/**
 * 客户端预览启动模块 — 独立于 React 生命周期
 *
 * 核心设计：
 * 1. 幂等：同一时间只允许一个 boot 进行（module-level promise lock）
 * 2. 自给自足：直接调用 preview/start API + 读取 NDJSON 流 + 更新 zustand store
 * 3. 可被任何地方调用：PreviewFrame、useAutoFix、编辑器页面等
 */

import { useEditorStore } from '@/store/editorStore';

export type BootResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/** Module-level lock: 同一时间只允许一个 boot */
let activeBootPromise: Promise<BootResult> | null = null;

/**
 * 启动预览 dev server（幂等）
 * - 如果已经在 booting，返回相同的 promise
 * - 如果已经 ready，直接返回 URL
 * - 否则调用 preview/start API 并读取 NDJSON 流
 */
export function bootPreview(projectId: string): Promise<BootResult> {
  const state = useEditorStore.getState();

  // 已经就绪 → 直接返回
  if (state.previewStatus === 'ready' && state.previewUrl) {
    return Promise.resolve({ ok: true, url: state.previewUrl });
  }

  // 正在启动中 → 复用现有 promise
  if (activeBootPromise) {
    return activeBootPromise;
  }

  activeBootPromise = doBootPreview(projectId).finally(() => {
    activeBootPromise = null;
  });

  return activeBootPromise;
}

/**
 * 强制重启预览（停止旧进程 → 重写文件 → 重启 Vite）
 * 用于 auto-fix 修复编译错误后的完整重启。
 */
export async function rebootPreview(projectId: string): Promise<BootResult> {
  activeBootPromise = null; // 清除旧的 lock

  // ★ 先停止旧的 preview 进程，确保干净重启
  try {
    await fetch(`/api/projects/${projectId}/preview/stop`, { method: 'POST' });
  } catch {
    // Non-fatal — 进程可能已经退出
  }

  const store = useEditorStore.getState();
  store.setPreviewStatus('idle');
  store.setPreviewUrl(null);
  store.clearPreviewLogs();

  return bootPreview(projectId);
}

/**
 * 检查是否正在启动
 */
export function isBooting(): boolean {
  return activeBootPromise !== null;
}

// ─────────────────────────────────────────────

async function doBootPreview(projectId: string): Promise<BootResult> {
  const store = useEditorStore.getState();
  const files = store.files;

  if (files.length === 0) {
    return { ok: false, error: 'No files to preview' };
  }

  store.clearPreviewLogs();
  store.setPreviewStatus('creating');
  store.appendPreviewLog('Creating local preview environment...\n');

  const parsedFiles = files.map((f) => ({
    path: f.path,
    content: f.content,
  }));

  try {
    const response = await fetch(`/api/projects/${projectId}/preview/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: parsedFiles }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || 'Failed to start preview');
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: BootResult = { ok: false, error: 'Stream ended without ready' };

    // 用于在 'ready' 后立即 resolve，同时继续后台读取日志
    let resolveReady: ((r: BootResult) => void) | null = null;
    const readyPromise = new Promise<BootResult>((resolve) => {
      resolveReady = resolve;
    });

    // 后台持续读取 NDJSON 流（ready 后继续读编译错误日志）
    const readStream = async () => {
      if (!reader) {
        resolveReady?.({ ok: false, error: 'No response body' });
        return;
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop()!;

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              const s = useEditorStore.getState();
              const message = (data.message as string) || '';

              switch (data.status) {
                case 'creating':
                  s.setPreviewStatus('creating');
                  s.appendPreviewLog(message + '\n');
                  break;
                case 'installing':
                  s.setPreviewStatus('installing');
                  s.appendPreviewLog(message + '\n');
                  break;
                case 'starting':
                  s.setPreviewStatus('starting');
                  s.appendPreviewLog(message + '\n');
                  break;
                case 'log':
                  s.appendPreviewLog(message + '\n');
                  break;
                case 'ready': {
                  const url = data.previewUrl as string;
                  s.setPreviewStatus('ready');
                  s.setPreviewUrl(url);
                  s.appendPreviewLog(`\nDev server ready at: ${url}\n`);
                  result = { ok: true, url };
                  resolveReady?.(result);
                  resolveReady = null;
                  // 继续读取后续的编译日志（不 return）
                  break;
                }
                case 'error':
                  s.setPreviewStatus('error');
                  s.appendPreviewLog(`\nError: ${message}\n`);
                  result = { ok: false, error: message };
                  resolveReady?.(result);
                  resolveReady = null;
                  break;
                case 'stopped':
                  s.setPreviewStatus('idle');
                  resolveReady?.({ ok: false, error: 'Server stopped' });
                  resolveReady = null;
                  break;
              }
            } catch {
              // skip malformed JSON
            }
          }
        }

        // 处理 buffer 中剩余的内容
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer);
            const s = useEditorStore.getState();
            const message = (data.message as string) || '';
            if (data.status === 'ready') {
              const url = data.previewUrl as string;
              s.setPreviewStatus('ready');
              s.setPreviewUrl(url);
              s.appendPreviewLog(`\nDev server ready at: ${url}\n`);
              result = { ok: true, url };
            } else if (data.status === 'error') {
              s.setPreviewStatus('error');
              s.appendPreviewLog(`\nError: ${message}\n`);
              result = { ok: false, error: message };
            }
          } catch {
            // skip
          }
        }
      } catch {
        // Stream read error — non-fatal if we already got 'ready'
      }

      // 如果 stream 结束但从未收到 ready，resolve 错误
      resolveReady?.(result);
    };

    // 启动后台读取（不 await，让它在后台持续运行）
    readStream();

    // 等待 ready 或 error
    const bootResult = await readyPromise;

    // ★ Health check: verify the server is actually responding (via backend proxy)
    if (bootResult.ok) {
      let healthy = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const res = await fetch(`/api/projects/${projectId}/preview/health`);
          const data = await res.json();
          if (data.healthy) {
            healthy = true;
            break;
          }
        } catch { /* 重试 */ }
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (!healthy) {
        const s = useEditorStore.getState();
        s.setPreviewStatus('error');
        s.appendPreviewLog('\nDev server not responding to health check.\n');
        return { ok: false, error: 'Server not responding' };
      }
    }

    return bootResult;
  } catch (err) {
    const s = useEditorStore.getState();
    s.setPreviewStatus('error');
    s.appendPreviewLog(`\nFailed to start preview: ${(err as Error).message}\n`);
    return { ok: false, error: (err as Error).message };
  }
}
