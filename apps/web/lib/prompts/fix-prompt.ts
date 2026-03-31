/**
 * Auto-fix 专用 Prompt（v2 增强版）
 * 针对编译错误和运行时错误的精准修复指令
 *
 * v2 改进：
 * - 扩展上下文收集：包含所有 entity 文件、被报错文件引入的文件、package.json
 * - 传递依赖追踪：如果 A 报错且 A 引入了 B，B 也被包含
 * - 更好的错误分类和修复指导
 */

export function buildFixPrompt(errors: string[], existingFiles?: { path: string; content: string }[]): string {
  let prompt = `You are a code repair agent. Fix the following errors in this Vite + React + TypeScript project.

## Rules
1. Only output files that need changes — do NOT repeat unchanged files
2. Fix the root cause, not symptoms
3. If an import is wrong, check what's actually available before fixing
4. If a component is missing, generate it in src/components/ui/ following shadcn/ui patterns
5. Use @/ path alias for all src/ imports
6. Keep existing code patterns consistent
7. NEVER remove or simplify existing functionality to fix errors
8. When fixing type errors, check the entity/interface definitions to ensure types match
9. When a file imports from another file, check the exports of that file match what's being imported

## Pre-installed files (do NOT regenerate):
- src/lib/data-service.ts — createEntityService SDK (exports: createEntityService)
- src/lib/supabase.ts — Supabase client (exports: supabase, isSupabaseConnected)
- src/lib/auth.tsx — Auth provider (exports: AuthProvider, useAuth)
- src/lib/storage.ts — File storage (exports: storageService)
- src/lib/utils.ts — cn() function
- src/components/ui/*.tsx — 25 shadcn/ui components: button, input, label, card, badge, textarea, separator, table, dialog, select, tabs, dropdown-menu, avatar, switch, skeleton, alert, alert-dialog, sheet, form, popover, checkbox, scroll-area, tooltip, radio-group, progress
- src/components/ErrorBoundary.tsx — React Error Boundary
- src/components/Loading.tsx — LoadingSkeleton + PageLoading
- src/components/EmptyState.tsx — Empty state with icon + title + action

## Errors to fix:
${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}

## Common fix patterns:
- "Cannot find module '@/xxx'" → Check if the file exists; if it's a UI component, check the 25 available ones above
- "is not exported from" → Check the actual exports of the target module — READ the module file to see what's exported
- "does not provide an export named 'XXX'" from lucide-react → The icon name doesn't exist! Replace with a valid icon: Home, Users, Settings, Search, Plus, Trash2, Edit, BarChart3, Package, FileText, LayoutDashboard, UserCircle, CheckSquare, Bell, ShoppingCart, Workflow, etc.
- "Cannot find name" → Add missing import or declare the variable
- "Type error" → Check the entity interface definition to see correct field names/types, then fix the mismatch
- "Unexpected token" → Likely JSX syntax error, check for unclosed tags
- Props mismatch → Check the component's definition to see what props it accepts, then fix the call site
`;

  if (existingFiles?.length) {
    // ── 智能上下文收集（v2 增强版） ──
    const contextFiles = new Map<string, { path: string; content: string }>();

    // 1. 从错误消息中提取文件路径
    const errorPaths = new Set<string>();
    for (const err of errors) {
      const pathMatch = err.match(/(?:src\/[^\s:,]+\.tsx?)/);
      if (pathMatch) errorPaths.add(pathMatch[0]);
      // 也匹配 [xxx] file.tsx:line 格式
      const altMatch = err.match(/\b([^\s:]+\.tsx?)/);
      if (altMatch && altMatch[1].includes('/')) errorPaths.add(altMatch[1]);
    }

    // 2. 直接关联的文件：报错文件 + App.tsx + main.tsx
    for (const f of existingFiles) {
      if (errorPaths.has(f.path) || f.path.includes('App.tsx') || f.path.includes('main.tsx')) {
        contextFiles.set(f.path, f);
      }
    }

    // 3. 传递依赖：报错文件 import 的文件也加入
    const snapshotPaths = Array.from(contextFiles.keys());
    for (const filePath of snapshotPaths) {
      const file = contextFiles.get(filePath);
      if (!file) continue;

      const imports = extractLocalImports(file.content);
      for (const imp of imports) {
        const resolved = resolveImportPath(filePath, imp);
        const candidates = [resolved, resolved + '.ts', resolved + '.tsx', resolved + '/index.ts', resolved + '/index.tsx'];
        for (const candidate of candidates) {
          const found = existingFiles.find(f => f.path === candidate);
          if (found && !contextFiles.has(found.path)) {
            contextFiles.set(found.path, found);
            break;
          }
        }
      }
    }

    // 4. 始终包含所有 entity 文件（类型定义是修复类型错误的关键）
    for (const f of existingFiles) {
      if (f.path.includes('entities/') && !contextFiles.has(f.path)) {
        contextFiles.set(f.path, f);
      }
    }

    // 5. 始终包含 types 文件
    for (const f of existingFiles) {
      if ((f.path.includes('types/') || f.path === 'src/types.ts') && !contextFiles.has(f.path)) {
        contextFiles.set(f.path, f);
      }
    }

    // 6. 始终包含 package.json（帮助判断 npm 包是否可用）
    const pkgFile = existingFiles.find(f => f.path === 'package.json');
    if (pkgFile && !contextFiles.has('package.json')) {
      contextFiles.set('package.json', pkgFile);
    }

    // 7. Layout/Sidebar（如果有路由或导航相关错误）
    const hasRouteError = errors.some(e =>
      e.includes('Route') || e.includes('route') || e.includes('App.tsx') || e.includes('navigate')
    );
    if (hasRouteError) {
      for (const f of existingFiles) {
        if ((f.path.includes('Layout.tsx') || f.path.includes('Sidebar.tsx')) && !contextFiles.has(f.path)) {
          contextFiles.set(f.path, f);
        }
      }
    }

    // 8. 大小控制：超过 20 个文件时截断
    let entries = Array.from(contextFiles.values());
    if (entries.length > 20) {
      // 优先保留：报错文件 > entity > types > 其他
      entries.sort((a, b) => {
        const scoreA = errorPaths.has(a.path) ? 0 : a.path.includes('entities/') ? 1 : a.path.includes('types') ? 2 : 3;
        const scoreB = errorPaths.has(b.path) ? 0 : b.path.includes('entities/') ? 1 : b.path.includes('types') ? 2 : 3;
        return scoreA - scoreB;
      });
      entries = entries.slice(0, 20);
    }

    // 输出上下文文件
    if (entries.length > 0) {
      prompt += '\n## Relevant files (read carefully before fixing):\n';
      for (const f of entries) {
        // 对大文件进行截断
        const content = f.content.length > 4000
          ? f.content.slice(0, 3000) + '\n// ... truncated ...\n' + f.content.slice(-800)
          : f.content;
        prompt += `### ${f.path}\n\`\`\`\n${content}\n\`\`\`\n\n`;
      }
    }

    // 输出项目文件列表（帮助 LLM 了解可用文件）
    const allPaths = existingFiles
      .map(f => f.path)
      .filter(p => !p.includes('components/ui/'));
    if (allPaths.length > 0) {
      prompt += `\n## All project files (for import path reference):\n${allPaths.map(p => `- ${p}`).join('\n')}\n`;
    }

    // 输出已安装依赖列表
    if (pkgFile) {
      try {
        const pkg = JSON.parse(pkgFile.content);
        const deps = Object.keys(pkg.dependencies || {}).join(', ');
        if (deps) {
          prompt += `\n## Installed npm dependencies:\n${deps}\n`;
        }
      } catch { /* ignore */ }
    }
  }

  return prompt;
}

/** 提取文件中的本地 import 路径 */
function extractLocalImports(content: string): string[] {
  const regex = /from\s+['"](@\/[^'"]+|\.\.?\/[^'"]+)['"]/g;
  const paths: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    paths.push(match[1]);
  }
  return paths;
}

/** 解析 import 路径为文件路径 */
function resolveImportPath(fromFile: string, importPath: string): string {
  if (importPath.startsWith('@/')) {
    return 'src/' + importPath.slice(2);
  }
  const dir = fromFile.split('/').slice(0, -1).join('/');
  const parts = importPath.replace(/^\.\//, '').split('/');
  const dirParts = dir.split('/');
  for (const part of parts) {
    if (part === '..') dirParts.pop();
    else dirParts.push(part);
  }
  return dirParts.join('/');
}
