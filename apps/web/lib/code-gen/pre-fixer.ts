/**
 * 确定性预修复器 v3
 * 在调用 LLM 之前，自动修复可通过静态分析确定的错误
 * 9 类修复，不需要 LLM 参与
 */

import type { DetectedError } from '@/lib/error-detection/detector';

interface FileEntry {
  path: string;
  content: string;
}

/** Phase 1 预装的 25 个 shadcn/ui 组件 */
const PRE_INCLUDED_UI_COMPONENTS = new Set([
  'button', 'input', 'label', 'card', 'badge', 'textarea',
  'separator', 'table', 'dialog', 'select', 'tabs',
  'dropdown-menu', 'avatar', 'switch', 'skeleton',
  'alert', 'alert-dialog', 'sheet', 'form', 'popover',
  'checkbox', 'scroll-area', 'tooltip', 'radio-group', 'progress',
]);

/** React hooks 名称列表 */
const REACT_HOOKS = [
  'useState', 'useEffect', 'useCallback', 'useMemo', 'useRef',
  'useContext', 'useReducer', 'useId', 'useLayoutEffect',
  'useImperativeHandle', 'useDebugValue', 'useDeferredValue',
  'useTransition', 'useSyncExternalStore', 'useInsertionEffect',
];

export function preFixFiles(
  files: FileEntry[],
  errors: DetectedError[]
): { fixedFiles: FileEntry[]; fixedErrors: string[]; remainingErrors: DetectedError[] } {
  const fixedFiles = files.map(f => ({ ...f }));
  const fixedErrors: string[] = [];
  const remainingErrors: DetectedError[] = [];

  // ── Fix 1: 删除不存在的 shadcn/ui 组件 import ──
  for (const file of fixedFiles) {
    if (!file.path.match(/\.(tsx?|jsx?)$/)) continue;

    const uiImportRegex = /^import\s+\{[^}]*\}\s+from\s+['"]@\/components\/ui\/([^'"]+)['"]\s*;?\s*$/gm;
    let match;
    const linesToRemove: string[] = [];

    while ((match = uiImportRegex.exec(file.content)) !== null) {
      const componentName = match[1];
      if (!PRE_INCLUDED_UI_COMPONENTS.has(componentName)) {
        // 检查是否有用户生成的同名组件文件
        const componentPath = `src/components/ui/${componentName}.tsx`;
        if (!fixedFiles.some(f => f.path === componentPath)) {
          linesToRemove.push(match[0]);
        }
      }
    }

    if (linesToRemove.length > 0) {
      for (const line of linesToRemove) {
        file.content = file.content.replace(line, '');
      }
      file.content = file.content.replace(/\n{3,}/g, '\n\n');
      fixedErrors.push(`Removed ${linesToRemove.length} imports of non-existent UI components in ${file.path}`);
    }
  }

  // ── Fix 2: 修复相对路径为 @/ alias ──
  for (const file of fixedFiles) {
    if (!file.path.match(/\.(tsx?|jsx?)$/)) continue;
    if (!file.path.startsWith('src/')) continue;

    // 修复 ../../../ 深层相对路径为 @/ alias
    const deepRelativeRegex = /from\s+['"](\.\.\/(\.\.\/)+[^'"]+)['"]/g;
    let changed = false;
    file.content = file.content.replace(deepRelativeRegex, (match, relativePath) => {
      // 解析实际的绝对路径
      const parts = file.path.split('/');
      parts.pop(); // 去掉文件名
      const segments = relativePath.split('/');
      for (const seg of segments) {
        if (seg === '..') parts.pop();
        else if (seg !== '.') parts.push(seg);
      }
      const resolved = parts.join('/');
      if (resolved.startsWith('src/')) {
        changed = true;
        return `from '@/${resolved.slice(4)}'`;
      }
      return match;
    });

    // 修复带文件扩展名的 import
    const extRegex = /from\s+['"](@\/[^'"]+)\.(ts|tsx|js|jsx)['"]/g;
    file.content = file.content.replace(extRegex, (match, basePath) => {
      changed = true;
      return `from '${basePath}'`;
    });

    if (changed) {
      fixedErrors.push(`Fixed import paths in ${file.path}`);
    }
  }

  // ── Fix 3: 补充缺失的 React hooks import ──
  for (const file of fixedFiles) {
    if (!file.path.match(/\.(tsx?|jsx?)$/)) continue;

    // 查找文件中使用的 hooks
    const usedHooks = REACT_HOOKS.filter(hook => {
      // 确保是作为函数调用使用的，不是在注释或字符串中
      const hookRegex = new RegExp(`\\b${hook}\\s*[(<]`, 'g');
      return hookRegex.test(file.content);
    });

    if (usedHooks.length === 0) continue;

    // 检查是否已经有 React import
    const reactImportMatch = file.content.match(/^import\s+\{([^}]+)\}\s+from\s+['"]react['"]/m);
    const reactDefaultImport = file.content.match(/^import\s+React\b/m);

    if (reactDefaultImport) continue; // import React covers everything

    if (reactImportMatch) {
      // 已有 named import，检查缺少哪些
      const existingImports = reactImportMatch[1].split(',').map(s => s.trim());
      const missingHooks = usedHooks.filter(h => !existingImports.includes(h));

      if (missingHooks.length > 0) {
        const allImports = [...existingImports, ...missingHooks].join(', ');
        file.content = file.content.replace(
          reactImportMatch[0],
          `import { ${allImports} } from 'react'`
        );
        fixedErrors.push(`Added missing React hooks (${missingHooks.join(', ')}) in ${file.path}`);
      }
    } else {
      // 没有 React import，添加一个
      file.content = `import { ${usedHooks.join(', ')} } from 'react';\n` + file.content;
      fixedErrors.push(`Added React hooks import (${usedHooks.join(', ')}) to ${file.path}`);
    }
  }

  // ── Fix 4: 修复 default export 一致性 ──
  for (const file of fixedFiles) {
    if (!file.path.match(/\.(tsx?|jsx?)$/)) continue;

    // 检测多个 export default
    const defaultExportMatches = file.content.match(/^export default /gm);
    if (defaultExportMatches && defaultExportMatches.length > 1) {
      const lines = file.content.split('\n');
      let defaultCount = 0;
      const newLines = lines.filter(line => {
        if (line.match(/^export default /)) {
          defaultCount++;
          return defaultCount <= 1;
        }
        return true;
      });
      file.content = newLines.join('\n');
      fixedErrors.push(`Fixed duplicate export default in ${file.path}`);
    }
  }

  // ── Fix 5: 修复无效 lucide-react 图标 import ──
  // 当错误包含 "does not provide an export named 'XXX'" 且来自 lucide-react 时，
  // 将无效图标替换为安全的通用图标
  const ICON_FALLBACK_MAP: Record<string, string> = {
    // 常见 LLM 幻觉图标 → 实际存在的替代
    Pipeline: 'Workflow', Pipelines: 'Workflow',
    Dashboard: 'LayoutDashboard', DashboardIcon: 'LayoutDashboard',
    Analytics: 'BarChart3', Analytic: 'BarChart3',
    Customer: 'Users', Customers: 'Users',
    Product: 'Package', Products: 'Package',
    Order: 'ShoppingCart', Orders: 'ShoppingCart',
    Invoice: 'Receipt', Invoices: 'Receipt',
    Report: 'FileText', Reports: 'FileText',
    Setting: 'Settings', SettingsIcon: 'Settings',
    Employee: 'UserCircle', Employees: 'UserCircle',
    Task: 'CheckSquare', Tasks: 'CheckSquare',
    Project: 'FolderKanban', Projects: 'FolderKanban',
    Message: 'MessageSquare', Messages: 'MessageSquare',
    Notification: 'Bell', Notifications: 'Bell',
    Category: 'Tags', Categories: 'Tags',
    Document: 'FileText', Documents: 'FileText',
    Calendar1: 'Calendar', CalendarView: 'Calendar',
    Chart: 'BarChart3', Charts: 'BarChart3',
    Money: 'DollarSign', Revenue: 'DollarSign',
    Inventory: 'Warehouse', Stock: 'Package',
    Contact: 'Contact2', Contacts: 'Contact2',
    Deal: 'Handshake', Deals: 'Handshake',
    Lead: 'UserPlus', Leads: 'UserPlus',
  };

  for (const error of errors) {
    if (!error.message.includes('does not provide an export named')) continue;
    const exportMatch = error.message.match(/export named '(\w+)'/);
    if (!exportMatch) continue;
    const invalidName = exportMatch[1];

    // 查找包含这个 import 的文件
    for (const file of fixedFiles) {
      const lucideImportRegex = new RegExp(
        `^(import\\s*\\{[^}]*)\\b${invalidName}\\b([^}]*\\}\\s*from\\s*['"]lucide-react['"])`,
        'gm'
      );

      if (!lucideImportRegex.test(file.content)) continue;

      const replacement = ICON_FALLBACK_MAP[invalidName] || 'Circle';
      file.content = file.content.replace(
        new RegExp(`\\b${invalidName}\\b`, 'g'),
        replacement
      );
      fixedErrors.push(`Replaced invalid lucide icon "${invalidName}" with "${replacement}" in ${file.path}`);
    }
  }

  // ── Fix 6: 补充缺失的 lucide-react 图标 import ──
  const KNOWN_LUCIDE_ICONS = new Set([
    'Home', 'Users', 'Settings', 'Search', 'Plus', 'Trash2', 'Edit', 'Eye', 'EyeOff',
    'Download', 'Upload', 'Mail', 'Phone', 'Calendar', 'Clock', 'Star', 'Heart',
    'Check', 'X', 'ChevronDown', 'ChevronRight', 'ChevronLeft', 'ChevronUp',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Menu', 'MoreHorizontal',
    'MoreVertical', 'Filter', 'SortAsc', 'SortDesc', 'Bell', 'ShoppingCart',
    'CreditCard', 'DollarSign', 'BarChart3', 'LineChart', 'PieChart', 'TrendingUp',
    'TrendingDown', 'Package', 'FileText', 'FolderOpen', 'Image', 'Link', 'Globe',
    'Lock', 'Unlock', 'Shield', 'AlertTriangle', 'Info', 'HelpCircle', 'UserPlus',
    'UserCircle', 'LogOut', 'LogIn', 'LayoutDashboard', 'Layers', 'Tag', 'Bookmark',
    'Share2', 'Copy', 'Clipboard', 'RefreshCw', 'Loader2', 'CheckCircle', 'XCircle',
    'AlertCircle', 'Workflow', 'Building2', 'MapPin', 'Briefcase', 'Receipt',
    'Warehouse', 'Contact2', 'Handshake', 'Target', 'Zap', 'Award', 'Flame',
    'BookOpen', 'Save', 'Send', 'Paperclip', 'Printer', 'ExternalLink', 'Code',
    'Terminal', 'Database', 'Server', 'Wifi', 'WifiOff', 'Battery', 'Monitor',
    'Smartphone', 'Tablet', 'Camera', 'Mic', 'Volume2', 'VolumeX', 'Play', 'Pause',
    'SkipForward', 'SkipBack', 'Maximize', 'Minimize', 'Move', 'RotateCw',
    'Scissors', 'Bold', 'Italic', 'Underline', 'AlignLeft', 'AlignCenter',
    'AlignRight', 'List', 'ListOrdered', 'Indent', 'Outdent', 'Type', 'Hash',
    'AtSign', 'Percent', 'Activity', 'Aperture', 'Archive', 'Box', 'Columns',
    'Command', 'Compass', 'Cpu', 'Disc', 'File', 'Folder', 'Gift', 'Grid',
    'Key', 'Map', 'MessageSquare', 'MessageCircle', 'Moon', 'Sun', 'Sunrise',
    'Sunset', 'Thermometer', 'Umbrella', 'Wind', 'Cloud', 'CloudRain', 'Snowflake',
    'Droplets', 'Feather', 'Flag', 'Hexagon', 'Infinity', 'Lightbulb', 'Magnet',
    'Navigation', 'Pencil', 'Pin', 'Power', 'Radio', 'Rocket', 'Rss', 'Scale',
    'Slash', 'Speaker', 'Stamp', 'Ticket', 'Timer', 'ToggleLeft', 'ToggleRight',
    'Tool', 'Trash', 'Truck', 'Tv', 'User', 'Video', 'Watch', 'Wrench',
    'FolderKanban', 'CheckSquare', 'Tags', 'ThumbsUp', 'ThumbsDown',
  ]);

  for (const file of fixedFiles) {
    if (!file.path.match(/\.(tsx|jsx)$/)) continue;

    // 查找 JSX 中使用的图标组件：<IconName  (大写开头，后面跟空格或属性)
    const jsxIconUsageRegex = /<([A-Z][a-zA-Z0-9]+)\s/g;
    const usedIcons = new Set<string>();
    let iconMatch;
    while ((iconMatch = jsxIconUsageRegex.exec(file.content)) !== null) {
      const name = iconMatch[1];
      if (KNOWN_LUCIDE_ICONS.has(name)) {
        usedIcons.add(name);
      }
    }

    if (usedIcons.size === 0) continue;

    // 查找已导入的 lucide-react 图标
    const lucideImportMatch = file.content.match(/^import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/m);
    const importedIcons = new Set<string>();
    if (lucideImportMatch) {
      lucideImportMatch[1].split(',').forEach(s => {
        // 处理 "Tag as TagIcon" 这样的 alias
        const trimmed = s.trim().split(/\s+as\s+/)[0].trim();
        if (trimmed) importedIcons.add(trimmed);
      });
    }

    // 也检查 alias 形式 — 如果 "Tag as TagIcon"，TagIcon 在 JSX 中使用，则 Tag 已导入
    const aliasMap = new Map<string, string>();
    if (lucideImportMatch) {
      lucideImportMatch[1].split(',').forEach(s => {
        const aliasMatch = s.trim().match(/^(\w+)\s+as\s+(\w+)$/);
        if (aliasMatch) aliasMap.set(aliasMatch[2], aliasMatch[1]);
      });
    }

    // 找出使用了但未导入的图标
    const missingIcons: string[] = [];
    for (const icon of usedIcons) {
      if (!importedIcons.has(icon) && !aliasMap.has(icon)) {
        missingIcons.push(icon);
      }
    }

    if (missingIcons.length === 0) continue;

    if (lucideImportMatch) {
      // 在现有 import 中追加
      const existingList = lucideImportMatch[1].trim();
      const newList = existingList + ', ' + missingIcons.join(', ');
      file.content = file.content.replace(lucideImportMatch[0], `import { ${newList} } from 'lucide-react'`);
    } else {
      // 没有 lucide-react import，新增一行
      file.content = `import { ${missingIcons.join(', ')} } from 'lucide-react';\n` + file.content;
    }
    fixedErrors.push(`Added missing lucide-react icons (${missingIcons.join(', ')}) in ${file.path}`);
  }

  // ── Fix 7: 修复 .ts 文件中包含 JSX（重命名为 .tsx） ──
  for (let i = 0; i < fixedFiles.length; i++) {
    const file = fixedFiles[i];
    if (!file.path.match(/\.ts$/) || file.path.match(/\.d\.ts$/)) continue;

    const jsxPattern = /return\s*\([\s\S]*?<[A-Z]/;
    const jsxSelfClosing = /<[A-Z]\w+[\s\S]*?\/>/;
    const jsxFragment = /<>|<\/>/;
    if (jsxPattern.test(file.content) || jsxSelfClosing.test(file.content) || jsxFragment.test(file.content)) {
      const oldPath = file.path;
      file.path = file.path.replace(/\.ts$/, '.tsx');
      fixedErrors.push(`Renamed ${oldPath} → ${file.path} (contains JSX)`);
    }
  }

  // ── Fix 8: 移除重复 import ──
  for (const file of fixedFiles) {
    if (!file.path.match(/\.(tsx?|jsx?)$/)) continue;

    const lines = file.content.split('\n');
    const seenImports = new Set<string>();
    let removed = 0;

    const newLines = lines.filter(line => {
      const importMatch = line.match(/^import\s+.*from\s+['"]([^'"]+)['"]\s*;?\s*$/);
      if (importMatch) {
        const importKey = importMatch[0].replace(/\s+/g, ' ').trim();
        if (seenImports.has(importKey)) {
          removed++;
          return false;
        }
        seenImports.add(importKey);
      }
      return true;
    });

    if (removed > 0) {
      file.content = newLines.join('\n');
      fixedErrors.push(`Removed ${removed} duplicate imports in ${file.path}`);
    }
  }

  // ── Fix 9: 修复 Sonner Toaster 缺失 ──
  const appFile = fixedFiles.find(f => f.path === 'src/App.tsx');
  if (appFile) {
    // 检查是否有任何文件使用了 toast 但 App.tsx 没有 Toaster
    const usesToast = fixedFiles.some(f =>
      f.path !== 'src/App.tsx' &&
      (f.content.includes("from 'sonner'") || f.content.includes('from "sonner"'))
    );

    if (usesToast && !appFile.content.includes('Toaster')) {
      if (!appFile.content.includes("from 'sonner'") && !appFile.content.includes('from "sonner"')) {
        appFile.content = "import { Toaster } from 'sonner';\n" + appFile.content;
      }
      appFile.content = appFile.content.replace(
        /(<BrowserRouter|<Router|<div\s+className)/,
        '<>\n      <Toaster position="top-right" richColors />\n      $1'
      );
      // 在最外层 closing tag 前添加 </>
      if (appFile.content.includes('<>')) {
        fixedErrors.push('Added Toaster provider to App.tsx');
      }
    }
  }

  // ── Fix 10: 自动补充缺失的 npm 包到 package.json ──
  const pkgFile = fixedFiles.find(f => f.path === 'package.json');
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content);
      const deps = pkg.dependencies || {};
      const devDeps = pkg.devDependencies || {};
      const allDeps = new Set([...Object.keys(deps), ...Object.keys(devDeps)]);

      // 收集所有文件中的 npm 包导入
      const usedPackages = new Set<string>();
      for (const file of fixedFiles) {
        if (!file.path.match(/\.(tsx?|jsx?)$/)) continue;
        const npmRegex = /from\s+['"]([^./'"@][^'"]*|@[^/'"]+\/[^'"]+)['"]/g;
        let npmMatch;
        while ((npmMatch = npmRegex.exec(file.content)) !== null) {
          const pkgName = npmMatch[1].startsWith('@')
            ? npmMatch[1].split('/').slice(0, 2).join('/')
            : npmMatch[1].split('/')[0];
          // 跳过内置和 react 系列
          if (['react', 'react-dom', 'react-router-dom', 'react/jsx-runtime'].includes(pkgName)) continue;
          if (pkgName.startsWith('node:')) continue;
          usedPackages.add(pkgName);
        }
      }

      // 找出在代码中使用但不在 package.json 中的包
      const COMMON_PACKAGES: Record<string, string> = {
        'date-fns': '^4.1.0',
        'recharts': '^2.15.0',
        'sonner': '^1.7.0',
        'lucide-react': '^0.468.0',
        'zod': '^3.24.0',
        'react-hook-form': '^7.54.0',
        '@hookform/resolvers': '^3.9.0',
        'clsx': '^2.1.0',
        'tailwind-merge': '^2.6.0',
        '@tanstack/react-table': '^8.20.0',
      };

      let pkgModified = false;
      for (const usedPkg of usedPackages) {
        if (!allDeps.has(usedPkg) && COMMON_PACKAGES[usedPkg]) {
          if (!pkg.dependencies) pkg.dependencies = {};
          pkg.dependencies[usedPkg] = COMMON_PACKAGES[usedPkg];
          pkgModified = true;
          fixedErrors.push(`Added missing package "${usedPkg}" to package.json`);
        }
      }

      if (pkgModified) {
        pkgFile.content = JSON.stringify(pkg, null, 2);
      }
    } catch { /* package.json parse error, skip */ }
  }

  // ── Fix 11: 自动补全 App.tsx 中缺失的页面路由 import ──
  const appFileForRoutes = fixedFiles.find(f => f.path === 'src/App.tsx');
  if (appFileForRoutes) {
    const pageFiles = fixedFiles.filter(f => f.path.match(/^src\/pages\/\w+\.tsx$/));
    for (const page of pageFiles) {
      const nameMatch = page.path.match(/src\/pages\/(\w+)\.tsx$/);
      if (!nameMatch) continue;
      const componentName = nameMatch[1];

      // 检查是否已在 App.tsx 中引用
      if (!appFileForRoutes.content.includes(componentName)) {
        // 添加 import
        const lastImportIdx = appFileForRoutes.content.lastIndexOf('\nimport ');
        if (lastImportIdx >= 0) {
          const lineEnd = appFileForRoutes.content.indexOf('\n', lastImportIdx + 1);
          const importLine = `\nimport ${componentName} from '@/pages/${componentName}';`;
          appFileForRoutes.content = appFileForRoutes.content.slice(0, lineEnd) + importLine + appFileForRoutes.content.slice(lineEnd);
        }

        // 添加 Route
        const routePath = '/' + componentName.toLowerCase().replace(/page$/i, '');
        const routeLine = `            <Route path="${routePath}" element={<${componentName} />} />`;
        const lastRouteIdx = appFileForRoutes.content.lastIndexOf('<Route ');
        if (lastRouteIdx >= 0) {
          const routeLineEnd = appFileForRoutes.content.indexOf('/>', lastRouteIdx);
          if (routeLineEnd >= 0) {
            const insertAt = routeLineEnd + 2;
            appFileForRoutes.content = appFileForRoutes.content.slice(0, insertAt) + '\n' + routeLine + appFileForRoutes.content.slice(insertAt);
          }
        }

        fixedErrors.push(`Added missing route + import for ${componentName} in App.tsx`);
      }
    }
  }

  // ── Fix 12: 修复 createEntityService 接口与 sampleData 不匹配 ──
  for (const file of fixedFiles) {
    if (!file.path.match(/src\/entities\/\w+\.ts$/)) continue;
    if (!file.content.includes('createEntityService')) continue;

    // 提取 interface 中的必需字段
    const interfaceMatch = file.content.match(/export interface \w+ \{([^}]+)\}/);
    if (!interfaceMatch) continue;

    const requiredFields = interfaceMatch[1]
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('//') && !line.includes('?:'))
      .map(line => line.split(':')[0]?.trim())
      .filter(Boolean);

    // 检查 sampleData 中的第一个对象是否有所有必需字段
    const sampleMatch = file.content.match(/sampleData:\s*\[([\s\S]*?)\]/);
    if (!sampleMatch) continue;

    // 检查 sampleData 是否为空
    if (sampleMatch[1].trim() === '') {
      fixedErrors.push(`Warning: ${file.path} has empty sampleData array`);
    }
  }

  // ── Fix 13: 修复常见 React Hook 错误 — useEffect 空依赖数组警告 ──
  for (const file of fixedFiles) {
    if (!file.path.match(/\.(tsx|jsx)$/)) continue;

    // 检测 useEffect 中调用了定义在外部的函数但未加入依赖数组
    // 常见模式: useEffect(() => { loadData(); }, []) 但 loadData 使用了 state/props
    // 修复: 确保有 useCallback 的函数被加入依赖
    const useEffectEmptyDeps = /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?\},\s*\[\s*\]\s*\)/g;
    let effectMatch;
    while ((effectMatch = useEffectEmptyDeps.exec(file.content)) !== null) {
      const effectBody = effectMatch[0];
      // 查找 effect body 中调用的 useCallback 函数
      const calledFns = effectBody.match(/\b(load\w+|fetch\w+|init\w+|get\w+)\s*\(/g);
      if (calledFns) {
        for (const call of calledFns) {
          const fnName = call.replace(/\s*\($/, '');
          // 检查该函数是否用 useCallback 定义
          if (file.content.includes(`const ${fnName} = useCallback`)) {
            // 将函数加入依赖数组
            const oldEffect = effectBody;
            const newEffect = effectBody.replace(
              /,\s*\[\s*\]\s*\)/,
              `, [${fnName}])`
            );
            if (oldEffect !== newEffect) {
              file.content = file.content.replace(oldEffect, newEffect);
              fixedErrors.push(`Added ${fnName} to useEffect dependency array in ${file.path}`);
            }
          }
        }
      }
    }
  }

  // ── Fix 14: 修复 Sidebar 导航链接与路由不匹配 ──
  const sidebarFile = fixedFiles.find(f => f.path === 'src/components/Sidebar.tsx');
  const appFileCheck = fixedFiles.find(f => f.path === 'src/App.tsx');
  if (sidebarFile && appFileCheck) {
    // 提取 App.tsx 中的路由路径
    const routePaths = new Set<string>();
    const routeRegex = /path=["']([^"']+)["']/g;
    let routeMatch;
    while ((routeMatch = routeRegex.exec(appFileCheck.content)) !== null) {
      routePaths.add(routeMatch[1]);
    }

    // 检查 Sidebar 中的 NavLink to 属性是否都在路由中
    const navLinkRegex = /to=["']([^"']+)["']/g;
    let navMatch;
    const brokenLinks: string[] = [];
    while ((navMatch = navLinkRegex.exec(sidebarFile.content)) !== null) {
      const linkPath = navMatch[1];
      if (!routePaths.has(linkPath) && linkPath !== '/') {
        brokenLinks.push(linkPath);
      }
    }

    if (brokenLinks.length > 0) {
      fixedErrors.push(`Warning: Sidebar has ${brokenLinks.length} nav links to non-existent routes: ${brokenLinks.join(', ')}`);
    }
  }

  // ── 处理每个原始错误的状态 ──
  for (const error of errors) {
    let fixed = false;

    // 检查错误是否已被上述修复覆盖
    if (error.message.includes('Multiple export default') || error.message.includes('default export')) {
      fixed = fixedErrors.some(e => e.includes('duplicate export default'));
    }
    if (error.message.includes("'React'") && error.message.includes('not defined')) {
      fixed = fixedErrors.some(e => e.includes('React'));
    }
    if (error.message.includes('Cannot resolve import') && error.message.includes('@/components/ui/')) {
      const compMatch = error.message.match(/@\/components\/ui\/(\S+)/);
      if (compMatch && !PRE_INCLUDED_UI_COMPONENTS.has(compMatch[1])) {
        fixed = fixedErrors.some(e => e.includes('non-existent UI'));
      }
    }
    if (error.message.includes('Cannot resolve import') && error.message.includes('@/')) {
      fixed = fixedErrors.some(e => e.includes('import paths'));
    }
    // 新增：npm 包错误是否已通过 Fix 10 修复
    if (error.message.includes('Cannot resolve import') && error.type === 'import') {
      const pkgMatch2 = error.message.match(/Cannot resolve import "([^"]+)"/);
      if (pkgMatch2 && !pkgMatch2[1].startsWith('.') && !pkgMatch2[1].startsWith('@/')) {
        fixed = fixedErrors.some(e => e.includes(pkgMatch2[1]) && e.includes('package.json'));
      }
    }
    // 新增：路由缺失是否已通过 Fix 11 修复
    if (error.message.includes('not imported') || error.message.includes('not routed')) {
      fixed = fixedErrors.some(e => e.includes('missing route'));
    }

    if (!fixed) {
      remainingErrors.push(error);
    }
  }

  return { fixedFiles, fixedErrors, remainingErrors };
}
