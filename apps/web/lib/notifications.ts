/**
 * 轻量级通知工具
 * 1. showToast — 页面内浮动提示（无第三方依赖）
 * 2. notifyBuildComplete — 浏览器原生推送通知（标签页不可见时触发）
 * 3. requestNotificationPermission — 请求通知权限
 */

// ═══ 页面内 Toast ═══

let toastContainer: HTMLDivElement | null = null;

function getToastContainer(): HTMLDivElement {
  if (toastContainer && document.body.contains(toastContainer)) return toastContainer;
  toastContainer = document.createElement('div');
  toastContainer.style.cssText =
    'position:fixed;top:16px;right:16px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
  document.body.appendChild(toastContainer);
  return toastContainer;
}

export function showToast(
  message: string,
  options: { type?: 'success' | 'info' | 'warning'; duration?: number } = {}
) {
  const { type = 'info', duration = 4000 } = options;
  const container = getToastContainer();

  const colors = {
    success: 'background:rgba(16,185,129,0.95);color:#fff;',
    info: 'background:rgba(59,130,246,0.95);color:#fff;',
    warning: 'background:rgba(245,158,11,0.95);color:#fff;',
  };

  const toast = document.createElement('div');
  toast.style.cssText = `
    ${colors[type]}
    padding:12px 20px;border-radius:8px;font-size:14px;line-height:1.4;
    box-shadow:0 4px 12px rgba(0,0,0,0.15);pointer-events:auto;
    transform:translateX(120%);transition:transform 0.3s ease;
    max-width:360px;backdrop-filter:blur(8px);
  `;
  toast.textContent = message;
  container.appendChild(toast);

  // Slide in
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(0)';
  });

  // Slide out and remove
  setTimeout(() => {
    toast.style.transform = 'translateX(120%)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ═══ 浏览器推送通知 ═══

export function requestNotificationPermission(): void {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

export function notifyBuildComplete(projectName: string, filesGenerated: number): void {
  // 只在标签页不可见时发送浏览器通知
  if (typeof window === 'undefined') return;
  if (!document.hidden) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  new Notification('生成完成 ✓', {
    body: `${projectName} 已生成完毕，共 ${filesGenerated} 个文件`,
    icon: '/aspark-logo.svg',
    tag: 'build-complete', // 防止重复通知
  });
}
