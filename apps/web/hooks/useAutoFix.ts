'use client';

import { useCallback, useRef } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { detectErrors, buildAutoFixPrompt } from '@/lib/error-detection/detector';
import { checkRouteConsistency } from '@/lib/code-gen/route-checker';
import { preFixFiles } from '@/lib/code-gen/pre-fixer';
import type { GenerationType } from '@/types';
import { bootPreview, rebootPreview } from '@/lib/preview/boot-client';

interface UseAutoFixOptions {
  projectId: string;
  generate: (params: { prompt: string; type?: GenerationType; isAutoFix?: boolean }) => Promise<unknown>;
}

/**
 * ★ Phase 2: 4-Stage Auto-fix Pipeline
 *
 * Stage 1: 确定性修复 (pre-fixer, no LLM)   → verify
 * Stage 2: LLM 精准修复 (1-3 rounds)         → verify
 * Stage 3: LLM 扩大修复 (1-2 rounds)         → verify
 * Stage 4: 降级修复 (remove problematic code) → verify
 */
const MAX_AUTO_FIX_ROUNDS = 10;

// Stage boundaries
const STAGE_2_START = 1;
const STAGE_3_START = 4;
const STAGE_4_START = 6;

function getStage(round: number): 1 | 2 | 3 | 4 {
  if (round < STAGE_2_START) return 1;
  if (round < STAGE_3_START) return 2;
  if (round < STAGE_4_START) return 3;
  return 4;
}

function hasNpmPackageErrors(errors: ReturnType<typeof detectErrors>): boolean {
  return errors.some((e) => {
    if (e.type !== 'import') return false;
    const match = e.message.match(/Cannot resolve import "([^"]+)"/);
    if (!match) return false;
    const pkg = match[1];
    return !pkg.startsWith('.') && !pkg.startsWith('@/') && !pkg.startsWith('src/');
  });
}

export function useAutoFix({ projectId, generate }: UseAutoFixOptions) {
  const fixCountRef = useRef(0);
  const isFixingRef = useRef(false);
  const isAutoFixGeneratingRef = useRef(false);

  const { addChatMessage, setBuildPhase } = useEditorStore();

  const syncFilesToDisk = useCallback(async () => {
    const { previewStatus, getDirtyFileContents, clearDirtyFiles, files } = useEditorStore.getState();
    if (previewStatus !== 'ready' || files.length === 0) return;

    const dirtyContents = getDirtyFileContents();
    const filesToSync = dirtyContents.length > 0
      ? dirtyContents
      : files.map((f) => ({ path: f.path, content: f.content }));

    try {
      const res = await fetch(`/api/projects/${projectId}/preview/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filesToSync }),
      });
      if (res.ok && dirtyContents.length > 0) {
        clearDirtyFiles();
      }
    } catch { /* Non-fatal */ }
  }, [projectId]);

  const waitForPreviewReady = useCallback(async () => {
    const maxWait = 60000;
    const interval = 1000;
    let waited = 0;
    while (waited < maxWait) {
      const { previewStatus } = useEditorStore.getState();
      if (previewStatus === 'ready' || previewStatus === 'error') break;
      await new Promise((resolve) => setTimeout(resolve, interval));
      waited += interval;
    }
  }, []);

  const waitForLogsToStabilize = useCallback(async (maxWait = 10000, quietPeriod = 2000) => {
    const startTime = Date.now();
    let lastLogCount = useEditorStore.getState().previewLogs.length;
    let lastChangeTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise((r) => setTimeout(r, 500));
      const currentCount = useEditorStore.getState().previewLogs.length;
      if (currentCount !== lastLogCount) {
        lastLogCount = currentCount;
        lastChangeTime = Date.now();
      } else if (Date.now() - lastChangeTime >= quietPeriod) {
        break;
      }
    }
  }, []);

  /**
   * Collect all current errors (Vite logs + runtime + route issues)
   */
  const collectErrors = useCallback((isFirstRound: boolean) => {
    const { previewLogs, files, runtimeErrors } = useEditorStore.getState();

    const errors = detectErrors(previewLogs);

    // Merge runtime errors from iframe postMessage
    if (runtimeErrors.length > 0) {
      for (const re of runtimeErrors) {
        const key = `${re.file}:${re.message}`;
        if (!errors.some((e) => `${e.file}:${e.message}` === key)) {
          errors.push({
            type: 'runtime',
            file: re.file,
            line: re.line,
            message: re.message,
            rawLog: re.message,
          });
        }
      }
      useEditorStore.getState().clearRuntimeErrors();
    }

    // Route consistency check (only on first round)
    if (isFirstRound) {
      const routeIssues = checkRouteConsistency(
        files.map((f) => ({ path: f.path, content: f.content }))
      );
      for (const issue of routeIssues) {
        errors.push({
          type: 'import' as const,
          file: 'src/App.tsx',
          message: issue.message,
          rawLog: issue.message,
        });
      }
    }

    return errors;
  }, []);

  /**
   * Collect fix context (error files + dependency chain + entries + entities)
   */
  const collectFixContext = useCallback((
    errors: ReturnType<typeof detectErrors>,
    files: { path: string; content: string }[]
  ) => {
    const context = new Map<string, string>();

    // 1. Error files
    for (const err of errors) {
      if (err.file !== 'unknown') {
        const file = files.find(f => f.path === err.file || f.path === `src/${err.file}` || f.path.endsWith(err.file));
        if (file) context.set(file.path, file.content);
      }
    }

    // 2. Entry files
    for (const ep of ['src/App.tsx', 'src/main.tsx', 'src/lib/supabase.ts']) {
      const file = files.find(f => f.path === ep);
      if (file && !context.has(file.path)) context.set(file.path, file.content);
    }

    // 3. Dependency chain
    const snapshotEntries = Array.from(context.entries());
    for (const [filePath, content] of snapshotEntries) {
      const imports = extractImports(content);
      for (const imp of imports) {
        const resolvedPath = resolveImportToFile(imp, filePath, files);
        if (resolvedPath && !context.has(resolvedPath)) {
          const depFile = files.find(f => f.path === resolvedPath);
          if (depFile) context.set(depFile.path, depFile.content);
        }
      }
    }

    // 4. Entity files (if data-related errors)
    const hasDataError = errors.some(e =>
      e.message.toLowerCase().includes('supabase') ||
      e.message.includes('Service') ||
      e.message.includes('createEntityService') ||
      e.file.includes('entities/')
    );
    if (hasDataError) {
      for (const ef of files.filter(f => f.path.includes('entities/'))) {
        if (!context.has(ef.path)) context.set(ef.path, ef.content);
      }
    }

    // 5. package.json
    const pkgFile = files.find(f => f.path === 'package.json');
    if (pkgFile && !context.has(pkgFile.path)) context.set(pkgFile.path, pkgFile.content);

    // 6. types
    const typesFile = files.find(f => f.path === 'src/types/index.ts' || f.path === 'src/types.ts');
    if (typesFile && !context.has(typesFile.path)) context.set(typesFile.path, typesFile.content);

    // 7. npm package error: collect all files referencing the missing package
    for (const err of errors) {
      if (err.type !== 'import') continue;
      const pkgMatch = err.message.match(/Cannot resolve import "([^"]+)"/);
      if (!pkgMatch) continue;
      const pkg = pkgMatch[1];
      if (pkg.startsWith('.') || pkg.startsWith('@/') || pkg.startsWith('src/')) continue;

      for (const f of files) {
        if (context.has(f.path) || f.path.includes('components/ui/')) continue;
        if (f.content.includes(`from "${pkg}"`) || f.content.includes(`from '${pkg}'`) ||
            f.content.includes(`from "${pkg}/`) || f.content.includes(`from '${pkg}/`)) {
          context.set(f.path, f.content);
        }
      }
    }

    // 8. Fallback: add business files if we have too few
    if (context.size <= 4) {
      const businessFiles = files.filter(f =>
        f.path.includes('src/') && !f.path.includes('components/ui/') &&
        (f.path.endsWith('.tsx') || f.path.endsWith('.ts'))
      );
      for (const f of businessFiles.slice(0, 10)) {
        if (!context.has(f.path)) context.set(f.path, f.content);
      }
    }

    // Size control
    let entries = Array.from(context.entries());
    if (entries.length > 15) {
      entries = entries.slice(0, 15).map(([path, content]) => [
        path,
        content.length > 3000
          ? content.slice(0, 2500) + '\n// ... truncated ...\n' + content.slice(-500)
          : content,
      ]);
    }

    const fileContents = entries.map(([path, content]) => ({ path, content }));
    const allFilePaths = files.map(f => f.path).filter(p => !p.includes('components/ui/'));

    return { fileContents, allFilePaths };
  }, []);

  /**
   * After LLM fix: sync files or reboot preview
   */
  const applyFixAndWait = useCallback(async (errors: ReturnType<typeof detectErrors>) => {
    const postFixStatus = useEditorStore.getState().previewStatus;
    const needsReboot = hasNpmPackageErrors(errors);

    if (postFixStatus === 'error' || postFixStatus === 'idle' || needsReboot) {
      console.log(`[AutoFix] ${needsReboot ? 'npm package error' : 'Preview down'}, rebooting...`);
      const rebootResult = await rebootPreview(projectId);
      if (!rebootResult.ok) {
        await waitForLogsToStabilize(5000, 1500);
      } else {
        await waitForLogsToStabilize(10000, 2500);
      }
    } else if (postFixStatus === 'ready') {
      await syncFilesToDisk();
      useEditorStore.getState().clearPreviewLogs();
      await waitForLogsToStabilize(8000, 2000);

      // Trigger re-analysis
      try {
        await fetch(`/api/projects/${projectId}/preview/health`);
        await waitForLogsToStabilize(5000, 1500);
      } catch { /* non-fatal */ }
    }
  }, [projectId, syncFilesToDisk, waitForLogsToStabilize]);

  /**
   * ★ Core 4-stage auto-fix loop
   */
  const waitAndFix = useCallback(async (): Promise<void> => {
    if (isFixingRef.current) return;
    isFixingRef.current = true;
    isAutoFixGeneratingRef.current = true;
    fixCountRef.current = 0;

    try {
      const store = useEditorStore.getState();

      // Step 1: Boot preview if needed
      if (store.previewStatus !== 'ready') {
        if (store.files.length > 0) {
          console.log('[AutoFix] Preview not ready, booting...');
          await bootPreview(projectId);
        }
      }

      await waitForPreviewReady();

      // Step 2: Initial sync
      const { previewStatus: initialStatus } = useEditorStore.getState();
      if (initialStatus === 'ready') {
        await syncFilesToDisk();
        await waitForLogsToStabilize(10000, 2500);
      } else if (initialStatus === 'error') {
        await waitForLogsToStabilize(5000, 1500);
      }

      // Step 3: Fix loop
      const fixHistory: string[] = [];

      while (fixCountRef.current < MAX_AUTO_FIX_ROUNDS) {
        const { isGenerating } = useEditorStore.getState();
        if (isGenerating) break;

        const errors = collectErrors(fixCountRef.current === 0);

        // No errors — verify and exit
        if (errors.length === 0) {
          await verifyAndFinish();
          break;
        }

        fixCountRef.current++;
        const stage = getStage(fixCountRef.current);
        setBuildPhase('fixing_errors');

        console.log(
          `[AutoFix] Round ${fixCountRef.current}/${MAX_AUTO_FIX_ROUNDS} (Stage ${stage}): ${errors.length} errors`
        );

        addChatMessage({
          id: crypto.randomUUID(),
          role: 'system',
          content: `检测到 ${errors.length} 个错误，正在自动修复...（第 ${fixCountRef.current} 轮，阶段 ${stage}）`,
          timestamp: Date.now(),
          messageType: 'text',
        });

        // ★ 每轮 auto-fix 开始时立即保存消息，防止用户中途离开丢失
        const snapMsgs = useEditorStore.getState().chatMessages;
        fetch(`/api/projects/${projectId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: snapMsgs }),
        }).catch(() => {});

        // ═══ STAGE 1: Deterministic pre-fix (no LLM) ═══
        const plainFiles = useEditorStore.getState().files.map(f => ({ path: f.path, content: f.content }));
        const { fixedFiles, fixedErrors, remainingErrors } = preFixFiles(plainFiles, errors);

        if (fixedErrors.length > 0) {
          const { updateFile } = useEditorStore.getState();
          const currentFiles = useEditorStore.getState().files;
          for (const ff of fixedFiles) {
            const original = currentFiles.find(f => f.path === ff.path);
            if (original && original.content !== ff.content) {
              updateFile(ff.path, ff.content);
            }
          }
          addChatMessage({
            id: crypto.randomUUID(),
            role: 'system',
            content: `预修复了 ${fixedErrors.length} 个问题：\n${fixedErrors.join('\n')}`,
            timestamp: Date.now(),
            messageType: 'text',
          });

          if (remainingErrors.length === 0) {
            // All fixed by pre-fixer, sync and re-check
            await applyFixAndWait(errors);
            continue;
          }
        }

        // ═══ STAGES 2-4: LLM-based fix ═══
        const errorsForLLM = remainingErrors.length > 0 ? remainingErrors : errors;
        const latestFiles = useEditorStore.getState().files.map(f => ({ path: f.path, content: f.content }));
        const { fileContents, allFilePaths } = collectFixContext(errorsForLLM, latestFiles);

        const fixPrompt = buildAutoFixPrompt(
          errorsForLLM,
          fileContents,
          allFilePaths,
          fixCountRef.current,
          fixHistory.slice(-3)
        );

        fixHistory.push(
          `错误: ${errorsForLLM.map(e => e.message).join('; ')}\n修复文件: ${fileContents.map(f => f.path).join(', ')}`
        );

        try {
          await generate({ prompt: fixPrompt, type: 'iterate', isAutoFix: true });
        } catch (err) {
          console.error('[AutoFix] Generation failed:', err);
          break;
        }

        setBuildPhase('fixing_errors');
        await applyFixAndWait(errors);
      }

      // Max rounds reached
      if (fixCountRef.current >= MAX_AUTO_FIX_ROUNDS) {
        const remaining = detectErrors(useEditorStore.getState().previewLogs);
        if (remaining.length > 0) {
          addChatMessage({
            id: crypto.randomUUID(),
            role: 'system',
            content: `已尝试自动修复 ${MAX_AUTO_FIX_ROUNDS} 轮，仍有 ${remaining.length} 个错误未解决。请手动检查：\n${remaining.map(e => `- ${e.file}: ${e.message}`).join('\n')}`,
            timestamp: Date.now(),
            messageType: 'text',
          });
        }
      }

      // ★ 持久化所有消息（含 auto-fix 中间系统消息）到 project_messages
      // 服务端负责生成消息的权威写入，此处仅补充保存 auto-fix 系统消息
      const msgs = useEditorStore.getState().chatMessages;
      fetch(`/api/projects/${projectId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs }),
      }).catch(() => {});

    } finally {
      isFixingRef.current = false;
      isAutoFixGeneratingRef.current = false;
      fixCountRef.current = 0;
      const { buildPhase } = useEditorStore.getState();
      if (buildPhase === 'fixing_errors') {
        setBuildPhase('completed');
      }
    }
  }, [
    projectId, generate, addChatMessage, setBuildPhase,
    syncFilesToDisk, waitForPreviewReady, waitForLogsToStabilize,
    collectErrors, collectFixContext, applyFixAndWait,
  ]);

  /**
   * Verify server health after all errors cleared
   */
  const verifyAndFinish = useCallback(async () => {
    console.log('[AutoFix] No errors detected, verifying server health...');
    const { previewStatus } = useEditorStore.getState();

    if (previewStatus === 'ready') {
      try {
        const healthRes = await fetch(`/api/projects/${projectId}/preview/health`);
        const healthData = await healthRes.json();
        if (!healthData.healthy) {
          console.log('[AutoFix] Server health check failed, rebooting...');
          const rebootResult = await rebootPreview(projectId);
          if (rebootResult.ok) {
            await waitForLogsToStabilize(8000, 2000);
            const newErrors = detectErrors(useEditorStore.getState().previewLogs);
            if (newErrors.length > 0) return; // will continue in the loop
          }
        }
      } catch { /* non-fatal */ }
    }

    if (fixCountRef.current > 0) {
      addChatMessage({
        id: crypto.randomUUID(),
        role: 'system',
        content: `自动修复完成！经过 ${fixCountRef.current} 轮修复，所有错误已解决。`,
        timestamp: Date.now(),
        messageType: 'text',
      });
    }
  }, [projectId, addChatMessage, waitForLogsToStabilize]);

  const resetFixCount = useCallback(() => {
    fixCountRef.current = 0;
    isFixingRef.current = false;
  }, []);

  const isAutoFixGeneration = useCallback(() => isAutoFixGeneratingRef.current, []);
  const isFixing = useCallback(() => isFixingRef.current, []);

  return {
    waitAndFix,
    resetFixCount,
    isAutoFixGeneration,
    isFixing,
    detectErrors: () => detectErrors(useEditorStore.getState().previewLogs),
  };
}

// ─── Import helpers ───

function extractImports(content: string): string[] {
  const imports: string[] = [];
  const regex = /from\s+['"](@\/[^'"]+|\.\.?\/[^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

function resolveImportToFile(
  importPath: string,
  fromFile: string,
  files: { path: string; content: string }[]
): string | null {
  let resolved: string;
  if (importPath.startsWith('@/')) {
    resolved = 'src/' + importPath.slice(2);
  } else {
    const dir = fromFile.split('/').slice(0, -1).join('/');
    const parts = importPath.split('/');
    const dirParts = dir.split('/');
    for (const part of parts) {
      if (part === '..') dirParts.pop();
      else if (part !== '.') dirParts.push(part);
    }
    resolved = dirParts.join('/');
  }

  const candidates = [resolved, resolved + '.ts', resolved + '.tsx', resolved + '/index.ts', resolved + '/index.tsx'];
  for (const c of candidates) {
    if (files.some(f => f.path === c)) return c;
  }
  return null;
}
