'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Copy, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';

const categories = [
  '全部',
  '市场营销与销售',
  '运营',
  '数据与分析',
  '内容生成',
  '人力资源与法务',
  '财务',
  '教育背景',
  '社区',
  '生活方式与爱好',
  '游戏与娱乐',
];

interface Template {
  id: string;
  name: string;
  description: string;
  author: string;
  clones: number;
  price: string;
  tags: string[];
  gradient: string;
  icon: string;
}

const templates: Template[] = [
  {
    id: 'task-flow',
    name: '任务管理流程',
    description: '全功能项目管理看板，支持任务分配、进度追踪、团队协作与数据分析仪表盘',
    author: 'ASpark 官方',
    clones: 27061,
    price: '免费',
    tags: ['市场营销与销售', '运营'],
    gradient: 'from-violet-600 via-purple-600 to-indigo-700',
    icon: '📊',
  },
  {
    id: 'spa-salon',
    name: '宁静——水疗与沙龙',
    description: '豪华水疗与沙龙预约管理系统，包含服务展示、在线预约、客户管理与支付集成',
    author: '数字医生',
    clones: 2773,
    price: '¥68',
    tags: ['市场营销与销售', '生活方式与爱好'],
    gradient: 'from-amber-700 via-yellow-800 to-amber-900',
    icon: '🧖',
  },
  {
    id: 'task-mgmt',
    name: '任务管理',
    description: '简洁高效的团队任务管理工具，支持看板视图、优先级排序与截止日期提醒',
    author: 'ASpark 官方',
    clones: 15908,
    price: '免费',
    tags: ['市场营销与销售', '运营'],
    gradient: 'from-slate-700 via-gray-800 to-slate-900',
    icon: '✅',
  },
  {
    id: 'crm-system',
    name: '客户关系管理系统',
    description: '一体化 CRM 平台，涵盖客户跟踪、销售漏斗、数据分析和自动化营销功能',
    author: 'ASpark 官方',
    clones: 12450,
    price: '免费',
    tags: ['市场营销与销售', '数据与分析'],
    gradient: 'from-blue-600 via-cyan-600 to-teal-600',
    icon: '👥',
  },
  {
    id: 'website-gen',
    name: 'AI 网站生成器',
    description: '描述你的愿景，AI 即刻生成精美响应式网站，支持自定义主题与组件拖拽编辑',
    author: 'ASpark 官方',
    clones: 8920,
    price: '免费',
    tags: ['内容生成', '运营'],
    gradient: 'from-emerald-500 via-green-600 to-teal-700',
    icon: '🌐',
  },
  {
    id: 'skill-products',
    name: '技能变现平台',
    description: '快速启动你的微产品，支持在线课程、付费内容与会员订阅系统',
    author: '创业工坊',
    clones: 5340,
    price: '¥128',
    tags: ['财务', '内容生成'],
    gradient: 'from-fuchsia-600 via-pink-600 to-rose-600',
    icon: '🚀',
  },
  {
    id: 'edu-platform',
    name: '在线教育平台',
    description: '功能完备的学习管理系统，支持课程创建、学生管理、在线考试与进度追踪',
    author: 'ASpark 官方',
    clones: 9800,
    price: '免费',
    tags: ['教育背景', '内容生成'],
    gradient: 'from-orange-500 via-red-500 to-pink-600',
    icon: '📚',
  },
  {
    id: 'inventory',
    name: '库存管理系统',
    description: '智能库存管理与进销存系统，支持多仓库、库存预警、供应商管理与报表生成',
    author: 'ASpark 官方',
    clones: 6720,
    price: '免费',
    tags: ['运营', '数据与分析'],
    gradient: 'from-sky-600 via-blue-700 to-indigo-800',
    icon: '📦',
  },
  {
    id: 'social-community',
    name: '社交社区门户',
    description: '小众社区平台模板，支持帖子发布、评论互动、用户主页与通知系统',
    author: '社区达人',
    clones: 3150,
    price: '¥88',
    tags: ['社区', '生活方式与爱好'],
    gradient: 'from-rose-500 via-pink-500 to-fuchsia-600',
    icon: '💬',
  },
];

export default function TemplatesPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('全部');
  const [cloningId, setCloningId] = useState<string | null>(null);

  const filtered = templates.filter((t) => {
    const matchSearch =
      !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory =
      activeCategory === '全部' || t.tags.includes(activeCategory);
    return matchSearch && matchCategory;
  });

  const handleClone = async (template: Template) => {
    setCloningId(template.id);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
        }),
      });
      if (res.ok) {
        const project = await res.json();
        router.push(
          `/${project.id}?prompt=${encodeURIComponent(
            `基于"${template.name}"模板创建应用：${template.description}`
          )}`
        );
      }
    } catch (e) {
      console.error('Failed to clone template:', e);
    } finally {
      setCloningId(null);
    }
  };

  const formatClones = (n: number) => {
    if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="shrink-0 px-8 pt-8 pb-0">
        <h1 className="text-3xl font-bold tracking-tight mb-2">应用模板</h1>
        <p className="text-base text-muted-foreground mb-6">
          探索我们社区精心打造的应用程序合集。
        </p>

        {/* Search + Filters Row */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索应用"
              className="pl-9 h-10 bg-card border-border"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-foreground text-background'
                  : 'bg-secondary text-foreground hover:bg-secondary/80'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </header>

      {/* Template Grid */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-lg font-medium mb-2">未找到匹配的模板</p>
            <p className="text-sm text-muted-foreground">尝试调整搜索词或选择其他分类</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((template) => (
              <div
                key={template.id}
                className="group rounded-xl border border-border bg-card overflow-hidden hover:shadow-lg hover:border-brand/20 transition-all duration-200 cursor-pointer"
                onClick={() => handleClone(template)}
              >
                {/* Preview Image */}
                <div
                  className={`relative h-[200px] bg-gradient-to-br ${template.gradient} flex items-center justify-center overflow-hidden`}
                >
                  <span className="text-6xl opacity-30 group-hover:opacity-50 group-hover:scale-110 transition-all duration-300">
                    {template.icon}
                  </span>

                  {/* Clone overlay on hover */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 px-4 py-2 rounded-lg bg-white/90 text-foreground text-sm font-medium shadow-lg">
                      {cloningId === template.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      使用此模板
                    </div>
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-4">
                  {/* Title + Price */}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-base font-semibold truncate">
                      {template.name}
                    </h3>
                    <span
                      className={`text-sm font-medium shrink-0 ${
                        template.price === '免费'
                          ? 'text-muted-foreground'
                          : 'text-foreground'
                      }`}
                    >
                      {template.price}
                    </span>
                  </div>

                  {/* Author + Clones */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                    <span>{template.author}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Copy className="h-3 w-3" />
                      {formatClones(template.clones)}
                    </span>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5">
                    {template.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded text-[11px] bg-secondary text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                    {template.tags.length > 2 && (
                      <span className="px-2 py-0.5 rounded text-[11px] text-muted-foreground">
                        +{template.tags.length - 2}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
