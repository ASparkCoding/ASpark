/**
 * GET /api/projects/[id]/session-snapshot
 * POST /api/projects/[id]/session-snapshot
 * 会话持久化 API - 保存/恢复会话快照
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/lib/session/session-storage';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const data = await req.json();
    const snapshot = sessionManager.createSnapshot(params.id, data);

    return NextResponse.json({
      success: true,
      snapshotId: snapshot.id,
      checksum: snapshot.checksum,
      messageCount: snapshot.messages.length,
      fileCount: Object.keys(snapshot.files).length,
    });
  } catch (error) {
    console.error('[Session Snapshot Error]', error);
    return NextResponse.json({ error: 'Failed to create snapshot' }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 从 query params 获取操作类型
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'list';

    if (action === 'list') {
      const sessions = sessionManager.listSavedSessions();
      const projectSessions = sessions.filter(s => s.projectId === params.id);
      return NextResponse.json({ sessions: projectSessions });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[Session Snapshot Error]', error);
    return NextResponse.json({ error: 'Failed to get sessions' }, { status: 500 });
  }
}
