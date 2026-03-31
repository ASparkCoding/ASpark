/**
 * Prompt 常量分层
 * 学习 Base44 哲学：Prompt 尽可能短，复杂逻辑转移到模板和 SDK 中
 */

/** 技术栈声明 */
export const TECH_STACK_DECLARATION = `## Tech Stack (locked, do not deviate)
- Build: Vite 5+ / React 18 / TypeScript (loose mode)
- Styling: Tailwind CSS 3 + CSS variables (bg-background, text-foreground, etc.)
- UI: shadcn/ui + Radix UI (see Available Components below)
- Icons: Lucide React
- Database: Supabase JS Browser SDK (@supabase/supabase-js)
- Storage: Supabase Storage (via storageService SDK)
- Forms: Zod + React Hook Form
- Routing: React Router v6 (BrowserRouter)
- Charts: Recharts
- Toast: Sonner
- Date: date-fns`;

/** 可用组件清单（25 个 shadcn/ui 组件） */
export const AVAILABLE_COMPONENTS_LIST = `## Available Components (pre-installed, import directly)
All at @/components/ui/{name}:
button, input, label, card, badge, textarea, separator, table,
dialog, select, tabs, dropdown-menu, avatar, switch, skeleton,
alert, alert-dialog, sheet, form, popover, checkbox, scroll-area,
tooltip, radio-group, progress

Also available: ErrorBoundary (@/components/ErrorBoundary), Loading (@/components/Loading), EmptyState (@/components/EmptyState)
Utilities: cn() from @/lib/utils, toast from sonner`;

/** 预注入文件声明 — 告知 LLM 哪些文件已经存在 */
export const PRE_INJECTED_FILES = `## Pre-installed files (already exist, do NOT generate these)
**Config (always injected):**
package.json, vite.config.ts, tsconfig.json, tsconfig.node.json, index.html,
tailwind.config.js, postcss.config.js, src/index.css, src/vite-env.d.ts, vercel.json

**Infrastructure (import directly):**
- src/lib/supabase.ts — Supabase client with \`isSupabaseConnected\` detection
- src/lib/data-service.ts — Entity CRUD SDK: \`createEntityService()\`
- src/lib/auth.tsx — Auth provider: \`AuthProvider\`, \`useAuth()\`
- src/lib/storage.ts — File storage: \`storageService.upload(bucket, path, file)\`, \`.delete()\`, \`.list()\`, \`.getPublicUrl()\`
- src/lib/utils.ts — \`cn()\` helper

**UI Components:**
- src/components/ui/*.tsx — All 25 shadcn/ui components listed above
- src/components/ErrorBoundary.tsx — React Error Boundary
- src/components/Loading.tsx — LoadingSkeleton + PageLoading
- src/components/EmptyState.tsx — Empty state with icon + title + action

**Environment:**
- .env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY configured
- Platform auto-executes supabase-schema.sql`;

/** Entity 模式 — 使用 createEntityService SDK */
export const ENTITY_PATTERN = `## Entity Pattern (use createEntityService SDK)
Each entity file only needs:
1. Define TypeScript interface
2. Provide 5+ Chinese sample data items
3. Call createEntityService to create service

Example:
\`\`\`typescript
// src/entities/Customer.ts
import { createEntityService } from '@/lib/data-service';

export interface Customer {
  id: string;
  name: string;
  email: string;
  company: string;
  status: 'active' | 'inactive' | 'lead';
  phone?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export const customerService = createEntityService<Customer>({
  tableName: 'customers',
  searchFields: ['name', 'email', 'company'],
  defaultOrderBy: 'created_at',
  sampleData: [
    { id: '1', name: '张三', email: 'zhangsan@huawei.com', company: '华为技术', status: 'active', phone: '13800138001', notes: '大客户', created_at: '2025-01-15T08:00:00Z', updated_at: '2025-03-01T10:00:00Z' },
    { id: '2', name: '李四', email: 'lisi@alibaba.com', company: '阿里巴巴', status: 'active', phone: '13900139002', notes: '年度合作', created_at: '2025-02-20T09:00:00Z', updated_at: '2025-03-10T14:00:00Z' },
    { id: '3', name: '王五', email: 'wangwu@tencent.com', company: '腾讯', status: 'lead', phone: '13700137003', notes: '初次接触', created_at: '2025-03-01T11:00:00Z', updated_at: '2025-03-15T16:00:00Z' },
    { id: '4', name: '赵六', email: 'zhaoliu@bytedance.com', company: '字节跳动', status: 'inactive', phone: '13600136004', notes: '合同到期', created_at: '2025-01-10T07:00:00Z', updated_at: '2025-02-28T09:00:00Z' },
    { id: '5', name: '钱七', email: 'qianqi@meituan.com', company: '美团', status: 'active', phone: '13500135005', notes: '新签客户', created_at: '2025-03-10T13:00:00Z', updated_at: '2025-03-14T15:00:00Z' },
  ],
});
\`\`\`

**IMPORTANT: Do NOT implement getAll/create/update/delete manually — they are provided by createEntityService automatically.**
Usage: \`const { data, error } = await customerService.getAll({ search: '华为' });\``;

/** 关键规则 */
export const CRITICAL_RULES = `## CRITICAL RULES
1. Use \`createEntityService()\` for ALL entities — never write raw Supabase queries in entity files
2. Only import components from the Available Components list above
3. Every page must have: loading skeleton + empty state + error toast
4. Use BrowserRouter + Routes in App.tsx, wrap in ErrorBoundary
5. Use @/ prefix for all src/ imports
6. Use CSS variable colors (bg-background, text-foreground, etc.) — NEVER hardcode bg-white/bg-black/text-gray-xxx
7. All user actions need loading + success/error feedback (sonner toast)
8. NEVER output setup instructions, README, or "how to run" text — just code files
9. Lucide icons: ONLY use verified icon names. Common ones: Home, Users, Settings, Search, Plus, Trash2, Edit, Eye, Download, Upload, Mail, Phone, Calendar, Clock, Star, Heart, Check, X, ChevronDown, ChevronRight, ArrowLeft, ArrowRight, Menu, MoreHorizontal, MoreVertical, Filter, SortAsc, Bell, ShoppingCart, CreditCard, DollarSign, BarChart3, LineChart, PieChart, TrendingUp, TrendingDown, Package, FileText, FolderOpen, Image, Link, Globe, Lock, Unlock, Shield, AlertTriangle, Info, HelpCircle, UserPlus, UserCircle, LogOut, LayoutDashboard, Layers, Tag, Bookmark, Share2, Copy, Clipboard, RefreshCw, Loader2, CheckCircle, XCircle, AlertCircle, Workflow, Building2, MapPin, Briefcase, Receipt, Warehouse, Contact2, Handshake, Target, Zap, Award. Do NOT invent icon names.`;

/** UI/UX 设计标准（精简版） */
export const UI_STANDARDS = `## UI/UX Standards
- Layout: Sidebar(w-64) + Header(h-14) + Main Content, responsive (hamburger on mobile)
- Every page: h1 title + description + action area + content area
- Tables: use shadcn Table, include search + pagination
- Dashboard: 4 stat cards (icon + value + trend) + charts (recharts)
- Navigation: NavLink with active highlight (bg-accent), Lucide icons
- Typography: text-2xl font-bold (page title), text-lg font-semibold (section), text-sm text-muted-foreground (description)
- Spacing: page p-4 md:p-6, card gap space-y-4, section gap space-y-6`;

/** SQL Schema 标准（精简版） */
export const SCHEMA_RULES = `## SQL Schema Rules
- CREATE TABLE IF NOT EXISTS, UUID PRIMARY KEY (gen_random_uuid()), created_at/updated_at TIMESTAMPTZ
- Foreign keys with ON DELETE CASCADE, CHECK constraints for enums
- CREATE INDEX for common query fields
- RLS: ALTER TABLE ... ENABLE ROW LEVEL SECURITY + permissive policy for preview
- All schema in one supabase-schema.sql file, ordered by dependency`;

/** 入口文件标准（精简版） */
export const ENTRY_STANDARDS = `## Entry File Patterns
main.tsx: import App + index.css, ReactDOM.createRoot, checkSupabaseConnection() already called by pre-injected main.tsx — you only need to generate App.tsx.
App.tsx: BrowserRouter + Routes + Toaster + ErrorBoundary wrapper, Layout with Outlet.
Layout.tsx: flex h-screen, Sidebar + main with Outlet, responsive.`;

/** Scaffold 任务特定指令 */
export const SCAFFOLD_INSTRUCTIONS = `## Task: Scaffold (first-time full generation)
Generate a complete, runnable application.

### Files to generate:
- src/App.tsx (router + layout)
- src/entities/*.ts (using createEntityService SDK)
- src/pages/*.tsx (all pages)
- src/components/Layout.tsx, Sidebar.tsx, and business components
- supabase-schema.sql (if database needed)

### Files NOT to generate (pre-injected):
- package.json, vite.config.ts, tsconfig.json, index.html, etc.
- src/main.tsx (pre-injected with Supabase init)
- src/lib/supabase.ts, src/lib/data-service.ts, src/lib/auth.tsx, src/lib/utils.ts
- src/components/ui/*.tsx (all 25 shadcn components)
- src/components/ErrorBoundary.tsx, Loading.tsx, EmptyState.tsx
- src/index.css, src/vite-env.d.ts

### Output order:
1. Entity files (src/entities/*.ts) — then write: "数据层定义完成。接下来创建页面和组件。"
2. Page files (src/pages/*.tsx) — then write: "页面创建完成，接下来添加公共组件和布局。"
3. Layout + Sidebar + business components — then write: "组件已就绪，接下来配置路由。"
4. App.tsx + supabase-schema.sql

Each entity must have 5+ sample data items. Minimize explanation text, maximize code.`;

/** 黄金示例：一个完整的迷你应用片段，展示正确的文件间协作模式 */
export const GOLDEN_EXAMPLE = `## Golden Reference: How files work together
Below is a **correct, minimal** example showing entity → page → component → App.tsx wiring.
Follow this exact pattern for every feature you generate.

### 1. Entity file (src/entities/Task.ts)
\`\`\`typescript
import { createEntityService } from '@/lib/data-service';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  assignee?: string;
  created_at: string;
  updated_at: string;
}

export const taskService = createEntityService<Task>({
  tableName: 'tasks',
  searchFields: ['title', 'description', 'assignee'],
  defaultOrderBy: 'created_at',
  sampleData: [
    { id: '1', title: '设计系统架构', description: '完成系统整体架构设计', status: 'done', priority: 'high', assignee: '张三', created_at: '2025-01-10T08:00:00Z', updated_at: '2025-01-15T10:00:00Z' },
    { id: '2', title: '开发用户模块', description: '实现用户注册和登录功能', status: 'in_progress', priority: 'high', assignee: '李四', created_at: '2025-01-12T09:00:00Z', updated_at: '2025-01-20T14:00:00Z' },
    { id: '3', title: '编写单元测试', description: '为核心模块编写测试用例', status: 'todo', priority: 'medium', assignee: '王五', created_at: '2025-01-15T11:00:00Z', updated_at: '2025-01-15T11:00:00Z' },
    { id: '4', title: '优化数据库查询', description: '改善慢查询性能', status: 'todo', priority: 'low', created_at: '2025-01-18T13:00:00Z', updated_at: '2025-01-18T13:00:00Z' },
    { id: '5', title: '部署到生产环境', description: '配置CI/CD并部署', status: 'todo', priority: 'medium', assignee: '赵六', created_at: '2025-01-20T15:00:00Z', updated_at: '2025-01-20T15:00:00Z' },
  ],
});
\`\`\`

### 2. Page file (src/pages/Tasks.tsx)
\`\`\`tsx
import { useState, useEffect, useCallback } from 'react';
import { taskService, type Task } from '@/entities/Task';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { Plus, Search, CheckSquare } from 'lucide-react';
import { toast } from 'sonner';

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await taskService.getAll({ search });
      setTasks(data || []);
    } catch {
      toast.error('加载任务失败');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const statusColors: Record<string, string> = {
    todo: 'bg-muted text-muted-foreground',
    in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">任务管理</h1>
          <p className="text-sm text-muted-foreground">管理和追踪所有任务</p>
        </div>
        <Button><Plus className="h-4 w-4 mr-2" />新建任务</Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="搜索任务..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {tasks.length === 0 ? (
        <EmptyState icon={CheckSquare} title="暂无任务" description="点击新建按钮创建第一个任务" />
      ) : (
        <Card>
          <CardHeader><CardTitle>任务列表</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>标题</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>优先级</TableHead>
                  <TableHead>负责人</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map(task => (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium">{task.title}</TableCell>
                    <TableCell><Badge className={statusColors[task.status]}>{task.status}</Badge></TableCell>
                    <TableCell><Badge variant="outline">{task.priority}</Badge></TableCell>
                    <TableCell>{task.assignee || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
\`\`\`

### 3. App.tsx wiring (src/App.tsx)
\`\`\`tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Toaster } from 'sonner';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Tasks from '@/pages/Tasks';

export default function App() {
  return (
    <ErrorBoundary>
      <Toaster position="top-right" richColors />
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tasks" element={<Tasks />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
\`\`\`

### Key patterns to follow:
- **Entity → Page**: Page imports entity type + service, uses \`service.getAll()\`
- **Loading state**: Always show Skeleton while fetching, EmptyState when no data
- **Error handling**: Wrap API calls in try/catch, show \`toast.error()\` on failure
- **Import paths**: Always use \`@/\` prefix, NEVER use deep relative paths like \`../../../\`
- **Icons**: Only use verified Lucide icon names from the list above
- **Colors**: Only use CSS variable classes (bg-background, text-foreground, bg-muted, etc.)
- **App.tsx**: Every page MUST be imported and have a \`<Route>\` entry`;
