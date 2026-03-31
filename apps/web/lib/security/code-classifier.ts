/**
 * ASpark Security Code Classifier
 * 对生成的代码进行安全分类，标记危险操作
 */

export type SecurityLevel = 'safe' | 'warning' | 'danger' | 'critical';

export interface SecurityIssue {
  level: SecurityLevel;
  category: SecurityCategory;
  file: string;
  line?: number;
  code: string;
  message: string;
  suggestion: string;
}

export type SecurityCategory =
  | 'sql_injection'
  | 'xss'
  | 'data_deletion'
  | 'sensitive_data_exposure'
  | 'insecure_auth'
  | 'external_api_call'
  | 'file_system_access'
  | 'eval_usage'
  | 'hardcoded_secrets'
  | 'insecure_dependency'
  | 'dangerous_html'
  | 'cors_misconfiguration'
  | 'unvalidated_redirect';

interface SecurityRule {
  pattern: RegExp;
  category: SecurityCategory;
  level: SecurityLevel;
  message: string;
  suggestion: string;
  /** 如果提供，匹配到这些模式时排除（误报抑制） */
  excludePatterns?: RegExp[];
}

/** 安全规则集 */
const SECURITY_RULES: SecurityRule[] = [
  // === Critical ===
  {
    pattern: /eval\s*\(/g,
    category: 'eval_usage',
    level: 'critical',
    message: '使用了 eval()，可能导致代码注入',
    suggestion: '使用 JSON.parse() 或其他安全的替代方案',
  },
  {
    pattern: /new\s+Function\s*\(/g,
    category: 'eval_usage',
    level: 'critical',
    message: '使用了 new Function()，等同于 eval',
    suggestion: '避免动态创建函数，使用预定义的函数映射',
  },
  {
    pattern: /(SUPABASE_SERVICE_ROLE_KEY|SECRET_KEY|PRIVATE_KEY|PASSWORD)\s*[:=]\s*['"][^'"]+['"]/g,
    category: 'hardcoded_secrets',
    level: 'critical',
    message: '检测到硬编码的密钥或密码',
    suggestion: '将密钥移至环境变量 (.env)，不要提交到代码中',
  },

  // === Danger ===
  {
    pattern: /DELETE\s+FROM\s+\w+(?!\s+WHERE)/gi,
    category: 'data_deletion',
    level: 'danger',
    message: '检测到无 WHERE 条件的 DELETE 语句，将删除所有数据',
    suggestion: '添加 WHERE 条件限制删除范围，或使用软删除 (is_deleted 标志)',
  },
  {
    pattern: /DROP\s+(TABLE|DATABASE|INDEX|SCHEMA)/gi,
    category: 'data_deletion',
    level: 'danger',
    message: '检测到 DROP 操作，将永久删除数据库对象',
    suggestion: '确认此操作是否必要，考虑使用迁移脚本管理数据库变更',
  },
  {
    pattern: /TRUNCATE\s+TABLE/gi,
    category: 'data_deletion',
    level: 'danger',
    message: '检测到 TRUNCATE 操作，将清空整个表',
    suggestion: '使用带条件的 DELETE 或软删除方案',
  },
  {
    pattern: /dangerouslySetInnerHTML/g,
    category: 'xss',
    level: 'danger',
    message: '使用了 dangerouslySetInnerHTML，可能导致 XSS 攻击',
    suggestion: '使用 DOMPurify 净化 HTML，或使用 React 的安全渲染方式',
    excludePatterns: [/DOMPurify/],
  },
  {
    pattern: /innerHTML\s*=/g,
    category: 'xss',
    level: 'danger',
    message: '直接操作 innerHTML，可能导致 XSS 攻击',
    suggestion: '使用 textContent 或 React 组件安全渲染',
  },

  // === Warning ===
  {
    pattern: /fetch\s*\(\s*['"`]https?:\/\/(?!localhost)/g,
    category: 'external_api_call',
    level: 'warning',
    message: '检测到外部 API 调用',
    suggestion: '确保 API 调用安全，使用 HTTPS，验证响应数据',
  },
  {
    pattern: /process\.env\.\w+/g,
    category: 'sensitive_data_exposure',
    level: 'warning',
    message: '直接访问环境变量',
    suggestion: '确保不在前端代码中暴露服务端环境变量，仅使用 VITE_ 或 NEXT_PUBLIC_ 前缀的变量',
    excludePatterns: [/VITE_/, /NEXT_PUBLIC_/],
  },
  {
    pattern: /cors\s*:\s*\{\s*origin\s*:\s*['"`]\*['"`]/g,
    category: 'cors_misconfiguration',
    level: 'warning',
    message: 'CORS 配置允许所有来源',
    suggestion: '限制 CORS origin 为可信域名',
  },
  {
    pattern: /fs\.(readFile|writeFile|unlink|rmdir|rm|readdir)\s*\(/g,
    category: 'file_system_access',
    level: 'warning',
    message: '检测到文件系统操作',
    suggestion: '确保路径经过消毒处理，防止路径遍历攻击',
  },
  {
    pattern: /window\.location\s*=\s*[^'"]*\+/g,
    category: 'unvalidated_redirect',
    level: 'warning',
    message: '检测到动态重定向，可能导致开放重定向漏洞',
    suggestion: '使用白名单验证重定向目标',
  },
  {
    pattern: /localStorage\.setItem\s*\(\s*['"`](token|jwt|session|auth|key|secret)/gi,
    category: 'insecure_auth',
    level: 'warning',
    message: '将敏感认证数据存储在 localStorage 中',
    suggestion: '使用 httpOnly cookie 存储认证令牌，localStorage 容易受到 XSS 攻击',
  },
  {
    pattern: /\$\{[^}]*\}\s*(?:FROM|WHERE|AND|OR|INSERT|UPDATE|SET|VALUES)/gi,
    category: 'sql_injection',
    level: 'warning',
    message: '可能存在 SQL 注入风险：在 SQL 语句中使用了字符串插值',
    suggestion: '使用参数化查询 ($1, $2) 代替字符串拼接',
    excludePatterns: [/\.rpc\(/, /supabase/],
  },
];

/**
 * 扫描单个文件的安全问题
 */
export function scanFile(filePath: string, content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const lines = content.split('\n');

  for (const rule of SECURITY_RULES) {
    // 重置正则的 lastIndex
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = rule.pattern.exec(content)) !== null) {
      // 检查排除模式
      if (rule.excludePatterns) {
        const contextStart = Math.max(0, match.index - 200);
        const contextEnd = Math.min(content.length, match.index + match[0].length + 200);
        const context = content.slice(contextStart, contextEnd);
        if (rule.excludePatterns.some(p => p.test(context))) {
          continue;
        }
      }

      // 计算行号
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;

      issues.push({
        level: rule.level,
        category: rule.category,
        file: filePath,
        line: lineNumber,
        code: lines[lineNumber - 1]?.trim() || match[0],
        message: rule.message,
        suggestion: rule.suggestion,
      });
    }
  }

  return issues;
}

/**
 * 批量扫描多个文件
 */
export function scanFiles(
  files: Record<string, string>
): { issues: SecurityIssue[]; summary: SecuritySummary } {
  const allIssues: SecurityIssue[] = [];

  for (const [filePath, content] of Object.entries(files)) {
    // 只扫描代码文件
    if (!/\.(tsx?|jsx?|sql|html|vue|svelte)$/.test(filePath)) continue;
    allIssues.push(...scanFile(filePath, content));
  }

  // 按严重程度排序
  const levelOrder: Record<SecurityLevel, number> = {
    critical: 0, danger: 1, warning: 2, safe: 3,
  };
  allIssues.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);

  return {
    issues: allIssues,
    summary: generateSummary(allIssues),
  };
}

export interface SecuritySummary {
  totalIssues: number;
  critical: number;
  danger: number;
  warning: number;
  overallLevel: SecurityLevel;
  topCategories: { category: SecurityCategory; count: number }[];
  passedCheck: boolean;
}

function generateSummary(issues: SecurityIssue[]): SecuritySummary {
  const critical = issues.filter(i => i.level === 'critical').length;
  const danger = issues.filter(i => i.level === 'danger').length;
  const warning = issues.filter(i => i.level === 'warning').length;

  // 按类别统计
  const categoryCount: Record<string, number> = {};
  for (const issue of issues) {
    categoryCount[issue.category] = (categoryCount[issue.category] || 0) + 1;
  }
  const topCategories = Object.entries(categoryCount)
    .map(([category, count]) => ({ category: category as SecurityCategory, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const overallLevel: SecurityLevel =
    critical > 0 ? 'critical' :
    danger > 0 ? 'danger' :
    warning > 0 ? 'warning' : 'safe';

  return {
    totalIssues: issues.length,
    critical,
    danger,
    warning,
    overallLevel,
    topCategories,
    passedCheck: critical === 0 && danger === 0,
  };
}

/**
 * 格式化安全报告（用于 ChatPanel 展示）
 */
export function formatSecurityReport(summary: SecuritySummary, issues: SecurityIssue[]): string {
  if (summary.passedCheck && summary.warning === 0) {
    return '安全检查通过，未发现问题。';
  }

  const parts: string[] = [];

  if (summary.critical > 0) {
    parts.push(`严重问题: ${summary.critical} 个`);
  }
  if (summary.danger > 0) {
    parts.push(`危险问题: ${summary.danger} 个`);
  }
  if (summary.warning > 0) {
    parts.push(`警告: ${summary.warning} 个`);
  }

  let report = `安全扫描: ${parts.join(' | ')}\n\n`;

  // 只展示 critical 和 danger
  const highPriority = issues.filter(i => i.level === 'critical' || i.level === 'danger');
  for (const issue of highPriority.slice(0, 10)) {
    const levelIcon = issue.level === 'critical' ? '[CRITICAL]' : '[DANGER]';
    report += `${levelIcon} ${issue.file}:${issue.line}\n`;
    report += `  ${issue.message}\n`;
    report += `  建议: ${issue.suggestion}\n\n`;
  }

  return report;
}
