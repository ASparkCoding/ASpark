import { NextRequest } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase';
import { requireAuth, handleAuthError } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * POST /api/projects/[id]/plan/approve
 * 用户审批 Plan，准备进入构建阶段
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();

    const { sessionId, approved, feedback } = await request.json();

    if (!sessionId) {
      return new Response(JSON.stringify({ error: '缺少 sessionId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createServiceSupabase();

    if (approved) {
      await supabase
        .from('plan_sessions')
        .update({
          status: 'approved',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      return Response.json({ status: 'approved' });
    } else {
      // 用户要求修改 Plan，重置为 plan_generated 状态（前端会重新生成）
      if (feedback) {
        await supabase
          .from('plan_sessions')
          .update({
            user_supplement: feedback,
            status: 'plan_generated',
            updated_at: new Date().toISOString(),
          })
          .eq('id', sessionId);
      }

      return Response.json({ status: 'revised', feedback });
    }
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
