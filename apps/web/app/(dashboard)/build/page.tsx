'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUp,
  Plus,
  Settings,
  Mic,
  Home as HomeIcon,
  Palette,
  GraduationCap,
  Plane,
  Wallet,
  RefreshCw,
  Loader2,
  ShoppingCart,
  Dumbbell,
  Users,
  Paperclip,
  X,
} from 'lucide-react';
import { DashboardSidebar } from '@/components/DashboardSidebar';
import type { Project } from '@/types';

const suggestions = [
  { label: '家庭管理', icon: HomeIcon },
  { label: '创意工具', icon: Palette },
  { label: '教育', icon: GraduationCap },
  { label: '旅行规划', icon: Plane },
  { label: '个人理财', icon: Wallet },
];

const cardGradients = [
  { from: '#E04E2A44', to: '#E04E2A11', icon: ShoppingCart, iconColor: '#E04E2A66' },
  { from: '#3B82F644', to: '#3B82F611', icon: Dumbbell, iconColor: '#3B82F666' },
  { from: '#10B98144', to: '#10B98111', icon: Users, iconColor: '#10B98166' },
];

export default function HomePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeGalleryTab, setActiveGalleryTab] = useState<'recent' | 'templates'>('recent');
  const [usePlan, setUsePlan] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; preview?: string }[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/projects')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setProjects(data))
      .catch(() => {});
  }, []);

  // Close attach menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    }
    if (showAttachMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showAttachMenu]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles: { name: string; preview?: string }[] = [];
    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          setAttachedFiles((prev) => [...prev, { name: file.name, preview: reader.result as string }]);
        };
        reader.readAsDataURL(file);
      } else {
        newFiles.push({ name: file.name });
      }
    });
    if (newFiles.length > 0) {
      setAttachedFiles((prev) => [...prev, ...newFiles]);
    }
    e.target.value = '';
    setShowAttachMenu(false);
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: prompt.trim().slice(0, 50),
          description: prompt.trim(),
        }),
      });
      if (res.ok) {
        const project = await res.json();
        // usePlan=false: skip plan, go straight to generation
        // usePlan=true: enter plan mode (default project behavior when no files)
        const params = new URLSearchParams();
        params.set('prompt', prompt.trim());
        if (!usePlan) {
          params.set('skipPlan', 'true');
        }
        router.push(`/${project.id}?${params.toString()}`);
      }
    } catch (e) {
      console.error('Failed to create project:', e);
    } finally {
      setIsCreating(false);
    }
  };

  const formatTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    return `${days} 天前编辑`;
  };

  const recentProjects = projects.slice(0, 5).map((p) => ({ id: p.id, name: p.name }));
  const displayCards = projects.slice(0, 3);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <DashboardSidebar recentProjects={recentProjects} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-20 py-12 overflow-y-auto">
        <div className="w-full max-w-[720px] flex flex-col items-center gap-8">
          {/* Hero */}
          <div className="text-center space-y-4">
            <h1 className="text-[32px] font-bold tracking-tight">
              你接下来打算建造什么？
            </h1>
            <p className="text-base text-muted-foreground max-w-[520px] mx-auto leading-relaxed">
              用自然语言描述你的想法，ASpark 将为你生成完整的应用程序
            </p>
          </div>

          {/* Prompt Input Box */}
          <div className="w-full rounded-2xl border border-border bg-card shadow-[0_4px_60px_rgba(224,78,42,0.06)]">
            <div className="px-5 pt-4 pb-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述你想要构建的应用..."
                className="w-full bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/60 resize-none outline-none leading-relaxed min-h-[88px]"
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
              />

              {/* Attached files preview */}
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2 mb-1">
                  {attachedFiles.map((file, i) => (
                    <div key={i} className="relative group">
                      {file.preview ? (
                        <img
                          src={file.preview}
                          alt={file.name}
                          className="h-16 w-16 rounded-lg border object-cover"
                        />
                      ) : (
                        <div className="h-16 px-3 rounded-lg border bg-secondary flex items-center gap-2">
                          <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs text-foreground truncate max-w-[100px]">{file.name}</span>
                        </div>
                      )}
                      <button
                        onClick={() => removeFile(i)}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-foreground/80 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex items-center gap-1 relative" ref={attachMenuRef}>
                {/* + button with attach dropdown */}
                <button
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  className="h-9 w-9 rounded-lg border border-border flex items-center justify-center hover:bg-secondary transition-colors"
                >
                  <Plus className="h-5 w-5 text-muted-foreground" />
                </button>
                {showAttachMenu && (
                  <div className="absolute bottom-full left-0 mb-2 bg-popover border border-border rounded-xl shadow-lg py-1.5 z-50 min-w-[160px]">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                    >
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                      附件
                    </button>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.pdf,.doc,.docx,.txt"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <button className="h-9 w-9 rounded-lg border border-border flex items-center justify-center hover:bg-secondary transition-colors">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                {/* Plan toggle */}
                <button
                  onClick={() => setUsePlan(!usePlan)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    usePlan
                      ? 'bg-brand/10 text-brand border border-brand/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  Plan
                </button>
                <button className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-secondary transition-colors">
                  <Mic className="h-5 w-5 text-muted-foreground" />
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || isCreating}
                  className="h-10 w-10 rounded-full bg-brand hover:bg-brand-light flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreating ? (
                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                  ) : (
                    <ArrowUp className="h-5 w-5 text-white" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Suggestion Tags */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {suggestions.map((s) => (
              <button
                key={s.label}
                onClick={() =>
                  setPrompt(`帮我构建一个${s.label}应用，具备完整的功能和现代化 UI 设计`)
                }
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-border text-[13px] text-muted-foreground hover:border-brand/30 hover:text-foreground transition-colors"
              >
                <s.icon className="h-4 w-4" />
                {s.label}
              </button>
            ))}
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className="h-3.5 w-3.5" />
              更新想法
            </button>
          </div>

          {/* Bottom Gallery */}
          <div className="w-full space-y-4">
            {/* Gallery Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-0">
                <button
                  onClick={() => setActiveGalleryTab('recent')}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                    activeGalleryTab === 'recent'
                      ? 'border-brand text-foreground font-semibold'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  近期应用
                </button>
                <button
                  onClick={() => setActiveGalleryTab('templates')}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                    activeGalleryTab === 'templates'
                      ? 'border-brand text-foreground font-semibold'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  模板
                </button>
              </div>
              <button
                onClick={() => router.push('/projects')}
                className="text-[13px] text-brand hover:text-brand-light transition-colors"
              >
                查看全部 &rarr;
              </button>
            </div>

            {/* Cards Row */}
            <div className="grid grid-cols-3 gap-4">
              {displayCards.length > 0
                ? displayCards.map((project, i) => {
                    const grad = cardGradients[i % cardGradients.length];
                    const Icon = grad.icon;
                    return (
                      <button
                        key={project.id}
                        onClick={() => router.push(`/${project.id}`)}
                        className="text-left rounded-xl border border-border bg-card overflow-hidden hover:border-brand/30 transition-all group"
                      >
                        <div
                          className="h-[120px] relative"
                          style={{
                            background: `linear-gradient(135deg, ${grad.from}, ${grad.to})`,
                          }}
                        >
                          <Icon
                            className="absolute right-6 top-1/2 -translate-y-1/2 h-10 w-10 opacity-40"
                            style={{ color: grad.iconColor }}
                          />
                        </div>
                        <div className="p-4 space-y-1.5">
                          <h3 className="text-[15px] font-semibold truncate">{project.name}</h3>
                          <p className="text-[13px] text-muted-foreground line-clamp-1">
                            {project.description || '暂无描述'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatTime(project.updated_at || project.created_at)}
                          </p>
                        </div>
                      </button>
                    );
                  })
                : /* Empty state cards */
                  cardGradients.map((grad, i) => {
                    const Icon = grad.icon;
                    const names = ['电商后台管理', '健身追踪应用', '团队协作面板'];
                    const descs = [
                      '完整的商品与订单管理系统',
                      '运动数据记录与分析平台',
                      '实时任务追踪与团队沟通',
                    ];
                    return (
                      <div
                        key={i}
                        className="rounded-xl border border-border bg-card overflow-hidden opacity-60"
                      >
                        <div
                          className="h-[120px] relative"
                          style={{
                            background: `linear-gradient(135deg, ${grad.from}, ${grad.to})`,
                          }}
                        >
                          <Icon
                            className="absolute right-6 top-1/2 -translate-y-1/2 h-10 w-10 opacity-40"
                            style={{ color: grad.iconColor }}
                          />
                        </div>
                        <div className="p-4 space-y-1.5">
                          <h3 className="text-[15px] font-semibold">{names[i]}</h3>
                          <p className="text-[13px] text-muted-foreground">{descs[i]}</p>
                          <p className="text-xs text-muted-foreground">示例模板</p>
                        </div>
                      </div>
                    );
                  })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
