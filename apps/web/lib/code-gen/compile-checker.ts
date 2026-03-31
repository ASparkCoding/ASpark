/**
 * 编译检查关卡：使用静态分析在 Vite 启动前快速检测错误
 * 捕获 import 错误、语法错误和明显类型错误
 * 不依赖 esbuild 运行时，纯静态分析实现
 */

interface CompileError {
  file: string;
  message: string;
  severity: 'error' | 'warning';
  autoFixable: boolean;
}

interface CompileCheckResult {
  errors: CompileError[];
  hasBlockingErrors: boolean;
}

/** 预装的 shadcn/ui 组件名 */
const PRE_INCLUDED_UI = new Set([
  'button', 'input', 'label', 'card', 'badge', 'textarea',
  'separator', 'table', 'dialog', 'select', 'tabs',
  'dropdown-menu', 'avatar', 'switch', 'skeleton',
  'alert', 'alert-dialog', 'sheet', 'form', 'popover',
  'checkbox', 'scroll-area', 'tooltip', 'radio-group', 'progress',
]);

/** 预装的基础设施文件 */
const PRE_INSTALLED_PATHS = new Set([
  'src/lib/supabase.ts', 'src/lib/data-service.ts', 'src/lib/auth.tsx',
  'src/lib/storage.ts', 'src/lib/utils.ts',
  'src/components/ErrorBoundary.tsx', 'src/components/Loading.tsx',
  'src/components/EmptyState.tsx', 'src/main.tsx',
  'src/types/index.ts',
]);

/**
 * 静态编译检查：在 Vite 启动前验证所有文件
 *
 * 检查项：
 * 1. 所有本地 import 能解析到实际文件
 * 2. JSX 文件使用 .tsx 扩展名
 * 3. 没有明显的语法错误（未关闭的括号、模板字符串等）
 * 4. export default 不重复
 * 5. React hooks 有正确的 import
 * 6. 不存在循环依赖（简单检测）
 */
export function runCompileCheck(
  files: Array<{ path: string; content: string }>
): CompileCheckResult {
  const errors: CompileError[] = [];
  const filePaths = new Set(files.map(f => f.path));

  // 构建完整的路径集合（包含预装文件）
  const allPaths = new Set([...filePaths, ...PRE_INSTALLED_PATHS]);
  // 添加预装 UI 组件路径
  for (const comp of PRE_INCLUDED_UI) {
    allPaths.add(`src/components/ui/${comp}.tsx`);
  }

  for (const file of files) {
    if (!file.path.match(/\.(tsx?|jsx?)$/)) continue;

    // ── Check 1: Import 解析 ──
    const importErrors = checkImportResolution(file, allPaths, files);
    errors.push(...importErrors);

    // ── Check 2: JSX in .ts ──
    if (file.path.endsWith('.ts') && !file.path.endsWith('.d.ts')) {
      if (hasJSX(file.content)) {
        errors.push({
          file: file.path,
          message: `File contains JSX but uses .ts extension — should be .tsx`,
          severity: 'error',
          autoFixable: true,
        });
      }
    }

    // ── Check 3: 语法快速检查 ──
    const syntaxErrors = checkBasicSyntax(file);
    errors.push(...syntaxErrors);

    // ── Check 4: 重复 export default ──
    const defaults = file.content.match(/^export default /gm);
    if (defaults && defaults.length > 1) {
      errors.push({
        file: file.path,
        message: 'Multiple export default statements',
        severity: 'error',
        autoFixable: true,
      });
    }

    // ── Check 5: React hooks 使用但未导入 ──
    const hookErrors = checkReactHookImports(file);
    errors.push(...hookErrors);

    // ── Check 6: 使用了不存在的 lucide-react 图标 ──
    const iconErrors = checkLucideIcons(file);
    errors.push(...iconErrors);
  }

  // ── Check 7: 循环依赖检测 ──
  const circularErrors = detectCircularDeps(files);
  errors.push(...circularErrors);

  // ── Check 8: App.tsx 路由完整性 ──
  const routeErrors = checkRouteCompleteness(files);
  errors.push(...routeErrors);

  return {
    errors,
    hasBlockingErrors: errors.some(e => e.severity === 'error'),
  };
}

function checkImportResolution(
  file: { path: string; content: string },
  allPaths: Set<string>,
  files: Array<{ path: string; content: string }>
): CompileError[] {
  const errors: CompileError[] = [];
  const importRegex = /from\s+['"](@\/|\.\.?\/)([^'"]+)['"]/g;
  let match;

  while ((match = importRegex.exec(file.content)) !== null) {
    const importPath = match[1] + match[2];

    // 跳过 UI 组件
    if (importPath.includes('components/ui/')) {
      const compName = importPath.split('components/ui/')[1]?.replace(/\.(tsx?|jsx?)$/, '');
      if (compName && !PRE_INCLUDED_UI.has(compName)) {
        // 检查是否在生成的文件中
        const compPath = `src/components/ui/${compName}.tsx`;
        if (!allPaths.has(compPath)) {
          errors.push({
            file: file.path,
            message: `Import "${importPath}" references non-existent UI component "${compName}". Available: ${Array.from(PRE_INCLUDED_UI).join(', ')}`,
            severity: 'error',
            autoFixable: true,
          });
        }
      }
      continue;
    }

    const resolved = resolveImport(file.path, importPath);
    const candidates = [
      resolved,
      resolved + '.ts', resolved + '.tsx',
      resolved + '.js', resolved + '.jsx',
      resolved + '/index.ts', resolved + '/index.tsx',
    ];

    const exists = candidates.some(c => allPaths.has(c));
    if (!exists) {
      errors.push({
        file: file.path,
        message: `Import "${importPath}" cannot be resolved to any file`,
        severity: 'error',
        autoFixable: false,
      });
    }
  }

  // 检查 npm 包导入（非本地导入）是否在 package.json 中
  const npmImportRegex = /from\s+['"]([^./'"@][^'"]*|@[^/'"]+\/[^'"]+)['"]/g;
  const pkgFile = files.find(f => f.path === 'package.json');
  if (pkgFile) {
    let deps: Set<string>;
    try {
      const pkg = JSON.parse(pkgFile.content);
      deps = new Set([
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
      ]);
    } catch {
      deps = new Set();
    }

    let npmMatch;
    while ((npmMatch = npmImportRegex.exec(file.content)) !== null) {
      const pkgName = npmMatch[1].startsWith('@')
        ? npmMatch[1].split('/').slice(0, 2).join('/')
        : npmMatch[1].split('/')[0];

      // 跳过 Node.js 内置模块和 react 系列
      if (['react', 'react-dom', 'react-router-dom', 'react/jsx-runtime'].includes(pkgName)) continue;
      if (pkgName.startsWith('node:')) continue;

      if (deps.size > 0 && !deps.has(pkgName)) {
        errors.push({
          file: file.path,
          message: `Import "${pkgName}" is not in package.json dependencies`,
          severity: 'warning',
          autoFixable: true,
        });
      }
    }
  }

  return errors;
}

function checkBasicSyntax(file: { path: string; content: string }): CompileError[] {
  const errors: CompileError[] = [];
  const content = file.content;

  // 检查未闭合的模板字符串
  const backticks = content.split('`').length - 1;
  if (backticks % 2 !== 0) {
    errors.push({
      file: file.path,
      message: 'Unclosed template literal (odd number of backticks)',
      severity: 'warning',
      autoFixable: false,
    });
  }

  // 检查空文件
  if (!content.trim()) {
    errors.push({
      file: file.path,
      message: 'File is empty',
      severity: 'warning',
      autoFixable: false,
    });
  }

  return errors;
}

function checkReactHookImports(file: { path: string; content: string }): CompileError[] {
  if (!file.path.match(/\.(tsx|jsx)$/)) return [];
  const errors: CompileError[] = [];

  const hooks = ['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext', 'useReducer'];
  const usedHooks = hooks.filter(h => new RegExp(`\\b${h}\\s*[(<]`).test(file.content));
  if (usedHooks.length === 0) return [];

  // 检查是否有 React import
  const hasReactDefault = /^import\s+React\b/m.test(file.content);
  if (hasReactDefault) return [];

  const reactImportMatch = file.content.match(/^import\s+\{([^}]+)\}\s+from\s+['"]react['"]/m);
  if (!reactImportMatch) {
    errors.push({
      file: file.path,
      message: `Uses hooks (${usedHooks.join(', ')}) but missing React import`,
      severity: 'error',
      autoFixable: true,
    });
    return errors;
  }

  const imported = reactImportMatch[1].split(',').map(s => s.trim());
  const missing = usedHooks.filter(h => !imported.includes(h));
  if (missing.length > 0) {
    errors.push({
      file: file.path,
      message: `Missing React hook imports: ${missing.join(', ')}`,
      severity: 'error',
      autoFixable: true,
    });
  }

  return errors;
}

/** 已知的 lucide-react 图标名（子集，用于快速检测幻觉图标） */
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
  'Terminal', 'Database', 'Server', 'Wifi', 'WifiOff', 'Monitor',
  'Smartphone', 'Camera', 'Play', 'Pause', 'Maximize', 'Minimize', 'Move',
  'Scissors', 'Bold', 'Italic', 'List', 'ListOrdered', 'Type', 'Hash',
  'AtSign', 'Activity', 'Archive', 'Box', 'Columns',
  'Compass', 'Cpu', 'File', 'Folder', 'Gift', 'Grid',
  'Key', 'Map', 'MessageSquare', 'MessageCircle', 'Moon', 'Sun',
  'Feather', 'Flag', 'Lightbulb', 'Pencil', 'Pin', 'Power', 'Rocket',
  'Tool', 'Trash', 'Truck', 'User', 'Video', 'Wrench',
  'FolderKanban', 'CheckSquare', 'Tags', 'ThumbsUp', 'ThumbsDown',
]);

function checkLucideIcons(file: { path: string; content: string }): CompileError[] {
  const errors: CompileError[] = [];
  const lucideImportMatch = file.content.match(/import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/);
  if (!lucideImportMatch) return [];

  const importedIcons = lucideImportMatch[1].split(',').map(s => {
    const trimmed = s.trim();
    // Handle "Icon as Alias" pattern
    return trimmed.split(/\s+as\s+/)[0].trim();
  }).filter(Boolean);

  for (const icon of importedIcons) {
    if (!KNOWN_LUCIDE_ICONS.has(icon)) {
      errors.push({
        file: file.path,
        message: `Lucide icon "${icon}" may not exist. Consider using a verified icon name.`,
        severity: 'warning',
        autoFixable: true,
      });
    }
  }

  return errors;
}

function detectCircularDeps(files: Array<{ path: string; content: string }>): CompileError[] {
  const errors: CompileError[] = [];
  const importGraph = new Map<string, Set<string>>();

  for (const file of files) {
    if (!file.path.match(/\.(tsx?|jsx?)$/)) continue;
    const deps = new Set<string>();
    const importRegex = /from\s+['"](@\/|\.\.?\/)([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(file.content)) !== null) {
      const resolved = resolveImport(file.path, match[1] + match[2]);
      deps.add(resolved);
    }
    importGraph.set(file.path, deps);
  }

  // 简单的双向依赖检测（A→B 且 B→A）
  for (const [fileA, depsA] of importGraph) {
    for (const depPath of depsA) {
      // 尝试匹配文件路径（含扩展名变体）
      const depsB = importGraph.get(depPath) ||
        importGraph.get(depPath + '.ts') ||
        importGraph.get(depPath + '.tsx');

      if (depsB) {
        const normalA = fileA.replace(/\.(tsx?|jsx?)$/, '');
        if ([...depsB].some(d => d === normalA || d === fileA || d + '.ts' === fileA || d + '.tsx' === fileA)) {
          errors.push({
            file: fileA,
            message: `Circular dependency detected: ${fileA} ↔ ${depPath}`,
            severity: 'warning',
            autoFixable: false,
          });
        }
      }
    }
  }

  return errors;
}

function checkRouteCompleteness(files: Array<{ path: string; content: string }>): CompileError[] {
  const errors: CompileError[] = [];
  const appFile = files.find(f => f.path === 'src/App.tsx');
  if (!appFile) return errors;

  const pageFiles = files.filter(f => f.path.match(/^src\/pages\/\w+\.tsx$/));
  for (const page of pageFiles) {
    const nameMatch = page.path.match(/src\/pages\/(\w+)\.tsx$/);
    if (!nameMatch) continue;
    const componentName = nameMatch[1];

    if (!appFile.content.includes(componentName)) {
      errors.push({
        file: 'src/App.tsx',
        message: `Page "${componentName}" exists in src/pages/ but is not imported or routed in App.tsx`,
        severity: 'warning',
        autoFixable: true,
      });
    }
  }

  return errors;
}

function hasJSX(content: string): boolean {
  return /return\s*\([\s\S]*?<[A-Z]/.test(content) ||
    /<[A-Z]\w+[\s\S]*?\/>/.test(content) ||
    /<>|<\/>/.test(content);
}

function resolveImport(fromFile: string, importPath: string): string {
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
