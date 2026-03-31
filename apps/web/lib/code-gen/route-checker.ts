export interface RouteInconsistency {
  type: 'missing_route' | 'missing_page' | 'path_mismatch';
  page: string;
  message: string;
}

/**
 * Check route consistency between pages/ files and App.tsx route registrations.
 * Detects pages that exist but are not registered in the router.
 */
export function checkRouteConsistency(
  files: Array<{ path: string; content: string }>
): RouteInconsistency[] {
  const issues: RouteInconsistency[] = [];

  // 1. Find all page components in pages/ directory
  const pageFiles = files.filter(
    (f) => f.path.includes('pages/') && f.path.match(/\.(tsx|jsx)$/)
  );

  // 2. Find App.tsx or router config file
  const appFile = files.find(
    (f) => f.path.endsWith('App.tsx') || f.path.endsWith('App.jsx')
  );
  if (!appFile || pageFiles.length === 0) return issues;

  // 3. Check each page is referenced in App.tsx
  for (const page of pageFiles) {
    const pageName = page.path
      .split('/')
      .pop()
      ?.replace(/\.(tsx|jsx)$/, '') || '';

    // Skip index files and layout files
    if (['index', 'layout', 'Layout'].includes(pageName)) continue;

    // Check if the component name is imported/referenced in App.tsx
    const isImported = appFile.content.includes(pageName);
    if (!isImported) {
      issues.push({
        type: 'missing_route',
        page: page.path,
        message: `${pageName} 已生成但未在 App.tsx 中注册路由`,
      });
    }
  }

  return issues;
}
