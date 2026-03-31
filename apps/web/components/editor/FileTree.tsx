'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { cn } from '@/lib/utils';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

function FileTreeNode({ node, depth = 0 }: { node: FileNode; depth?: number }) {
  const [expanded, setExpanded] = useState(true);
  const { activeFilePath, setActiveFile } = useEditorStore();
  const isActive = activeFilePath === node.path;

  const getFileIcon = (name: string) => {
    if (name.endsWith('.tsx') || name.endsWith('.ts'))
      return <span className="text-blue-400 text-xs mr-1">TS</span>;
    if (name.endsWith('.css'))
      return <span className="text-purple-400 text-xs mr-1">CS</span>;
    if (name.endsWith('.json'))
      return <span className="text-yellow-400 text-xs mr-1">{ }</span>;
    if (name.endsWith('.sql'))
      return <span className="text-green-400 text-xs mr-1">SQ</span>;
    return <FileText className="h-3.5 w-3.5 mr-1 text-muted-foreground" />;
  };

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center w-full px-2 py-1 text-sm hover:bg-accent rounded-sm"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 mr-1 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 mr-1 shrink-0" />
          )}
          {expanded ? (
            <FolderOpen className="h-3.5 w-3.5 mr-1 text-blue-400 shrink-0" />
          ) : (
            <Folder className="h-3.5 w-3.5 mr-1 text-blue-400 shrink-0" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children?.map((child) => (
          <FileTreeNode key={child.path} node={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => setActiveFile(node.path)}
      className={cn(
        'flex items-center w-full px-2 py-1 text-sm rounded-sm',
        isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
      )}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
    >
      {getFileIcon(node.name)}
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export function FileTree() {
  const { fileTree } = useEditorStore();

  if (fileTree.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground text-center">
        暂无文件，通过 AI 对话生成代码
      </div>
    );
  }

  return (
    <div className="py-2">
      {fileTree.map((node) => (
        <FileTreeNode key={node.path} node={node} />
      ))}
    </div>
  );
}
