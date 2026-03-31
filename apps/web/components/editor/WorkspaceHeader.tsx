'use client';

import Image from 'next/image';
import { ArrowLeft, Eye, LayoutDashboard, Code2, Loader2, CheckCircle2, AlertCircle, MousePointerClick, Settings, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/store/editorStore';
import { useProjectStore } from '@/store/projectStore';
import { DeployButton } from './DeployButton';
import Link from 'next/link';
import type { WorkspaceTab } from '@/store/editorStore';

const tabs: { value: WorkspaceTab; label: string; icon: React.ReactNode }[] = [
  { value: 'preview', label: '预览', icon: <Eye className="h-3.5 w-3.5" /> },
  { value: 'code', label: '代码', icon: <Code2 className="h-3.5 w-3.5" /> },
  { value: 'dashboard', label: '面板', icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
];

export function WorkspaceHeader({ projectId }: { projectId: string }) {
  const { activeTab, setActiveTab, isGenerating, buildPhase, previewStatus, visualEditMode, setVisualEditMode } = useEditorStore();
  const { currentProject } = useProjectStore();

  const appSettings = currentProject?.app_settings as Record<string, string> | undefined;
  const appIcon = appSettings?.appIcon;
  const appName = appSettings?.appName || currentProject?.name || '未命名项目';

  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-5 bg-card">
      {/* Left: Back + Logo + Divider + Project name + Status */}
      <div className="flex items-center gap-3 min-w-0">
        <Link href="/projects">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <Image src="/aspark-logo-horizontal.svg" alt="ASpark" width={90} height={18} className="h-[18px] w-auto shrink-0" />
        <div className="w-px h-6 bg-border" />
        <span className="text-sm font-semibold truncate max-w-[180px]" title={appName}>
          {appIcon && <span className="mr-1.5">{appIcon}</span>}
          {appName}
        </span>
        <BuildStatusBadge
          isGenerating={isGenerating}
          buildPhase={buildPhase}
          previewStatus={previewStatus}
        />
      </div>

      {/* Center: Tab navigation */}
      <nav className="flex items-center h-full">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`
              inline-flex items-center gap-1.5 px-4 h-full text-[13px] font-medium
              transition-colors border-b-2 -mb-px
              ${
                activeTab === tab.value
                  ? 'border-brand text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }
            `}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Right: Settings + Visual Edit + Deploy */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          title="设置"
        >
          <Settings className="h-4 w-4 text-muted-foreground" />
        </Button>
        <Button
          variant={visualEditMode ? 'default' : 'ghost'}
          size="sm"
          className={`h-8 gap-1.5 text-xs ${visualEditMode ? 'bg-brand hover:bg-brand-light text-white' : ''}`}
          onClick={() => {
            setVisualEditMode(!visualEditMode);
            if (!visualEditMode) setActiveTab('preview');
          }}
          title="可视化编辑 — 点击预览中的元素进行修改"
        >
          <MousePointerClick className="h-3.5 w-3.5" />
          可视化编辑
        </Button>
        <DeployButton projectId={projectId} />
      </div>
    </header>
  );
}

/** Compact status badge next to project name */
function BuildStatusBadge({
  isGenerating,
  buildPhase,
  previewStatus,
}: {
  isGenerating: boolean;
  buildPhase: string;
  previewStatus: string;
}) {
  if (isGenerating || buildPhase === 'building' || buildPhase === 'background') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20 font-medium">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        构建中
      </span>
    );
  }
  if (buildPhase === 'fixing_errors') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500 border border-orange-500/20 font-medium">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        修复中
      </span>
    );
  }
  if (previewStatus === 'ready') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium">
        <CheckCircle2 className="h-2.5 w-2.5" />
        运行中
      </span>
    );
  }
  if (previewStatus === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 font-medium">
        <AlertCircle className="h-2.5 w-2.5" />
        错误
      </span>
    );
  }
  if (previewStatus === 'creating' || previewStatus === 'installing' || previewStatus === 'starting') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 font-medium">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        启动中
      </span>
    );
  }
  return null;
}
