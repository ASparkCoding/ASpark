'use client';

import { Check, Loader2, FileCode, Database, Layout, Puzzle, Wrench, AlertTriangle, Minimize2 } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import type { BuildStep, BuildStepCategory, BuildPhase } from '@/store/editorStore';

const CATEGORY_CONFIG: Record<BuildStepCategory, { label: string; color: string; icon: React.ReactNode }> = {
  entity: { label: '实体', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: <Database className="h-3 w-3" /> },
  page: { label: '页面', color: 'bg-purple-500/10 text-purple-600 border-purple-500/20', icon: <Layout className="h-3 w-3" /> },
  component: { label: '组件', color: 'bg-green-500/10 text-green-600 border-green-500/20', icon: <Puzzle className="h-3 w-3" /> },
  data: { label: '数据', color: 'bg-orange-500/10 text-orange-600 border-orange-500/20', icon: <Database className="h-3 w-3" /> },
  utility: { label: '工具', color: 'bg-gray-500/10 text-gray-600 border-gray-500/20', icon: <Wrench className="h-3 w-3" /> },
};

const ACTION_LABELS: Record<string, string> = {
  wrote: '已创建',
  creating: '正在创建',
  reading: '正在读取',
  editing: '正在编辑',
};

export function BuildProgress() {
  const { buildSteps, buildPhase, isGenerating, setBuildPhase } = useEditorStore();

  if (buildSteps.length === 0 && buildPhase === 'idle') return null;

  const runningCount = buildSteps.filter((s) => s.status === 'running').length;
  const doneCount = buildSteps.filter((s) => s.status === 'done').length;

  // ★ Background / collapsed mode — show minimal indicator
  if (buildPhase === 'background') {
    return (
      <div
        className="flex items-center gap-2 py-2 px-3 bg-primary/5 rounded-md border border-primary/10 cursor-pointer hover:bg-primary/10 transition-colors"
        onClick={() => setBuildPhase('building')}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">
          后台构建中... ({doneCount} 个文件)
        </span>
        <span className="text-[10px] text-primary ml-auto">展开</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 py-2">
      {/* Steps list */}
      {buildSteps.map((step) => (
        <StepItem key={step.id} step={step} />
      ))}

      {/* Bottom status line */}
      {isGenerating && (
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>
              {buildPhase === 'fixing_errors'
                ? '修复中...'
                : `构建中... ${runningCount > 0 ? `(${runningCount} 个进行中)` : ''}`
              }
            </span>
          </div>
          {/* ★ "Continue in background" button */}
          {buildPhase === 'building' && (
            <button
              onClick={() => setBuildPhase('background')}
              className="flex items-center gap-1 text-[10px] text-primary hover:underline"
            >
              <Minimize2 className="h-3 w-3" />
              后台继续
            </button>
          )}
        </div>
      )}

      {/* Completed */}
      {buildPhase === 'completed' && !isGenerating && (
        <div className="flex items-center gap-2 text-xs text-green-600 pt-2">
          <Check className="h-3.5 w-3.5" />
          <span>构建完成 ({doneCount} 个文件)</span>
        </div>
      )}

      {/* Error fixing phase indicator */}
      {buildPhase === 'fixing_errors' && (
        <div className="flex items-center gap-2 text-xs text-orange-500 mt-2 p-2 bg-orange-500/5 rounded-md border border-orange-500/10">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>检测到错误，正在自动修复...</span>
        </div>
      )}
    </div>
  );
}

function StepItem({ step }: { step: BuildStep }) {
  const categoryConfig = CATEGORY_CONFIG[step.category];
  const actionLabel = ACTION_LABELS[step.action] || step.action;
  const { setActiveTab, setActiveFile } = useEditorStore();

  const handleClick = () => {
    setActiveFile(step.filePath);
    setActiveTab('code');
  };

  return (
    <div className="flex items-center gap-2 py-0.5">
      {/* Status icon */}
      {step.status === 'done' ? (
        <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
      ) : step.status === 'running' ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
      ) : (
        <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 shrink-0" />
      )}

      {/* Action label */}
      <span className="text-xs text-muted-foreground shrink-0">{actionLabel}</span>

      {/* Target name with category badge — clickable */}
      <button
        onClick={handleClick}
        className={`text-xs px-1.5 py-0.5 rounded border font-medium inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity ${categoryConfig.color}`}
        title={`跳转到 ${step.filePath}`}
      >
        {categoryConfig.icon}
        {step.target}
      </button>
    </div>
  );
}

/**
 * Categorize a file path into a build step category.
 */
export function categorizeFile(path: string): BuildStepCategory {
  if (path.includes('entities/') || path.includes('models/')) return 'entity';
  if (path.includes('pages/') || path.match(/Page\.(tsx|ts|jsx|js)$/)) return 'page';
  if (path.includes('components/') && !path.includes('components/ui/')) return 'component';
  if (path.endsWith('.sql') || path.includes('seed') || path.includes('schema')) return 'data';
  return 'utility';
}

/**
 * Extract a display name from a file path.
 * e.g., "src/pages/Dashboard.tsx" → "Dashboard"
 *       "src/entities/Customer.ts" → "Customer"
 */
export function getDisplayName(filePath: string): string {
  const filename = filePath.split('/').pop() || filePath;
  // Remove extension
  const name = filename.replace(/\.(tsx?|jsx?|css|json|sql|mjs|cjs)$/, '');
  return name;
}
