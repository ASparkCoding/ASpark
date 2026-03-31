import { NextRequest } from 'next/server';
import { Vercel } from '@vercel/sdk';
import { requireAuth, handleAuthError } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/projects/[id]/deploy
 * Deploy the generated app to Vercel using inline file mode.
 * Streams NDJSON status updates: uploading -> building -> ready / error
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    const projectId = params.id;

    let body: { files?: unknown; projectName?: string };
    try {
      body = await request.json();
    } catch (e) {
      console.error('[Deploy] Failed to parse request body:', e);
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { files, projectName } = body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return Response.json({ error: 'No files provided' }, { status: 400 });
    }

    const token = process.env.VERCEL_TOKEN;
    if (!token) {
      console.error('[Deploy] VERCEL_TOKEN not set in environment');
      return Response.json(
        { error: 'VERCEL_TOKEN not configured' },
        { status: 500 }
      );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
          } catch { /* stream may be closed */ }
        };

        try {
          const vercel = new Vercel({ bearerToken: token });
          const name = sanitizeProjectName(
            projectName || `ai-app-${projectId.slice(0, 8)}`
          );

          console.log(`[Deploy] Starting deployment for project ${projectId}, name="${name}", ${files.length} files`);

          // Step 1: Prepare files for inline deployment
          send({
            status: 'uploading',
            message: `Preparing ${files.length} files for deployment...`,
          });

          const vercelFiles = (files as { path: string; content: string }[]).map(
            (f) => ({
              file: f.path.replace(/^\/+/, ''),
              data: f.content,
            })
          );

          // Inject vercel.json for SPA routing (rewrite all paths to index.html)
          if (!vercelFiles.some((f) => f.file === 'vercel.json')) {
            vercelFiles.push({
              file: 'vercel.json',
              data: JSON.stringify(
                { routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/index.html' }] },
                null,
                2
              ),
            });
          }

          // Step 2: Create deployment via Vercel SDK
          send({ status: 'uploading', message: 'Uploading to Vercel...' });

          let deployment;
          try {
            deployment = await vercel.deployments.createDeployment({
              requestBody: {
                name,
                files: vercelFiles,
                projectSettings: {
                  framework: null,
                  buildCommand: 'vite build',
                  outputDirectory: 'dist',
                  installCommand: 'npm install',
                },
                target: 'production',
              },
            });
          } catch (createErr: unknown) {
            const err = createErr as Error & {
              statusCode?: number;
              body?: unknown;
            };
            console.error('[Deploy] createDeployment failed:', err.message);
            console.error('[Deploy] statusCode:', err.statusCode);
            console.error('[Deploy] body:', JSON.stringify(err.body));
            send({
              status: 'error',
              message: `Vercel API error: ${err.message}`,
            });
            controller.close();
            return;
          }

          const deploymentId = deployment.id;
          const deploymentUrl = `https://${deployment.url}`;
          console.log(`[Deploy] Deployment created: ${deploymentId} -> ${deploymentUrl}, readyState=${deployment.readyState}`);

          send({
            status: 'building',
            message: `Deployment created: ${deploymentUrl}`,
            deploymentId,
            deploymentUrl,
          });

          // Step 3: Poll deployment status until ready or failed
          let readyState = deployment.readyState as string | undefined;
          let attempts = 0;
          const maxAttempts = 120; // 4 minutes max polling

          while (
            readyState !== 'READY' &&
            readyState !== 'ERROR' &&
            readyState !== 'CANCELED' &&
            attempts < maxAttempts
          ) {
            await sleep(2000);
            attempts++;

            try {
              const status = await vercel.deployments.getDeployment({
                idOrUrl: deploymentId,
              });
              readyState = status.readyState as string | undefined;

              send({
                status: 'building',
                message: `Building... (${attempts * 2}s, state: ${readyState})`,
                deploymentId,
                deploymentUrl,
              });
            } catch (pollErr) {
              console.warn(`[Deploy] Poll attempt ${attempts} failed:`, (pollErr as Error).message);
              send({
                status: 'building',
                message: `Checking status... (${attempts * 2}s)`,
              });
            }
          }

          if (readyState === 'READY') {
            console.log(`[Deploy] Deployment ${deploymentId} is READY`);
            send({
              status: 'ready',
              message: 'Deployment successful!',
              deploymentId,
              deploymentUrl,
            });
          } else if (readyState === 'ERROR' || readyState === 'CANCELED') {
            console.error(`[Deploy] Deployment ${deploymentId} ended with state: ${readyState}`);
            send({
              status: 'error',
              message: `Deployment ${readyState === 'ERROR' ? 'failed during build' : 'was canceled'}. Check Vercel dashboard for details.`,
              deploymentId,
              deploymentUrl,
            });
          } else {
            send({
              status: 'building',
              message: 'Deployment is still building. Check Vercel dashboard for status.',
              deploymentId,
              deploymentUrl,
            });
          }

          controller.close();
        } catch (error) {
          const err = error as Error;
          console.error('[Deploy] Unexpected error:', err.message);
          console.error('[Deploy] Stack:', err.stack);
          send({ status: 'error', message: `Deploy error: ${err.message}` });
          try {
            controller.close();
          } catch { /* already closed */ }
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

function sanitizeProjectName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'ai-generated-app'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
