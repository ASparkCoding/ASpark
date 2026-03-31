'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Trash2,
  Edit3,
  Loader2,
  FolderOpen,
  CheckCircle2,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useProjectStore } from '@/store/projectStore';
import { useEditorStore } from '@/store/editorStore';
import type { Project } from '@/types';

type BuildStatus = 'running' | 'completed' | 'error' | 'idle';

function StatusBadge({ status }: { status?: BuildStatus }) {
  if (!status || status === 'idle') return null;

  const config = {
    running: {
      label: 'Building',
      bg: 'bg-brand/10',
      text: 'text-brand',
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    completed: {
      label: 'Deployed',
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-500',
      icon: <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />,
    },
    error: {
      label: 'Error',
      bg: 'bg-red-500/10',
      text: 'text-red-500',
      icon: <span className="h-1.5 w-1.5 rounded-full bg-red-500" />,
    },
  }[status];

  if (!config) return null;

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${config.bg} ${config.text}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

export default function ProjectsPage() {
  const { projects, setProjects, addProject, removeProject, updateProject, isLoading, setIsLoading } =
    useProjectStore();
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeBuilds, setActiveBuilds] = useState<Map<string, BuildStatus>>(new Map());

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const res = await fetch('/api/projects');
        if (res.ok) {
          const data = await res.json();
          setProjects(data);
        }
      } catch (e) {
        console.error('Failed to load projects:', e);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [setProjects, setIsLoading]);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch('/api/builds/active');
        if (res.ok && active) {
          const builds: Array<{ projectId: string; status: string }> = await res.json();
          const map = new Map<string, BuildStatus>();
          for (const b of builds) map.set(b.projectId, b.status as BuildStatus);
          setActiveBuilds(map);
          if (builds.some((b) => b.status === 'running')) {
            setTimeout(poll, 5000);
          }
        }
      } catch { /* ignore */ }
    }
    poll();
    return () => { active = false; };
  }, [projects]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      });
      if (res.ok) {
        const project = await res.json();
        addProject(project);
        setNewName('');
        setNewDesc('');
        setCreateOpen(false);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此项目吗？')) return;
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    if (res.ok) {
      removeProject(id);
      useEditorStore.getState().resetEditor();
    }
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim() }),
    });
    if (res.ok) {
      updateProject(id, { name: editName.trim() });
      setEditId(null);
    }
  };

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="h-[72px] flex items-center justify-between px-8 border-b shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">我的项目</h1>
          <span className="inline-flex items-center justify-center h-6 px-2.5 rounded-full bg-brand-glow text-brand text-xs font-semibold">
            {projects.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索..."
              className="pl-9 w-60 h-10 bg-secondary border-border"
            />
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="gap-2 bg-brand hover:bg-brand-light text-white">
                <Plus className="h-5 w-5" />
                新建项目
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新建项目</DialogTitle>
                <DialogDescription>创建一个新的 AI 驱动应用</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">项目名称</label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="例如：电商平台、博客系统..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">描述（可选）</label>
                  <Input
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="简要描述你想要构建的应用..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  取消
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!newName.trim() || creating}
                  className="bg-brand hover:bg-brand-light text-white"
                >
                  {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  创建
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredProjects.length === 0 && projects.length === 0 ? (
          <div className="text-center py-20">
            <FolderOpen className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <h2 className="text-xl font-semibold mb-2">暂无项目</h2>
            <p className="text-muted-foreground mb-6">创建你的第一个 AI 应用</p>
            <Button onClick={() => setCreateOpen(true)} className="gap-2 bg-brand hover:bg-brand-light text-white">
              <Plus className="h-4 w-4" />
              新建项目
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => (
              <Link
                key={project.id}
                href={`/${project.id}`}
                className="group block rounded-xl border bg-card hover:border-brand/30 transition-all duration-200"
              >
                {/* Card Header */}
                <div className="p-5 pb-3 border-b border-border">
                  {editId === project.id ? (
                    <div className="flex gap-2" onClick={(e) => e.preventDefault()}>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(project.id);
                          if (e.key === 'Escape') setEditId(null);
                        }}
                        autoFocus
                        className="h-8"
                      />
                      <Button size="sm" onClick={() => handleRename(project.id)} className="bg-brand hover:bg-brand-light text-white">
                        Save
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-base font-semibold truncate">{project.name}</h3>
                        <StatusBadge status={activeBuilds.get(project.id) || (project.description ? 'completed' : undefined)} />
                      </div>
                      <p className="text-[13px] text-muted-foreground line-clamp-2">
                        {project.description || '暂无描述'}
                      </p>
                    </>
                  )}
                </div>
                {/* Card Footer */}
                <div className="px-5 py-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Updated {formatTime(project.updated_at || project.created_at)}
                  </span>
                  <div className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => {
                        setEditId(project.id);
                        setEditName(project.name);
                      }}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      onClick={() => handleDelete(project.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Link>
            ))}

            {/* Create New Card */}
            <button
              onClick={() => setCreateOpen(true)}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border hover:border-brand/30 transition-colors py-10"
            >
              <Plus className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">新建项目</span>
              <span className="text-xs text-muted-foreground/50">开始用 AI 构建应用</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
