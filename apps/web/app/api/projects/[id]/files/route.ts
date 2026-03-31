import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase';
import { requireAuth, handleAuthError } from '@/lib/auth';

// GET /api/projects/:id/files - 获取项目文件
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    const supabase = createServiceSupabase();

    // 获取每个文件的最新版本
    const { data, error } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', params.id)
      .order('path')
      .order('version', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 取每个 path 的最新版本
    const latestFiles = new Map<string, typeof data[0]>();
    for (const file of data || []) {
      if (!latestFiles.has(file.path)) {
        latestFiles.set(file.path, file);
      }
    }

    return NextResponse.json(Array.from(latestFiles.values()));
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

// POST /api/projects/:id/files - 批量保存/更新文件
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    const supabase = createServiceSupabase();
    const body = await request.json();

    const { files } = body as { files: { path: string; content: string }[] };

    if (!files?.length) {
      return NextResponse.json({ error: '文件列表不能为空' }, { status: 400 });
    }

    // 获取当前文件最新版本号
    const { data: existing } = await supabase
      .from('project_files')
      .select('path, version')
      .eq('project_id', params.id)
      .order('version', { ascending: false });

    const versionMap = new Map<string, number>();
    for (const f of existing || []) {
      if (!versionMap.has(f.path)) {
        versionMap.set(f.path, f.version);
      }
    }

    // 插入新版本
    const inserts = files.map((f) => ({
      project_id: params.id,
      path: f.path,
      content: f.content,
      version: (versionMap.get(f.path) || 0) + 1,
    }));

    const { data, error } = await supabase
      .from('project_files')
      .insert(inserts)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
