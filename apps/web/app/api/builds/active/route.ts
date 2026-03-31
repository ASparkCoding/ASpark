import { NextResponse } from 'next/server';
import { buildManager } from '@/lib/build/build-manager';
import { requireAuth, handleAuthError } from '@/lib/auth';

/**
 * GET /api/builds/active
 * 返回所有正在运行的 build（用于项目列表页显示生成状态徽章）
 */
export async function GET() {
  try {
    await requireAuth();
    const activeBuilds = buildManager.getAllActive();
    return NextResponse.json(activeBuilds);
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
