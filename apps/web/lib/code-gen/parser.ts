export interface ParsedFile {
  path: string;
  content: string;
}

/**
 * 解析 LLM 完整输出中的文件块
 */
export function parseGeneratedCode(raw: string): ParsedFile[] {
  const files: ParsedFile[] = [];

  // 方案一：解析 XML <file path="...">...</file> 格式
  const fileRegex = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g;
  let match: RegExpExecArray | null;

  while ((match = fileRegex.exec(raw)) !== null) {
    files.push({
      path: normalizePath(match[1].trim()),
      content: match[2].trim(),
    });
  }

  // 如果 XML 格式匹配到文件，直接返回
  if (files.length > 0) return deduplicateFiles(files);

  // 方案二（兜底）：解析 Markdown 代码块格式
  return deduplicateFiles(parseFallbackMarkdown(raw));
}

/**
 * 流式解析：从不断累积的文本中提取已完成的文件块
 * 返回已解析的文件和剩余未解析的文本
 */
export function parseStreamingCode(accumulated: string): {
  completedFiles: ParsedFile[];
  pendingFile: { path: string; partialContent: string } | null;
  hasMore: boolean;
} {
  const completedFiles: ParsedFile[] = [];
  let pendingFile: { path: string; partialContent: string } | null = null;

  // 查找所有已完成的 <file>...</file> 块
  const fileRegex = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g;
  let match: RegExpExecArray | null;
  let lastMatchEnd = 0;

  while ((match = fileRegex.exec(accumulated)) !== null) {
    completedFiles.push({
      path: normalizePath(match[1].trim()),
      content: match[2].trim(),
    });
    lastMatchEnd = match.index + match[0].length;
  }

  // 检查是否有正在输出中的 <file> 块（已打开但未关闭）
  const remaining = accumulated.slice(lastMatchEnd);
  const openTagMatch = remaining.match(/<file\s+path="([^"]+)">([\s\S]*)$/);
  if (openTagMatch) {
    pendingFile = {
      path: normalizePath(openTagMatch[1].trim()),
      partialContent: openTagMatch[2],
    };
  }

  // 判断是否还可能有更多文件
  const hasMore = !!pendingFile || remaining.includes('<file');

  return { completedFiles, pendingFile, hasMore };
}

/**
 * 兜底解析：提取 Markdown 代码块格式
 */
function parseFallbackMarkdown(raw: string): ParsedFile[] {
  const files: ParsedFile[] = [];

  // 匹配多种格式：
  // ```typescript:app/page.tsx  (语言:路径)
  // ```app/page.tsx              (直接路径)
  // ```tsx app/page.tsx          (语言 路径)
  const patterns = [
    /```(?:\w+):([^\n`]+\.(?:tsx?|jsx?|css|json|sql|md|mjs|cjs))\n([\s\S]*?)```/g,
    /```(?:\w+)?\s+([^\n`]+\.(?:tsx?|jsx?|css|json|sql|md|mjs|cjs))\n([\s\S]*?)```/g,
    /```([^\n`]+\.(?:tsx?|jsx?|css|json|sql|md|mjs|cjs))\n([\s\S]*?)```/g,
  ];

  const seen = new Set<string>();

  for (const regex of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(raw)) !== null) {
      const path = normalizePath(match[1].trim());
      const content = match[2].trim();
      if (path && content && !seen.has(path)) {
        seen.add(path);
        files.push({ path, content });
      }
    }
  }

  return files;
}

/**
 * 去重：如果同一路径出现多次，保留最后一个版本
 */
function deduplicateFiles(files: ParsedFile[]): ParsedFile[] {
  const map = new Map<string, ParsedFile>();
  for (const file of files) {
    map.set(file.path, file);
  }
  return Array.from(map.values());
}

/**
 * 规范化文件路径
 */
function normalizePath(path: string): string {
  // 移除前导 ./  或 /
  let normalized = path.replace(/^\.\//, '').replace(/^\//, '');
  // 统一使用 / 分隔符
  normalized = normalized.replace(/\\/g, '/');
  return normalized;
}
