'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { History, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/store/editorStore';

interface Version {
  id: string;
  version: number;
  content: string;
  created_at: string;
}

export function VersionHistory() {
  const { projectId } = useParams<{ projectId: string }>();
  const { activeFilePath, updateFile } = useEditorStore();
  const [versions, setVersions] = useState<Version[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!activeFilePath || !isOpen) return;
    fetch(
      `/api/projects/${projectId}/files/versions?path=${encodeURIComponent(activeFilePath)}`
    )
      .then((r) => r.json())
      .then((d) => setVersions(d.versions || []))
      .catch(() => {});
  }, [activeFilePath, isOpen, projectId]);

  const handleRollback = async (version: number) => {
    if (!activeFilePath) return;
    const res = await fetch(`/api/projects/${projectId}/files/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: activeFilePath, version }),
    });
    const data = await res.json();
    if (data.success) {
      updateFile(activeFilePath, data.content);
    }
  };

  if (!activeFilePath) return null;

  return (
    <div className="border-t">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 w-full px-3 py-2 text-xs
                   text-muted-foreground hover:bg-accent"
      >
        <History className="h-3 w-3" />
        版本历史 ({versions.length})
      </button>
      {isOpen && (
        <div className="max-h-48 overflow-auto px-2 pb-2 space-y-1">
          {versions.length === 0 ? (
            <div className="text-xs text-muted-foreground px-2 py-1.5">
              暂无历史版本
            </div>
          ) : (
            versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between px-2 py-1.5
                           rounded text-xs hover:bg-muted"
              >
                <span>
                  v{v.version} · {new Date(v.created_at).toLocaleString()}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => handleRollback(v.version)}
                  title="回滚到此版本"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
