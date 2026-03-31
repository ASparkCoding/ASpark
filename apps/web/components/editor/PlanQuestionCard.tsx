'use client';

import { useState } from 'react';
import { Send, SkipForward, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PlanQuestion } from '@/store/editorStore';

interface PlanQuestionCardProps {
  question: PlanQuestion;
  onAnswer: (answer: string) => void;
  onSkip: () => void;
  disabled?: boolean;
}

/**
 * Detect if a question allows multiple selections
 * Checks for keywords like 可多选, 多选, multiple, multi-select
 */
function isMultiSelect(questionText: string): boolean {
  return /多选|可多选|multiple|multi.?select/i.test(questionText);
}

export function PlanQuestionCard({
  question,
  onAnswer,
  onSkip,
  disabled,
}: PlanQuestionCardProps) {
  const multiSelect = isMultiSelect(question.question);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customInput, setCustomInput] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const handleToggle = (value: string) => {
    if (disabled) return;
    setUseCustom(false);

    if (multiSelect) {
      // Multi-select: toggle the value in set
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(value)) {
          next.delete(value);
        } else {
          next.add(value);
        }
        return next;
      });
    } else {
      // Single-select: replace
      setSelected(new Set([value]));
    }
  };

  const handleSend = () => {
    if (useCustom && customInput.trim()) {
      onAnswer(customInput.trim());
    } else if (selected.size > 0) {
      // Map selected values to labels
      const labels = [...selected]
        .map((v) => question.options.find((o) => o.value === v)?.label || v)
        .join('、');
      onAnswer(labels);
    }
  };

  const isAnswered = question.answer !== null || question.skipped;

  // Answered state: read-only display
  if (isAnswered) {
    return (
      <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-1.5">
        <p className="text-sm font-medium text-foreground/80">{question.question}</p>
        {question.skipped ? (
          <p className="text-xs text-muted-foreground italic">已跳过</p>
        ) : (
          <p className="text-xs text-primary font-medium">{question.answer}</p>
        )}
      </div>
    );
  }

  // Interactive state
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 shadow-sm">
      <p className="text-sm font-medium">{question.question}</p>

      {/* Options */}
      <div className="space-y-2">
        {question.options.map((option) => {
          const isSelected = selected.has(option.value) && !useCustom;
          return (
            <label
              key={option.value}
              className={`flex items-center gap-2.5 rounded-md border px-3 py-2 cursor-pointer transition-colors text-sm ${
                isSelected
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border hover:border-primary/50 hover:bg-accent/50'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => handleToggle(option.value)}
            >
              {multiSelect ? (
                /* Checkbox indicator for multi-select */
                <div
                  className={`h-3.5 w-3.5 rounded-sm border-2 flex items-center justify-center shrink-0 transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground/40'
                  }`}
                >
                  {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                </div>
              ) : (
                /* Radio indicator for single-select */
                <div
                  className={`h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    isSelected ? 'border-primary' : 'border-muted-foreground/40'
                  }`}
                >
                  {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </div>
              )}
              <span>{option.label}</span>
            </label>
          );
        })}

        {/* Custom input option */}
        <label
          className={`flex items-start gap-2.5 rounded-md border px-3 py-2 cursor-pointer transition-colors text-sm ${
            useCustom
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-accent/50'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          onClick={() => {
            if (disabled) return;
            setUseCustom(true);
            if (!multiSelect) setSelected(new Set());
          }}
        >
          <div
            className={`h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
              useCustom ? 'border-primary' : 'border-muted-foreground/40'
            }`}
          >
            {useCustom && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
          </div>
          <div className="flex-1 space-y-1.5">
            <span className="text-muted-foreground">其他想法...</span>
            {useCustom && (
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customInput.trim()) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                className="w-full bg-background border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="输入你的想法..."
                autoFocus
                disabled={disabled}
              />
            )}
          </div>
        </label>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSkip}
          disabled={disabled}
          className="text-muted-foreground text-xs"
        >
          <SkipForward className="h-3 w-3 mr-1" />
          跳过
        </Button>
        <Button
          size="sm"
          onClick={handleSend}
          disabled={disabled || (selected.size === 0 && !(useCustom && customInput.trim()))}
        >
          <Send className="h-3 w-3 mr-1" />
          确认
        </Button>
      </div>
    </div>
  );
}
