'use client';

import { useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { useEditorStore } from '@/store/editorStore';
import { VersionHistory } from './VersionHistory';

function getLanguage(path: string): string {
  if (path.endsWith('.tsx') || path.endsWith('.jsx')) return 'typescript';
  if (path.endsWith('.ts')) return 'typescript';
  if (path.endsWith('.js')) return 'javascript';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.html')) return 'html';
  if (path.endsWith('.md')) return 'markdown';
  if (path.endsWith('.sql')) return 'sql';
  return 'plaintext';
}

export function CodeViewer() {
  const { files, activeFilePath, updateFile } = useEditorStore();

  const activeFile = useMemo(
    () => files.find((f) => f.path === activeFilePath),
    [files, activeFilePath]
  );

  if (!activeFilePath || !activeFile) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <div className="text-center space-y-2">
          <p>选择文件查看代码</p>
          <p className="text-xs">或通过 AI 对话生成新文件</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 文件标签栏 */}
      <div className="flex items-center h-9 border-b bg-muted/30 px-2">
        <span className="text-xs text-muted-foreground px-2 py-1 bg-background rounded border">
          {activeFilePath}
        </span>
      </div>

      {/* Monaco 编辑器 */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={getLanguage(activeFilePath)}
          value={activeFile.content}
          onChange={(value) => {
            if (value !== undefined) {
              updateFile(activeFilePath, value);
            }
          }}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 20,
            padding: { top: 8 },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            readOnly: false,
            tabSize: 2,
          }}
        />
      </div>

      {/* 版本历史面板 */}
      <VersionHistory />
    </div>
  );
}
