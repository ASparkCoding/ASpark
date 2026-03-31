import { NextRequest } from 'next/server';
import { processManager } from '@/lib/preview/process-manager';
import { requireAuth, handleAuthError } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * POST /api/projects/[id]/preview/stop
 * Stop the running dev server for a project.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    const projectId = params.id;

    try {
      await processManager.stop(projectId);
      return Response.json({ success: true });
    } catch (error) {
      return Response.json(
        { error: `Failed to stop: ${(error as Error).message}` },
        { status: 500 }
      );
    }
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
