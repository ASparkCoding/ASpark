'use client';

import { useCallback, useRef } from 'react';
import { useEditorStore, type ChatMessage } from '@/store/editorStore';
import { parseGeneratedCode, parseStreamingCode } from '@/lib/code-gen/parser';
import { validateGeneratedFiles } from '@/lib/code-gen/validator';
import { validateGeneratedProject } from '@/lib/code-gen/post-gen-validator';
import { SCAFFOLD_TEMPLATE_PATHS } from '@/lib/templates/scaffold-base';
import { categorizeFile, getDisplayName } from '@/components/editor/BuildProgress';
import { checkNeedsRefactor, buildRefactorInstruction } from '@/lib/code-gen/refactor-checker';
import type { GenerationType, ConversationMessage } from '@/types';
import type { BuildStep } from '@/store/editorStore';

interface UseGenerationOptions {
  projectId: string;
}

interface GenerateParams {
  prompt: string;
  type?: GenerationType;
  imageData?: string; // base64 data URL for vision input
  skipQuestions?: boolean; // skip builder questions clarity check
  isAutoFix?: boolean; // mark as auto-fix generation (concise display)
}

/**
 * 模板文件路径集合（用于从聊天显示中过滤 template XML）
 */
const TEMPLATE_PATHS = new Set(SCAFFOLD_TEMPLATE_PATHS);

/**
 * 从流式内容中移除 template 文件的 XML 块，只保留 LLM 生成的内容
 */
function stripTemplateXml(content: string): string {
  return content.replace(
    /<file\s+path="([^"]+)">\s*[\s\S]*?<\/file>\s*/g,
    (match, path) => TEMPLATE_PATHS.has(path) ? '' : match
  );
}

/**
 * 移除 <thinking>...</thinking> 标签（后端转发的 reasoning 内容）
 * 用于聊天显示和代码解析前的内容清理
 */
function stripThinkingContent(content: string): string {
  return content.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '');
}

/**
 * 检测当前是否正处于 <thinking> 阶段（标签已开启但尚未关闭）
 */
function isThinking(content: string): boolean {
  const lastOpen = content.lastIndexOf('<thinking>');
  const lastClose = content.lastIndexOf('</thinking>');
  return lastOpen !== -1 && lastOpen > lastClose;
}

/**
 * 截断消息内容：移除 <file> 标签，截断到 maxLen
 */
function truncateMessageContent(content: string, maxLen: number): string {
  const cleaned = content.replace(/<file\s+path="[^"]*">[\s\S]*?<\/file>/g, '[file output]');
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + '...' : cleaned;
}

/**
 * 从 auto-fix prompt 中提取简短摘要（去掉文件代码，只保留错误列表）
 * 在聊天中显示精简版本，而非完整的修复 prompt
 */
function extractFixSummary(fixPrompt: string): string {
  // Extract error list section
  const errorListMatch = fixPrompt.match(/## 错误列表\n([\s\S]*?)(?=\n##|\n要求：)/);
  if (errorListMatch) {
    const errors = errorListMatch[1].trim().split('\n').filter(Boolean);
    if (errors.length > 0) {
      // Show at most 3 errors to keep it compact
      const shown = errors.slice(0, 3).map(e => e.replace(/^-\s*/, '').trim());
      const extra = errors.length > 3 ? ` (+${errors.length - 3} more)` : '';
      return `修复 ${errors.length} 个错误${extra}：\n${shown.join('\n')}`;
    }
  }

  // Fallback: just show first line
  const firstLine = fixPrompt.split('\n')[0] || '';
  return firstLine.slice(0, 100);
}

export function useGeneration({ projectId }: UseGenerationOptions) {
  const abortControllerRef = useRef<AbortController | null>(null);

  const {
    chatMessages,
    isGenerating,
    addChatMessage,
    updateLastAssistantMessage,
    setIsGenerating,
    addFile,
    updateFile,
    setActiveFile,
    addBuildStep,
    updateBuildStep,
    setBuildPhase,
    clearBuildProgress,
  } = useEditorStore();

  /**
   * ★ T6: 分层对话上下文策略
   * 1. 核心上下文（永远保留）：Plan 内容 + 第一条 user message
   * 2. 近期上下文（滑动窗口）：最近 6 轮对话
   * 3. 中期摘要（压缩）：6-20 轮的对话自动摘要为 1 段文字
   */
  const getConversationHistory = useCallback((): ConversationMessage[] => {
    const { planContent, planOriginalPrompt } = useEditorStore.getState();
    const history: ConversationMessage[] = [];

    // 1. 核心上下文（永远保留）
    if (planContent) {
      history.push({
        role: 'system',
        content: `[项目 Plan]\n${planContent.slice(0, 2000)}`,
      });
    } else if (planOriginalPrompt) {
      history.push({
        role: 'user',
        content: `[原始需求] ${planOriginalPrompt}`,
      });
    }

    // 2. 过滤有效消息
    const userAssistantMsgs = chatMessages.filter(
      (m) => m.role === 'user' || m.role === 'assistant'
    );

    if (userAssistantMsgs.length <= 10) {
      // 消息不多，全部保留
      history.push(
        ...userAssistantMsgs.map((m) => ({
          role: m.role,
          content: truncateMessageContent(m.content, 1000),
        }))
      );
    } else {
      // 3. 中期摘要：较早的消息压缩为一段
      const oldMsgs = userAssistantMsgs.slice(0, -6);
      const summary = oldMsgs
        .filter((m) => m.role === 'user')
        .map((m) => `- ${m.content.slice(0, 100)}`)
        .join('\n');

      history.push({
        role: 'system',
        content: `[历史修改摘要]\n用户之前进行了 ${oldMsgs.length} 轮修改，主要操作：\n${summary}`,
      });

      // 4. 近期上下文：最近 6 轮
      const recentMsgs = userAssistantMsgs.slice(-6);
      history.push(
        ...recentMsgs.map((m) => ({
          role: m.role,
          content: truncateMessageContent(m.content, 1500),
        }))
      );
    }

    return history;
  }, [chatMessages]);

  /**
   * 根据用户 prompt 和项目状态智能判断任务类型，驱动多模型路由
   * ★ 使用 getState() 获取最新 files 状态，避免闭包捕获的 stale files
   */
  const detectGenerationType = useCallback(
    (prompt: string, explicitType?: GenerationType): GenerationType => {
      if (explicitType) return explicitType;

      // ★ 关键修复：使用 getState() 获取最新的 files 状态
      // 之前用闭包中的 files，在页面刷新后 loadFiles() 未完成时 files 为空
      // 导致永远检测为 scaffold → 只调用豆包
      const currentFiles = useEditorStore.getState().files;

      // 无文件 → 首次脚手架生成（→ Kimi K2.5）
      if (currentFiles.length === 0) return 'scaffold';

      const p = prompt.toLowerCase();

      // 重构类关键词（→ Kimi K2.5：262K 长上下文 + SWE-bench 最强）
      const refactorKeywords = [
        '重构', '架构', '重新设计', '重新组织', '拆分', '模块化',
        '重写', '整体改造', '目录结构', '项目结构', '大改',
        'refactor', 'restructure', 'reorganize', 'rewrite', 'architecture',
      ];
      if (refactorKeywords.some((kw) => p.includes(kw))) return 'refactor';

      // 推理/算法类关键词（→ DeepSeek Reasoner：深度思考模式）
      const reasonKeywords = [
        '算法', '推理', '复杂逻辑', '数学', '递归', '动态规划',
        '优化算法', '排序', '搜索', '图论', '深度优先', '广度优先',
        'algorithm', 'reasoning', 'optimize', 'complexity',
      ];
      if (reasonKeywords.some((kw) => p.includes(kw))) return 'reason';

      // 默认：增量迭代修改（→ DeepSeek V3.2 chat：高性价比）
      return 'iterate';
    },
    [] // 不再依赖 files 闭包，改用 getState() 实时获取
  );

  /**
   * 发起 AI 生成请求
   */
  const generate = useCallback(
    async ({ prompt, type, imageData, skipQuestions, isAutoFix }: GenerateParams) => {
      if (!prompt.trim() || isGenerating) return;

      const generationType = detectGenerationType(prompt, type);

      // ★ 3.1 Builder Questions: clarity check for iterate mode (not scaffold/refactor)
      if (
        !skipQuestions &&
        !isAutoFix &&
        generationType === 'iterate' &&
        !imageData &&
        prompt.length >= 5 &&
        prompt.length <= 200
      ) {
        try {
          const checkRes = await fetch(`/api/projects/${projectId}/clarity-check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
          });
          if (checkRes.ok) {
            const { needsClarification, questions } = await checkRes.json();
            if (needsClarification && questions?.length > 0) {
              useEditorStore.getState().setBuilderQuestions(questions, prompt);
              return { success: false, needsClarification: true };
            }
          }
        } catch {
          // Clarity check failed, proceed without questions
        }
      }

      // ★ T9: Save file snapshot before generation (for undo)
      useEditorStore.getState().pushSnapshot(`Before: ${prompt.slice(0, 50)}`);

      // 添加用户消息 — auto-fix 只显示摘要，不显示完整 prompt（含文件代码太冗余）
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: isAutoFix ? extractFixSummary(prompt) : prompt,
        timestamp: Date.now(),
      };
      addChatMessage(userMessage);

      // 添加空的 assistant 消息用于流式填充
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };
      addChatMessage(assistantMessage);
      setIsGenerating(true);

      // ★ Scaffold 模板文件通过 SSE 流从服务端注入（server-side getScaffoldTemplateFiles）
      // 客户端不再预注入，避免 fs 依赖问题

      // ★ Build progress: clear previous and start tracking
      clearBuildProgress();
      setBuildPhase('building');

      // ★ 消息持久化已由服务端 generate route 负责（写入 project_messages 表）
      // 客户端不再保存生成消息，避免竞态和重复

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      let fullContent = '';
      // Track which file paths already have build steps
      const emittedStepPaths = new Set<string>();

      try {
        // ★ Phase 2: Refactor check for iterate mode
        let finalPrompt = prompt;
        if (generationType === 'iterate') {
          const currentFiles = useEditorStore.getState().files;
          const refactorSuggestions = checkNeedsRefactor(
            currentFiles.map(f => ({ path: f.path, content: f.content }))
          );
          const refactorInstruction = buildRefactorInstruction(refactorSuggestions);
          if (refactorInstruction) {
            finalPrompt = refactorInstruction + prompt;
          }
        }

        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            prompt: finalPrompt,
            type: generationType,
            conversationHistory: getConversationHistory(),
            imageData,
            userMessageId: userMessage.id,
            assistantMessageId: assistantMessage.id,
            userDisplayContent: userMessage.content,
            planSessionId: useEditorStore.getState().planSessionId || undefined,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || '生成失败');
        }

        // ★ 从响应 headers 获取实际使用的模型信息
        const modelProvider = response.headers.get('X-Model-Provider') || '';
        const modelName = response.headers.get('X-Model-Name') || '';
        const effectiveType = response.headers.get('X-Generation-Type') || generationType;
        console.log(`[Generation] Model routing: type=${effectiveType}, provider=${modelProvider}, model=${modelName}`);

        // 更新 assistant 消息的模型信息（触发 store 更新以显示 ModelBadge）
        {
          const msgs = [...useEditorStore.getState().chatMessages];
          const lastIdx = msgs.length - 1;
          if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
            msgs[lastIdx] = {
              ...msgs[lastIdx],
              modelInfo: { provider: modelProvider, model: modelName, type: effectiveType },
            };
            useEditorStore.setState({ chatMessages: msgs });
          }
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let lastParsedFileCount = 0;

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            fullContent += chunk;

            // 流式显示：过滤模板 XML 和 <thinking> 内容
            const cleanContent = stripThinkingContent(stripTemplateXml(fullContent)).trim();
            if (isThinking(fullContent)) {
              // reasoning 阶段：显示"正在思考"，让用户知道模型在工作
              updateLastAssistantMessage(cleanContent || '正在思考...');
            } else {
              updateLastAssistantMessage(cleanContent || '正在生成代码...');
            }

            // 实时解析已完成的文件块（先剥离 <thinking> 避免干扰解析）
            const parsableContent = stripThinkingContent(fullContent);
            const { completedFiles, pendingFile } = parseStreamingCode(parsableContent);

            // ★ Build progress: show "Creating..." for pending file
            if (pendingFile && !emittedStepPaths.has(pendingFile.path) && !TEMPLATE_PATHS.has(pendingFile.path)) {
              const stepId = `step-${pendingFile.path}`;
              emittedStepPaths.add(pendingFile.path);
              addBuildStep({
                id: stepId,
                action: 'creating',
                target: getDisplayName(pendingFile.path),
                filePath: pendingFile.path,
                status: 'running',
                category: categorizeFile(pendingFile.path),
                timestamp: Date.now(),
              });
            }

            if (completedFiles.length > lastParsedFileCount) {
              for (let i = lastParsedFileCount; i < completedFiles.length; i++) {
                const newFile = completedFiles[i];

                // ★ Scaffold 模板保护：不让 LLM 覆盖预注入的模板文件
                // 模板文件已通过 composite stream 先注入，LLM 后生成的同名文件会覆盖正确版本
                const currentFiles = useEditorStore.getState().files;
                const existingFile = currentFiles.find((f) => f.path === newFile.path);
                if (generationType === 'scaffold' && existingFile && TEMPLATE_PATHS.has(newFile.path)) {
                  console.log(`[Generation] Skipping LLM overwrite of template: ${newFile.path}`);
                  continue;
                }

                const isEdit = !!existingFile;
                if (existingFile) {
                  updateFile(newFile.path, newFile.content);
                } else {
                  addFile({
                    id: crypto.randomUUID(),
                    project_id: projectId,
                    path: newFile.path,
                    content: newFile.content,
                    version: 1,
                    created_at: new Date().toISOString(),
                  });
                }

                // ★ Build progress: mark step as done
                const stepId = `step-${newFile.path}`;
                if (emittedStepPaths.has(newFile.path)) {
                  // Update existing "creating" → "wrote/editing done"
                  updateBuildStep(stepId, {
                    action: isEdit ? 'editing' : 'wrote',
                    status: 'done',
                  });
                } else {
                  // File completed without a pending phase (fast completion)
                  emittedStepPaths.add(newFile.path);
                  addBuildStep({
                    id: stepId,
                    action: isEdit ? 'editing' : 'wrote',
                    target: getDisplayName(newFile.path),
                    filePath: newFile.path,
                    status: 'done',
                    category: categorizeFile(newFile.path),
                    timestamp: Date.now(),
                  });
                }
              }
              lastParsedFileCount = completedFiles.length;

              // 自动选中第一个非模板文件
              const firstNonTemplate = completedFiles.find(
                (f) => !TEMPLATE_PATHS.has(f.path)
              );
              if (firstNonTemplate && lastParsedFileCount <= completedFiles.length) {
                setActiveFile(firstNonTemplate.path);
              }
            }
          }
        }

        // 流结束后最终解析（剥离 <thinking> 后再解析代码文件）
        const finalContent = stripThinkingContent(fullContent);
        const finalFiles = parseGeneratedCode(finalContent);
        for (const newFile of finalFiles) {
          const currentFiles = useEditorStore.getState().files;
          const existingFile = currentFiles.find((f) => f.path === newFile.path);

          // ★ Scaffold 模板保护（同上）
          if (generationType === 'scaffold' && existingFile && TEMPLATE_PATHS.has(newFile.path)) {
            continue;
          }

          if (existingFile) {
            updateFile(newFile.path, newFile.content);
          } else {
            addFile({
              id: crypto.randomUUID(),
              project_id: projectId,
              path: newFile.path,
              content: newFile.content,
              version: 1,
              created_at: new Date().toISOString(),
            });
          }
        }

        // 最终聊天显示：过滤模板 XML 和 <thinking> 内容
        const finalDisplay = stripThinkingContent(stripTemplateXml(fullContent)).trim();
        updateLastAssistantMessage(finalDisplay || '代码生成完成');

        const generatedCount = finalFiles.filter(
          (f) => !TEMPLATE_PATHS.has(f.path)
        ).length;
        console.log(`[Generation] Completed: ${generatedCount} files generated by LLM`);

        // ★ T5: Static validation of generated files
        const nonTemplateFinal = finalFiles.filter((f) => !TEMPLATE_PATHS.has(f.path));
        if (nonTemplateFinal.length > 0) {
          const allPaths = useEditorStore.getState().files.map((f) => f.path);
          const validationErrors = validateGeneratedFiles(nonTemplateFinal, allPaths);
          if (validationErrors.length > 0) {
            console.warn('[Validator]', validationErrors.length, 'issues found:', validationErrors);
          }
        }

        // ★ E4: 生成后验证管线 — 在预览启动前拦截结构性错误
        if (nonTemplateFinal.length > 0) {
          const currentFiles = useEditorStore.getState().files;
          const existingFilesForValidation = currentFiles.map(f => ({ path: f.path, content: f.content }));
          const newFilesForValidation = nonTemplateFinal.map(f => ({ path: f.path, content: f.content }));

          const issues = validateGeneratedProject(newFilesForValidation, existingFilesForValidation);
          const validationErrors = issues.filter(i => i.severity === 'error');
          const validationWarnings = issues.filter(i => i.severity === 'warning');

          if (validationErrors.length > 0) {
            addChatMessage({
              id: crypto.randomUUID(),
              role: 'system',
              content: `生成后验证发现 ${validationErrors.length} 个问题，将在自动修复阶段处理：\n${validationErrors.map(e => `- [${e.category}] ${e.message}${e.fixSuggestion ? ` (建议: ${e.fixSuggestion})` : ''}`).join('\n')}`,
              timestamp: Date.now(),
              messageType: 'text',
            });
          }

          if (issues.length > 0) {
            useEditorStore.getState().setValidationIssues(issues);
          }

          if (validationWarnings.length > 0) {
            console.warn('[PostGenValidator]', validationWarnings.length, 'warnings:', validationWarnings);
          }
        }

        return { success: true, filesGenerated: finalFiles.length };
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          updateLastAssistantMessage(fullContent + '\n\n[已取消生成]');
          return { success: false, cancelled: true };
        }
        const errMsg = (error as Error).message;
        updateLastAssistantMessage(
          fullContent ? fullContent + '\n\n[生成出错] ' + errMsg : '生成出错：' + errMsg
        );
        return { success: false, error: errMsg };
      } finally {
        setIsGenerating(false);
        abortControllerRef.current = null;
        // ★ Build progress: mark any remaining "running" steps as done, set phase completed
        const steps = useEditorStore.getState().buildSteps;
        for (const s of steps) {
          if (s.status === 'running') {
            updateBuildStep(s.id, { status: 'done', action: 'wrote' });
          }
        }
        if (useEditorStore.getState().buildPhase === 'building') {
          setBuildPhase('completed');
        }
        // ★ 消息持久化由服务端 onFinish 负责，客户端不再保存
      }
    },
    [
      projectId,
      isGenerating,
      detectGenerationType,
      getConversationHistory,
      addChatMessage,
      updateLastAssistantMessage,
      setIsGenerating,
      addFile,
      updateFile,
      setActiveFile,
      addBuildStep,
      updateBuildStep,
      setBuildPhase,
      clearBuildProgress,
    ]
  );

  /**
   * 取消当前生成
   */
  const cancelGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    generate,
    cancelGeneration,
    isGenerating,
  };
}
