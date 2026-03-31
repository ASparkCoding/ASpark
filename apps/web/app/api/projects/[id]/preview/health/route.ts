import { NextRequest } from 'next/server';
import { processManager } from '@/lib/preview/process-manager';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const status = processManager.getStatus(projectId);

  if (!status || status.status !== 'ready') {
    return Response.json({ healthy: false, reason: 'not running' });
  }

  try {
    const res = await fetch(`http://127.0.0.1:${status.port}`, {
      signal: AbortSignal.timeout(3000),
    });
    return Response.json({
      healthy: res.ok || res.status === 304,
      status: res.status,
    });
  } catch (err) {
    return Response.json({
      healthy: false,
      reason: (err as Error).message,
    });
  }
}
