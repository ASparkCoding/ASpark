// Runtime error reporter — injected into index.html
// Captures uncaught errors and unhandled promise rejections,
// then sends them to the parent window via postMessage

(function() {
  const MAX_ERRORS = 10;
  let errorCount = 0;

  function reportError(type: string, message: string, source?: string, line?: number, col?: number) {
    if (errorCount >= MAX_ERRORS) return;
    errorCount++;

    try {
      window.parent.postMessage({
        type: 'preview-runtime-error',
        payload: {
          errorType: type,
          message: message,
          source: source || '',
          line: line || 0,
          col: col || 0,
          timestamp: Date.now(),
        }
      }, '*');
    } catch {
      // Silently ignore postMessage failures
    }
  }

  window.onerror = function(message, source, lineno, colno) {
    reportError('uncaught', String(message), source, lineno, colno);
  };

  window.addEventListener('unhandledrejection', function(event) {
    const message = event.reason instanceof Error
      ? event.reason.message
      : String(event.reason);
    reportError('unhandled-rejection', message);
  });

  // Report render failures (blank screen detection)
  window.addEventListener('load', function() {
    setTimeout(function() {
      const root = document.getElementById('root');
      if (root && root.children.length === 0) {
        reportError('blank-screen', 'Root element has no children after load');
      }
    }, 3000);
  });
})();
