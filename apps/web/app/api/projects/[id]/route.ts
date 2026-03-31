import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase';
import { processManager } from '@/lib/preview/process-manager';
import { getProjectDir } from '@/lib/preview/file-manager';
import fs from 'node:fs';
import { requireAuth, handleAuthError } from '@/lib/auth';

export const runtime = 'nodejs';

// GET /api/projects/:id - 获取单个项目
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    const supabase = createServiceSupabase();

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

// PATCH /api/projects/:id - 更新项目（重命名等）
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    const supabase = createServiceSupabase();
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description.trim();
    if (body.status !== undefined) updates.status = body.status;

    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

// DELETE /api/projects/:id - 删除项目
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    const projectId = params.id;
    const supabase = createServiceSupabase();

    // 1. 停掉正在运行的 Vite dev server
    try {
      await processManager.stop(projectId);
    } catch {
      // 可能没有运行，忽略
    }

    // 2. 清理磁盘上的项目文件
    try {
      const projectDir = getProjectDir(projectId);
      if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn(`[Delete] Failed to clean project dir for ${projectId}:`, err);
    }

    // 3. 删除数据库记录
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
