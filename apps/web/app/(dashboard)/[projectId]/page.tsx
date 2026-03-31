'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { ChatPanel } from '@/components/editor/ChatPanel';
import { FileTree } from '@/components/editor/FileTree';
import { CodeViewer } from '@/components/editor/CodeViewer';
import { PreviewFrame } from '@/components/editor/PreviewFrame';
import { WorkspaceHeader } from '@/components/editor/WorkspaceHeader';
import { DashboardPanel } from '@/components/editor/DashboardPanel';
import { useEditorStore } from '@/store/editorStore';
import { useProjectStore } from '@/store/projectStore';
import { bootPreview } from '@/lib/preview/boot-client';
import { showToast, notifyBuildComplete, requestNotificationPermission } from '@/lib/notifications';

/**
 * Poll the background build status API until completion.
 * ★ While running: also refresh messages so user sees real-time generation progress.
 * ★ On completion: reload both files AND messages for a seamless return experience.
 */
function pollBuildStatus(projectId: string) {
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/build/status`);
      if (!res.ok) return;
      const data = await res.json();

      if (data.status === 'running') {
        // ★ While build is running, also refresh messages to show streaming partial content
        const msgRes = await fetch(`/api/projects/${projectId}/messages`).catch(() => null);
        if (msgRes?.ok) {
          const msgs = await msgRes.json();
          if (msgs?.length > 0 && !useEditorStore.getState().isGenerating) {
            useEditorStore.getState().setChatMessages(msgs);
          }
        }
      } else if (data.status === 'completed') {
        clearInterval(interval);
        useEditorStore.getState().setBuildPhase('completed');
        // ★ 完成提示 + 浏览器通知
        const projectName = useProjectStore.getState().currentProject?.name || 'Project';
        showToast(`${projectName} generated successfully — ${data.filesGenerated} files`, { type: 'success', duration: 5000 });
        notifyBuildComplete(projectName, data.filesGenerated);
        // ★ Reload both files AND messages on completion
        const [freshFiles, freshMessages] = await Promise.all([
          fetch(`/api/projects/${projectId}/files`)
            .then((r) => r.ok ? r.json() : null)
            .catch(() => null),
          fetch(`/api/projects/${projectId}/messages`)
            .then((r) => r.ok ? r.json() : null)
            .catch(() => null),
        ]);
        if (freshFiles && !useEditorStore.getState().isGenerating) {
          useEditorStore.getState().setFiles(freshFiles);
        }
        if (freshMessages?.length > 0) {
          useEditorStore.getState().setChatMessages(freshMessages);
        }
      } else if (data.status === 'error') {
        clearInterval(interval);
        useEditorStore.getState().setBuildPhase('idle');
        // ★ Still reload messages to show whatever was saved before the error
        const msgRes = await fetch(`/api/projects/${projectId}/messages`).catch(() => null);
        if (msgRes?.ok) {
          const msgs = await msgRes.json();
          if (msgs?.length > 0) useEditorStore.getState().setChatMessages(msgs);
        }
      } else if (data.status === 'idle') {
        // Build manager lost track (server restart) — stop polling
        clearInterval(interval);
        useEditorStore.getState().setBuildPhase('idle');
      }
    } catch {
      // Polling error — keep retrying
    }
  }, 3000);

  // Safety: stop polling after 10 minutes
  setTimeout(() => clearInterval(interval), 10 * 60 * 1000);
}

export default function EditorPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { setCurrentProject } = useProjectStore();
  const { files, setFiles, activeTab, isGenerating, buildPhase } = useEditorStore();
  const { resetEditor } = useEditorStore();

  // Prevent React StrictMode double-mount from calling resetEditor + preview/stop twice
  const initRef = useRef<string | null>(null);

  useEffect(() => {
    if (initRef.current === projectId) return;
    initRef.current = projectId;

    resetEditor();

    async function init() {
      // Await stop so the old server is fully killed before we load files & boot
      await fetch(`/api/projects/${projectId}/preview/stop`, { method: 'POST' }).catch(() => {});

      // ★ 先检查 build 状态（在加载文件之前），防止预览抢跑
      // 如果后台还在生成，先设置 buildPhase='background'，
      // 这样后面 setFiles 触发 preview boot effect 时会被 buildPhase 守卫拦住
      let buildIsRunning = false;
      try {
        const buildRes = await fetch(`/api/projects/${projectId}/build/status`);
        if (buildRes.ok) {
          const buildData = await buildRes.json();
          if (buildData.status === 'running') {
            buildIsRunning = true;
            useEditorStore.getState().setBuildPhase('background');
            pollBuildStatus(projectId);
            // ★ "欢迎回来" 提示
            const elapsed = Math.round((Date.now() - buildData.startedAt) / 1000);
            showToast(`Background build in progress (running for ${elapsed}s), please wait...`, { type: 'info', duration: 5000 });
            // ★ 请求浏览器通知权限（首次会弹授权）
            requestNotificationPermission();
          }
        }
      } catch {
        // Non-fatal
      }

      // Load project info, files, and chat messages in parallel
      const [, filesData, messagesData] = await Promise.all([
        fetch(`/api/projects/${projectId}`)
          .then(async (res) => {
            if (res.ok) {
              const project = await res.json();
              setCurrentProject(project);
              // ★ 恢复 UI 偏好（activeTab、activeFilePath）
              const settings = project.app_settings;
              if (settings) {
                if (settings.editorActiveTab) {
                  useEditorStore.getState().setActiveTab(settings.editorActiveTab);
                }
                if (settings.editorActiveFile) {
                  useEditorStore.getState().setActiveFile(settings.editorActiveFile);
                }
              }
            }
          })
          .catch((e) => console.error('Failed to load project:', e)),
        fetch(`/api/projects/${projectId}/files`)
          .then(async (res) => {
            if (res.ok) return res.json();
            return null;
          })
          .catch((e) => {
            console.error('Failed to load files:', e);
            return null;
          }),
        fetch(`/api/projects/${projectId}/messages`)
          .then(async (res) => {
            if (res.ok) return res.json();
            return null;
          })
          .catch((e) => {
            console.error('Failed to load messages:', e);
            return null;
          }),
      ]);

      if (filesData) {
        const { isGenerating: generating } = useEditorStore.getState();
        if (!generating) {
          setFiles(filesData);
        }
      }

      // Restore chat messages from DB
      if (messagesData && Array.isArray(messagesData) && messagesData.length > 0) {
        useEditorStore.getState().setChatMessages(messagesData);
      }

      // ★ Check for active Plan session (e.g., user navigated away during plan questioning/generation)
      try {
        const planRes = await fetch(`/api/projects/${projectId}/plan/session`);
        if (planRes.ok) {
          const planData = await planRes.json();
          if (planData.active && planData.session) {
            const s = planData.session;
            const store = useEditorStore.getState();

            // Restore plan mode state
            store.enterPlanMode(s.originalPrompt);
            store.setPlanSessionId(s.id);

            // ★ 如果项目已有生成文件且 plan 已 approved，说明代码生成已完成，不恢复 Plan 模式
            const hasLlmFiles = filesData && filesData.some(
              (f: { path: string }) => f.path.startsWith('src/pages/') || f.path.startsWith('src/entities/')
            );
            if (hasLlmFiles && (s.status === 'approved' || s.status === 'building')) {
              console.log('[Plan] Plan already executed (project has generated files), skipping restore');
            } else {
              // Restore questions with answers
              if (Array.isArray(s.questions) && s.questions.length > 0) {
                for (const q of s.questions) {
                  store.addPlanQuestion({
                    id: q.id,
                    question: q.question,
                    options: q.options || [],
                    answer: q.answer || null,
                    skipped: q.skipped || false,
                  });
                }
                // Set currentQuestionIndex to the first unanswered question
                const firstUnanswered = s.questions.findIndex(
                  (q: { answer: string | null; skipped: boolean }) => !q.answer && !q.skipped
                );
                if (firstUnanswered === -1) {
                  useEditorStore.setState({ currentQuestionIndex: s.questions.length });
                } else {
                  useEditorStore.setState({ currentQuestionIndex: firstUnanswered });
                }
              }

              // Restore plan content if available
              if (s.planContent) {
                store.setPlanContent(s.planContent);
              }
              if (s.planStructured) {
                store.setPlanStructured(s.planStructured);
              }

              // ★ 根据 DB 状态精确映射 Zustand planStatus
              switch (s.status) {
                case 'questioning':
                  store.setPlanStatus('questioning');
                  break;
                case 'plan_generated':
                  store.setPlanStatus('plan_ready');
                  break;
                case 'approved':
                case 'building':
                  store.setPlanStatus('approved');
                  break;
              }
            }

            // Add user message to chat if not already present
            const msgs = useEditorStore.getState().chatMessages;
            if (!msgs.some(m => m.role === 'user' && m.content === s.originalPrompt)) {
              store.addChatMessage({
                id: crypto.randomUUID(),
                role: 'user',
                content: s.originalPrompt,
                timestamp: Date.now(),
              });
            }

            console.log(`[Plan] Restored plan session: ${s.id}, status=${s.status}, questions=${s.questions?.length || 0}`);
          }
        }
      } catch {
        // Non-fatal
      }

      // ★ 如果 build 不在运行，检查是否最近刚完成（补充加载最新文件和消息）
      if (!buildIsRunning) {
        try {
          const buildRes = await fetch(`/api/projects/${projectId}/build/status`);
          if (buildRes.ok) {
            const buildData = await buildRes.json();
            if (
              buildData.status === 'completed' &&
              buildData.completedAt &&
              Date.now() - buildData.completedAt < 60000
            ) {
              // ★ 最近刚完成 — 提示用户
              showToast(`Previous build completed in background (${buildData.filesGenerated} files)`, { type: 'success' });
              // Build completed recently — reload files AND messages to pick up any changes
              const [freshFiles, freshMessages] = await Promise.all([
                fetch(`/api/projects/${projectId}/files`)
                  .then((r) => r.ok ? r.json() : null)
                  .catch(() => null),
                fetch(`/api/projects/${projectId}/messages`)
                  .then((r) => r.ok ? r.json() : null)
                  .catch(() => null),
              ]);
              if (freshFiles && !useEditorStore.getState().isGenerating) {
                useEditorStore.getState().setFiles(freshFiles);
              }
              if (freshMessages?.length > 0) {
                useEditorStore.getState().setChatMessages(freshMessages);
              }
            }
          }
        } catch {
          // Non-fatal
        }
      }
    }

    init();
  }, [projectId, setCurrentProject, setFiles, resetEditor]);

  /**
   * ★ Preview boot trigger — lives in EditorPage (always mounted)
   * instead of PreviewFrame (only mounted on preview tab).
   *
   * ★ 关键守卫：buildPhase 为 'background' 或 'building' 时不启动预览。
   * 当后台生成完成、pollBuildStatus 检测到 completed 并 reload files 后，
   * buildPhase 变为 'completed'，此 effect 重新触发，preview 正常启动。
   */
  useEffect(() => {
    if (files.length > 0 && !isGenerating && buildPhase !== 'background' && buildPhase !== 'building') {
      const { previewStatus: status } = useEditorStore.getState();
      if (status === 'idle') {
        bootPreview(projectId);
      }
    }
  }, [files.length, isGenerating, buildPhase, projectId]);

  /**
   * ★ 全局运行时错误捕获 — 即使 PreviewFrame 不是当前 Tab 也能捕获
   * 当 iframe 加载后发生运行时错误时，通过 postMessage 发送到父窗口。
   * 此监听器始终存在于 EditorPage（always mounted），确保 auto-fix 能检测运行时错误。
   */
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const store = useEditorStore.getState();

      // Legacy format: { type: 'preview-error', message: string }
      if (event.data?.type === 'preview-error' && typeof event.data.message === 'string') {
        const msg = event.data.message;
        store.appendPreviewLog(`[runtime] ${msg}\n`);
        store.addRuntimeErrors([{
          type: 'runtime',
          message: msg,
          file: 'unknown',
        }]);
      }

      // ★ Phase 2: New structured format from error-reporter.ts
      // { type: 'preview-runtime-error', payload: { errorType, message, source, line, col } }
      if (event.data?.type === 'preview-runtime-error' && event.data.payload) {
        const { errorType, message, source, line } = event.data.payload;
        const prefix = errorType === 'blank-screen' ? '[blank-screen]' : '[runtime]';
        store.appendPreviewLog(`${prefix} ${message}${source ? ` at ${source}:${line}` : ''}\n`);
        store.addRuntimeErrors([{
          type: errorType || 'runtime',
          message,
          file: source || 'unknown',
          line: line || undefined,
        }]);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  /**
   * ★ 页面离开时保存非生成类消息 + UI 偏好
   */
  const saveOnLeave = useCallback(() => {
    // 1. 保存消息（安全网）
    const msgs = useEditorStore.getState().chatMessages;
    if (msgs.length > 0) {
      const payload = JSON.stringify({ messages: msgs });
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(`/api/projects/${projectId}/messages`, blob);
    }

    // 2. 保存 UI 偏好（activeTab、activeFilePath）到 app_settings
    const { activeTab: tab, activeFilePath: filePath } = useEditorStore.getState();
    const uiPrefs = JSON.stringify({ editorActiveTab: tab, editorActiveFile: filePath });
    const prefsBlob = new Blob([uiPrefs], { type: 'application/json' });
    navigator.sendBeacon(`/api/projects/${projectId}/settings`, prefsBlob);
  }, [projectId]);

  useEffect(() => {
    window.addEventListener('beforeunload', saveOnLeave);
    return () => {
      window.removeEventListener('beforeunload', saveOnLeave);
      saveOnLeave();
    };
  }, [saveOnLeave]);

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-background">
      {/* Workspace header with tabs + publish button */}
      <WorkspaceHeader projectId={projectId} />

      {/* Two-column layout: ChatPanel left | Tab content right */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left: Chat panel */}
        <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
          <ChatPanel projectId={projectId} />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right: Tab content area */}
        <ResizablePanel defaultSize={70} minSize={40}>
          <TabContent projectId={projectId} activeTab={activeTab} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function TabContent({
  projectId,
  activeTab,
}: {
  projectId: string;
  activeTab: string;
}) {
  switch (activeTab) {
    case 'preview':
      return <PreviewFrame />;
    case 'dashboard':
      return <DashboardPanel projectId={projectId} />;
    case 'code':
      return (
        <ResizablePanelGroup direction="horizontal">
          {/* File tree */}
          <ResizablePanel defaultSize={30} minSize={15} maxSize={40}>
            <div className="h-full border-r overflow-y-auto">
              <div className="px-3 py-2 border-b">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase">Files</h4>
              </div>
              <FileTree />
            </div>
          </ResizablePanel>

          <ResizableHandle />

          {/* Code viewer */}
          <ResizablePanel defaultSize={70}>
            <CodeViewer />
          </ResizablePanel>
        </ResizablePanelGroup>
      );
    default:
      return <PreviewFrame />;
  }
}
