'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw, ExternalLink, Terminal, Monitor, StopCircle, X, Send, Palette, Type, Square, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/store/editorStore';
import { BuildingAnimation } from './BuildingAnimation';
import type { PreviewStatus } from '@/store/editorStore';
import { useParams } from 'next/navigation';
import { bootPreview } from '@/lib/preview/boot-client';
import { VISUAL_EDIT_SCRIPT } from '@/lib/templates/infra-files/visual-edit-injector';

export function PreviewFrame() {
  const params = useParams();
  const projectId = params.projectId as string;

  const {
    files,
    previewUrl,
    previewStatus,
    previewLogs,
    setPreviewUrl,
    setPreviewStatus,
    appendPreviewLog,
    isGenerating,
    buildPhase,
    visualEditMode,
    setVisualEditMode,
  } = useEditorStore();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [previewPath, setPreviewPath] = useState('/');
  const [selectedElement, setSelectedElement] = useState<{
    tagName: string;
    text: string;
    className: string;
    path: string;
    styles?: Record<string, string>;
  } | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal logs
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [previewLogs]);

  // Runtime error listener is now in EditorPage (always mounted)
  // to ensure errors are captured regardless of which tab is active.

  // NOTE: Boot trigger is in EditorPage (always mounted), not here.
  // This ensures preview boots regardless of which tab is active.

  // ★ Force iframe reload when preview transitions to ready
  const prevPreviewStatusRef = useRef<PreviewStatus>('idle');
  useEffect(() => {
    if (previewStatus === 'ready' && prevPreviewStatusRef.current !== 'ready') {
      setIframeKey((k) => k + 1);
    }
    prevPreviewStatusRef.current = previewStatus;
  }, [previewStatus]);

  // ★ Periodic health check: detect dead server while status is 'ready'
  // Catches cases where Vite crashes after HMR but status wasn't updated
  useEffect(() => {
    if (previewStatus !== 'ready') return;
    const checkHealth = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/preview/health`);
        const data = await res.json();
        if (!data.healthy) {
          appendPreviewLog('\nDev server stopped responding. Restarting...\n');
          setPreviewStatus('error');
        }
      } catch { /* ignore fetch errors */ }
    };
    // Check after 5s, then every 15s
    const initialTimer = setTimeout(checkHealth, 5000);
    const interval = setInterval(checkHealth, 15000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [previewStatus, projectId, appendPreviewLog, setPreviewStatus]);

  // ★ G8: Visual Edit — inject click-capture script into iframe
  useEffect(() => {
    if (!visualEditMode || previewStatus !== 'ready') {
      setSelectedElement(null);
      return;
    }

    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'visual-edit-select') {
        setSelectedElement(e.data.data);
      }
    };
    window.addEventListener('message', handler);

    // Inject enhanced visual edit capture script (from infra file)
    const iframe = iframeRef.current;
    if (iframe?.contentDocument) {
      try {
        const script = iframe.contentDocument.createElement('script');
        script.id = 'aspark-visual-edit';
        script.textContent = VISUAL_EDIT_SCRIPT;
        iframe.contentDocument.head.appendChild(script);
      } catch { /* cross-origin */ }
    }

    return () => {
      window.removeEventListener('message', handler);
      // Remove script on cleanup
      try {
        const doc = iframeRef.current?.contentDocument;
        const script = doc?.getElementById('aspark-visual-edit');
        if (script) script.remove();
      } catch { /* ignore */ }
    };
  }, [visualEditMode, previewStatus, iframeKey]);

  // ★ Incremental file updates via local file write (HMR)
  // Key guard: wasReadyRef ensures we only send updates when files change
  // WHILE preview was already ready — NOT on the initial ready transition,
  // which would re-write all files and cause Vite 504 "Outdated Request".
  const wasReadyRef = useRef(false);
  useEffect(() => {
    if (previewStatus === 'ready') {
      if (wasReadyRef.current && !isGenerating) {
        const dirtyContents = useEditorStore.getState().getDirtyFileContents();
        if (dirtyContents.length === 0) return; // 无变更，不发请求

        fetch(`/api/projects/${projectId}/preview/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: dirtyContents }),
        })
          .then((res) => {
            if (res.ok) {
              useEditorStore.getState().clearDirtyFiles();
              appendPreviewLog(`\n${dirtyContents.length} files updated (HMR).\n`);
            } else {
              appendPreviewLog('\nFailed to update files.\n');
            }
          })
          .catch(() => {
            appendPreviewLog('\nFailed to update files.\n');
          });
      }
      wasReadyRef.current = true;
    } else {
      wasReadyRef.current = false;
    }
  }, [files, previewStatus, isGenerating, projectId, appendPreviewLog]);

  const handleRefresh = () => {
    setIframeKey((k) => k + 1);
  };

  const handleStop = async () => {
    try {
      await fetch(`/api/projects/${projectId}/preview/stop`, {
        method: 'POST',
      });
      setPreviewStatus('idle');
      setPreviewUrl(null);
      appendPreviewLog('\nDev server stopped.\n');
    } catch {
      appendPreviewLog('\nFailed to stop dev server.\n');
    }
  };

  const handleRetry = () => {
    // Directly call bootPreview (the module-level lock handles idempotency)
    useEditorStore.getState().setPreviewStatus('idle');
    bootPreview(projectId);
  };

  // Empty state
  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm bg-muted/20">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
            <Monitor className="h-8 w-8" />
          </div>
          <p>Preview</p>
          <p className="text-xs">
            AI generates code, then preview runs locally
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Status bar */}
      <div className="flex items-center justify-between h-9 border-b bg-muted/30 px-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <StatusBadge status={previewStatus} />
          {/* T10: Editable route path */}
          {previewUrl ? (
            <div className="flex items-center gap-0 text-[10px] text-muted-foreground bg-background/50 border rounded px-1.5 py-0.5 flex-1 max-w-[220px]">
              <span className="shrink-0 opacity-60">localhost</span>
              <input
                value={previewPath}
                onChange={(e) => setPreviewPath(e.target.value.startsWith('/') ? e.target.value : '/' + e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && iframeRef.current && previewUrl) {
                    setIframeKey((k) => k + 1);
                  }
                }}
                className="flex-1 bg-transparent outline-none text-foreground min-w-[40px] pl-0.5"
                placeholder="/"
              />
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground">No preview</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setShowTerminal((v) => !v)}
            title="Toggle terminal"
          >
            <Terminal className="h-3 w-3" />
          </Button>
          {previewStatus === 'ready' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleStop}
              title="Stop dev server"
            >
              <StopCircle className="h-3 w-3" />
            </Button>
          )}
          {previewUrl && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleRefresh}
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => window.open(previewUrl, '_blank')}
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col relative">
        {/* Building animation — shown during build when preview not ready (including background mode) */}
        {(buildPhase === 'building' || buildPhase === 'fixing_errors' || buildPhase === 'background') && previewStatus !== 'ready' ? (
          <BuildingAnimation />
        ) : previewStatus === 'ready' && previewUrl ? (
          <iframe
            ref={iframeRef}
            key={iframeKey}
            src={previewPath !== '/' ? `${previewUrl}${previewPath}` : previewUrl}
            className="flex-1 w-full border-0"
            sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
            allow="clipboard-read; clipboard-write"
            title="App Preview"
          />
        ) : (
          /* Loading: show terminal logs */
          <div className="flex-1 bg-zinc-950 text-green-400 font-mono text-xs p-3 overflow-auto">
            {previewLogs.map((line, i) => (
              <span key={i}>{line}</span>
            ))}
            {previewStatus === 'creating' && (
              <div className="animate-pulse mt-1 text-zinc-400">
                Preparing project files...
              </div>
            )}
            {previewStatus === 'installing' && (
              <div className="animate-pulse mt-1 text-yellow-400">
                Installing dependencies...
              </div>
            )}
            {previewStatus === 'starting' && (
              <div className="animate-pulse mt-1 text-blue-400">
                Starting dev server...
              </div>
            )}
            {previewStatus === 'error' && (
              <div className="mt-1 text-red-400">
                Error occurred. Check logs above.
                <Button
                  variant="link"
                  size="sm"
                  className="text-red-400 underline ml-2 h-auto p-0"
                  onClick={handleRetry}
                >
                  Retry
                </Button>
              </div>
            )}
          </div>
        )}

        {/* G8: Visual Edit panel overlay */}
        {visualEditMode && selectedElement && (
          <VisualEditPanel
            element={selectedElement}
            onApply={(instruction) => {
              // Send as chat message for iterate generation
              const chatInput = document.querySelector<HTMLTextAreaElement>('textarea[placeholder]');
              if (chatInput) {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                nativeInputValueSetter?.call(chatInput, instruction);
                chatInput.dispatchEvent(new Event('input', { bubbles: true }));
              }
              setSelectedElement(null);
              setVisualEditMode(false);
            }}
            onClose={() => setSelectedElement(null)}
          />
        )}

        {/* Visual Edit mode indicator */}
        {visualEditMode && previewStatus === 'ready' && !selectedElement && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#E04E2A] text-white text-xs shadow-lg">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            点击预览中的元素进行编辑
          </div>
        )}

        {/* Collapsible terminal panel (after preview is ready) */}
        {showTerminal && previewStatus === 'ready' && (
          <div
            ref={terminalRef}
            className="h-40 bg-zinc-950 text-green-400 font-mono text-xs p-2 overflow-auto border-t border-zinc-700"
          >
            {previewLogs.map((line, i) => (
              <span key={i}>{line}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * G8 Stage 2: Enhanced Visual Edit panel with property controls
 */
type EditTab = 'text' | 'style' | 'custom';

function VisualEditPanel({
  element,
  onApply,
  onClose,
}: {
  element: { tagName: string; text: string; className: string; path: string; styles?: Record<string, string> };
  onApply: (instruction: string) => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<EditTab>(element.text ? 'text' : 'style');
  const [newText, setNewText] = useState(element.text);
  const [instruction, setInstruction] = useState('');

  // Style properties
  const [textColor, setTextColor] = useState(element.styles?.color || '');
  const [bgColor, setBgColor] = useState(element.styles?.backgroundColor || '');
  const [fontSize, setFontSize] = useState(element.styles?.fontSize || '');
  const [padding, setPadding] = useState(element.styles?.padding || '');
  const [borderRadius, setBorderRadius] = useState(element.styles?.borderRadius || '');

  const buildPrompt = (): string => {
    const parts: string[] = [];

    if (activeTab === 'text' && newText !== element.text && newText.trim()) {
      parts.push(`将文本 "${element.text.slice(0, 50)}" 修改为 "${newText}"`);
    }

    if (activeTab === 'style') {
      const styleChanges: string[] = [];
      if (textColor && textColor !== element.styles?.color) styleChanges.push(`文字颜色改为 ${textColor}`);
      if (bgColor && bgColor !== element.styles?.backgroundColor) styleChanges.push(`背景色改为 ${bgColor}`);
      if (fontSize && fontSize !== element.styles?.fontSize) styleChanges.push(`字体大小改为 ${fontSize}`);
      if (padding && padding !== element.styles?.padding) styleChanges.push(`内边距改为 ${padding}`);
      if (borderRadius && borderRadius !== element.styles?.borderRadius) styleChanges.push(`圆角改为 ${borderRadius}`);
      if (styleChanges.length > 0) parts.push(styleChanges.join('，'));
    }

    if (instruction.trim()) parts.push(instruction.trim());

    if (parts.length === 0) return '';
    return `${parts.join('。')}。目标元素位于 ${element.path}`;
  };

  const handleApply = () => {
    const prompt = buildPrompt();
    if (!prompt) return;
    onApply(prompt);
  };

  const tabs: { key: EditTab; label: string; icon: React.ReactNode }[] = [
    ...(element.text ? [{ key: 'text' as EditTab, label: '文本', icon: <Type className="h-3 w-3" /> }] : []),
    { key: 'style', label: '样式', icon: <Palette className="h-3 w-3" /> },
    { key: 'custom', label: '自定义', icon: <Send className="h-3 w-3" /> },
  ];

  return (
    <div className="absolute bottom-4 left-4 right-4 bg-background border rounded-lg shadow-xl z-50 max-h-[320px] overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold">Visual Edit</h4>
          <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded truncate max-w-[200px]">
            {element.path.split(' > ').pop()}
          </span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b px-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4 space-y-3">
        {activeTab === 'text' && element.text && (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">文本内容</label>
            <input
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        )}

        {activeTab === 'style' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <Palette className="h-3 w-3" /> 文字颜色
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={rgbToHex(textColor)}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="w-7 h-7 rounded border cursor-pointer"
                />
                <input
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  placeholder="#000000"
                  className="flex-1 border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <Square className="h-3 w-3" /> 背景色
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={rgbToHex(bgColor)}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-7 h-7 rounded border cursor-pointer"
                />
                <input
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  placeholder="transparent"
                  className="flex-1 border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <Type className="h-3 w-3" /> 字体大小
              </label>
              <input
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value)}
                placeholder="16px"
                className="w-full border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <Maximize2 className="h-3 w-3" /> 内边距
              </label>
              <input
                value={padding}
                onChange={(e) => setPadding(e.target.value)}
                placeholder="8px"
                className="w-full border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-xs text-muted-foreground">圆角</label>
              <input
                value={borderRadius}
                onChange={(e) => setBorderRadius(e.target.value)}
                placeholder="4px"
                className="w-full border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        )}

        {activeTab === 'custom' && (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">自定义修改指令</label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleApply(); } }}
              placeholder="描述你想要的修改，如：改为蓝色渐变背景、添加阴影效果、居中对齐..."
              rows={3}
              className="w-full border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>
        )}

        <Button
          size="sm"
          className="gap-1.5 w-full"
          onClick={handleApply}
          disabled={!buildPrompt()}
        >
          <Send className="h-3 w-3" />
          应用修改
        </Button>
      </div>
    </div>
  );
}

/** Convert rgb(r, g, b) or rgba() string to hex for color input */
function rgbToHex(rgb: string): string {
  if (!rgb || rgb === 'transparent' || rgb.startsWith('#')) return rgb || '#000000';
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return '#000000';
  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

function StatusBadge({ status }: { status: PreviewStatus }) {
  const map: Record<PreviewStatus, { label: string; color: string }> = {
    idle: { label: 'Idle', color: 'text-gray-400' },
    creating: { label: 'Creating', color: 'text-orange-400' },
    installing: { label: 'Installing', color: 'text-yellow-400' },
    starting: { label: 'Starting', color: 'text-blue-400' },
    ready: { label: 'Running', color: 'text-green-400' },
    error: { label: 'Error', color: 'text-red-400' },
  };
  const { label, color } = map[status];
  return <span className={`text-xs font-medium ${color}`}>● {label}</span>;
}
