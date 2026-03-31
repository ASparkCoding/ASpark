import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { processManager } from '@/lib/preview/process-manager';
import {
  initProjectDir,
  installDependencies,
  ensureGoldenTemplate,
  getProjectDir,
} from '@/lib/preview/file-manager';
import { runPrePreviewFixes } from '@/lib/code-gen/pre-preview-fixer';
import { runCompileCheck } from '@/lib/code-gen/compile-checker';
import { requireAuth, handleAuthError } from '@/lib/auth';
import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ★ T4: Module-level cache for package.json hash per project
const installedPkgHashes = new Map<string, string>();

/**
 * POST /api/projects/[id]/preview/start
 * Write files to disk, install deps, start Vite dev server.
 * Streams NDJSON status updates to the client.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    const projectId = params.id;
    const { files } = await request.json();

    if (!files || !Array.isArray(files) || files.length === 0) {
      return Response.json({ error: 'No files provided' }, { status: 400 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
          } catch {
            // Stream may be closed
          }
        };

        try {
          // Check if already running
          if (processManager.isRunning(projectId)) {
            const existing = processManager.getStatus(projectId);
            if (existing?.status === 'ready') {
              send({
                status: 'ready',
                message: 'Dev server already running',
                previewUrl: `http://127.0.0.1:${existing.port}`,
              });
              controller.close();
              return;
            }
          }

          // Step 1: Try to build golden template from the project's package.json
          const packageJsonFile = files.find(
            (f: { path: string }) =>
              f.path === 'package.json' || f.path === '/package.json'
          );
          if (packageJsonFile) {
            send({ status: 'creating', message: 'Preparing dependency cache...' });
            try {
              await ensureGoldenTemplate(
                packageJsonFile.content,
                (msg) => send({ status: 'installing', message: msg })
              );
            } catch (err) {
              // Non-fatal: will fall back to fresh install
              console.warn('[Preview] Golden template failed:', err);
            }
          }

          // Step 2: Pre-preview validation & fix
          send({ status: 'creating', message: 'Validating generated code...' });
          const templatePaths = new Set(
            (packageJsonFile ? ['package.json'] : []).concat(
              files.filter((f: { path: string }) =>
                f.path.startsWith('src/components/ui/') ||
                f.path.startsWith('src/lib/') ||
                ['vite.config.ts', 'tsconfig.json', 'index.html', 'tailwind.config.js',
                 'postcss.config.js', 'src/index.css', 'src/vite-env.d.ts', 'src/main.tsx'].includes(f.path)
              ).map((f: { path: string }) => f.path)
            )
          );
          const existingTemplateFiles = files.filter((f: { path: string }) => templatePaths.has(f.path));
          const newGenFiles = files.filter((f: { path: string }) => !templatePaths.has(f.path));

          const fixResult = runPrePreviewFixes(newGenFiles, existingTemplateFiles);

          if (fixResult.fixedIssues.length > 0) {
            send({
              status: 'creating',
              message: `Pre-preview fix: ${fixResult.fixedIssues.length} issues auto-fixed`,
            });
            console.log('[Preview] Pre-preview fixes:', fixResult.fixedIssues);
          }

          if (fixResult.remainingIssues.length > 0) {
            console.log('[Preview] Remaining issues:', fixResult.remainingIssues.map(i => i.message));
          }

          // Merge fixed files back
          const fixedFileMap = new Map<string, string>();
          for (const f of files) fixedFileMap.set(f.path, f.content);
          for (const f of fixResult.fixedFiles) fixedFileMap.set(f.path, f.content);
          const finalFiles = Array.from(fixedFileMap.entries()).map(([p, c]) => ({ path: p, content: c }));

          // Step 3: Compile check gate (static analysis before Vite)
          const compileResult = runCompileCheck(finalFiles);
          if (compileResult.errors.length > 0) {
            const blockingCount = compileResult.errors.filter(e => e.severity === 'error').length;
            const warningCount = compileResult.errors.filter(e => e.severity === 'warning').length;
            if (blockingCount > 0) {
              send({
                status: 'creating',
                message: `Compile check: ${blockingCount} errors, ${warningCount} warnings detected (will attempt auto-fix)`,
              });
            }
            // Log all compile errors for debugging
            for (const err of compileResult.errors) {
              console.log(`[CompileCheck] [${err.severity}] ${err.file}: ${err.message}`);
              // Forward errors as logs so useAutoFix can pick them up
              send({ status: 'log', message: `[compile-check] ${err.file}: ${err.message}` });
            }
          }

          // Step 4: Create project directory and write files
          send({
            status: 'creating',
            message: `Writing ${finalFiles.length} files to disk...`,
          });
          const projectDir = await initProjectDir(projectId, finalFiles);

          // Step 5: Install dependencies (with hash-based skip)
          const pkgJsonPath = path.join(projectDir, 'package.json');
          const pkgContent = fs.existsSync(pkgJsonPath) ? fs.readFileSync(pkgJsonPath, 'utf-8') : '';
          const currentHash = crypto.createHash('md5').update(pkgContent).digest('hex');
          const prevHash = installedPkgHashes.get(projectId);
          const nodeModulesExists = fs.existsSync(path.join(projectDir, 'node_modules'));

          if (nodeModulesExists && currentHash === prevHash) {
            send({ status: 'installing', message: 'Dependencies cached, skipping install...\n' });
          } else {
            send({ status: 'installing', message: 'Installing dependencies...' });
            await installDependencies(projectDir, (msg) => {
              send({ status: 'installing', message: msg });
            });
            installedPkgHashes.set(projectId, currentHash);
          }

          // Step 6: Start Vite dev server
          // ★ Keep stream OPEN after 'ready' so post-compilation errors
          //   (e.g. missing imports detected when browser requests a file)
          //   continue flowing to the client. Only close on terminal events.
          send({ status: 'starting', message: 'Starting dev server...' });
          await processManager.start(projectId, projectDir, (event) => {
            send(event);
            if (event.status === 'error' || event.status === 'stopped') {
              try { controller.close(); } catch { /* already closed */ }
            }
          });
        } catch (error) {
          send({
            status: 'error',
            message: `Preview error: ${(error as Error).message}`,
          });
          try { controller.close(); } catch { /* already closed */ }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
