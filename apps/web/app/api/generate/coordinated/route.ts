/**
 * POST /api/generate/coordinated
 * 多 Agent 协调生成 — 用于 scaffold 复杂应用
 *
 * 流程: Architect → Frontend+Backend 并行 → QA → 自动修复
 * 通过 SSE 返回进度和最终文件
 */

import { NextRequest } from 'next/server';
import { AgentCoordinator, type CoordinationProgress } from '@/lib/agents/coordinator';
import { createServiceSupabase } from '@/lib/supabase';
import { getScaffoldTemplateFiles, SCAFFOLD_TEMPLATE_PATHS } from '@/lib/templates/scaffold-base';
import { executeSchemaSQL } from '@/lib/db/execute-schema';
import { buildManager } from '@/lib/build/build-manager';
import { requireAuth, handleAuthError } from '@/lib/auth';
import { scanFiles } from '@/lib/security/code-classifier';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();

    const body = await request.json();
    const {
      projectId,
      prompt,
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

    // 注册构建任务
    buildManager.start(projectId, { provider: 'multi-agent', model: 'coordinator', type: 'scaffold' });

    // 保存用户消息
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
          model_info: { provider: 'multi-agent', model: 'coordinator', type: 'scaffold' },
          created_at: now + 1,
        },
      ], { onConflict: 'id' });
    }

    // 模板文件预注入
    const templateFiles = [
      ...getScaffoldTemplateFiles(),
      {
        path: '.env',
        content: [
          `VITE_SUPABASE_URL=${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}`,
          `VITE_SUPABASE_ANON_KEY=${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}`,
        ].join('\n'),
      },
    ];

    const templateInserts = templateFiles.map((f) => ({
      project_id: projectId,
      path: f.path,
      content: f.content,
      version: 1,
    }));
    await supabase.from('project_files').insert(templateInserts);

    // SSE 流
    const encoder = new TextEncoder();
    const templatePathSet = new Set(SCAFFOLD_TEMPLATE_PATHS);

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event, ...data as object })}\n\n`));
        };

        // 1. 先发送模板文件 XML
        const templateXml = templateFiles
          .map((f) => `<file path="${f.path}">\n${f.content}\n</file>`)
          .join('\n\n');
        controller.enqueue(encoder.encode(templateXml + '\n\n'));

        // 2. 启动协调器
        const coordinator = new AgentCoordinator({
          onProgress: (progress: CoordinationProgress) => {
            send('progress', {
              phase: progress.phase,
              detail: progress.detail,
              agent: progress.agentRole,
              percent: progress.progress,
            });
          },
        });

        try {
          const result = await coordinator.orchestrate(prompt, templateFiles);

          if (!result.success) {
            send('error', { message: 'Multi-agent coordination failed' });
            buildManager.fail(projectId, 'Coordination failed');
            controller.close();
            return;
          }

          // 3. 发送生成的文件 XML（过滤模板文件）
          const generatedFiles = result.files.filter(f => !templatePathSet.has(f.path));
          for (const file of generatedFiles) {
            controller.enqueue(encoder.encode(`<file path="${file.path}">\n${file.content}\n</file>\n\n`));
          }

          // 4. 发送完成摘要
          const summaryParts: string[] = [];
          if (result.plan) {
            summaryParts.push(`架构设计: ${result.plan.pages.length} 页面, ${result.plan.entities.length} 实体`);
          }
          summaryParts.push(`生成文件: ${generatedFiles.length} 个`);
          if (result.validation) {
            summaryParts.push(result.validation.passed ? 'QA 验证通过' : `QA 发现 ${result.validation.errors.length} 个问题（已自动修复）`);
          }
          summaryParts.push(`耗时: ${(result.duration / 1000).toFixed(1)}s`);

          controller.enqueue(encoder.encode(`\n${summaryParts.join(' | ')}\n`));

          // 5. 保存文件到数据库
          const allFiles = result.files;
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

          const filteredFiles = allFiles.filter(f => {
            if (templatePathSet.has(f.path) && versionMap.has(f.path)) return false;
            return true;
          });

          const inserts = filteredFiles.map((f) => ({
            project_id: projectId,
            path: f.path,
            content: f.content,
            version: (versionMap.get(f.path) || 0) + 1,
          }));

          if (inserts.length > 0) {
            await supabase.from('project_files').insert(inserts);
          }

          // 6. 安全扫描
          const fileMap: Record<string, string> = {};
          for (const f of generatedFiles) fileMap[f.path] = f.content;
          const { summary: secSummary } = scanFiles(fileMap);
          if (secSummary.critical > 0) {
            console.warn(`[Coordinated] ⚠ ${secSummary.critical} critical security issues`);
          }

          // 7. 自动执行 SQL schema
          const schemaFile = allFiles.find((f) => f.path.endsWith('.sql'));
          if (schemaFile) {
            const schemaResult = await executeSchemaSQL(schemaFile.content);
            if (schemaResult.success) {
              console.log('[Coordinated] Auto-executed schema SQL');
            }
          }

          // 8. 更新 assistant 消息
          if (assistantMessageId) {
            await supabase.from('project_messages')
              .update({
                content: summaryParts.join('\n'),
                model_info: { provider: 'multi-agent', model: 'coordinator', type: 'scaffold' },
                file_changes: generatedFiles.map((f) => ({ path: f.path, action: 'create' as const })),
              })
              .eq('id', assistantMessageId);
          }

          // 9. 标记 plan 完成
          if (planSessionId) {
            await supabase.from('plan_sessions')
              .update({ status: 'completed' })
              .eq('id', planSessionId);
          }

          buildManager.complete(projectId, generatedFiles.length);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error('[Coordinated] Error:', errMsg);
          controller.enqueue(encoder.encode(`\n\n[协调生成错误] ${errMsg}\n`));
          buildManager.fail(projectId, errMsg);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Model-Provider': 'multi-agent',
        'X-Model-Name': 'coordinator',
        'X-Generation-Type': 'scaffold',
      },
    });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
