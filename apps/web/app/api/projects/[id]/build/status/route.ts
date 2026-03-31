import { NextRequest, NextResponse } from 'next/server';
import { buildManager } from '@/lib/build/build-manager';
import { requireAuth, handleAuthError } from '@/lib/auth';

/**
 * GET /api/projects/[id]/build/status
 * Returns the current build status for a project.
 * Used for polling when user clicks "Continue in background".
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    const job = buildManager.getStatus(params.id);

    if (!job) {
      return NextResponse.json({ status: 'idle' });
    }

    return NextResponse.json({
      status: job.status,
      startedAt: job.startedAt,
      completedAt: job.completedAt ?? null,
      filesGenerated: job.filesGenerated,
      error: job.error ?? null,
      modelInfo: job.modelInfo ?? null,
      durationMs: job.completedAt
        ? job.completedAt - job.startedAt
        : Date.now() - job.startedAt,
    });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
