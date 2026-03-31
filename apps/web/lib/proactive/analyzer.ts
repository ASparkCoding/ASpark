/**
 * ASpark Proactive Analyzer
 * 生成完成后主动分析安全漏洞、性能问题、最佳实践并推送建议
 */

import { scanFiles, type SecurityIssue, type SecuritySummary } from '../security/code-classifier';

// ======================== Types ========================

export type AnalysisCategory = 'security' | 'performance' | 'accessibility' | 'best_practice' | 'runtime';

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface ProactiveIssue {
  id: string;
  category: AnalysisCategory;
  severity: IssueSeverity;
  title: string;
  message: string;
  file?: string;
  line?: number;
  suggestion: string;
  /** 是否可以自动修复 */
  autoFixable: boolean;
  /** 自动修复的描述 */
  autoFixDescription?: string;
}

export interface AnalysisResult {
  issues: ProactiveIssue[];
  summary: {
    totalIssues: number;
    bySeverity: Record<IssueSeverity, number>;
    byCategory: Record<AnalysisCategory, number>;
    score: number; // 0-100, 代码健康度评分
  };
  timestamp: number;
  analyzedFiles: number;
}

// ======================== Analysis Rules ========================

interface AnalysisRule {
  id: string;
  category: AnalysisCategory;
  severity: IssueSeverity;
  title: string;
  /** 检查函数: 返回发现的问题 */
  check: (files: Record<string, string>) => ProactiveIssue[];
}

const ANALYSIS_RULES: AnalysisRule[] = [
  // === Performance ===
  {
    id: 'perf-large-component',
    category: 'performance',
    severity: 'medium',
    title: '大型组件未拆分',
    check: (files) => {
      const issues: ProactiveIssue[] = [];
      for (const [filePath, content] of Object.entries(files)) {
        if (!/\.(tsx|jsx)$/.test(filePath)) continue;
        const lines = content.split('\n').length;
        if (lines > 300) {
          issues.push({
            id: `perf-large-${filePath}`,
            category: 'performance',
            severity: 'medium',
            title: '大型组件未拆分',
            message: `${filePath} 有 ${lines} 行，建议拆分为更小的子组件`,
            file: filePath,
            suggestion: '将组件拆分为 3-5 个更小的子组件，每个不超过 100 行',
            autoFixable: false,
          });
        }
      }
      return issues;
    },
  },
  {
    id: 'perf-no-lazy',
    category: 'performance',
    severity: 'low',
    title: '缺少路由级懒加载',
    check: (files) => {
      const issues: ProactiveIssue[] = [];
      const appFile = Object.entries(files).find(([p]) => p.endsWith('App.tsx'));
      if (appFile) {
        const [filePath, content] = appFile;
        const hasRoutes = content.includes('<Route') || content.includes('createBrowserRouter');
        const hasLazy = content.includes('React.lazy') || content.includes('lazy(');
        if (hasRoutes && !hasLazy) {
          issues.push({
            id: 'perf-no-lazy',
            category: 'performance',
            severity: 'low',
            title: '缺少路由级懒加载',
            message: 'App.tsx 中的路由组件未使用懒加载',
            file: filePath,
            suggestion: '使用 React.lazy(() => import("./pages/XxxPage")) 实现按需加载',
            autoFixable: true,
            autoFixDescription: '为所有页面组件添加 React.lazy 懒加载',
          });
        }
      }
      return issues;
    },
  },
  {
    id: 'perf-no-memo',
    category: 'performance',
    severity: 'info',
    title: '列表组件未优化',
    check: (files) => {
      const issues: ProactiveIssue[] = [];
      for (const [filePath, content] of Object.entries(files)) {
        if (!/\.(tsx|jsx)$/.test(filePath)) continue;
        // 检测有 .map() 渲染列表但没有用 memo
        const hasListRender = /\.map\s*\(\s*\(/g.test(content);
        const hasMemo = /React\.memo|useMemo/g.test(content);
        if (hasListRender && !hasMemo && content.split('\n').length > 50) {
          issues.push({
            id: `perf-no-memo-${filePath}`,
            category: 'performance',
            severity: 'info',
            title: '列表渲染未优化',
            message: `${filePath} 包含列表渲染但未使用 React.memo 或 useMemo`,
            file: filePath,
            suggestion: '对列表项组件使用 React.memo 包装以避免不必要的重渲染',
            autoFixable: false,
          });
        }
      }
      return issues;
    },
  },

  // === Accessibility ===
  {
    id: 'a11y-missing-alt',
    category: 'accessibility',
    severity: 'medium',
    title: '图片缺少 alt 属性',
    check: (files) => {
      const issues: ProactiveIssue[] = [];
      for (const [filePath, content] of Object.entries(files)) {
        if (!/\.(tsx|jsx)$/.test(filePath)) continue;
        const imgWithoutAlt = content.match(/<img\s+(?![^>]*alt=)[^>]*>/g);
        if (imgWithoutAlt && imgWithoutAlt.length > 0) {
          issues.push({
            id: `a11y-alt-${filePath}`,
            category: 'accessibility',
            severity: 'medium',
            title: '图片缺少 alt 属性',
            message: `${filePath} 中有 ${imgWithoutAlt.length} 个 <img> 标签缺少 alt 属性`,
            file: filePath,
            suggestion: '为所有 <img> 标签添加描述性的 alt 属性',
            autoFixable: true,
            autoFixDescription: '添加 alt="" 占位属性',
          });
        }
      }
      return issues;
    },
  },
  {
    id: 'a11y-missing-label',
    category: 'accessibility',
    severity: 'medium',
    title: '表单元素缺少标签',
    check: (files) => {
      const issues: ProactiveIssue[] = [];
      for (const [filePath, content] of Object.entries(files)) {
        if (!/\.(tsx|jsx)$/.test(filePath)) continue;
        const inputCount = (content.match(/<(Input|input|textarea|select)\s/g) || []).length;
        const labelCount = (content.match(/<(Label|label)\s/g) || []).length;
        const ariaCount = (content.match(/aria-label/g) || []).length;
        if (inputCount > 0 && (labelCount + ariaCount) < inputCount) {
          issues.push({
            id: `a11y-label-${filePath}`,
            category: 'accessibility',
            severity: 'medium',
            title: '表单元素缺少标签',
            message: `${filePath} 有 ${inputCount} 个输入元素但只有 ${labelCount + ariaCount} 个标签`,
            file: filePath,
            suggestion: '为每个表单元素添加 <Label> 或 aria-label 属性',
            autoFixable: false,
          });
        }
      }
      return issues;
    },
  },

  // === Best Practices ===
  {
    id: 'bp-no-error-boundary',
    category: 'best_practice',
    severity: 'high',
    title: '缺少 ErrorBoundary',
    check: (files) => {
      const hasErrorBoundary = Object.keys(files).some(
        p => p.includes('ErrorBoundary') || Object.values(files).some(c => c.includes('ErrorBoundary'))
      );
      if (!hasErrorBoundary) {
        return [{
          id: 'bp-no-error-boundary',
          category: 'best_practice',
          severity: 'high',
          title: '缺少 ErrorBoundary',
          message: '项目中没有使用 ErrorBoundary 组件，运行时错误会导致白屏',
          suggestion: '在 App.tsx 中包裹 <ErrorBoundary> 组件来优雅处理运行时错误',
          autoFixable: true,
          autoFixDescription: '添加 ErrorBoundary 组件并在 App 中使用',
        }];
      }
      return [];
    },
  },
  {
    id: 'bp-no-loading-state',
    category: 'best_practice',
    severity: 'low',
    title: '缺少加载状态处理',
    check: (files) => {
      const issues: ProactiveIssue[] = [];
      for (const [filePath, content] of Object.entries(files)) {
        if (!/\.(tsx|jsx)$/.test(filePath)) continue;
        const hasFetch = /useEffect[\s\S]*?fetch\(|supabase\.\w+\.\w+\(|\.from\(/g.test(content);
        const hasLoadingState = /loading|isLoading|skeleton|Skeleton|spinner|Spinner/gi.test(content);
        if (hasFetch && !hasLoadingState) {
          issues.push({
            id: `bp-loading-${filePath}`,
            category: 'best_practice',
            severity: 'low',
            title: '缺少加载状态',
            message: `${filePath} 有异步数据获取但没有加载状态处理`,
            file: filePath,
            suggestion: '添加 loading 状态和 Skeleton/Spinner 组件',
            autoFixable: false,
          });
        }
      }
      return issues;
    },
  },
  {
    id: 'bp-no-empty-state',
    category: 'best_practice',
    severity: 'info',
    title: '缺少空状态处理',
    check: (files) => {
      const issues: ProactiveIssue[] = [];
      for (const [filePath, content] of Object.entries(files)) {
        if (!/\.(tsx|jsx)$/.test(filePath)) continue;
        const hasList = /\.map\s*\(\s*\(/.test(content);
        const hasEmptyState = /\.length\s*(===|==|>|!)\s*0|emptyState|EmptyState|no\s+data|暂无/gi.test(content);
        if (hasList && !hasEmptyState) {
          issues.push({
            id: `bp-empty-${filePath}`,
            category: 'best_practice',
            severity: 'info',
            title: '缺少空状态',
            message: `${filePath} 有列表渲染但没有空状态展示`,
            file: filePath,
            suggestion: '当列表为空时显示友好的空状态提示',
            autoFixable: false,
          });
        }
      }
      return issues;
    },
  },
  {
    id: 'bp-console-log',
    category: 'best_practice',
    severity: 'low',
    title: '残留的 console.log',
    check: (files) => {
      const issues: ProactiveIssue[] = [];
      for (const [filePath, content] of Object.entries(files)) {
        if (!/\.(tsx?|jsx?)$/.test(filePath)) continue;
        const matches = content.match(/console\.log\(/g);
        if (matches && matches.length > 2) {
          issues.push({
            id: `bp-console-${filePath}`,
            category: 'best_practice',
            severity: 'low',
            title: '过多 console.log',
            message: `${filePath} 有 ${matches.length} 个 console.log 调用`,
            file: filePath,
            suggestion: '移除调试用的 console.log，生产环境会影响性能',
            autoFixable: true,
            autoFixDescription: '移除所有 console.log 调用',
          });
        }
      }
      return issues;
    },
  },
];

// ======================== Proactive Analyzer ========================

/**
 * 运行完整的主动分析
 */
export function runProactiveAnalysis(files: Record<string, string>): AnalysisResult {
  const allIssues: ProactiveIssue[] = [];

  // 1. 运行自定义规则
  for (const rule of ANALYSIS_RULES) {
    try {
      const issues = rule.check(files);
      allIssues.push(...issues);
    } catch {
      // 单个规则失败不影响其他规则
    }
  }

  // 2. 运行安全扫描
  const { issues: securityIssues } = scanFiles(files);
  for (const issue of securityIssues) {
    allIssues.push({
      id: `sec-${issue.category}-${issue.file}-${issue.line}`,
      category: 'security',
      severity: mapSecurityLevel(issue.level),
      title: issue.message,
      message: `${issue.file}:${issue.line} - ${issue.message}`,
      file: issue.file,
      line: issue.line,
      suggestion: issue.suggestion,
      autoFixable: false,
    });
  }

  // 3. 去重
  const seen = new Set<string>();
  const dedupedIssues = allIssues.filter(issue => {
    if (seen.has(issue.id)) return false;
    seen.add(issue.id);
    return true;
  });

  // 4. 按严重程度排序
  const severityOrder: Record<IssueSeverity, number> = {
    critical: 0, high: 1, medium: 2, low: 3, info: 4,
  };
  dedupedIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // 5. 生成统计
  const bySeverity: Record<IssueSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const byCategory: Record<AnalysisCategory, number> = {
    security: 0, performance: 0, accessibility: 0, best_practice: 0, runtime: 0,
  };

  for (const issue of dedupedIssues) {
    bySeverity[issue.severity]++;
    byCategory[issue.category]++;
  }

  // 6. 计算健康度评分
  const score = calculateHealthScore(bySeverity, Object.keys(files).length);

  return {
    issues: dedupedIssues,
    summary: {
      totalIssues: dedupedIssues.length,
      bySeverity,
      byCategory,
      score,
    },
    timestamp: Date.now(),
    analyzedFiles: Object.keys(files).filter(f => /\.(tsx?|jsx?|sql|html)$/.test(f)).length,
  };
}

/**
 * 格式化分析结果为推送建议
 */
export function formatAnalysisAsSuggestions(
  result: AnalysisResult,
  maxSuggestions: number = 4
): Array<{ label: string; prompt: string }> {
  const suggestions: Array<{ label: string; prompt: string }> = [];

  // 按严重度取前 N 个可修复的问题
  const fixableIssues = result.issues.filter(i => i.autoFixable);
  const highPriorityIssues = result.issues.filter(i =>
    i.severity === 'critical' || i.severity === 'high'
  );

  // 优先推荐自动可修复的
  for (const issue of fixableIssues.slice(0, 2)) {
    suggestions.push({
      label: `修复: ${issue.title}`,
      prompt: issue.autoFixDescription || issue.suggestion,
    });
  }

  // 补充高优先级的
  for (const issue of highPriorityIssues.slice(0, maxSuggestions - suggestions.length)) {
    if (!suggestions.some(s => s.label.includes(issue.title))) {
      suggestions.push({
        label: `改进: ${issue.title}`,
        prompt: issue.suggestion,
      });
    }
  }

  // 补充健康度建议
  if (suggestions.length < maxSuggestions && result.summary.score < 80) {
    suggestions.push({
      label: `优化代码健康度 (${result.summary.score}/100)`,
      prompt: '请帮我优化代码质量，重点关注：' +
        (result.summary.byCategory.security > 0 ? '安全问题、' : '') +
        (result.summary.byCategory.performance > 0 ? '性能优化、' : '') +
        (result.summary.byCategory.accessibility > 0 ? '可访问性、' : '') +
        '最佳实践',
    });
  }

  return suggestions.slice(0, maxSuggestions);
}

// ======================== Helpers ========================

function mapSecurityLevel(level: string): IssueSeverity {
  switch (level) {
    case 'critical': return 'critical';
    case 'danger': return 'high';
    case 'warning': return 'medium';
    default: return 'low';
  }
}

function calculateHealthScore(
  bySeverity: Record<IssueSeverity, number>,
  fileCount: number
): number {
  // 基础分 100，每个问题按严重程度扣分
  const deductions =
    bySeverity.critical * 20 +
    bySeverity.high * 10 +
    bySeverity.medium * 5 +
    bySeverity.low * 2 +
    bySeverity.info * 1;

  // 项目越大，容错越高
  const tolerance = Math.log2(Math.max(fileCount, 1)) * 2;

  return Math.max(0, Math.min(100, 100 - deductions + tolerance));
}
