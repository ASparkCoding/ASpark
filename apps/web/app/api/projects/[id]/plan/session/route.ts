import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase';
import { requireAuth, handleAuthError } from '@/lib/auth';

/**
 * GET /api/projects/[id]/plan/session
 * 获取当前项目最新的活跃 Plan session（用于页面重入时恢复 Plan 状态）
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    const supabase = createServiceSupabase();

    // 查找最新的非 completed 的 plan session
    const { data, error } = await supabase
      .from('plan_sessions')
      .select('*')
      .eq('project_id', params.id)
      .in('status', ['questioning', 'plan_generated', 'approved', 'building'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ active: false });
    }

    return NextResponse.json({
      active: true,
      session: {
        id: data.id,
        status: data.status,
        originalPrompt: data.original_prompt,
        questions: data.questions || [],
        planContent: data.plan_content || null,
        planStructured: data.plan_structured || null,
        userSupplement: data.user_supplement || '',
        createdAt: data.created_at,
      },
    });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

/**
 * PATCH /api/projects/[id]/plan/session
 * 更新 Plan session（保存 questions/answers、user supplement 等）
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    const supabase = createServiceSupabase();
    const body = await request.json();
    const { sessionId, questions, userSupplement } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (questions !== undefined) updates.questions = questions;
    if (userSupplement !== undefined) updates.user_supplement = userSupplement;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true });
    }

    const { error } = await supabase
      .from('plan_sessions')
      .update(updates)
      .eq('id', sessionId)
      .eq('project_id', params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
