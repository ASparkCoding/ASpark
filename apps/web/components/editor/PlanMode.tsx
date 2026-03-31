'use client';

import { Loader2, ClipboardList } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { PlanQuestionCard } from './PlanQuestionCard';
import { PlanDocument } from './PlanDocument';

interface PlanModeProps {
  onAnswer: (questionId: string, answer: string | null, skipped: boolean) => void;
  onApprovePlan: () => void;
  onRevisePlan: (feedback: string) => void;
  isStreaming?: boolean;
}

export function PlanMode({
  onAnswer,
  onApprovePlan,
  onRevisePlan,
  isStreaming,
}: PlanModeProps) {
  const {
    planStatus,
    planQuestions,
    currentQuestionIndex,
    planContent,
    userSupplement,
    setUserSupplement,
    goBackToQuestion,
  } = useEditorStore();

  return (
    <div className="space-y-3 py-2">
      {/* Plan 审批状态标记 */}
      {planStatus === 'approved' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-green-500/10 border border-green-500/20">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-xs font-medium text-green-600 dark:text-green-400">
            Plan approved
          </span>
        </div>
      )}

      {/* 已回答的问题列表 — hover 显示"修改"按钮 */}
      {planQuestions.slice(0, currentQuestionIndex).map((q, idx) => (
        <div key={q.id} className="relative group">
          <PlanQuestionCard
            question={q}
            onAnswer={() => {}}
            onSkip={() => {}}
            disabled
          />
          {planStatus === 'questioning' && (
            <button
              onClick={() => goBackToQuestion(idx)}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100
                         transition-opacity text-[10px] px-2 py-0.5 rounded
                         bg-muted hover:bg-accent border"
            >
              修改
            </button>
          )}
        </div>
      ))}

      {/* 当前问题 */}
      {planStatus === 'questioning' && currentQuestionIndex < planQuestions.length && (
        <PlanQuestionCard
          key={planQuestions[currentQuestionIndex].id}
          question={planQuestions[currentQuestionIndex]}
          onAnswer={(answer) =>
            onAnswer(planQuestions[currentQuestionIndex].id, answer, false)
          }
          onSkip={() =>
            onAnswer(planQuestions[currentQuestionIndex].id, null, true)
          }
          disabled={isStreaming}
        />
      )}

      {/* 等待更多问题加载 */}
      {planStatus === 'questioning' &&
        currentQuestionIndex >= planQuestions.length &&
        isStreaming && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>正在分析需求，生成问题...</span>
          </div>
        )}

      {/* 所有问题回答完毕，等待生成 Plan */}
      {planStatus === 'questioning' &&
        currentQuestionIndex >= planQuestions.length &&
        !isStreaming &&
        planQuestions.length > 0 && (
          <div className="space-y-3">
            {/* 补充输入区 */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  补充说明（可选）— 添加问题未覆盖的需求、约束或想法
                </span>
              </div>
              <textarea
                value={userSupplement}
                onChange={(e) => setUserSupplement(e.target.value)}
                placeholder="例如：需要支持移动端响应式布局、数据导出功能..."
                className="w-full min-h-[50px] rounded border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>正在生成构建计划...</span>
            </div>
          </div>
        )}

      {/* Plan 生成中 */}
      {planStatus === 'generating_plan' && !planContent && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>正在生成构建计划...</span>
        </div>
      )}

      {/* Plan 文档展示 */}
      {planContent && planStatus !== 'approved' && planStatus !== 'building' && (
        <PlanDocument
          content={planContent}
          onApprove={onApprovePlan}
          onRevise={onRevisePlan}
          isLoading={isStreaming}
        />
      )}

      {/* 已批准，正在构建 */}
      {planStatus === 'building' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>正在根据 Plan 构建应用...</span>
        </div>
      )}
    </div>
  );
}
