'use client';

import { useCallback, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import type { PlanQuestion, PlanStructured } from '@/store/editorStore';

interface UsePlanOptions {
  projectId: string;
}

export function usePlan({ projectId }: UsePlanOptions) {
  const abortRef = useRef<AbortController | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const {
    planMode,
    planStatus,
    planSessionId,
    planOriginalPrompt,
    planQuestions,
    currentQuestionIndex,
    userSupplement,
    enterPlanMode,
    setPlanStatus,
    setPlanSessionId,
    addPlanQuestion,
    answerPlanQuestion,
    advanceQuestion,
    setPlanContent,
    setPlanStructured,
    approvePlan,
    exitPlanMode,
    addChatMessage,
  } = useEditorStore();

  /**
   * 开始 Plan 模式：生成澄清问题
   */
  const startPlanMode = useCallback(
    async (prompt: string) => {
      enterPlanMode(prompt);
      setIsStreaming(true);

      // 添加用户消息到 Chat
      addChatMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      });

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const response = await fetch(`/api/projects/${projectId}/plan/questions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          let errDetail = `HTTP ${response.status}`;
          try {
            const errBody = await response.json();
            errDetail = errBody.error || errDetail;
          } catch {
            errDetail = await response.text().catch(() => errDetail);
          }
          throw new Error(errDetail);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const event = JSON.parse(line);
                if (event.type === 'session') {
                  setPlanSessionId(event.sessionId);
                } else if (event.type === 'question') {
                  const q: PlanQuestion = {
                    id: event.data.id,
                    question: event.data.question,
                    options: event.data.options,
                    answer: null,
                    skipped: false,
                  };
                  addPlanQuestion(q);
                } else if (event.type === 'done') {
                  // questions done
                } else if (event.type === 'error') {
                  console.error('[Plan] Question error:', event.message);
                }
              } catch {
                // ignore malformed lines
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('[Plan] startPlanMode error:', err);
        addChatMessage({
          id: crypto.randomUUID(),
          role: 'system',
          content: `需求分析出错：${(err as Error).message}`,
          timestamp: Date.now(),
        });
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [projectId, enterPlanMode, setPlanSessionId, addPlanQuestion, addChatMessage]
  );

  /**
   * 生成 Plan
   */
  const generatePlan = useCallback(async () => {
    const state = useEditorStore.getState();
    setPlanStatus('generating_plan');
    setIsStreaming(true);

    const qaHistory = state.planQuestions
      .filter((q) => !q.skipped && q.answer)
      .map((q) => ({ question: q.question, answer: q.answer! }));

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const response = await fetch(`/api/projects/${projectId}/plan/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: state.planSessionId,
          qaHistory,
          supplement: state.userSupplement || undefined,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error('生成 Plan 失败');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let planText = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);
              if (event.type === 'plan_chunk') {
                planText += event.content;
                setPlanContent(planText);
              } else if (event.type === 'plan_complete') {
                setPlanContent(event.planContent || planText);
                if (event.planStructured) {
                  setPlanStructured(event.planStructured as PlanStructured);
                }
                setPlanStatus('plan_ready');
              } else if (event.type === 'error') {
                console.error('[Plan] Generate error:', event.message);
              }
            } catch {
              // ignore
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error('[Plan] generatePlan error:', err);
      addChatMessage({
        id: crypto.randomUUID(),
        role: 'system',
        content: `Plan 生成出错：${(err as Error).message}`,
        timestamp: Date.now(),
      });
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [projectId, setPlanStatus, setPlanContent, setPlanStructured, addChatMessage]);

  /**
   * 回答问题后，前进到下一个问题
   * 如果所有问题都已回答，自动触发 Plan 生成
   */
  const handleAnswer = useCallback(
    async (questionId: string, answer: string | null, skipped: boolean) => {
      answerPlanQuestion(questionId, answer, skipped);

      const state = useEditorStore.getState();
      const questionIdx = state.planQuestions.findIndex(q => q.id === questionId);

      // ★ 回答后，找下一个未回答的问题（跳过已回答的）
      // 这样修改了第 1 题后，第 2-5 题如果已回答就直接跳到末尾生成 Plan
      const nextUnanswered = state.planQuestions.findIndex(
        (q, i) => i > questionIdx && q.answer === null && !q.skipped
      );

      if (nextUnanswered === -1) {
        // 所有问题都已回答 → 跳到末尾
        useEditorStore.setState({ currentQuestionIndex: state.planQuestions.length });
      } else {
        useEditorStore.setState({ currentQuestionIndex: nextUnanswered });
      }

      // ★ 实时保存 questions（含最新 answer）到 plan_sessions，页面重入时可恢复
      const latestState = useEditorStore.getState();
      if (latestState.planSessionId) {
        const questionsForDb = latestState.planQuestions.map(q => ({
          id: q.id,
          question: q.question,
          options: q.options,
          answer: q.answer,
          skipped: q.skipped,
        }));
        fetch(`/api/projects/${projectId}/plan/session`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: latestState.planSessionId,
            questions: questionsForDb,
          }),
        }).catch(() => {});
      }

      // 检查是否所有问题都回答了
      const finalIdx = useEditorStore.getState().currentQuestionIndex;
      if (finalIdx >= state.planQuestions.length) {
        // 所有问题回答完毕，自动生成 Plan
        await generatePlan();
      }
    },
    [projectId, answerPlanQuestion, generatePlan]
  );

  /**
   * 审批 Plan → 进入构建阶段
   */
  const handleApprovePlan = useCallback(async () => {
    const state = useEditorStore.getState();

    approvePlan();

    // 通知后端
    try {
      await fetch(`/api/projects/${projectId}/plan/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: state.planSessionId,
          approved: true,
        }),
      });
    } catch {
      // non-critical
    }

    // ★ G6: Extract branding (appIcon, brandColor, appName) from plan structured data
    const structured = state.planStructured as Record<string, unknown> | null;
    if (structured) {
      const branding: Record<string, unknown> = {};
      if (structured.appIcon) branding.appIcon = structured.appIcon;
      if (structured.brandColor) branding.brandColor = structured.brandColor;
      if (structured.appName) branding.appName = structured.appName;

      if (Object.keys(branding).length > 0) {
        fetch(`/api/projects/${projectId}/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(branding),
        }).catch(() => {});
      }
    }

    // 返回增强 prompt 供 useGeneration 使用
    return {
      originalPrompt: state.planOriginalPrompt,
      planContent: state.planContent,
      planStructured: state.planStructured,
    };
  }, [projectId, approvePlan]);

  /**
   * 修改 Plan
   */
  const handleRevisePlan = useCallback(
    async (feedback: string) => {
      const state = useEditorStore.getState();

      try {
        await fetch(`/api/projects/${projectId}/plan/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: state.planSessionId,
            approved: false,
            feedback,
          }),
        });
      } catch {
        // non-critical
      }

      // 用 feedback 重新生成
      useEditorStore.setState({ userSupplement: feedback });
      await generatePlan();
    },
    [projectId, generatePlan]
  );

  /**
   * 取消
   */
  const cancelPlan = useCallback(() => {
    abortRef.current?.abort();
    exitPlanMode();
  }, [exitPlanMode]);

  return {
    planMode,
    planStatus,
    isStreaming,
    startPlanMode,
    handleAnswer,
    handleApprovePlan,
    handleRevisePlan,
    cancelPlan,
    generatePlan,
  };
}
