import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase';
import { requireAuth, handleAuthError } from '@/lib/auth';

// GET /api/projects - 获取项目列表
export async function GET() {
  try {
    const auth = await requireAuth();
    const supabase = createServiceSupabase();

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

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

// POST /api/projects - 创建项目
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const supabase = createServiceSupabase();
    const body = await request.json();

    const { name, description } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: '项目名称不能为空' }, { status: 400 });
    }

    // MVP 阶段使用固定 user_id，后续集成 Auth
    const { data, error } = await supabase
      .from('projects')
      .insert({
        name: name.trim(),
        description: description?.trim() || '',
        user_id: '00000000-0000-0000-0000-000000000000',
      })
      .select()
      .single();

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
