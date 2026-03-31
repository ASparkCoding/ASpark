import { NextRequest } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase';
import { requireAuth, handleAuthError } from '@/lib/auth';

// GET /api/projects/:id/files/versions?path=xxx — 获取文件版本历史
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();

    const filePath = request.nextUrl.searchParams.get('path');
    if (!filePath) {
      return Response.json({ error: 'Missing path' }, { status: 400 });
    }

    const supabase = createServiceSupabase();
    const { data } = await supabase
      .from('project_files')
      .select('id, version, content, created_at')
      .eq('project_id', params.id)
      .eq('path', filePath)
      .order('version', { ascending: false })
      .limit(20);

    return Response.json({ versions: data || [] });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

// POST /api/projects/:id/files/versions — 回滚到指定版本
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();

    const { path: filePath, version } = await request.json();
    if (!filePath || version === undefined) {
      return Response.json({ error: 'Missing path or version' }, { status: 400 });
    }

    const supabase = createServiceSupabase();

    // 获取目标版本内容
    const { data: target } = await supabase
      .from('project_files')
      .select('content')
      .eq('project_id', params.id)
      .eq('path', filePath)
      .eq('version', version)
      .single();

    if (!target) {
      return Response.json({ error: 'Version not found' }, { status: 404 });
    }

    // 获取当前最新版本号
    const { data: latest } = await supabase
      .from('project_files')
      .select('version')
      .eq('project_id', params.id)
      .eq('path', filePath)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    // 创建新版本（内容 = 目标版本）
    const newVersion = (latest?.version || 0) + 1;
    await supabase.from('project_files').insert({
      project_id: params.id,
      path: filePath,
      content: target.content,
      version: newVersion,
    });

    return Response.json({ success: true, version: newVersion, content: target.content });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
