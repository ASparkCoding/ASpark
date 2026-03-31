/**
 * ASpark Context Compactor
 * 智能上下文压缩系统 - 4种压缩策略
 *
 * AutoCompact:     监控 token 使用量，到达阈值时自动压缩旧消息
 * MicroCompact:    精细粒度减少 token 而不丢失语义
 * SnipCompact:     保留关键转折点，折叠中间对话
 * ReactiveCompact: 预测未来 token 需求，提前压缩
 */

export interface CompactableMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** 消息的预估 token 数 */
  tokenCount?: number;
  /** 是否包含代码生成结果 */
  hasCodeOutput?: boolean;
  /** 是否是关键转折点 (plan approval, scaffold, error fix) */
  isKeyTurnpoint?: boolean;
  /** 消息时间戳 */
  timestamp?: number;
}

export interface CompactionResult {
  messages: CompactableMessage[];
  strategy: CompactionStrategy;
  tokensBefore: number;
  tokensAfter: number;
  savedTokens: number;
  compactedCount: number;
}

export type CompactionStrategy = 'auto' | 'micro' | 'snip' | 'reactive' | 'none';

export interface CompactorConfig {
  /** 触发自动压缩的 token 阈值 (默认 80000) */
  autoCompactThreshold?: number;
  /** 保留最近 N 轮对话不压缩 (默认 3) */
  preserveRecentTurns?: number;
  /** 最大 token 预算 (默认 128000) */
  maxTokenBudget?: number;
  /** ReactiveCompact 提前压缩的余量比例 (默认 0.2) */
  reactiveBufferRatio?: number;
}

const DEFAULT_CONFIG: Required<CompactorConfig> = {
  autoCompactThreshold: 80000,
  preserveRecentTurns: 3,
  maxTokenBudget: 128000,
  reactiveBufferRatio: 0.2,
};

/**
 * 估算文本的 token 数（粗略：1 token ≈ 4 字符英文 / 2 字符中文）
 */
export function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 2 + otherChars / 4);
}

/**
 * 为每条消息添加 token 估算
 */
function ensureTokenCounts(messages: CompactableMessage[]): CompactableMessage[] {
  return messages.map(m => ({
    ...m,
    tokenCount: m.tokenCount ?? estimateTokens(m.content),
  }));
}

/**
 * 计算消息列表的总 token 数
 */
function totalTokens(messages: CompactableMessage[]): number {
  return messages.reduce((sum, m) => sum + (m.tokenCount || estimateTokens(m.content)), 0);
}

// =======================================================================
//  AutoCompact: 到达阈值时压缩旧消息为摘要
// =======================================================================
export function autoCompact(
  messages: CompactableMessage[],
  config: CompactorConfig = {}
): CompactionResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const tagged = ensureTokenCounts(messages);
  const currentTokens = totalTokens(tagged);

  // 未到阈值，不压缩
  if (currentTokens <= cfg.autoCompactThreshold) {
    return {
      messages: tagged,
      strategy: 'none',
      tokensBefore: currentTokens,
      tokensAfter: currentTokens,
      savedTokens: 0,
      compactedCount: 0,
    };
  }

  // 保留最近 N 轮（一轮 = user + assistant）
  const preserveCount = cfg.preserveRecentTurns * 2;
  const preservedMessages = tagged.slice(-preserveCount);
  const oldMessages = tagged.slice(0, -preserveCount);

  if (oldMessages.length === 0) {
    return {
      messages: tagged,
      strategy: 'none',
      tokensBefore: currentTokens,
      tokensAfter: currentTokens,
      savedTokens: 0,
      compactedCount: 0,
    };
  }

  // 将旧消息压缩为摘要
  const summary = compressToSummary(oldMessages);
  const summaryMessage: CompactableMessage = {
    role: 'system',
    content: `[对话历史摘要]\n${summary}`,
    tokenCount: estimateTokens(summary),
    isKeyTurnpoint: true,
  };

  const result = [summaryMessage, ...preservedMessages];
  const tokensAfter = totalTokens(result);

  return {
    messages: result,
    strategy: 'auto',
    tokensBefore: currentTokens,
    tokensAfter,
    savedTokens: currentTokens - tokensAfter,
    compactedCount: oldMessages.length,
  };
}

// =======================================================================
//  MicroCompact: 精细粒度减少 token (不丢失语义)
// =======================================================================
export function microCompact(
  messages: CompactableMessage[],
  config: CompactorConfig = {}
): CompactionResult {
  const tagged = ensureTokenCounts(messages);
  const tokensBefore = totalTokens(tagged);

  const compacted = tagged.map(msg => {
    if (msg.role === 'system') return msg; // 不压缩系统消息

    let content = msg.content;

    // 1. 移除连续空行 -> 单空行
    content = content.replace(/\n{3,}/g, '\n\n');

    // 2. 移除代码块中的纯注释行（保留功能性注释）
    content = content.replace(
      /(```\w*\n)([\s\S]*?)(```)/g,
      (_, open, code, close) => {
        const cleanedCode = code
          .split('\n')
          .filter((line: string) => {
            const trimmed = line.trim();
            // 保留空行和代码行，只移除纯注释行
            if (trimmed === '') return true;
            if (trimmed.startsWith('//') && !trimmed.includes('TODO') && !trimmed.includes('FIXME')) {
              return false;
            }
            return true;
          })
          .join('\n');
        return `${open}${cleanedCode}${close}`;
      }
    );

    // 3. 压缩重复的错误消息
    content = content.replace(
      /(Error:.*?\n)(\1{2,})/g,
      (_, firstLine) => `${firstLine}[上述错误重复多次]\n`
    );

    // 4. 截断超长的堆栈跟踪
    content = content.replace(
      /(at\s+\S+\s+\([^)]+\)\n){5,}/g,
      (match) => {
        const lines = match.trim().split('\n');
        return lines.slice(0, 3).join('\n') + `\n  ... (${lines.length - 3} more frames)\n`;
      }
    );

    // 5. 压缩重复的文件内容列表
    content = content.replace(
      /(<file path="[^"]*">[\s\S]*?<\/file>\s*){2,}/g,
      (match) => {
        const fileCount = (match.match(/<file path="/g) || []).length;
        const firstFile = match.match(/<file path="([^"]*)">/)?.[1] || '';
        if (fileCount > 5) {
          const firstTwo = match.match(/(<file path="[^"]*">[\s\S]*?<\/file>)/g)?.slice(0, 2).join('\n') || '';
          return `${firstTwo}\n[... 还有 ${fileCount - 2} 个文件]\n`;
        }
        return match;
      }
    );

    return {
      ...msg,
      content,
      tokenCount: estimateTokens(content),
    };
  });

  const tokensAfter = totalTokens(compacted);

  return {
    messages: compacted,
    strategy: 'micro',
    tokensBefore,
    tokensAfter,
    savedTokens: tokensBefore - tokensAfter,
    compactedCount: compacted.filter((m, i) => m.content !== tagged[i].content).length,
  };
}

// =======================================================================
//  SnipCompact: 保留关键转折点，折叠中间对话
// =======================================================================
export function snipCompact(
  messages: CompactableMessage[],
  config: CompactorConfig = {}
): CompactionResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const tagged = ensureTokenCounts(messages);
  const tokensBefore = totalTokens(tagged);

  // 识别关键转折点
  const keyTurnpoints = identifyKeyTurnpoints(tagged);

  // 保留最近 N 轮
  const preserveCount = cfg.preserveRecentTurns * 2;
  const recentStartIndex = Math.max(0, tagged.length - preserveCount);

  const result: CompactableMessage[] = [];
  let lastIncludedIndex = -1;
  let snippedCount = 0;

  for (let i = 0; i < tagged.length; i++) {
    const isRecent = i >= recentStartIndex;
    const isKeypoint = keyTurnpoints.has(i);

    if (isRecent || isKeypoint) {
      // 如果跳过了消息，插入折叠标记
      if (i - lastIncludedIndex > 1 && lastIncludedIndex >= 0) {
        const skippedCount = i - lastIncludedIndex - 1;
        snippedCount += skippedCount;
        result.push({
          role: 'system',
          content: `[... 折叠了 ${skippedCount} 条对话消息 ...]`,
          tokenCount: 10,
        });
      }
      result.push(tagged[i]);
      lastIncludedIndex = i;
    }
  }

  const tokensAfter = totalTokens(result);

  return {
    messages: result,
    strategy: 'snip',
    tokensBefore,
    tokensAfter,
    savedTokens: tokensBefore - tokensAfter,
    compactedCount: snippedCount,
  };
}

// =======================================================================
//  ReactiveCompact: 预测未来 token 需求，提前压缩
// =======================================================================
export function reactiveCompact(
  messages: CompactableMessage[],
  estimatedOutputTokens: number,
  config: CompactorConfig = {}
): CompactionResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const tagged = ensureTokenCounts(messages);
  const currentTokens = totalTokens(tagged);

  // 预测总 token 需求 = 当前 + 预估输出 + 缓冲
  const predictedTotal = currentTokens + estimatedOutputTokens;
  const budgetWithBuffer = cfg.maxTokenBudget * (1 - cfg.reactiveBufferRatio);

  // 如果预测不会超限，不压缩
  if (predictedTotal <= budgetWithBuffer) {
    return {
      messages: tagged,
      strategy: 'none',
      tokensBefore: currentTokens,
      tokensAfter: currentTokens,
      savedTokens: 0,
      compactedCount: 0,
    };
  }

  // 需要释放的 token 数
  const tokensToFree = predictedTotal - budgetWithBuffer;

  // 依次应用策略直到释放足够空间
  // Step 1: 先做 MicroCompact (无损)
  let result = microCompact(tagged, config);
  if (result.savedTokens >= tokensToFree) {
    return { ...result, strategy: 'reactive' };
  }

  // Step 2: 再做 SnipCompact (保留关键点)
  result = snipCompact(result.messages, config);
  if (totalTokens(tagged) - totalTokens(result.messages) >= tokensToFree) {
    return {
      ...result,
      strategy: 'reactive',
      tokensBefore: currentTokens,
    };
  }

  // Step 3: 最后做 AutoCompact (摘要化)
  result = autoCompact(result.messages, config);
  return {
    ...result,
    strategy: 'reactive',
    tokensBefore: currentTokens,
  };
}

// =======================================================================
//  智能选择最优压缩策略
// =======================================================================
export function selectAndCompact(
  messages: CompactableMessage[],
  options: {
    estimatedOutputTokens?: number;
    config?: CompactorConfig;
  } = {}
): CompactionResult {
  const config = { ...DEFAULT_CONFIG, ...options.config };
  const tagged = ensureTokenCounts(messages);
  const currentTokens = totalTokens(tagged);

  // 如果有预估输出需求，优先使用 ReactiveCompact
  if (options.estimatedOutputTokens) {
    return reactiveCompact(tagged, options.estimatedOutputTokens, config);
  }

  // 超过阈值 80%，使用 AutoCompact
  if (currentTokens > config.autoCompactThreshold) {
    return autoCompact(tagged, config);
  }

  // 超过阈值 60%，使用 MicroCompact
  if (currentTokens > config.autoCompactThreshold * 0.6) {
    return microCompact(tagged, config);
  }

  // 不需要压缩
  return {
    messages: tagged,
    strategy: 'none',
    tokensBefore: currentTokens,
    tokensAfter: currentTokens,
    savedTokens: 0,
    compactedCount: 0,
  };
}

// =======================================================================
//  辅助函数
// =======================================================================

/**
 * 识别对话中的关键转折点
 */
function identifyKeyTurnpoints(messages: CompactableMessage[]): Set<number> {
  const turnpoints = new Set<number>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // 显式标记的转折点
    if (msg.isKeyTurnpoint) {
      turnpoints.add(i);
      continue;
    }

    const content = msg.content.toLowerCase();

    // Plan 相关
    if (content.includes('plan') && (content.includes('approve') || content.includes('批准'))) {
      turnpoints.add(i);
      continue;
    }

    // 首次 scaffold 生成
    if (msg.hasCodeOutput && msg.role === 'assistant') {
      turnpoints.add(i);
      continue;
    }

    // 错误修复成功
    if (content.includes('fix') && content.includes('success')) {
      turnpoints.add(i);
      continue;
    }

    // 用户提出重大变更
    if (msg.role === 'user' && (
      content.includes('重构') || content.includes('refactor') ||
      content.includes('redesign') || content.includes('重新设计') ||
      content.includes('添加') || content.includes('add new')
    )) {
      turnpoints.add(i);
    }
  }

  // 始终保留第一条消息（原始需求）
  if (messages.length > 0) {
    turnpoints.add(0);
  }

  return turnpoints;
}

/**
 * 将消息列表压缩为结构化摘要
 */
function compressToSummary(messages: CompactableMessage[]): string {
  const parts: string[] = [];
  let userRequestCount = 0;
  let codeGenCount = 0;
  let errorFixCount = 0;

  for (const msg of messages) {
    if (msg.role === 'user') {
      userRequestCount++;
      // 提取用户请求的要点（取前100字符）
      const brief = msg.content.slice(0, 100).replace(/\n/g, ' ');
      parts.push(`用户请求${userRequestCount}: ${brief}${msg.content.length > 100 ? '...' : ''}`);
    } else if (msg.role === 'assistant' && msg.hasCodeOutput) {
      codeGenCount++;
    }

    if (msg.content.toLowerCase().includes('error') || msg.content.toLowerCase().includes('fix')) {
      errorFixCount++;
    }
  }

  let summary = `对话历史包含 ${messages.length} 条消息。`;
  summary += `\n用户发起了 ${userRequestCount} 次请求，AI 生成了 ${codeGenCount} 次代码。`;
  if (errorFixCount > 0) {
    summary += `\n修复了 ${errorFixCount} 个错误。`;
  }
  summary += '\n\n主要交互:';
  for (const part of parts.slice(0, 10)) {
    summary += `\n- ${part}`;
  }
  if (parts.length > 10) {
    summary += `\n- ... (还有 ${parts.length - 10} 次交互)`;
  }

  return summary;
}
