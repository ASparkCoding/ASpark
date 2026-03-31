import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { selectModel, getModelDisplayName, getDefaultProvider } from '@/lib/llm/router';
import { buildSystemPrompt, buildUserMessage } from '@/lib/prompts/system-prompt';
import { parseGeneratedCode } from '@/lib/code-gen/parser';
import { createServiceSupabase } from '@/lib/supabase';
import { getScaffoldTemplateFiles, SCAFFOLD_TEMPLATE_PATHS } from '@/lib/templates/scaffold-base';
import { executeSchemaSQL } from '@/lib/db/execute-schema';
import { buildManager } from '@/lib/build/build-manager';
import { selectRelevantFiles } from '@/lib/prompts/context-selector';
import type { GenerationType, ConversationMessage } from '@/types';
import { requireAuth, handleAuthError } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300; // Gemini / Kimi reasoning + 代码生成需要更长时间

// POST /api/generate - SSE 流式生成
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();

    const body = await request.json();
    const {
      projectId,
      prompt,
      type = 'scaffold' as GenerationType,
      conversationHistory,
      imageData,
      userMessageId,
      assistantMessageId,
      userDisplayContent,
      planSessionId,
    } = body;

    if (!projectId || !prompt) {
      return new Response(JSON.stringify({ error: '缺少必要参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createServiceSupabase();

  // ★ 服务端类型校验：根据数据库中实际文件状态决定真正的生成类型
  // 防止客户端 files 状态未加载完导致永远 scaffold → Kimi
  let effectiveType = type;

  // 查询项目是否已有文件
  const { count: fileCount } = await supabase
    .from('project_files')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId);

  if (effectiveType === 'scaffold' && (fileCount || 0) > 0) {
    // 项目已有文件，不应再用 scaffold，自动降级为 iterate
    effectiveType = detectServerType(prompt);
    console.log(`[LLM Router] Server override: scaffold → ${effectiveType} (project has ${fileCount} files)`);
  }

  // 获取项目现有文件（用于上下文注入）
  let existingFiles: { path: string; content: string }[] = [];
  if (effectiveType !== 'scaffold') {
    const { data } = await supabase
      .from('project_files')
      .select('path, content, version')
      .eq('project_id', projectId)
      .order('version', { ascending: false });

    // 取每个 path 的最新版本
    const latest = new Map<string, { path: string; content: string }>();
    for (const f of data || []) {
      if (!latest.has(f.path)) {
        latest.set(f.path, { path: f.path, content: f.content });
      }
    }

    // ★ iterate 模式：智能选择相关文件（节省 token）
    if (effectiveType === 'iterate') {
      existingFiles = selectRelevantFiles(prompt, Array.from(latest.values()));
    } else {
      existingFiles = Array.from(latest.values());
    }
  }

  // 构建 System Prompt
  const systemPrompt = buildSystemPrompt({ type: effectiveType, existingFiles, conversationHistory });

  // 构建消息列表
  const userMessages = buildUserMessage(prompt, conversationHistory);

  // 选择模型（自动路由）— 有图片时强制使用视觉模型
  const provider = imageData ? 'doubao' : getDefaultProvider(effectiveType);
  const aiModel = selectModel({
    type: effectiveType,
    contextLength: systemPrompt.length + prompt.length,
    forceVision: !!imageData,
  });

  const modelName = getModelDisplayName(provider, effectiveType);
  console.log(`[LLM Router] clientType=${type}, effectiveType=${effectiveType}, provider=${provider}, model=${modelName}`);

  // ★ Register build job in build-manager (for background tracking & status polling)
  buildManager.start(projectId, { provider, model: modelName, type: effectiveType });

  // Scaffold 模板文件：预注入 shadcn/ui 组件 + 配置 + .env
  const templateFiles = effectiveType === 'scaffold' ? [
    ...getScaffoldTemplateFiles(),
    // 自动注入 .env，让生成的应用直接连上 Supabase
    {
      path: '.env',
      content: [
        `VITE_SUPABASE_URL=${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}`,
        `VITE_SUPABASE_ANON_KEY=${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}`,
      ].join('\n'),
    },
  ] : [];
  const templateXml = templateFiles.length > 0
    ? templateFiles.map((f) => `<file path="${f.path}">\n${f.content}\n</file>`).join('\n\n') + '\n\n'
    : '';

  // 预存模板文件到数据库（preview 系统从 DB 读取文件写入磁盘）
  if (templateFiles.length > 0) {
    const templateInserts = templateFiles.map((f) => ({
      project_id: projectId,
      path: f.path,
      content: f.content,
      version: 1,
    }));
    await supabase.from('project_files').insert(templateInserts);
  }

  // 创建生成会话记录
  const { data: session } = await supabase
    .from('generation_sessions')
    .insert({
      project_id: projectId,
      model: modelName,
      prompt: prompt.slice(0, 10000), // 截断过长的 prompt
    })
    .select()
    .single();

  // 保存用户消息
  if (session) {
    await supabase.from('messages').insert({
      session_id: session.id,
      role: 'user',
      content: prompt,
    });
  }

  // ★ 将聊天消息写入 project_messages（UI 读取的表），使用客户端传来的 ID 保持一致
  const now = Date.now();
  if (userMessageId && assistantMessageId) {
    await supabase.from('project_messages').upsert([
      {
        id: userMessageId,
        project_id: projectId,
        role: 'user',
        content: userDisplayContent || prompt,
        message_type: 'text',
        created_at: now,
      },
      {
        id: assistantMessageId,
        project_id: projectId,
        role: 'assistant',
        content: '',
        message_type: 'text',
        model_info: { provider, model: modelName, type: effectiveType },
        created_at: now + 1,
      },
    ], { onConflict: 'id' });
  }

  // 用于服务端定期保存 assistant 消息的 partial content
  let _streamedText = '';
  let _lastPartialSave = Date.now();
  const PARTIAL_SAVE_INTERVAL = 5000;

  // 使用 Vercel AI SDK streamText
  // ★ Kimi K2.5 默认开启 reasoning，所有 output token 会先走 reasoning_content，
  //   toTextStreamResponse() 只转发 content → 前端收到 0 字节 → "不生成"。
  //   改用 fullStream 自建流：reasoning 包在 <thinking> 标签中转发（保持连接活跃），
  //   text 内容原样转发。budget_tokens 限制思考消耗，避免耗尽全部 output token。
  //   moonshotai providerOptions 仅对 Kimi 模型生效，DeepSeek / 豆包自动忽略。
  const result = streamText({
    model: aiModel,
    system: systemPrompt,
    messages: userMessages.map((m, idx) => {
      // ★ G2: Last user message with image → multimodal content
      if (imageData && m.role === 'user' && idx === userMessages.length - 1) {
        return {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: m.content },
            { type: 'image' as const, image: imageData },
          ],
        };
      }
      return {
        role: m.role as 'user' | 'assistant',
        content: m.content,
      };
    }),
    // ★ temperature 限制：
    //   Kimi K2.5 thinking 模式只允许 temperature=1
    //   DeepSeek chat/reasoner 只允许 temperature=1
    //   豆包可以自定义 temperature
    //   统一不传 temperature，使用各模型 API 默认值
    maxOutputTokens: getMaxOutputTokens(effectiveType),
    // ★ providerOptions 按 provider key 精确匹配，只对对应模型生效：
    //   - moonshotai: Kimi K2.5 需要 thinking + budgetTokens 限制思考量
    //   - deepseek: 不能传！deepseek-chat 收到后静默升级为 deepseek-reasoner → 0 字节输出
    //   - openai(豆包): 不传 thinking，豆包 API 不支持此参数格式
    // ★ 注意：SDK 用 camelCase (budgetTokens)，会自动转为 snake_case (budget_tokens) 发送给 API
    providerOptions: {
      moonshotai: { thinking: { type: 'enabled', budgetTokens: 8192 } },
    },
    onFinish: async ({ text, usage }) => {
      // 生成完成后：解析代码并保存文件（仅 LLM 生成的部分）
      const parsedFiles = parseGeneratedCode(text);

      // ★ Update build-manager status
      buildManager.complete(projectId, parsedFiles.length);

      if (parsedFiles.length > 0) {
        // 获取当前文件最新版本号
        const { data: existing } = await supabase
          .from('project_files')
          .select('path, version')
          .eq('project_id', projectId)
          .order('version', { ascending: false });

        const versionMap = new Map<string, number>();
        for (const f of existing || []) {
          if (!versionMap.has(f.path)) {
            versionMap.set(f.path, f.version);
          }
        }

        // ★ Scaffold 模板保护：过滤掉 LLM 生成的模板文件（模板已预注入，LLM 版本可能有问题）
        const templatePathSet = new Set(SCAFFOLD_TEMPLATE_PATHS);
        const filteredFiles = effectiveType === 'scaffold'
          ? parsedFiles.filter((f) => {
              if (templatePathSet.has(f.path) && versionMap.has(f.path)) {
                console.log(`[Generate] Skipping LLM overwrite of template: ${f.path}`);
                return false;
              }
              return true;
            })
          : parsedFiles;

        const inserts = filteredFiles.map((f) => ({
          project_id: projectId,
          path: f.path,
          content: f.content,
          version: (versionMap.get(f.path) || 0) + 1,
        }));

        if (inserts.length > 0) {
          await supabase.from('project_files').insert(inserts);
        }
      }

      // 自动执行 SQL schema（建表、RLS 策略等）
      const schemaFile = parsedFiles.find((f) => f.path.endsWith('.sql'));
      if (schemaFile) {
        const result = await executeSchemaSQL(schemaFile.content);
        if (result.success) {
          console.log('[Schema] Auto-executed schema SQL');
        } else {
          console.warn('[Schema] Failed to auto-execute:', result.error);
        }
      }

      // 更新会话记录
      if (session) {
        await supabase
          .from('generation_sessions')
          .update({
            tokens_used: (usage?.totalTokens) || 0,
          })
          .eq('id', session.id);

        // 保存 AI 回复消息
        await supabase.from('messages').insert({
          session_id: session.id,
          role: 'assistant',
          content: text.slice(0, 50000), // 截断过长的回复
          file_changes: parsedFiles.map((f) => ({
            path: f.path,
            action: 'create' as const,
          })),
        });
      }

      // ★ 更新 project_messages 中的 assistant 消息为最终内容（UI 表）
      if (assistantMessageId) {
        const displayContent = cleanForDisplay(text);
        await supabase.from('project_messages')
          .update({
            content: displayContent || '代码生成完成',
            model_info: { provider, model: modelName, type: effectiveType },
            file_changes: parsedFiles.map((f) => ({
              path: f.path,
              action: 'create' as const,
            })),
          })
          .eq('id', assistantMessageId);
      }

      // ★ 标记 plan_sessions 为 completed（防止页面重入时错误恢复 Plan 模式）
      if (planSessionId) {
        await supabase.from('plan_sessions')
          .update({ status: 'completed' })
          .eq('id', planSessionId);
      }
    },
  });

  // 模型路由信息 headers（让前端显示当前使用的模型）
  const routingHeaders = {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Model-Provider': provider,
    'X-Model-Name': modelName,
    'X-Generation-Type': effectiveType,
  };

  // ★ 用 fullStream 自建流，替代 toTextStreamResponse()
  // toTextStreamResponse() 只转发 text-delta，丢弃 reasoning-delta，
  // 导致 Kimi K2.5 等 reasoning 模型在思考阶段前端收不到任何数据。
  // 自建流将 reasoning 内容包在 <thinking> 标签中转发：
  //   1. 保持 HTTP 连接活跃，防止超时断开
  //   2. 前端可展示"正在思考"的进度
  //   3. <thinking> 标签不含 path 属性，不会被 parseGeneratedCode 误解析为代码文件
  const encoder = new TextEncoder();

  const buildLLMStream = (): ReadableStream => {
    return new ReadableStream({
      async start(controller) {
        try {
          for await (const part of result.fullStream) {
            switch (part.type) {
              case 'reasoning-start':
                controller.enqueue(encoder.encode('<thinking>\n'));
                break;
              case 'reasoning-delta':
                controller.enqueue(encoder.encode(part.text));
                break;
              case 'reasoning-end':
                controller.enqueue(encoder.encode('\n</thinking>\n'));
                break;
              case 'text-delta':
                _streamedText += part.text;
                controller.enqueue(encoder.encode(part.text));
                // ★ 定期保存 partial content 到 project_messages（服务端驱动，不依赖客户端）
                if (assistantMessageId && Date.now() - _lastPartialSave > PARTIAL_SAVE_INTERVAL) {
                  _lastPartialSave = Date.now();
                  const partial = cleanForDisplay(_streamedText);
                  if (partial.length > 0) {
                    Promise.resolve(
                      supabase.from('project_messages')
                        .update({ content: partial })
                        .eq('id', assistantMessageId)
                    ).catch(() => {});
                  }
                }
                break;
              case 'error': {
                // ★ 关键修复：LLM API 错误必须转发到前端，否则流静默结束 → "直接中断"
                const errDetail = part.error instanceof Error
                  ? part.error.message
                  : typeof part.error === 'string'
                    ? part.error
                    : JSON.stringify(part.error);
                console.error('[LLM Stream] Model error:', errDetail);
                controller.enqueue(encoder.encode(`\n\n[模型错误] ${errDetail}\n`));
                break;
              }
              // finish、tool-call 等其他事件类型不转发
            }
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error('[LLM Stream] Stream error:', errMsg);
          buildManager.fail(projectId, errMsg);
          // ★ 流异常也要转发到前端，而不是静默吞掉
          try {
            controller.enqueue(encoder.encode(`\n\n[流错误] ${errMsg}\n`));
          } catch {
            // controller 可能已关闭，忽略
          }
        } finally {
          controller.close();
        }
      },
    });
  };

  // Scaffold：先发送模板文件，再接 LLM 流
  if (templateXml) {
    const llmStream = buildLLMStream();
    const reader = llmStream.getReader();

    const compositeStream = new ReadableStream({
      async start(controller) {
        // 1. 先发送预注入的模板文件
        controller.enqueue(encoder.encode(templateXml));

        // 2. 再转发 LLM 的流式输出（含 <thinking> + 代码）
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(compositeStream, { headers: routingHeaders });
  }

    // 非 scaffold：直接返回 LLM 流
    return new Response(buildLLMStream(), { headers: routingHeaders });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

/**
 * 根据模型和类型返回安全的 maxOutputTokens
 * DeepSeek chat/reasoner: max 8192
 * Kimi K2.5: max 65536
 * Doubao: max 4096
 */
function getMaxOutputTokens(type: GenerationType): number {
  switch (type) {
    case 'scaffold':  return 64000;  // GPT-5.3-Codex
    case 'refactor':  return 64000;  // GPT-5.3-Codex
    case 'iterate':   return 64000;  // Kimi K2.5
    case 'reason':    return 8192;   // DeepSeek Reasoner
    case 'complete':  return 4096;   // Doubao Flash
    default:          return 8192;
  }
}

/**
 * 清理 LLM 原始输出为适合 UI 显示的内容
 * 1. 移除 <thinking> 推理标签
 * 2. 移除模板文件的 XML 块（保留 LLM 生成的文件块）
 */
function cleanForDisplay(raw: string): string {
  // Strip <thinking>...</thinking>
  let clean = raw.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '');
  // Strip template file XML blocks (keep LLM-generated ones)
  const tplPaths = new Set(SCAFFOLD_TEMPLATE_PATHS);
  clean = clean.replace(
    /<file\s+path="([^"]+)">\s*[\s\S]*?<\/file>\s*/g,
    (match, p) => tplPaths.has(p) ? '' : match
  );
  return clean.trim();
}

/**
 * 服务端根据 prompt 内容检测生成类型（当客户端错误传 scaffold 时使用）
 */
function detectServerType(prompt: string): GenerationType {
  const p = prompt.toLowerCase();

  const refactorKeywords = [
    '重构', '架构', '重新设计', '重新组织', '拆分', '模块化',
    '重写', '整体改造', '目录结构', '项目结构', '大改',
    'refactor', 'restructure', 'reorganize', 'rewrite', 'architecture',
  ];
  if (refactorKeywords.some((kw) => p.includes(kw))) return 'refactor';

  const reasonKeywords = [
    '算法', '推理', '复杂逻辑', '数学', '递归', '动态规划',
    '优化算法', '排序', '搜索', '图论', '深度优先', '广度优先',
    'algorithm', 'reasoning', 'optimize', 'complexity',
  ];
  if (reasonKeywords.some((kw) => p.includes(kw))) return 'reason';

  return 'iterate';
}
