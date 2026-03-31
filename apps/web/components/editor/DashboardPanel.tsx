'use client';

import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Database,
  Settings,
  ScrollText,
  ExternalLink,
  Share2,
  Globe,
  Lock,
  Clock,
  Cpu,
  FileCode,
  CheckCircle2,
  XCircle,
  Hammer,
  Users,
  BarChart3,
  Code,
  Copy,
  Link2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Trash2,
  Plus,
  Loader2,
  HardDrive,
  Zap,
  Upload,
  Workflow,
  Bot,
  Play,
  Pause,
  MessageSquare,
  Activity,
  Eye,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useEditorStore } from '@/store/editorStore';
import { useProjectStore } from '@/store/projectStore';

type DashboardSection = 'overview' | 'users' | 'data' | 'analytics' | 'automations' | 'agents' | 'domains' | 'security' | 'storage' | 'functions' | 'api' | 'settings' | 'logs';

const sidebarItems: { value: DashboardSection; label: string; icon: React.ReactNode; badge?: string }[] = [
  { value: 'overview', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
  { value: 'users', label: 'Users', icon: <Users className="h-4 w-4" /> },
  { value: 'data', label: 'Data', icon: <Database className="h-4 w-4" /> },
  { value: 'analytics', label: 'Analytics', icon: <BarChart3 className="h-4 w-4" /> },
  { value: 'automations', label: 'Automations', icon: <Workflow className="h-4 w-4" /> },
  { value: 'agents', label: 'Agents', icon: <Bot className="h-4 w-4" /> },
  { value: 'domains', label: 'Domains', icon: <Link2 className="h-4 w-4" /> },
  { value: 'security', label: 'Security', icon: <Shield className="h-4 w-4" /> },
  { value: 'storage', label: 'Storage', icon: <HardDrive className="h-4 w-4" /> },
  { value: 'functions', label: 'Functions', icon: <Zap className="h-4 w-4" /> },
  { value: 'api', label: 'API', icon: <Code className="h-4 w-4" /> },
  { value: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
  { value: 'logs', label: 'Logs', icon: <ScrollText className="h-4 w-4" /> },
];

export function DashboardPanel({ projectId }: { projectId: string }) {
  const [activeSection, setActiveSection] = useState<DashboardSection>('overview');

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <div className="w-48 border-r bg-muted/20 flex flex-col">
        <div className="px-3 py-2 border-b">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase">Dashboard</h4>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {sidebarItems.map((item) => (
            <button
              key={item.value}
              onClick={() => setActiveSection(item.value)}
              className={`
                w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm
                transition-colors
                ${
                  activeSection === item.value
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }
              `}
            >
              {item.icon}
              {item.label}
              {item.badge && (
                <span className="text-[9px] ml-auto px-1 py-0.5 rounded bg-amber-500/15 text-amber-500 font-medium">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeSection === 'overview' && <OverviewSection projectId={projectId} />}
        {activeSection === 'users' && <UsersSection />}
        {activeSection === 'data' && <DataSection />}
        {activeSection === 'analytics' && <AnalyticsSection projectId={projectId} />}
        {activeSection === 'automations' && <AutomationsSection projectId={projectId} />}
        {activeSection === 'agents' && <AgentsSection projectId={projectId} />}
        {activeSection === 'domains' && <DomainsSection projectId={projectId} />}
        {activeSection === 'security' && <SecuritySection projectId={projectId} />}
        {activeSection === 'storage' && <StorageSection projectId={projectId} />}
        {activeSection === 'functions' && <FunctionsSection projectId={projectId} />}
        {activeSection === 'api' && <APISection />}
        {activeSection === 'settings' && <SettingsSection projectId={projectId} />}
        {activeSection === 'logs' && <LogsSection projectId={projectId} />}
      </div>
    </div>
  );
}

// ─── Overview (G4: App Settings) ─────────────────────────────

function OverviewSection({ projectId }: { projectId: string }) {
  const { currentProject } = useProjectStore();
  const { previewUrl, deployUrl, files, previewStatus, buildPhase, isGenerating } = useEditorStore();
  const [settings, setSettings] = useState({
    visibility: 'private',
    requireLogin: false,
    showBadge: true,
  });
  const [copied, setCopied] = useState(false);

  // Load settings
  useEffect(() => {
    fetch(`/api/projects/${projectId}/settings`)
      .then((r) => r.json())
      .then((d) => d.settings && setSettings((prev) => ({ ...prev, ...d.settings })))
      .catch(() => {});
  }, [projectId]);

  const updateSetting = async (key: string, value: unknown) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    await fetch(`/api/projects/${projectId}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    }).catch(() => {});
  };

  const status = isGenerating
    ? 'Generating'
    : buildPhase === 'fixing_errors'
      ? 'Fixing errors'
      : previewStatus === 'ready'
        ? 'Running'
        : previewStatus === 'error'
          ? 'Error'
          : files.length > 0
            ? 'Ready'
            : 'Empty';

  const handleCopyLink = () => {
    const url = deployUrl || previewUrl || '';
    if (url) {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">{currentProject?.name || 'Untitled Project'}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {currentProject?.description || 'No description'}
        </p>
      </div>

      <Separator />

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Files" value={files.length} icon={<FileCode className="h-4 w-4 text-muted-foreground" />} />
        <StatCard label="Status" value={status} icon={<CheckCircle2 className="h-4 w-4 text-muted-foreground" />} />
        <StatCard
          label="Tech Stack"
          value={currentProject?.tech_stack?.join(', ') || 'React + TS'}
          icon={<Cpu className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <Separator />

      {/* Quick actions */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          {previewUrl && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(previewUrl, '_blank')}>
              <ExternalLink className="h-3.5 w-3.5" />
              Open Preview
            </Button>
          )}
          {deployUrl && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(deployUrl, '_blank')}>
              <Globe className="h-3.5 w-3.5" />
              Visit Live App
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopyLink}>
            {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
            {copied ? 'Copied!' : 'Share Link'}
          </Button>
        </div>
      </div>

      <Separator />

      {/* G4: App Visibility */}
      <div>
        <h3 className="text-sm font-semibold mb-3">App Visibility</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => updateSetting('visibility', 'public')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors
                ${settings.visibility === 'public'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/50'}`}
            >
              <Globe className="h-4 w-4" /> Public
            </button>
            <button
              onClick={() => updateSetting('visibility', 'private')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors
                ${settings.visibility === 'private'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/50'}`}
            >
              <Lock className="h-4 w-4" /> Private
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={settings.requireLogin}
              onChange={(e) => updateSetting('requireLogin', e.target.checked)}
              className="rounded border-border"
            />
            Require login to access
          </label>
        </div>
      </div>

      <Separator />

      {/* G4: Invite Users */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Invite Users</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopyLink}>
            <Copy className="h-3.5 w-3.5" />
            Copy Link
          </Button>
          <Button size="sm">Send Invites</Button>
        </div>
      </div>

      <Separator />

      {/* G4: Platform Badge */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Platform Badge</h3>
        <p className="text-xs text-muted-foreground mb-2">控制生成的应用底部是否显示 ASpark 徽章</p>
        <Button variant="outline" size="sm" onClick={() => updateSetting('showBadge', !settings.showBadge)}>
          {settings.showBadge ? 'Hide Badge' : 'Show Badge'}
        </Button>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <div className="p-3 border rounded-lg">
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-sm font-medium mt-1 truncate">{String(value)}</p>
    </div>
  );
}

// ─── G5: Users Section ───────────────────────────────────────

function UsersSection() {
  const { files } = useEditorStore();
  const userEntities = files.filter(
    (f) => f.path.includes('entities/') &&
    (f.path.toLowerCase().includes('user') || f.path.toLowerCase().includes('role') || f.path.toLowerCase().includes('auth'))
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-lg font-semibold">Users & Roles</h2>
      <p className="text-sm text-muted-foreground">
        以下是应用中定义的用户相关数据模型
      </p>
      <Separator />
      {userEntities.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">暂无用户相关实体</p>
          <p className="text-xs mt-1">可在 Chat 中要求 AI 添加用户管理功能</p>
        </div>
      ) : (
        userEntities.map((f) => (
          <div key={f.path} className="border rounded-md p-4">
            <h3 className="text-sm font-medium mb-2">{f.path}</h3>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-48">
              {f.content.slice(0, 2000)}
            </pre>
          </div>
        ))
      )}
    </div>
  );
}

// ─── G5: Analytics Section ───────────────────────────────────

function AnalyticsSection({ projectId }: { projectId: string }) {
  const { files, chatMessages, buildSteps } = useEditorStore();
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/analytics`);
      if (res.ok) setAnalyticsData(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAnalytics(); }, [projectId]);

  const summary = analyticsData?.summary || {};
  const dailyActivity = summary.dailyActivity || {};
  const pageViews = summary.pageViews || {};
  const dailyDays = Object.keys(dailyActivity).slice(-7);
  const maxDaily = Math.max(...Object.values(dailyActivity as Record<string, number>), 1);

  const codeStats = [
    { label: '文件', value: files.length, icon: <FileCode className="h-4 w-4" /> },
    { label: '代码行数', value: files.reduce((sum, f) => sum + f.content.split('\n').length, 0).toLocaleString(), icon: <Code className="h-4 w-4" /> },
    { label: '组件', value: files.filter((f) => f.path.includes('components/') && !f.path.includes('ui/')).length, icon: <LayoutDashboard className="h-4 w-4" /> },
    { label: '实体', value: files.filter((f) => f.path.includes('entities/')).length, icon: <Database className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Analytics</h2>
        <Button variant="ghost" size="sm" onClick={loadAnalytics} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <Separator />

      {/* Traffic overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Eye className="h-3.5 w-3.5" />
            <span className="text-xs">Page Views</span>
          </div>
          <p className="text-2xl font-bold mt-1">{summary.totalPageViews || 0}</p>
        </div>
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span className="text-xs">Visitors</span>
          </div>
          <p className="text-2xl font-bold mt-1">{summary.uniqueVisitors || 0}</p>
        </div>
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="text-xs">Errors</span>
          </div>
          <p className="text-2xl font-bold mt-1">{summary.totalErrors || 0}</p>
        </div>
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-xs">Events</span>
          </div>
          <p className="text-2xl font-bold mt-1">{summary.totalEvents || 0}</p>
        </div>
      </div>

      {/* Daily activity chart (simple bar chart) */}
      {dailyDays.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Daily Activity (Last 7 days)</h3>
          <div className="flex items-end gap-1 h-24 p-3 border rounded-lg">
            {dailyDays.map((day) => {
              const val = dailyActivity[day] || 0;
              const pct = (val / maxDaily) * 100;
              return (
                <div key={day} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[9px] text-muted-foreground">{val}</span>
                  <div
                    className="w-full bg-primary/80 rounded-t-sm min-h-[2px]"
                    style={{ height: `${Math.max(pct, 3)}%` }}
                  />
                  <span className="text-[9px] text-muted-foreground">{day.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top pages */}
      {Object.keys(pageViews).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Top Pages</h3>
          <div className="space-y-1">
            {Object.entries(pageViews as Record<string, number>)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([page, count]) => (
                <div key={page} className="flex items-center justify-between p-2 border rounded-md text-xs">
                  <code className="font-mono">{page}</code>
                  <span className="text-muted-foreground">{count} views</span>
                </div>
              ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Code stats */}
      <div>
        <h3 className="text-sm font-medium mb-3">Code Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {codeStats.map((s) => (
            <div key={s.label} className="border rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">{s.icon}<span className="text-xs">{s.label}</span></div>
              <p className="text-xl font-bold">{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Automations Section ─────────────────────────────────────

interface AutomationEntry {
  id: string;
  name: string;
  description?: string;
  triggerType: string;
  actionType: string;
  enabled: boolean;
  lastRunAt?: string;
  lastRunStatus?: string;
  runCount: number;
}

const TRIGGER_LABELS: Record<string, string> = {
  data_insert: '数据创建',
  data_update: '数据更新',
  data_delete: '数据删除',
  schedule: '定时任务',
  webhook: 'Webhook',
  manual: '手动触发',
};

const ACTION_LABELS: Record<string, string> = {
  update_data: '更新数据',
  call_api: '调用 API',
  run_function: '执行函数',
  log: '记录日志',
};

function AutomationsSection({ projectId }: { projectId: string }) {
  const [automations, setAutomations] = useState<AutomationEntry[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTrigger, setNewTrigger] = useState('data_insert');
  const [newAction, setNewAction] = useState('log');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/automations`)
      .then((r) => r.json())
      .then((d) => { setAutomations(d.automations || []); setLogs(d.logs || []); })
      .catch(() => {});
  }, [projectId]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/automations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, triggerType: newTrigger, actionType: newAction, triggerConfig: {}, actionConfig: {} }),
      });
      if (res.ok) {
        const { automation } = await res.json();
        setAutomations((prev) => [...prev, automation]);
        setShowCreate(false);
        setNewName('');
      }
    } catch { /* ignore */ } finally { setCreating(false); }
  };

  const handleToggle = async (id: string) => {
    const res = await fetch(`/api/projects/${projectId}/automations`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ automationId: id, action: 'toggle' }),
    });
    if (res.ok) {
      const { automation } = await res.json();
      setAutomations((prev) => prev.map((a) => a.id === id ? { ...a, enabled: automation.enabled } : a));
    }
  };

  const handleTrigger = async (id: string) => {
    const res = await fetch(`/api/projects/${projectId}/automations`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ automationId: id, action: 'trigger', triggerData: { manual: true, timestamp: new Date().toISOString() } }),
    });
    if (res.ok) {
      const { log } = await res.json();
      setLogs((prev) => [...prev, log].slice(-50));
      setAutomations((prev) => prev.map((a) => a.id === id ? { ...a, runCount: a.runCount + 1, lastRunAt: log.timestamp, lastRunStatus: log.status } : a));
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/projects/${projectId}/automations`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ automationId: id }),
    });
    setAutomations((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Automations</h2>
          <p className="text-sm text-muted-foreground mt-1">配置自动化工作流：当事件发生时自动执行动作</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
      </div>
      <Separator />

      {/* Create form */}
      {showCreate && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Automation name..." className="w-full border rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">When (Trigger)</label>
              <select value={newTrigger} onChange={(e) => setNewTrigger(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm bg-background mt-1">
                {Object.entries(TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Then (Action)</label>
              <select value={newAction} onChange={(e) => setNewAction(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm bg-background mt-1">
                {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || creating}>
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Automations list */}
      {automations.length > 0 ? (
        <div className="space-y-2">
          {automations.map((auto) => (
            <div key={auto.id} className="border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium">{auto.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${auto.enabled ? 'bg-green-500/15 text-green-500' : 'bg-muted text-muted-foreground'}`}>
                    {auto.enabled ? 'Active' : 'Paused'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleTrigger(auto.id)} title="手动触发">
                    <Play className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggle(auto.id)} title={auto.enabled ? '暂停' : '启用'}>
                    {auto.enabled ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(auto.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">{TRIGGER_LABELS[auto.triggerType] || auto.triggerType}</span>
                <span>→</span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500">{ACTION_LABELS[auto.actionType] || auto.actionType}</span>
                {auto.runCount > 0 && <span className="ml-auto">Runs: {auto.runCount}</span>}
                {auto.lastRunStatus && (
                  <span className={auto.lastRunStatus === 'success' ? 'text-green-500' : 'text-red-500'}>
                    {auto.lastRunStatus === 'success' ? '✓' : '✗'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : !showCreate ? (
        <div className="text-center py-12 text-muted-foreground">
          <Workflow className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">暂无自动化工作流</p>
          <p className="text-xs mt-1">点击 New 创建你的第一个自动化</p>
        </div>
      ) : null}

      {/* Recent logs */}
      {logs.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Recent Runs</h3>
          <div className="space-y-1">
            {logs.slice(-5).reverse().map((log: any) => (
              <div key={log.id} className="flex items-center gap-2 p-2 border rounded-md text-xs">
                <span className={log.status === 'success' ? 'text-green-500' : 'text-red-500'}>
                  {log.status === 'success' ? '✓' : '✗'}
                </span>
                <span className="font-medium">{log.automationName}</span>
                <span className="text-muted-foreground ml-auto">{log.duration}ms</span>
                <span className="text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Agents Section ──────────────────────────────────────────

interface AgentEntry {
  id: string;
  name: string;
  description: string;
  instructions: string;
  model: string;
  enabled: boolean;
  chatCount: number;
  createdAt: string;
}

function AgentsSection({ projectId }: { projectId: string }) {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newInstructions, setNewInstructions] = useState('');
  const [newModel, setNewModel] = useState('balanced');
  const [creating, setCreating] = useState(false);
  const [chatAgent, setChatAgent] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [chatting, setChatting] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/agents`)
      .then((r) => r.json())
      .then((d) => setAgents(d.agents || []))
      .catch(() => {});
  }, [projectId]);

  const handleCreate = async () => {
    if (!newName.trim() || !newInstructions.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, instructions: newInstructions, model: newModel, description: '', knowledgeBase: '', entityAccess: [] }),
      });
      if (res.ok) {
        const { agent } = await res.json();
        setAgents((prev) => [...prev, agent]);
        setShowCreate(false);
        setNewName('');
        setNewInstructions('');
      }
    } catch { /* ignore */ } finally { setCreating(false); }
  };

  const handleChat = async () => {
    if (!chatAgent || !chatInput.trim() || chatting) return;
    setChatting(true);
    const userMsg = { role: 'user', content: chatInput, timestamp: new Date().toISOString() };
    setChatHistory((prev) => [...prev, userMsg]);
    setChatInput('');
    try {
      const res = await fetch(`/api/projects/${projectId}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'chat', agentId: chatAgent, message: userMsg.content }),
      });
      if (res.ok) {
        const { message, history } = await res.json();
        setChatHistory(history || [...chatHistory, userMsg, message]);
      }
    } catch { /* ignore */ } finally { setChatting(false); }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/projects/${projectId}/agents`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: id }),
    });
    setAgents((prev) => prev.filter((a) => a.id !== id));
    if (chatAgent === id) { setChatAgent(null); setChatHistory([]); }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">AI Agents</h2>
          <p className="text-sm text-muted-foreground mt-1">创建自治 AI Agent，对话并操作应用数据</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="h-3.5 w-3.5" />
          New Agent
        </Button>
      </div>
      <Separator />

      {/* Create form */}
      {showCreate && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Agent name..." className="w-full border rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
          <textarea value={newInstructions} onChange={(e) => setNewInstructions(e.target.value)} placeholder="Agent instructions (e.g. 你是一个客服助手，帮助用户解答产品问题...)" rows={3} className="w-full border rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
          <div>
            <label className="text-xs text-muted-foreground">Model</label>
            <select value={newModel} onChange={(e) => setNewModel(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm bg-background mt-1">
              <option value="fast">Fast (豆包)</option>
              <option value="balanced">Balanced (DeepSeek)</option>
              <option value="powerful">Powerful (Kimi)</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || !newInstructions.trim() || creating}>
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create Agent'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Agent list */}
      {agents.length > 0 ? (
        <div className="space-y-2">
          {agents.map((agent) => (
            <div key={agent.id} className={`border rounded-lg p-3 ${chatAgent === agent.id ? 'border-primary' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">{agent.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{agent.model}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setChatAgent(chatAgent === agent.id ? null : agent.id); setChatHistory([]); }} title="Chat">
                    <MessageSquare className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(agent.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {agent.description && <p className="text-xs text-muted-foreground mt-1">{agent.description}</p>}
              <p className="text-[10px] text-muted-foreground/60 mt-1">{agent.chatCount || 0} chats</p>
            </div>
          ))}
        </div>
      ) : !showCreate ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">暂无 AI Agent</p>
          <p className="text-xs mt-1">点击 New Agent 创建你的第一个 AI 助手</p>
        </div>
      ) : null}

      {/* Chat panel */}
      {chatAgent && (
        <div className="border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-muted/30 border-b flex items-center gap-2">
            <Bot className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs font-medium">Chat with {agents.find((a) => a.id === chatAgent)?.name}</span>
          </div>
          <div className="h-48 overflow-auto p-3 space-y-2">
            {chatHistory.filter((m) => m.role !== 'system').map((msg, i) => (
              <div key={i} className={`text-xs p-2 rounded-lg max-w-[85%] ${msg.role === 'user' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted'}`}>
                {msg.content}
              </div>
            ))}
            {chatting && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Thinking...
              </div>
            )}
          </div>
          <div className="flex border-t p-2 gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleChat(); }}
              placeholder="Ask the agent..."
              className="flex-1 border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={chatting}
            />
            <Button size="sm" onClick={handleChat} disabled={!chatInput.trim() || chatting} className="h-7 px-2">
              <MessageSquare className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── G5: API Section ─────────────────────────────────────────

function APISection() {
  const { files } = useEditorStore();
  const apiFiles = files.filter(
    (f) => f.path.includes('/api/') && (f.path.endsWith('route.ts') || f.path.endsWith('route.tsx'))
  );
  // Also detect supabase service files
  const serviceFiles = files.filter(
    (f) => f.path.includes('entities/') || f.path.includes('services/')
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-lg font-semibold">API Endpoints</h2>
      <p className="text-sm text-muted-foreground">
        以下是生成应用中定义的 API 路由和数据服务
      </p>
      <Separator />

      {apiFiles.length === 0 && serviceFiles.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Code className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">暂无 API 端点</p>
          <p className="text-xs mt-1">生成的应用使用 Supabase 客户端 SDK 直接访问数据</p>
        </div>
      ) : (
        <div className="space-y-2">
          {apiFiles.map((f) => {
            const methods: string[] = [];
            if (f.content.includes('export async function GET') || f.content.includes('export function GET')) methods.push('GET');
            if (f.content.includes('export async function POST') || f.content.includes('export function POST')) methods.push('POST');
            if (f.content.includes('export async function PUT') || f.content.includes('export function PUT')) methods.push('PUT');
            if (f.content.includes('export async function PATCH') || f.content.includes('export function PATCH')) methods.push('PATCH');
            if (f.content.includes('export async function DELETE') || f.content.includes('export function DELETE')) methods.push('DELETE');

            const routePath = f.path
              .replace(/^src\//, '')
              .replace(/\/route\.tsx?$/, '')
              .replace(/^app/, '');

            return (
              <div key={f.path} className="flex items-center gap-2 p-3 border rounded-md">
                <div className="flex gap-1">
                  {methods.map((m) => (
                    <span
                      key={m}
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        m === 'GET' ? 'bg-green-500/15 text-green-500' :
                        m === 'POST' ? 'bg-blue-500/15 text-blue-500' :
                        m === 'DELETE' ? 'bg-red-500/15 text-red-500' :
                        'bg-yellow-500/15 text-yellow-500'
                      }`}
                    >
                      {m}
                    </span>
                  ))}
                </div>
                <code className="text-sm font-mono">{routePath}</code>
              </div>
            );
          })}
          {serviceFiles.length > 0 && (
            <>
              <h3 className="text-sm font-medium mt-4 pt-2 border-t">Data Services (Supabase)</h3>
              {serviceFiles.map((f) => {
                const name = f.path.split('/').pop()?.replace(/\.(ts|tsx)$/, '') || f.path;
                return (
                  <div key={f.path} className="flex items-center gap-2 p-3 border rounded-md">
                    <Database className="h-4 w-4 text-blue-500" />
                    <code className="text-sm font-mono">{name}</code>
                    <span className="text-xs text-muted-foreground ml-auto">{f.path}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Domains Section ─────────────────────────────────────────

interface DomainEntry {
  id: string;
  domain: string;
  status: 'pending' | 'verifying' | 'active' | 'error';
  createdAt: string;
  dnsRecords?: { type: string; name: string; value: string }[];
}

function DomainsSection({ projectId }: { projectId: string }) {
  const { deployUrl } = useEditorStore();
  const [domains, setDomains] = useState<DomainEntry[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/projects/${projectId}/domains`)
      .then((r) => r.json())
      .then((d) => setDomains(d.domains || []))
      .catch(() => {});
  }, [projectId]);

  const handleAdd = async () => {
    const domain = newDomain.trim();
    if (!domain) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add domain');
        return;
      }
      setDomains((prev) => [...prev, data.domain]);
      setNewDomain('');
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (domainId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/domains`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainId }),
      });
      setDomains((prev) => prev.filter((d) => d.id !== domainId));
    } catch { /* ignore */ }
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500/15 text-yellow-500',
    verifying: 'bg-blue-500/15 text-blue-500',
    active: 'bg-green-500/15 text-green-500',
    error: 'bg-red-500/15 text-red-500',
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">Custom Domains</h2>
        <p className="text-sm text-muted-foreground mt-1">
          绑定自定义域名到你的应用
        </p>
      </div>
      <Separator />

      {/* Default domain */}
      {deployUrl && (
        <div className="p-3 border rounded-lg bg-muted/20">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-green-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">Default Domain</p>
              <a href={deployUrl} target="_blank" rel="noopener" className="text-xs text-primary hover:underline">
                {deployUrl.replace(/^https?:\/\//, '')}
              </a>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-500 font-medium">Active</span>
          </div>
        </div>
      )}

      {/* Add new domain */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Add Custom Domain</h3>
        <div className="flex gap-2">
          <input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="app.yourdomain.com"
            className="flex-1 border rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button size="sm" className="gap-1.5" onClick={handleAdd} disabled={loading || !newDomain.trim()}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add
          </Button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      {/* Domain list */}
      {domains.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Custom Domains</h3>
          {domains.map((d) => (
            <div key={d.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{d.domain}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusColors[d.status] || ''}`}>
                    {d.status}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemove(d.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* DNS Instructions */}
              {d.status === 'pending' && d.dnsRecords && (
                <div className="bg-muted/30 rounded-md p-3 text-xs space-y-1.5">
                  <p className="font-medium text-muted-foreground">DNS 配置指引：</p>
                  {d.dnsRecords.map((rec, i) => (
                    <div key={i} className="flex gap-3 font-mono">
                      <span className="text-blue-500 w-12">{rec.type}</span>
                      <span className="text-muted-foreground flex-1">{rec.name}</span>
                      <span className="text-foreground">{rec.value}</span>
                    </div>
                  ))}
                  <p className="text-muted-foreground/70 mt-1">
                    添加以上 DNS 记录后，域名将自动激活（可能需要几分钟到几小时）
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {domains.length === 0 && !deployUrl && (
        <div className="text-center py-12 text-muted-foreground">
          <Link2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">暂无自定义域名</p>
          <p className="text-xs mt-1">先部署应用到 Vercel，然后即可绑定自定义域名</p>
        </div>
      )}
    </div>
  );
}

// ─── Security Section ────────────────────────────────────────

interface SecurityCheck {
  id: string;
  category: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

function SecuritySection({ projectId }: { projectId: string }) {
  const [checks, setChecks] = useState<SecurityCheck[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const runScan = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/security`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setChecks(data.checks || []);
        setScore(data.score ?? null);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  const statusIcons: Record<string, React.ReactNode> = {
    pass: <ShieldCheck className="h-4 w-4 text-green-500" />,
    warn: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
    fail: <ShieldAlert className="h-4 w-4 text-red-500" />,
  };

  const statusBg: Record<string, string> = {
    pass: 'border-green-500/20 bg-green-500/5',
    warn: 'border-yellow-500/20 bg-yellow-500/5',
    fail: 'border-red-500/20 bg-red-500/5',
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Security</h2>
          <p className="text-sm text-muted-foreground mt-1">
            检查应用的安全配置和潜在风险
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={runScan} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
          {checks.length > 0 ? 'Re-scan' : 'Run Security Scan'}
        </Button>
      </div>
      <Separator />

      {/* Score */}
      {score !== null && (
        <div className="flex items-center gap-4 p-4 border rounded-lg">
          <div className={`text-3xl font-bold ${score >= 80 ? 'text-green-500' : score >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>
            {score}
          </div>
          <div>
            <p className="text-sm font-medium">Security Score</p>
            <p className="text-xs text-muted-foreground">
              {score >= 80 ? '安全配置良好' : score >= 50 ? '建议改善部分安全配置' : '存在安全风险，建议尽快修复'}
            </p>
          </div>
        </div>
      )}

      {/* Check results */}
      {checks.length > 0 ? (
        <div className="space-y-2">
          {checks.map((check) => (
            <div key={check.id} className={`flex items-start gap-3 p-3 border rounded-lg ${statusBg[check.status] || ''}`}>
              <div className="mt-0.5">{statusIcons[check.status]}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{check.label}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                    {check.category}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{check.detail}</p>
              </div>
            </div>
          ))}
        </div>
      ) : !loading ? (
        <div className="text-center py-12 text-muted-foreground">
          <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">点击上方按钮运行安全扫描</p>
          <p className="text-xs mt-1">将检查密钥暴露、RLS 策略、依赖安全等问题</p>
        </div>
      ) : null}
    </div>
  );
}

// ─── Storage Section ─────────────────────────────────────────

function StorageSection({ projectId }: { projectId: string }) {
  const { files } = useEditorStore();

  // Detect if the generated app uses storage
  const usesStorage = files.some(
    (f) => f.content.includes('storageService') || f.content.includes('storage.upload')
  );

  // Detect file upload related components
  const uploadComponents = files.filter(
    (f) =>
      f.content.includes('type="file"') ||
      f.content.includes('FileUpload') ||
      f.content.includes('storageService')
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">File Storage</h2>
        <p className="text-sm text-muted-foreground mt-1">
          基于 Supabase Storage 的文件上传服务
        </p>
      </div>
      <Separator />

      {/* Status */}
      <div className="p-4 border rounded-lg">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${usesStorage ? 'bg-green-500/10' : 'bg-muted'}`}>
            <HardDrive className={`h-5 w-5 ${usesStorage ? 'text-green-500' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <p className="text-sm font-medium">
              {usesStorage ? 'Storage SDK 已集成' : 'Storage SDK 可用'}
            </p>
            <p className="text-xs text-muted-foreground">
              {usesStorage
                ? `${uploadComponents.length} 个组件使用了存储服务`
                : '在 Chat 中要求 AI 添加文件上传功能即可使用'}
            </p>
          </div>
        </div>
      </div>

      {/* SDK Usage Guide */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">SDK 使用方式</h3>
        <div className="bg-muted/30 rounded-md p-3 text-xs font-mono space-y-1">
          <p className="text-muted-foreground">// 上传文件</p>
          <p>{"import { storageService } from '@/lib/storage';"}</p>
          <p>{"const { url, error } = await storageService.upload('images', 'user/avatar.png', file);"}</p>
          <p className="text-muted-foreground mt-2">// 列出文件</p>
          <p>{"const { files } = await storageService.list('images', 'user/');"}</p>
        </div>
      </div>

      {/* Files using storage */}
      {uploadComponents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">使用存储的文件</h3>
          {uploadComponents.map((f) => (
            <div key={f.path} className="flex items-center gap-2 p-2.5 border rounded-md">
              <Upload className="h-4 w-4 text-blue-500" />
              <code className="text-xs font-mono">{f.path}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Functions Section ───────────────────────────────────────

interface FunctionEntry {
  id: string;
  name: string;
  description: string;
  status: string;
  createdAt: string;
}

function FunctionsSection({ projectId }: { projectId: string }) {
  const [functions, setFunctions] = useState<FunctionEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/functions`)
      .then((r) => r.json())
      .then((d) => setFunctions(d.functions || []))
      .catch(() => {});
  }, [projectId]);

  const handleDelete = async (funcId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/functions`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ functionId: funcId }),
      });
      setFunctions((prev) => prev.filter((f) => f.id !== funcId));
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">Backend Functions</h2>
        <p className="text-sm text-muted-foreground mt-1">
          服务端后端函数，可执行自定义逻辑
        </p>
      </div>
      <Separator />

      {/* Info */}
      <div className="p-4 border rounded-lg bg-muted/20">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-amber-500" />
          <div>
            <p className="text-sm font-medium">Backend Functions Runtime</p>
            <p className="text-xs text-muted-foreground">
              在 Chat 中要求 AI 创建后端逻辑，平台会自动注册和执行
            </p>
          </div>
        </div>
      </div>

      {/* Functions list */}
      {functions.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Registered Functions</h3>
          {functions.map((func) => (
            <div key={func.id} className="border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">{func.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-500 font-medium">
                    {func.status}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(func.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {func.description && (
                <p className="text-xs text-muted-foreground mt-1">{func.description}</p>
              )}
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                Created {new Date(func.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">暂无后端函数</p>
          <p className="text-xs mt-1">在 Chat 中要求 AI 添加后端逻辑即可自动创建</p>
        </div>
      )}
    </div>
  );
}

// ─── Existing sections ───────────────────────────────────────

function DataSection() {
  const { files } = useEditorStore();
  const entityFiles = files.filter(
    (f) => f.path.includes('entities/') || f.path.includes('models/')
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-lg font-semibold">Data</h2>
      <p className="text-sm text-muted-foreground">View and manage your application data entities.</p>
      <Separator />
      {entityFiles.length > 0 ? (
        <div className="space-y-2">
          {entityFiles.map((f) => {
            const name = f.path.split('/').pop()?.replace(/\.(ts|tsx|js|jsx)$/, '') || f.path;
            return (
              <div key={f.path} className="flex items-center gap-3 p-3 border rounded-lg">
                <Database className="h-4 w-4 text-blue-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{name}</p>
                  <p className="text-xs text-muted-foreground truncate">{f.path}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No data entities found</p>
          <p className="text-xs mt-1">Entities will appear here after you generate an application with data models.</p>
        </div>
      )}
    </div>
  );
}

function SettingsSection({ projectId }: { projectId: string }) {
  const { currentProject } = useProjectStore();

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-lg font-semibold">Settings</h2>
      <Separator />
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Project Name</label>
          <div className="p-2 border rounded-md text-sm bg-muted/30">{currentProject?.name || 'Untitled'}</div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Description</label>
          <div className="p-2 border rounded-md text-sm bg-muted/30 min-h-[60px]">{currentProject?.description || 'No description'}</div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Tech Stack</label>
          <div className="flex flex-wrap gap-1.5">
            {(currentProject?.tech_stack || ['React', 'TypeScript', 'Tailwind CSS']).map((tech) => (
              <span key={tech} className="px-2 py-0.5 text-xs bg-muted rounded-full text-muted-foreground">{tech}</span>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Project ID</label>
          <div className="p-2 border rounded-md text-xs font-mono bg-muted/30 text-muted-foreground">{projectId}</div>
        </div>
      </div>
    </div>
  );
}

interface BuildHistoryEntry {
  id: string;
  model: string;
  prompt: string;
  tokens_used: number;
  created_at: string;
}

function LogsSection({ projectId }: { projectId: string }) {
  const { previewLogs, deployLogs } = useEditorStore();
  const [buildHistory, setBuildHistory] = useState<BuildHistoryEntry[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/sessions`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setBuildHistory(data);
        }
      })
      .catch(() => {});
  }, [projectId]);

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-lg font-semibold">Logs</h2>
      <Separator />

      <div className="space-y-2">
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <Hammer className="h-3.5 w-3.5" />
          Build History
        </h3>
        {buildHistory.length > 0 ? (
          <div className="space-y-1.5">
            {buildHistory.slice(0, 10).map((entry) => (
              <div key={entry.id} className="flex items-start gap-2 p-2.5 border rounded-md text-xs">
                <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-muted-foreground truncate">{entry.prompt.slice(0, 100)}</p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground/70">
                    <span>{entry.model}</span>
                    <span>·</span>
                    <span>{entry.tokens_used.toLocaleString()} tokens</span>
                    <span>·</span>
                    <span>{new Date(entry.created_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-4 text-center">No build history yet</p>
        )}
      </div>

      <Separator />

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Preview Server Logs</h3>
        <div className="bg-zinc-950 text-green-400 font-mono text-xs p-3 rounded-lg max-h-60 overflow-auto">
          {previewLogs.length > 0 ? (
            previewLogs.map((line, i) => <span key={i}>{line}</span>)
          ) : (
            <span className="text-zinc-500">No preview logs</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Deploy Logs</h3>
        <div className="bg-zinc-950 text-blue-400 font-mono text-xs p-3 rounded-lg max-h-60 overflow-auto">
          {deployLogs.length > 0 ? (
            deployLogs.map((line, i) => <div key={i}>{line}</div>)
          ) : (
            <span className="text-zinc-500">No deploy logs</span>
          )}
        </div>
      </div>
    </div>
  );
}
