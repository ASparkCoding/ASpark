'use client';

import { useState, useEffect } from 'react';
import { useEditorStore } from '@/store/editorStore';

const DID_YOU_KNOW_TIPS = [
  '生成完成后可以直接对话修改任意功能',
  '你可以上传设计截图让 AI 参照生成 UI',
  '点击 Suggestion 按钮可以快速迭代优化',
  '所有修改都有版本历史，可以随时回滚',
  '预览区域支持实时热更新',
  '你可以切换到 Code 标签查看和编辑源码',
  '支持一键部署到 Vercel 生产环境',
  '复杂需求建议使用 Plan Mode 分步澄清',
];

/**
 * ASpark flame icon — inline SVG for animation control
 */
function FlameIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer flame */}
      <path
        d="M24 0C33 16 48 40 48 54C48 68 38 78 24 80C10 78 0 68 0 54C0 40 15 16 24 0Z"
        fill="#E04E2A"
      />
      {/* Inner highlight */}
      <path
        d="M24 32C28 39 33 48 33 54C33 60 29 64 24 66C19 64 15 60 15 54C15 48 20 39 24 32Z"
        fill="white"
        fillOpacity="0.9"
      />
    </svg>
  );
}

export function BuildingAnimation() {
  const { buildSteps, buildPhase } = useEditorStore();
  const [tipIndex, setTipIndex] = useState(() =>
    Math.floor(Math.random() * DID_YOU_KNOW_TIPS.length)
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % DID_YOU_KNOW_TIPS.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const doneCount = buildSteps.filter((s) => s.status === 'done').length;

  const phaseLabel =
    buildPhase === 'fixing_errors'
      ? `Fixing errors...${doneCount}`
      : `Building...${doneCount}`;

  return (
    <div className="h-full flex flex-col items-center justify-center bg-background">
      {/* ASpark flame logo with glow animation */}
      <div className="relative mb-10">
        {/* Outer glow ring */}
        <div className="absolute -inset-6 rounded-full bg-[#E04E2A]/10 animate-pulse" />
        <div className="absolute -inset-3 rounded-full bg-[#E04E2A]/5 animate-ping-slow" />

        {/* Flame icon */}
        <div className="relative w-20 h-20 flex items-center justify-center">
          <FlameIcon className="w-12 h-[4.5rem] drop-shadow-[0_0_20px_rgba(224,78,42,0.4)]" />
        </div>
      </div>

      {/* Title */}
      <h2 className="text-xl font-semibold text-foreground mb-2 tracking-wide">
        Building your idea.
      </h2>

      {/* Phase status */}
      <p className="text-sm text-muted-foreground mb-10">{phaseLabel}</p>

      {/* Did you know tips */}
      <div className="max-w-sm text-center px-6">
        <p className="text-xs text-muted-foreground/50 mb-1.5 tracking-wider">Did you know?</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {DID_YOU_KNOW_TIPS[tipIndex]}
        </p>
      </div>
    </div>
  );
}
