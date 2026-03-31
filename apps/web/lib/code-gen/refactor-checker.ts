/**
 * 自动代码重构检测器
 * 监控文件大小，当文件过大时建议或强制重构
 */

export interface RefactorSuggestion {
  file: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  lines: number;
}

const MAX_FILE_LINES = 300;     // 超过 300 行触发重构建议
const FORCE_REFACTOR_LINES = 600; // 超过 600 行强制重构

/**
 * 检查项目文件是否需要重构
 */
export function checkNeedsRefactor(
  files: Array<{ path: string; content: string }>
): RefactorSuggestion[] {
  const suggestions: RefactorSuggestion[] = [];

  for (const file of files) {
    // 只检查用户代码，不检查配置和模板文件
    if (!file.path.startsWith('src/')) continue;
    if (file.path.includes('components/ui/')) continue;
    if (file.path.includes('node_modules')) continue;
    if (!file.path.match(/\.(tsx?|jsx?)$/)) continue;

    const lines = file.content.split('\n').length;

    if (lines > FORCE_REFACTOR_LINES) {
      suggestions.push({
        file: file.path,
        reason: `文件过大（${lines} 行，上限 ${MAX_FILE_LINES} 行），需要拆分为多个小组件/模块`,
        priority: 'high',
        lines,
      });
    } else if (lines > MAX_FILE_LINES) {
      suggestions.push({
        file: file.path,
        reason: `文件较大（${lines} 行，建议上限 ${MAX_FILE_LINES} 行），建议拆分`,
        priority: 'medium',
        lines,
      });
    }
  }

  // 按行数降序排列
  suggestions.sort((a, b) => b.lines - a.lines);

  return suggestions;
}

/**
 * 构建重构指令（插入到 iterate prompt 前面）
 */
export function buildRefactorInstruction(suggestions: RefactorSuggestion[]): string {
  if (suggestions.length === 0) return '';

  const highPriority = suggestions.filter(s => s.priority === 'high');

  if (highPriority.length > 0) {
    const fileList = highPriority
      .map(s => `- ${s.file} (${s.lines} lines)`)
      .join('\n');

    return `## ⚠️ REFACTOR REQUIRED FIRST
The following files are too large and MUST be split before implementing the user's request:
${fileList}

Split each file into smaller components/modules (max ${MAX_FILE_LINES} lines each), THEN implement the user's request.
Extract reusable logic into custom hooks, utility functions, or sub-components.

`;
  }

  return '';
}
