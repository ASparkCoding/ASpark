'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Send, Loader2, Trash2, Square, FileCode, Cpu, AlertTriangle, XCircle, RefreshCw, Undo2, Redo2, ChevronDown, Plus, X, Flame, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore, type ChatMessage } from '@/store/editorStore';
import { useGeneration } from '@/hooks/useGeneration';
import { usePlan } from '@/hooks/usePlan';
import { useAutoFix } from '@/hooks/useAutoFix';
import { PlanMode } from './PlanMode';
import { SuggestionChips, type Suggestion } from './SuggestionChips';
import { BuildProgress } from './BuildProgress';
import { BuilderQuestions } from './BuilderQuestions';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatPanelProps {
  projectId: string;
}

export function ChatPanel({ projectId }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const [attachedImage, setAttachedImage] = useState<{ file: File; preview: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevGeneratingRef = useRef(false);
  const isNearBottomRef = useRef(true);

  const { chatMessages, clearChat, files, planMode, planStatus, previewStatus, buildPhase, fileSnapshots, redoSnapshots, undo, redo, builderQuestions, builderQuestionsContext, clearBuilderQuestions } = useEditorStore();
  const { generate, cancelGeneration, isGenerating } = useGeneration({ projectId });
  const searchParams = useSearchParams();
  const skipPlanParam = searchParams.get('skipPlan') === 'true';
  const {
    isStreaming: isPlanStreaming,
    startPlanMode,
    handleAnswer,
    handleApprovePlan,
    handleRevisePlan,
    cancelPlan,
  } = usePlan({ projectId });
  const { waitAndFix, resetFixCount, isFixing } = useAutoFix({ projectId, generate });

  // 检测用户是否在底部附近（80px 阈值）+ 浮动跳转按钮
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 80;
    setShowJumpButton(distanceFromBottom > 300);
  }, []);

  // 只在用户位于底部时自动滚动，手动上滑后不强制拉回
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, planMode, planStatus]);

  /**
   * 代码生成完成后 → 自动等待预览 → 检测/修复错误 → 生成建议
   * ★ 两种触发路径：
   *   1. isGenerating true→false（正常在页面内生成完成）
   *   2. buildPhase background→completed（后台生成完成，用户返回后 pollBuildStatus 检测到）
   */
  const prevBuildPhaseRef = useRef(buildPhase);
  useEffect(() => {
    const generationJustFinished = prevGeneratingRef.current && !isGenerating;
    const backgroundJustCompleted = prevBuildPhaseRef.current === 'background' && buildPhase === 'completed';

    if (generationJustFinished || backgroundJustCompleted) {
      const currentFiles = useEditorStore.getState().files;
      if (currentFiles.length > 0) {
        if (!isFixing()) {
          resetFixCount();
          waitAndFix().then(() => {
            fetchSuggestions();
          });
        }
      }
    }
    prevGeneratingRef.current = isGenerating;
    prevBuildPhaseRef.current = buildPhase;
  }, [isGenerating, buildPhase, waitAndFix, resetFixCount, isFixing]);

  /**
   * 获取 AI 建议（轻量端点，不污染 generation_sessions）
   */
  const fetchSuggestions = useCallback(async () => {
    const { files: currentFiles, isGenerating: stillGenerating } = useEditorStore.getState();
    if (stillGenerating || currentFiles.length === 0) return;

    const filePaths = currentFiles
      .filter((f) => !f.path.includes('components/ui/') && !f.path.includes('node_modules'))
      .map((f) => f.path);

    try {
      const res = await fetch(`/api/projects/${projectId}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePaths }),
      });
      if (!res.ok) return;
      const { suggestions } = await res.json();
      if (Array.isArray(suggestions)) {
        setSuggestions(suggestions.slice(0, 4));
      }
    } catch {
      // 建议获取失败不影响主流程
    }
  }, [projectId]);

  // ★ G2: Image upload handler
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      alert('请上传 PNG、JPG 或 WEBP 格式的图片');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAttachedImage({ file, preview: reader.result as string });
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }, []);

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt && !attachedImage) return;
    if (isGenerating || isPlanStreaming) return;

    const imageData = attachedImage?.preview || undefined;
    setAttachedImage(null);
    setInput('');
    setSuggestions([]);

    // 新项目（无文件）→ 进入 Plan Mode（除非用户选择了 skipPlan）
    const currentFiles = useEditorStore.getState().files;
    if (currentFiles.length === 0 && !planMode && !skipPlanParam) {
      await startPlanMode(prompt);
      return;
    }

    // 已有文件 → 直接 iterate 生成（可附带图片）
    await generate({ prompt, imageData });
  };

  /**
   * 点击建议 → 自动发送
   */
  const handleSuggestionSelect = async (prompt: string) => {
    setSuggestions([]);
    await generate({ prompt });
  };

  /**
   * Plan 审批 → 触发构建
   */
  const handlePlanApprove = async () => {
    const planData = await handleApprovePlan();
    if (planData) {
      const { planToScaffoldPrompt } = await import('@/lib/prompts/plan-to-prompt');
      const enhancedPrompt = planToScaffoldPrompt(
        planData.originalPrompt,
        planData.planContent || '',
        planData.planStructured
      );
      useEditorStore.setState({ planStatus: 'building' });
      await generate({ prompt: enhancedPrompt, type: 'scaffold' });
      useEditorStore.setState({ planMode: false, planStatus: 'idle' });
    }
  };

  const handleRegenerate = useCallback(async () => {
    const msgs = useEditorStore.getState().chatMessages;
    let lastAssistantIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant') {
        lastAssistantIdx = i;
        break;
      }
    }
    if (lastAssistantIdx < 0) return;

    let userPrompt = '';
    for (let i = lastAssistantIdx - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        userPrompt = msgs[i].content;
        break;
      }
    }
    if (!userPrompt) return;

    useEditorStore.getState().removeMessagesFromId(msgs[lastAssistantIdx].id);
    await generate({ prompt: userPrompt });
  }, [generate]);

  /**
   * Builder Questions: user answered follow-up questions
   */
  const handleBuilderAnswer = async (answers: string[]) => {
    const originalPrompt = builderQuestionsContext || '';
    clearBuilderQuestions();
    const enriched = `${originalPrompt}\n\n补充说明：\n${answers.filter(Boolean).map((a, i) => `${i + 1}. ${a}`).join('\n')}`;
    await generate({ prompt: enriched, skipQuestions: true });
  };

  /**
   * Builder Questions: user skipped, generate with original prompt
   */
  const handleBuilderSkip = async () => {
    const originalPrompt = builderQuestionsContext || '';
    clearBuilderQuestions();
    await generate({ prompt: originalPrompt, skipQuestions: true });
  };

  const isBusy = isGenerating || isPlanStreaming;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Mode Tabs Header */}
      <div className="flex items-center border-b">
        <div className="flex items-center flex-1">
          {(['default', 'discuss', 'edit'] as const).map((mode) => {
            const labels = { default: '默认', discuss: '讨论', edit: '编辑' };
            const isActive = (useEditorStore.getState().visualEditMode ? 'edit' : 'default') === mode ||
              (!useEditorStore.getState().visualEditMode && mode === 'default');
            return (
              <button
                key={mode}
                className={`flex-1 h-12 text-sm font-medium transition-colors border-b-[3px] -mb-px ${
                  mode === 'default' && !useEditorStore.getState().visualEditMode
                    ? 'border-brand text-foreground font-semibold'
                    : mode === 'edit' && useEditorStore.getState().visualEditMode
                      ? 'border-brand text-foreground font-semibold'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  if (mode === 'edit') {
                    useEditorStore.getState().setVisualEditMode(true);
                    useEditorStore.getState().setActiveTab('preview');
                  } else {
                    useEditorStore.getState().setVisualEditMode(false);
                  }
                }}
              >
                {labels[mode]}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1 px-2">
          {planMode && (
            <Button variant="ghost" size="sm" onClick={cancelPlan} title="退出 Plan 模式" className="h-7 text-xs text-muted-foreground">
              退出 Plan
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              clearChat();
              fetch(`/api/projects/${projectId}/messages`, { method: 'DELETE' }).catch(() => {});
            }}
            title="清空对话"
            className="h-7 w-7"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* 消息列表 */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-4 relative">
        {/* 空状态 */}
        {chatMessages.length === 0 && !planMode && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-3">
            <FileCode className="h-10 w-10 text-muted-foreground/50" />
            <div className="text-center space-y-1">
              <p className="font-medium">描述你想要的应用</p>
              <p className="text-xs">AI 将通过几个问题了解你的需求，然后生成完整应用</p>
            </div>
            <div className="flex flex-wrap gap-2 mt-2 max-w-[280px] justify-center">
              {[
                '一个 CRM 客户管理系统',
                '待办事项 App',
                '电商后台管理',
              ].map((example) => (
                <button
                  key={example}
                  onClick={() => setInput(`帮我创建${example}`)}
                  className="text-xs px-3 py-1.5 rounded-full border hover:bg-accent transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message collapse: show older messages button */}
        {(() => {
          const COLLAPSE_THRESHOLD = 10;
          const visibleMessages = showAllMessages
            ? chatMessages
            : chatMessages.length > COLLAPSE_THRESHOLD
              ? chatMessages.slice(-COLLAPSE_THRESHOLD)
              : chatMessages;
          const collapsedCount = chatMessages.length - visibleMessages.length;

          return (
            <>
              {collapsedCount > 0 && (
                <button
                  onClick={() => setShowAllMessages(true)}
                  className="w-full py-2 text-xs text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/50 transition-colors text-center rounded-md"
                >
                  显示更早的 {collapsedCount} 条消息
                </button>
              )}

              {/* Chat 消息 */}
              {visibleMessages.map((msg, idx) => {
                const globalIdx = chatMessages.indexOf(msg);
                const isLastAssistant =
                  msg.role === 'assistant' &&
                  globalIdx === chatMessages.map((m) => m.role).lastIndexOf('assistant');
                return (
                  <ChatBubble
                    key={msg.id}
                    msg={msg}
                    isBusy={isBusy}
                    isLastAssistant={isLastAssistant}
                    onRegenerate={isLastAssistant ? handleRegenerate : undefined}
                  />
                );
              })}
            </>
          );
        })()}

        {/* Plan Mode UI */}
        {planMode && (
          <PlanMode
            onAnswer={handleAnswer}
            onApprovePlan={handlePlanApprove}
            onRevisePlan={handleRevisePlan}
            isStreaming={isPlanStreaming}
          />
        )}

        {/* Builder Questions (smart follow-up) */}
        {builderQuestions.length > 0 && !isBusy && (
          <BuilderQuestions
            questions={builderQuestions}
            onAnswer={handleBuilderAnswer}
            onSkip={handleBuilderSkip}
          />
        )}

        {/* Build Progress (shown during/after generation) */}
        {buildPhase !== 'idle' && <BuildProgress />}

        {/* Suggestion Chips */}
        {!isBusy && suggestions.length > 0 && (
          <SuggestionChips
            suggestions={suggestions}
            onSelect={handleSuggestionSelect}
            disabled={isBusy}
          />
        )}

        <div ref={messagesEndRef} />

        {/* Floating "Latest messages" jump button */}
        {showJumpButton && (
          <button
            onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="sticky bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs shadow-lg hover:bg-primary/90 transition-colors"
          >
            最新消息
            <ChevronDown className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* 输入区域 */}
      <div className="border-t p-4 space-y-3">
        {/* Image preview */}
        {attachedImage && (
          <div className="relative inline-block">
            <img src={attachedImage.preview} alt="Upload preview" className="h-20 rounded-md border object-cover" />
            <button
              onClick={() => setAttachedImage(null)}
              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        {/* Undo/Redo row */}
        {(fileSnapshots.length > 0 || redoSnapshots.length > 0) && !isBusy && (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={undo} disabled={fileSnapshots.length === 0} title="撤销上次生成" className="h-7 w-7">
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={redo} disabled={redoSnapshots.length === 0} title="重做" className="h-7 w-7">
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        <div className="flex items-end gap-2">
          {/* Hidden file input */}
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleImageSelect} />
          {/* "+" upload button */}
          <button
            className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary transition-colors shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
            title="上传参考图片"
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              planMode
                ? '等待 Plan 流程完成...'
                : files.length > 0
                  ? '告诉 ASpark 你的想法...'
                  : '描述你想要的应用功能...'
            }
            className="flex-1 min-h-[44px] max-h-[160px] resize-none rounded-xl border border-input bg-card px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={isBusy || (planMode && planStatus !== 'idle')}
          />
          {isBusy ? (
            <button
              onClick={isGenerating ? cancelGeneration : cancelPlan}
              className="h-8 w-8 rounded-full bg-destructive flex items-center justify-center shrink-0"
              title="取消"
            >
              <Square className="h-3.5 w-3.5 text-white" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() || (planMode && planStatus !== 'idle')}
              className="h-8 w-8 rounded-full bg-brand hover:bg-brand-light flex items-center justify-center shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="发送"
            >
              <ArrowUp className="h-4 w-4 text-white" />
            </button>
          )}
        </div>
        {!planMode && files.length > 0 && (
          <p className="text-[10px] text-muted-foreground mt-1.5">
            已有 {files.length} 个文件 · 将自动使用增量修改模式
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * 单条消息气泡
 */
function ChatBubble({
  msg,
  isBusy,
  isLastAssistant,
  onRegenerate,
}: {
  msg: ChatMessage;
  isBusy: boolean;
  isLastAssistant: boolean;
  onRegenerate?: () => void;
}) {
  // system 消息：auto-fix 进度和错误报告
  if (msg.role === 'system') {
    const isAutoFix = msg.content.includes('检测到') || msg.content.includes('自动修复') || msg.content.includes('errors');
    const isMaxReached = msg.content.includes('未解决') || msg.content.includes('手动检查');
    return (
      <div className="my-2">
        <div
          className={`rounded-lg px-3.5 py-2.5 text-xs leading-relaxed ${
            isMaxReached
              ? 'bg-red-500/10 text-red-600 border border-red-500/20'
              : isAutoFix
                ? 'bg-orange-500/10 text-orange-600 border border-orange-500/20'
                : 'bg-yellow-500/10 text-yellow-700 border border-yellow-500/20'
          }`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            {isMaxReached ? (
              <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="font-semibold text-[10px] uppercase tracking-wider">
              {isMaxReached ? 'Fix Failed' : 'Auto Fix'}
            </span>
          </div>
          <div className="whitespace-pre-wrap break-words font-mono">{msg.content}</div>
        </div>
      </div>
    );
  }

  // 用户消息
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[12px_4px_12px_12px] px-4 py-3 text-sm bg-brand text-white leading-relaxed">
          <div className="whitespace-pre-wrap break-words">{msg.content}</div>
        </div>
      </div>
    );
  }

  // 助手消息
  return (
    <div className="flex justify-start gap-2.5 group">
      {/* AI Avatar */}
      <div className="w-7 h-7 rounded-full bg-brand flex items-center justify-center shrink-0 mt-0.5">
        <Flame className="h-4 w-4 text-white" />
      </div>
      <div className="max-w-[90%] space-y-2">
        {/* Model badge */}
        {msg.modelInfo && <ModelBadge info={msg.modelInfo} />}

        {/* Content */}
        {msg.content ? (
          <div className="rounded-[4px_12px_12px_12px] bg-muted px-4 py-3 text-sm">
            <div className="break-words prose-sm">
              <MessageContent content={msg.content} role={msg.role} />
            </div>
          </div>
        ) : (
          isBusy && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-[4px_12px_12px_12px] bg-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
              <span className="text-xs text-muted-foreground">正在生成代码...</span>
            </div>
          )
        )}
        {/* 重新生成按钮 */}
        {isLastAssistant && !isBusy && (
          <button
            onClick={onRegenerate}
            className="flex items-center gap-1 text-[10px] text-muted-foreground
                       hover:text-foreground transition-colors
                       opacity-0 group-hover:opacity-100"
          >
            <RefreshCw className="h-3 w-3" />
            重新生成
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 消息内容渲染
 * - 助手消息：先显示 Base44 风格的文件操作徽章，再显示精简文字
 * - 用户消息：直接显示内容
 */
function MessageContent({ content, role }: { content: string; role: string }) {
  if (role === 'user') return <>{content}</>;

  // 提取文件操作列表（Base44 风格：显示 "Edited xxx" / "Created xxx" 徽章）
  const fileMatches = content.match(/<file\s+path="([^"]*)"/g);
  const filePaths = fileMatches
    ? fileMatches.map((m) => m.match(/path="([^"]*)"/)?.[1] || '').filter(Boolean)
    : [];

  // 清除 <file> XML 和 markdown 代码块，只保留说明文字
  let cleaned = content
    .replace(/<file\s+path="[^"]*">[\s\S]*?<\/file>/g, '')
    .replace(/<file\s+path="[^"]*">[\s\S]*$/g, '')
    .trim();

  // 进一步清理：移除残留的代码块（修复时 LLM 有时会在文本中包含代码）
  cleaned = cleaned
    .replace(/```[\s\S]*?```/g, '')
    .replace(/## 相关文件内容[\s\S]*/g, '')
    .replace(/### src\/[\s\S]*$/g, '')
    .trim();

  // 流式阶段：还没有文件也没有文字
  if (!cleaned && filePaths.length === 0) {
    const pendingCount = (content.match(/<file\s+path="/g) || []).length;
    if (pendingCount > 0) {
      return <span className="text-muted-foreground">正在生成 {pendingCount} 个文件...</span>;
    }
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Base44-style file action badges */}
      {filePaths.length > 0 && <FileActionBadges paths={filePaths} />}

      {/* 精简文字说明 */}
      {cleaned && (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
            ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
            li: ({ children }) => <li className="text-sm">{children}</li>,
            // 阻止渲染代码块（避免冗余代码出现在对话中）
            code: ({ className, children, ...props }) => {
              const isBlock = className?.includes('language-');
              if (isBlock) return null; // 不渲染代码块
              return (
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                  {children}
                </code>
              );
            },
            pre: () => null, // 不渲染 pre 块
            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
            h3: ({ children }) => <h3 className="font-semibold text-sm mt-3 mb-1">{children}</h3>,
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener" className="text-primary underline">
                {children}
              </a>
            ),
          }}
        >
          {cleaned}
        </ReactMarkdown>
      )}
    </div>
  );
}

/**
 * Base44 风格的文件操作徽章 — 点击跳转到代码
 */
function FileActionBadges({ paths }: { paths: string[] }) {
  const { setActiveTab, setActiveFile, files } = useEditorStore();

  const handleClick = (filePath: string) => {
    setActiveFile(filePath);
    setActiveTab('code');
  };

  // Deduplicate and determine action type
  const uniquePaths = [...new Set(paths)];

  return (
    <div className="space-y-1">
      {uniquePaths.map((p) => {
        const isExisting = files.some((f) => f.path === p);
        const displayName = getFileDisplayName(p);
        return (
          <button
            key={p}
            onClick={() => handleClick(p)}
            className="flex items-center gap-2 w-full text-left px-2 py-1 rounded-md hover:bg-accent transition-colors group"
          >
            <FileCode className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium text-primary">
              {isExisting ? 'Edited' : 'Created'}
            </span>
            <span className="text-xs text-foreground bg-muted px-1.5 py-0.5 rounded font-medium truncate">
              {displayName}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Extract a readable display name from a file path */
function getFileDisplayName(filePath: string): string {
  const parts = filePath.split('/');
  const fileName = parts.pop() || filePath;
  const name = fileName.replace(/\.(tsx?|jsx?|css|json)$/, '');

  // Add parent folder context for common patterns
  if (parts.length > 0) {
    const parent = parts[parts.length - 1];
    if (['pages', 'components', 'entities', 'lib'].includes(parent)) {
      return `${parent}/${name}`;
    }
  }
  return name;
}

/**
 * 模型路由标签
 */
const PROVIDER_LABELS: Record<string, { label: string; color: string }> = {
  doubao: { label: '豆包', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  deepseek: { label: 'DeepSeek', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  kimi: { label: 'Kimi', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
};

const TYPE_LABELS: Record<string, string> = {
  scaffold: '脚手架',
  iterate: '迭代',
  refactor: '重构',
  reason: '推理',
  complete: '补全',
};

function ModelBadge({ info }: { info: { provider: string; model: string; type: string } }) {
  const providerInfo = PROVIDER_LABELS[info.provider] || { label: info.provider, color: 'bg-gray-500/10 text-gray-400 border-gray-500/20' };
  const typeLabel = TYPE_LABELS[info.type] || info.type;

  return (
    <div className="flex items-center gap-1.5 mb-1">
      <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${providerInfo.color}`}>
        <Cpu className="h-2.5 w-2.5" />
        {providerInfo.label}
      </span>
      <span className="text-[10px] text-muted-foreground/70">
        {info.model} · {typeLabel}
      </span>
    </div>
  );
}

