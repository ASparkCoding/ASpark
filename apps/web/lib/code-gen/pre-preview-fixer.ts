/**
 * 预览前修复编排器
 * 在代码生成完成后、预览启动前执行：
 * 1. 运行 post-gen-validator 检测结构性问题
 * 2. 对 autoFixable 问题执行确定性修复
 * 3. 返回修复后的文件 + 剩余无法自动修复的警告
 */

import { validateGeneratedProject, type ValidationIssue } from './post-gen-validator';
import { preFixFiles } from './pre-fixer';
import type { DetectedError } from '@/lib/error-detection/detector';

interface FileEntry {
  path: string;
  content: string;
}

interface PrePreviewFixResult {
  /** 修复后的文件列表 */
  fixedFiles: FileEntry[];
  /** 已自动修复的问题描述 */
  fixedIssues: string[];
  /** 无法自动修复的剩余问题 */
  remainingIssues: ValidationIssue[];
  /** 是否有阻塞性错误（应延迟预览启动直到修复） */
  hasBlockingErrors: boolean;
}

/**
 * 预览前修复管线：在文件写入后、Vite 启动前执行
 *
 * @param newFiles - LLM 新生成的文件
 * @param existingFiles - 项目中已有的文件（模板 + 之前的生成）
 * @returns 修复结果
 */
export function runPrePreviewFixes(
  newFiles: FileEntry[],
  existingFiles: FileEntry[]
): PrePreviewFixResult {
  const fixedIssues: string[] = [];

  // ── Step 1: 运行 post-gen-validator 检测结构性问题 ──
  const issues = validateGeneratedProject(newFiles, existingFiles);

  if (issues.length === 0) {
    return {
      fixedFiles: newFiles,
      fixedIssues: [],
      remainingIssues: [],
      hasBlockingErrors: false,
    };
  }

  // ── Step 2: 将 ValidationIssues 转换为 DetectedError 格式（供 pre-fixer 使用） ──
  const syntheticErrors: DetectedError[] = issues
    .filter(i => i.autoFixable || i.severity === 'error')
    .map(issue => ({
      type: mapCategory(issue.category),
      file: issue.file || 'unknown',
      message: issue.message,
      rawLog: issue.message,
    }));

  // ── Step 3: 合并所有文件（existing + new），用于修复 ──
  const allFilesMap = new Map<string, FileEntry>();
  for (const f of existingFiles) allFilesMap.set(f.path, f);
  for (const f of newFiles) allFilesMap.set(f.path, f);
  const allFiles = Array.from(allFilesMap.values());

  // ── Step 4: 运行确定性预修复器 ──
  const { fixedFiles, fixedErrors } = preFixFiles(allFiles, syntheticErrors);

  if (fixedErrors.length > 0) {
    fixedIssues.push(...fixedErrors);
  }

  // ── Step 5: 针对 validator 发现的特定问题执行额外修复 ──
  const additionalFixes = applyValidatorFixes(fixedFiles, issues);
  fixedIssues.push(...additionalFixes.fixedDescriptions);

  // ── Step 6: 筛出仅新生成文件的修复版本（不影响 existing 文件） ──
  const newFilePaths = new Set(newFiles.map(f => f.path));
  const resultFiles = additionalFixes.files.filter(f => newFilePaths.has(f.path));

  // ── Step 7: 分类剩余问题 ──
  const remainingIssues = issues.filter(i => {
    // 已被 pre-fixer 或 validator-fixer 修复的问题排除
    if (i.autoFixable && fixedIssues.some(fi => fi.includes(i.file || '') || fi.includes(i.message))) {
      return false;
    }
    return true;
  });

  const hasBlockingErrors = remainingIssues.some(i => i.severity === 'error');

  return {
    fixedFiles: resultFiles,
    fixedIssues,
    remainingIssues,
    hasBlockingErrors,
  };
}

/**
 * 针对 post-gen-validator 发现的特定问题执行修复
 */
function applyValidatorFixes(
  files: FileEntry[],
  issues: ValidationIssue[]
): { files: FileEntry[]; fixedDescriptions: string[] } {
  const fixedDescriptions: string[] = [];

  for (const issue of issues) {
    if (!issue.autoFixable) continue;

    // Fix: App.tsx 缺少 ErrorBoundary 包裹
    if (issue.category === 'component' && issue.message.includes('ErrorBoundary')) {
      const appFile = files.find(f => f.path === 'src/App.tsx');
      if (appFile && !appFile.content.includes('ErrorBoundary')) {
        // 添加 import
        if (!appFile.content.includes("from '@/components/ErrorBoundary'")) {
          appFile.content = `import { ErrorBoundary } from '@/components/ErrorBoundary';\n` + appFile.content;
        }
        // 包裹内容
        if (appFile.content.includes('<BrowserRouter>')) {
          appFile.content = appFile.content.replace(
            '<BrowserRouter>',
            '<ErrorBoundary>\n    <BrowserRouter>'
          );
          appFile.content = appFile.content.replace(
            '</BrowserRouter>',
            '</BrowserRouter>\n    </ErrorBoundary>'
          );
        }
        fixedDescriptions.push('Added ErrorBoundary wrapper to App.tsx');
      }
    }

    // Fix: App.tsx 缺少 Toaster
    if (issue.category === 'component' && issue.message.includes('Toaster')) {
      const appFile = files.find(f => f.path === 'src/App.tsx');
      if (appFile && !appFile.content.includes('Toaster')) {
        if (!appFile.content.includes("from 'sonner'")) {
          appFile.content = `import { Toaster } from 'sonner';\n` + appFile.content;
        }
        // 在 BrowserRouter 之前插入 Toaster
        if (appFile.content.includes('<BrowserRouter>') || appFile.content.includes('<ErrorBoundary>')) {
          const insertBefore = appFile.content.includes('<ErrorBoundary>')
            ? '<ErrorBoundary>'
            : '<BrowserRouter>';
          appFile.content = appFile.content.replace(
            insertBefore,
            `<Toaster position="top-right" richColors />\n      ${insertBefore}`
          );
        }
        fixedDescriptions.push('Added Toaster from sonner to App.tsx');
      }
    }

    // Fix: 页面组件未在 App.tsx 中路由
    if (issue.category === 'route' && issue.file === 'src/App.tsx') {
      const appFile = files.find(f => f.path === 'src/App.tsx');
      if (appFile) {
        const nameMatch = issue.message.match(/Page component (\w+)/);
        if (nameMatch) {
          const componentName = nameMatch[1];
          const pagePath = `src/pages/${componentName}.tsx`;
          const pageFile = files.find(f => f.path === pagePath);

          if (pageFile && !appFile.content.includes(componentName)) {
            // 添加 import
            if (!appFile.content.includes(`from '@/pages/${componentName}'`)) {
              const lastImportIdx = appFile.content.lastIndexOf('import ');
              const lineEnd = appFile.content.indexOf('\n', lastImportIdx);
              const importLine = `\nimport ${componentName} from '@/pages/${componentName}';`;
              appFile.content = appFile.content.slice(0, lineEnd + 1) + importLine + appFile.content.slice(lineEnd + 1);
            }

            // 添加 Route（在最后一个 Route 之后）
            const routePath = '/' + componentName.toLowerCase().replace(/page$/i, '');
            const routeLine = `          <Route path="${routePath}" element={<${componentName} />} />`;
            const lastRouteIdx = appFile.content.lastIndexOf('<Route ');
            if (lastRouteIdx >= 0) {
              const lineEnd = appFile.content.indexOf('/>', lastRouteIdx) + 2;
              appFile.content = appFile.content.slice(0, lineEnd) + '\n' + routeLine + appFile.content.slice(lineEnd);
            }

            fixedDescriptions.push(`Added route for ${componentName} in App.tsx`);
          }
        }
      }
    }
  }

  return { files, fixedDescriptions };
}

function mapCategory(category: ValidationIssue['category']): DetectedError['type'] {
  switch (category) {
    case 'import': return 'import';
    case 'missing_file': return 'import';
    case 'schema': return 'typescript';
    case 'component': return 'import';
    case 'route': return 'import';
    default: return 'vite';
  }
}
