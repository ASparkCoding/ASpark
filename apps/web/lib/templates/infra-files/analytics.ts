/**
 * Analytics 追踪服务
 * 自动追踪页面访问、错误、性能指标
 * 数据发送到平台 Analytics API
 */

const SESSION_ID = `s-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

function getPlatformApiUrl(): string {
  const configuredUrl = import.meta.env.VITE_PLATFORM_API_URL;
  if (configuredUrl) return configuredUrl;
  if (typeof window !== 'undefined') {
    const port = parseInt(window.location.port);
    if (port >= 3100) return `${window.location.protocol}//localhost:3000`;
    return window.location.origin;
  }
  return '';
}

function getProjectId(): string {
  return import.meta.env.VITE_PROJECT_ID || '';
}

function sendEvent(eventType: string, pagePath?: string, metadata?: Record<string, any>) {
  const url = getPlatformApiUrl();
  const projectId = getProjectId();
  if (!url || !projectId) return;

  fetch(`${url}/api/projects/${projectId}/analytics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventType,
      pagePath: pagePath || window.location.pathname,
      metadata,
      sessionId: SESSION_ID,
    }),
  }).catch(() => {}); // Fire and forget
}

export const analytics = {
  /** Track a page view */
  trackPageView(path?: string) {
    sendEvent('page_view', path);
  },

  /** Track a custom event */
  trackEvent(name: string, data?: Record<string, any>) {
    sendEvent('action', undefined, { name, ...data });
  },

  /** Track an error */
  trackError(error: string, context?: Record<string, any>) {
    sendEvent('error', undefined, { error, ...context });
  },

  /** Track performance metrics (Core Web Vitals) */
  trackPerformance(metrics: { lcp?: number; fid?: number; cls?: number }) {
    sendEvent('performance', undefined, metrics);
  },
};

// ─── Auto-tracking: page views on route change ───
if (typeof window !== 'undefined') {
  // Initial page view
  setTimeout(() => analytics.trackPageView(), 1000);

  // SPA route changes
  const origPushState = history.pushState;
  history.pushState = function (...args) {
    origPushState.apply(this, args);
    analytics.trackPageView();
  };

  window.addEventListener('popstate', () => analytics.trackPageView());

  // Global error tracking
  window.addEventListener('error', (e) => {
    analytics.trackError(e.message, {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    analytics.trackError(`Unhandled rejection: ${e.reason}`, {});
  });

  // Performance metrics (after page load)
  window.addEventListener('load', () => {
    setTimeout(() => {
      try {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (nav) {
          analytics.trackPerformance({
            lcp: Math.round(nav.loadEventEnd - nav.startTime),
          });
        }
      } catch { /* not supported */ }
    }, 3000);
  });
}
