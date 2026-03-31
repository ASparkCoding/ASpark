'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Home,
  Folder,
  LayoutTemplate,
  Puzzle,
  Users,
  Globe,
  Diamond,
  ChevronsUpDown,
  Settings,
  Sparkles,
  Bell,
  User,
  HelpCircle,
  Heart,
  Gift,
  CreditCard,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RecentProject {
  id: string;
  name: string;
}

interface DashboardSidebarProps {
  recentProjects?: RecentProject[];
}

const navItems = [
  { label: '首页', icon: Home, href: '/' },
  { label: '所有应用', icon: Folder, href: '/projects' },
  { label: '应用模板', icon: LayoutTemplate, href: '/templates' },
  { label: '集成', icon: Puzzle, href: '/integrations' },
  { label: '社区', icon: Users, href: '/community' },
];

export function DashboardSidebar({ recentProjects = [] }: DashboardSidebarProps) {
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [userMenuOpen]);

  return (
    <aside className="w-[280px] flex flex-col bg-sidebar border-r border-sidebar-border shrink-0 h-screen">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
        <Link href="/" className="flex items-center">
          <Image
            src="/aspark-logo-horizontal.svg"
            alt="ASpark"
            width={120}
            height={24}
            className="h-6 w-auto"
            priority
          />
        </Link>
      </div>

      {/* Workspace Selector */}
      <div className="px-6 py-3">
        <button className="flex items-center gap-3 w-full rounded-lg px-2 py-2 hover:bg-sidebar-accent transition-colors">
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center shrink-0">
            <span className="text-sm font-semibold text-white">A</span>
          </div>
          <span className="text-sm font-medium text-sidebar-accent-foreground truncate flex-1 text-left">
            我的工作区
          </span>
          <ChevronsUpDown className="h-4 w-4 text-sidebar-foreground shrink-0" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="px-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 rounded-full text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50'
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Recent Projects */}
      <div className="flex-1 px-4 mt-6 overflow-y-auto">
        <h3 className="px-4 mb-2 text-xs font-medium text-sidebar-foreground tracking-wider">
          近期项目
        </h3>
        <div className="space-y-1">
          {recentProjects.slice(0, 5).map((project) => (
            <Link
              key={project.id}
              href={`/${project.id}`}
              className="flex items-center gap-3 px-4 py-2 rounded-full text-sm text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50 transition-colors"
            >
              <Globe className="h-4 w-4 shrink-0" />
              <span className="truncate">{project.name}</span>
            </Link>
          ))}
          {recentProjects.length === 0 && (
            <p className="px-4 py-2 text-xs text-sidebar-foreground/60">暂无项目</p>
          )}
        </div>
      </div>

      {/* Upgrade Banner */}
      {!userMenuOpen && (
        <div className="px-4 pb-3">
          <div className="rounded-xl bg-brand/10 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Diamond className="h-4 w-4 text-brand" />
              <span className="text-sm font-semibold text-brand">升级你的套餐</span>
            </div>
            <p className="text-xs text-muted-foreground">解锁更多 AI 积分与高级功能</p>
          </div>
        </div>
      )}

      {/* User Menu Popover - renders inline above toolbar when open */}
      <div ref={menuRef}>
        {userMenuOpen && (
          <div className="mx-3 mb-2 bg-popover border border-border rounded-xl shadow-lg py-2">
            {/* User Info */}
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-brand" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">Alex Chen</p>
                  <p className="text-xs text-muted-foreground truncate">alex@aspark.dev</p>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="py-1">
              <button className="flex items-center gap-3 w-full px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors">
                <User className="h-4 w-4 text-muted-foreground" />
                查看个人资料
              </button>
              <button className="flex items-center gap-3 w-full px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors">
                <Settings className="h-4 w-4 text-muted-foreground" />
                账户设置
              </button>
              <button className="flex items-center gap-3 w-full px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors">
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                帮助与支持
              </button>
            </div>

            <div className="border-t border-border my-1" />

            <div className="py-1">
              <button className="flex items-center gap-3 w-full px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors">
                <Heart className="h-4 w-4 text-muted-foreground" />
                成为合作伙伴
              </button>
              <button className="flex items-center gap-3 w-full px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors">
                <Gift className="h-4 w-4 text-muted-foreground" />
                邀请好友
              </button>
              <button className="flex items-center gap-3 w-full px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                发送礼品卡
              </button>
            </div>

            <div className="border-t border-border my-1" />

            <div className="py-1">
              <button className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors">
                <LogOut className="h-4 w-4" />
                退出登录
              </button>
            </div>
          </div>
        )}

        {/* Bottom Toolbar */}
        <div className="px-4 py-3 border-t border-sidebar-border flex items-center gap-1">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className={cn(
              'h-8 w-8 rounded-full flex items-center justify-center transition-colors',
              userMenuOpen ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent'
            )}
            title="用户菜单"
          >
            <Settings className="h-4 w-4 text-sidebar-foreground" />
          </button>
          <button
            className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-sidebar-accent transition-colors"
            title="AI 助手"
          >
            <Sparkles className="h-4 w-4 text-sidebar-foreground" />
          </button>
          <button
            className="relative h-8 w-8 rounded-full flex items-center justify-center hover:bg-sidebar-accent transition-colors"
            title="通知"
          >
            <Bell className="h-4 w-4 text-sidebar-foreground" />
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-brand" />
          </button>
        </div>
      </div>
    </aside>
  );
}
