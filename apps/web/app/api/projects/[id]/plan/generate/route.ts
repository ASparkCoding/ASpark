import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { selectModel } from '@/lib/llm/router';
import { createServiceSupabase } from '@/lib/supabase';
import {
  getPlanGeneratePrompt,
  parsePlanStructuredJson,
  extractPlanMarkdown,
} from '@/lib/prompts/plan-prompts';
import { requireAuth, handleAuthError } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/projects/[id]/plan/generate
 * 基于所有问答回答，流式生成结构化 Plan
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();

    const { sessionId, qaHistory, supplement } = await request.json();
    const projectId = params.id;

    if (!sessionId || !qaHistory) {
      return new Response(JSON.stringify({ error: '缺少必要参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createServiceSupabase();

    // 读取 plan session
    const { data: session } = await supabase
      .from('plan_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return new Response(JSON.stringify({ error: 'Plan 会话不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const originalPrompt = session.original_prompt || '';
    const planPrompt = getPlanGeneratePrompt(originalPrompt, qaHistory, supplement);

    // 使用 GPT-5.3-Codex 生成 Plan（需要高质量 + 长输出）
    const aiModel = selectModel({ type: 'scaffold' });

    const result = streamText({
      model: aiModel,
      messages: [{ role: 'user', content: planPrompt }],
      maxOutputTokens: 8000,
    });

    const encoder = new TextEncoder();
    let fullText = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const part of result.fullStream) {
            switch (part.type) {
              case 'reasoning-delta':
                // 不转发 reasoning，只保持连接
                break;
              case 'text-delta':
                fullText += part.text;
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({ type: 'plan_chunk', content: part.text }) + '\n'
                  )
                );
                break;
            }
          }

          // 解析结构化数据
          const planMarkdown = extractPlanMarkdown(fullText);
          const structured = parsePlanStructuredJson(fullText);

          // 保存到数据库
          await supabase
            .from('plan_sessions')
            .update({
              status: 'plan_generated',
              plan_content: planMarkdown,
              plan_structured: structured || null,
              questions: qaHistory,
              user_supplement: supplement || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sessionId);

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'plan_complete',
                planContent: planMarkdown,
                planStructured: structured,
              }) + '\n'
            )
          );
        } catch (err) {
          console.error('[Plan Generate] Error:', err);
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: 'error', message: String(err) }) + '\n'
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
