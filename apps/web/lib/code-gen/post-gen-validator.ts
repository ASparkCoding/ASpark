/**
 * 生成后验证管线：在文件写入 store 之后、启动预览之前执行
 * 检测结构性错误，提前拦截问题，减少 auto-fix 负担
 */

export interface ValidationIssue {
  severity: 'error' | 'warning';
  category: 'missing_file' | 'import' | 'route' | 'schema' | 'component';
  message: string;
  file?: string;
  autoFixable: boolean;
  fixSuggestion?: string;
}

/**
 * 生成后验证管线：5 项检查
 * V1: 必须文件检查
 * V2: Import 一致性
 * V3: Route 一致性
 * V4: Entity-Schema 一致性
 * V5: 组件依赖检查
 */
export function validateGeneratedProject(
  newFiles: Array<{ path: string; content: string }>,
  existingFiles: Array<{ path: string; content: string }>
): ValidationIssue[] {
  const allFiles = mergeFileLists(existingFiles, newFiles);
  const issues: ValidationIssue[] = [];

  issues.push(...checkRequiredFiles(allFiles));
  issues.push(...checkImportConsistency(allFiles));
  issues.push(...checkRouteConsistency(allFiles));
  issues.push(...checkEntitySchemaConsistency(allFiles));
  issues.push(...checkComponentDependencies(allFiles));

  return issues;
}

// ─── V1: 必须文件检查 ───

function checkRequiredFiles(files: Array<{ path: string; content: string }>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  // main.tsx and supabase.ts are now pre-injected, only App.tsx is required from LLM
  const requiredFiles = ['src/App.tsx'];

  for (const required of requiredFiles) {
    const exists = files.some(f => f.path === required);
    if (!exists) {
      issues.push({
        severity: 'error',
        category: 'missing_file',
        message: `Required file missing: ${required}`,
        autoFixable: false,
        fixSuggestion: `请生成 ${required} 文件`,
      });
    }
  }

  const appFile = files.find(f => f.path === 'src/App.tsx');

  if (appFile && !appFile.content.includes('BrowserRouter') && !appFile.content.includes('Router')) {
    issues.push({
      severity: 'error',
      category: 'missing_file',
      message: 'App.tsx does not contain Router setup',
      file: 'src/App.tsx',
      autoFixable: false,
      fixSuggestion: 'App.tsx must use BrowserRouter from react-router-dom',
    });
  }

  if (appFile && !appFile.content.includes('ErrorBoundary')) {
    issues.push({
      severity: 'warning',
      category: 'component',
      message: 'App.tsx does not wrap content in ErrorBoundary',
      file: 'src/App.tsx',
      autoFixable: true,
      fixSuggestion: 'Add ErrorBoundary wrapper in App.tsx',
    });
  }

  if (appFile && !appFile.content.includes('Toaster')) {
    issues.push({
      severity: 'warning',
      category: 'component',
      message: 'App.tsx does not include <Toaster /> from sonner',
      file: 'src/App.tsx',
      autoFixable: true,
      fixSuggestion: 'Add <Toaster /> from sonner in App.tsx',
    });
  }

  return issues;
}

// ─── V2: Import 一致性检查 ───

function checkImportConsistency(files: Array<{ path: string; content: string }>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const filePaths = new Set(files.map(f => f.path));

  for (const file of files) {
    if (!file.path.match(/\.(ts|tsx)$/)) continue;

    const importRegex = /from\s+['"](@\/|\.\.?\/)([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(file.content)) !== null) {
      const importPath = match[1] + match[2];
      let resolved: string;

      if (importPath.startsWith('@/')) {
        resolved = 'src/' + importPath.slice(2);
      } else {
        const dir = file.path.split('/').slice(0, -1).join('/');
        resolved = resolveRelativePath(dir, importPath.slice(importPath.startsWith('./') ? 2 : 0));
      }

      // 检查文件是否存在（尝试多种扩展名）
      const candidates = [
        resolved, resolved + '.ts', resolved + '.tsx',
        resolved + '/index.ts', resolved + '/index.tsx'
      ];

      const exists = candidates.some(c => filePaths.has(c));
      if (!exists) {
        // 排除 shadcn/ui 组件（模板预注入）和非本地 import
        if (resolved.includes('components/ui/') || (!importPath.startsWith('@/') && !importPath.startsWith('.'))) {
          continue;
        }

        issues.push({
          severity: 'warning',
          category: 'import',
          message: `Import "${importPath}" in ${file.path} may reference non-existent file`,
          file: file.path,
          autoFixable: false,
          fixSuggestion: `Check if ${resolved} exists or fix the import path`,
        });
      }
    }
  }

  return issues;
}

// ─── V3: Route 一致性检查 ───

function checkRouteConsistency(files: Array<{ path: string; content: string }>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const appFile = files.find(f => f.path === 'src/App.tsx');
  if (!appFile) return issues;

  const pageFiles = files.filter(f =>
    f.path.match(/src\/pages\/\w+\.tsx$/) &&
    f.content.includes('export')
  );

  for (const page of pageFiles) {
    const nameMatch = page.path.match(/src\/pages\/(\w+)\.tsx$/);
    if (!nameMatch) continue;
    const componentName = nameMatch[1];

    if (!appFile.content.includes(componentName)) {
      issues.push({
        severity: 'warning',
        category: 'route',
        message: `Page component ${componentName} (${page.path}) is not imported/routed in App.tsx`,
        file: 'src/App.tsx',
        autoFixable: false,
        fixSuggestion: `Add import and Route for ${componentName} in App.tsx`,
      });
    }
  }

  return issues;
}

// ─── V4: Entity-Schema 一致性 + createEntityService 使用检查 ───

function checkEntitySchemaConsistency(files: Array<{ path: string; content: string }>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const schemaFile = files.find(f => f.path === 'supabase-schema.sql');
  const entityFiles = files.filter(f => f.path.match(/src\/entities\/\w+\.ts$/));

  for (const entity of entityFiles) {
    // 检查是否使用 createEntityService SDK
    if (!entity.content.includes('createEntityService')) {
      // 检查是否手写了 Supabase 查询
      if (entity.content.includes('supabase.from(') || entity.content.includes('.select(')) {
        issues.push({
          severity: 'warning',
          category: 'schema',
          message: `Entity ${entity.path} uses raw Supabase queries instead of createEntityService SDK`,
          file: entity.path,
          autoFixable: false,
          fixSuggestion: 'Refactor to use createEntityService() from @/lib/data-service',
        });
      }
    }

    // 提取 table name（从 createEntityService 的 tableName 或 supabase.from）
    const tableMatch = entity.content.match(/tableName:\s*['"](\w+)['"]/) ||
                       entity.content.match(/from\(['"](\w+)['"]\)/);
    if (!tableMatch) continue;
    const tableName = tableMatch[1];

    // 检查 SQL schema 中是否有这个表
    if (schemaFile && !schemaFile.content.toLowerCase().includes(tableName)) {
      issues.push({
        severity: 'error',
        category: 'schema',
        message: `Entity references table "${tableName}" but it's not defined in supabase-schema.sql`,
        file: entity.path,
        autoFixable: false,
        fixSuggestion: `Add CREATE TABLE ${tableName} to supabase-schema.sql`,
      });
    }
  }

  return issues;
}

// ─── V5: 组件依赖检查 ───

function checkComponentDependencies(files: Array<{ path: string; content: string }>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 预注入的 shadcn/ui 组件列表
  // Phase 1: 25 pre-included shadcn/ui components
  const preIncludedUI = new Set([
    'button', 'input', 'label', 'card', 'badge', 'textarea',
    'separator', 'table', 'dialog', 'select', 'tabs',
    'dropdown-menu', 'avatar', 'switch', 'skeleton',
    'alert', 'alert-dialog', 'sheet', 'form', 'popover',
    'checkbox', 'scroll-area', 'tooltip', 'radio-group', 'progress',
  ]);

  const filePaths = new Set(files.map(f => f.path));

  for (const file of files) {
    if (!file.path.match(/\.(tsx|jsx)$/)) continue;

    const uiImportRegex = /from\s+['"]@\/components\/ui\/([^'"]+)['"]/g;
    let match;
    while ((match = uiImportRegex.exec(file.content)) !== null) {
      const componentName = match[1];
      if (!preIncludedUI.has(componentName)) {
        const componentPath = `src/components/ui/${componentName}.tsx`;
        if (!filePaths.has(componentPath)) {
          issues.push({
            severity: 'error',
            category: 'component',
            message: `UI component "${componentName}" is imported but not pre-included or generated`,
            file: file.path,
            autoFixable: false,
            fixSuggestion: `Generate src/components/ui/${componentName}.tsx or use an existing component`,
          });
        }
      }
    }
  }

  return issues;
}

// ─── Helpers ───

function resolveRelativePath(dir: string, relativePath: string): string {
  const parts = relativePath.split('/');
  const dirParts = dir.split('/');
  for (const part of parts) {
    if (part === '..') dirParts.pop();
    else dirParts.push(part);
  }
  return dirParts.join('/');
}

function mergeFileLists(
  existing: Array<{ path: string; content: string }>,
  newFiles: Array<{ path: string; content: string }>
): Array<{ path: string; content: string }> {
  const merged = new Map<string, string>();
  for (const f of existing) merged.set(f.path, f.content);
  for (const f of newFiles) merged.set(f.path, f.content);
  return Array.from(merged.entries()).map(([path, content]) => ({ path, content }));
}
