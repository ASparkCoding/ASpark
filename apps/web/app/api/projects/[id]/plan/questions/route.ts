import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { selectModel } from '@/lib/llm/router';
import { createServiceSupabase } from '@/lib/supabase';
import { getPlanQuestionPrompt } from '@/lib/prompts/plan-prompts';
import { requireAuth, handleAuthError } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/projects/[id]/plan/questions
 * 根据用户初始需求，流式生成澄清问题（NDJSON）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();

    try {
      let body: { prompt?: string };
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: '请求体解析失败' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const { prompt } = body;
      const projectId = params.id;

      if (!prompt) {
        return new Response(JSON.stringify({ error: '缺少 prompt' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      console.log(`[Plan Questions] projectId=${projectId}, prompt="${prompt.slice(0, 50)}..."`);

      const supabase = createServiceSupabase();

      // 创建 plan_session
      const { data: session, error: sessionError } = await supabase
        .from('plan_sessions')
        .insert({
          project_id: projectId,
          status: 'questioning',
          original_prompt: prompt,
        })
        .select()
        .single();

      if (sessionError) {
        console.error('[Plan] Failed to create session:', sessionError.message, sessionError.details);
        return new Response(
          JSON.stringify({ error: `创建 Plan 会话失败: ${sessionError.message}` }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[Plan Questions] Session created: ${session.id}`);

      // 使用 Kimi K2.5 生成问题
      const aiModel = selectModel({ type: 'iterate' });
      const systemPrompt = getPlanQuestionPrompt(prompt);

      console.log('[Plan Questions] Calling LLM for question generation...');
      const result = streamText({
        model: aiModel,
        messages: [{ role: 'user', content: systemPrompt }],
        // Kimi K2.5 只允许 temperature=1，不传则使用模型默认值
        maxOutputTokens: 2000,
      });

      // 将 LLM 输出转换为 NDJSON 流
      const encoder = new TextEncoder();
      let fullText = '';
      // ★ 收集所有生成的问题，流结束后保存到 plan_sessions.questions
      const collectedQuestions: Array<{ id: string; question: string; options: string[] }> = [];

      const stream = new ReadableStream({
        async start(controller) {
          try {
            // 先发送 session_id
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: 'session', sessionId: session.id }) + '\n')
            );

            for await (const part of result.fullStream) {
              if (part.type === 'text-delta') {
                fullText += part.text;

                // 尝试逐行解析完成的 JSON 行
                const lines = fullText.split('\n');
                fullText = lines.pop() || '';

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed) continue;
                  try {
                    const parsed = JSON.parse(trimmed);
                    if (parsed.question && parsed.options) {
                      const qId = crypto.randomUUID();
                      const questionData = {
                        type: 'question' as const,
                        data: {
                          id: qId,
                          question: parsed.question,
                          options: parsed.options,
                        },
                      };
                      collectedQuestions.push({ id: qId, question: parsed.question, options: parsed.options });
                      controller.enqueue(
                        encoder.encode(JSON.stringify(questionData) + '\n')
                      );
                      console.log(`[Plan Questions] Emitted question: "${parsed.question.slice(0, 30)}..."`);
                    }
                  } catch {
                    // 非 JSON 行，跳过
                  }
                }
              } else if (part.type === 'error') {
                console.error('[Plan Questions] LLM error event:', part.error);
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({ type: 'error', message: `LLM 错误: ${part.error}` }) + '\n'
                  )
                );
              }
            }

            // 处理最后一行
            if (fullText.trim()) {
              try {
                const parsed = JSON.parse(fullText.trim());
                if (parsed.question && parsed.options) {
                  const qId = crypto.randomUUID();
                  collectedQuestions.push({ id: qId, question: parsed.question, options: parsed.options });
                  controller.enqueue(
                    encoder.encode(
                      JSON.stringify({
                        type: 'question',
                        data: { id: qId, question: parsed.question, options: parsed.options },
                      }) + '\n'
                    )
                  );
                }
              } catch {
                // ignore
              }
            }

            // ★ 将收集的问题保存到 plan_sessions.questions（供页面重入恢复）
            if (collectedQuestions.length > 0) {
              const questionsForDb = collectedQuestions.map(q => ({
                id: q.id,
                question: q.question,
                options: q.options,
                answer: null,
                skipped: false,
              }));
              await supabase
                .from('plan_sessions')
                .update({ questions: questionsForDb })
                .eq('id', session.id);
            }

            controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'));
            console.log('[Plan Questions] Stream completed successfully');
          } catch (err) {
            console.error('[Plan Questions] Stream error:', err);
            try {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ type: 'error', message: String(err) }) + '\n'
                )
              );
            } catch {
              // controller may already be closed
            }
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
      // 顶层兜底：捕获所有未预期的错误
      console.error('[Plan Questions] Unhandled error:', err);
      return new Response(
        JSON.stringify({ error: `服务器内部错误: ${(err as Error).message}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
