'use client';

import { useState } from 'react';
import { Rocket, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PlanDocumentProps {
  content: string;
  onApprove: () => void;
  onRevise: (feedback: string) => void;
  isLoading?: boolean;
}

export function PlanDocument({
  content,
  onApprove,
  onRevise,
  isLoading,
}: PlanDocumentProps) {
  const [showRevise, setShowRevise] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [expanded, setExpanded] = useState(true);

  const handleRevise = () => {
    if (feedback.trim()) {
      onRevise(feedback.trim());
      setFeedback('');
      setShowRevise(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      {/* 头部 */}
      <div
        className="flex items-center justify-between px-4 py-2.5 bg-muted/50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-sm font-medium">Plan</span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {/* Plan 内容 */}
      {expanded && (
        <div className="p-4 space-y-4">
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
            <PlanMarkdown content={content} />
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button
              onClick={onApprove}
              disabled={isLoading}
              className="flex-1"
              size="sm"
            >
              <Rocket className="h-3.5 w-3.5 mr-1.5" />
              Start Building
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRevise(!showRevise)}
              disabled={isLoading}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              修改
            </Button>
          </div>

          {/* 修改反馈输入 */}
          {showRevise && (
            <div className="space-y-2 pt-2">
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="描述需要修改的内容..."
                className="w-full min-h-[60px] rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                disabled={isLoading}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleRevise}
                  disabled={!feedback.trim() || isLoading}
                >
                  重新生成 Plan
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 简易 Markdown 渲染（Plan 内容专用）
 */
function PlanMarkdown({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    key++;
    const trimmed = line.trim();

    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={key} className="text-sm font-semibold text-primary mt-3 mb-1.5 first:mt-0">
          {trimmed.slice(3)}
        </h3>
      );
    } else if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={key} className="text-sm font-medium mt-2 mb-1">
          {trimmed.slice(4)}
        </h4>
      );
    } else if (trimmed.match(/^\d+[.、]/)) {
      elements.push(
        <p key={key} className="text-sm pl-2 py-0.5">
          {formatInline(trimmed)}
        </p>
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <p key={key} className="text-sm pl-2 py-0.5 flex gap-1.5">
          <span className="text-muted-foreground shrink-0">-</span>
          <span>{formatInline(trimmed.slice(2))}</span>
        </p>
      );
    } else if (trimmed === '---') {
      // skip hr
    } else if (trimmed) {
      elements.push(
        <p key={key} className="text-sm py-0.5">
          {formatInline(trimmed)}
        </p>
      );
    }
  }

  return <>{elements}</>;
}

function formatInline(text: string): React.ReactNode {
  // Handle bold **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length <= 1) return text;

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
