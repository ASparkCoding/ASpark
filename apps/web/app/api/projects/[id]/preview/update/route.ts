import { NextRequest } from 'next/server';
import { processManager } from '@/lib/preview/process-manager';
import { updateProjectFiles, getProjectDir } from '@/lib/preview/file-manager';
import { requireAuth, handleAuthError } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * POST /api/projects/[id]/preview/update
 * Write updated files to disk. Vite HMR will auto-detect changes.
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

    if (!processManager.isRunning(projectId)) {
      return Response.json(
        { error: 'Preview is not running for this project' },
        { status: 400 }
      );
    }

    try {
      const projectDir = getProjectDir(projectId);
      await updateProjectFiles(projectDir, files);
      return Response.json({ success: true });
    } catch (error) {
      return Response.json(
        { error: `Update failed: ${(error as Error).message}` },
        { status: 500 }
      );
    }
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
