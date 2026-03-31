'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { DashboardSidebar } from '@/components/DashboardSidebar';
import type { Project } from '@/types';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [recentProjects, setRecentProjects] = useState<{ id: string; name: string }[]>([]);

  // IDE workspace pages get full-width layout (no sidebar)
  const isEditorPage = pathname.match(/^\/[a-zA-Z0-9-]+$/) && pathname !== '/projects' && pathname !== '/templates' && pathname !== '/explore' && pathname !== '/settings' && pathname !== '/docs' && pathname !== '/integrations' && pathname !== '/community';

  // Load recent projects for sidebar
  useEffect(() => {
    if (isEditorPage) return;
    fetch('/api/projects')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Project[]) => {
        setRecentProjects(data.slice(0, 5).map((p) => ({ id: p.id, name: p.name })));
      })
      .catch(() => {});
  }, [isEditorPage]);

  if (isEditorPage) {
    return <div className="min-h-screen flex flex-col">{children}</div>;
  }

  return (
    <div className="min-h-screen flex">
      <DashboardSidebar recentProjects={recentProjects} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
