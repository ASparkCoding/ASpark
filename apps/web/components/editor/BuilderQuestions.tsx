'use client';

import { useState } from 'react';
import { HelpCircle, Send, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BuilderQuestionsProps {
  questions: string[];
  onAnswer: (answers: string[]) => void;
  onSkip: () => void;
}

export function BuilderQuestions({ questions, onAnswer, onSkip }: BuilderQuestionsProps) {
  const [answers, setAnswers] = useState<string[]>(questions.map(() => ''));

  const handleSubmit = () => {
    const filled = answers.filter((a) => a.trim());
    if (filled.length === 0) {
      onSkip();
      return;
    }
    onAnswer(answers);
  };

  return (
    <div className="mx-2 my-3 rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <HelpCircle className="h-4 w-4" />
        <span>需要确认几个细节</span>
      </div>

      <div className="space-y-3">
        {questions.map((q, idx) => (
          <div key={idx} className="space-y-1.5">
            <p className="text-sm text-foreground">{q}</p>
            <input
              value={answers[idx]}
              onChange={(e) => {
                const next = [...answers];
                next[idx] = e.target.value;
                setAnswers(next);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="输入你的回答..."
              className="w-full border rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" className="gap-1.5" onClick={handleSubmit}>
          <Send className="h-3 w-3" />
          确认并生成
        </Button>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={onSkip}>
          <SkipForward className="h-3 w-3" />
          跳过，直接生成
        </Button>
      </div>
    </div>
  );
}
