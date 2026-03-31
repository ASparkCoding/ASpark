/**
 * ASpark Error Classifier & Recovery Strategy
 * 精细错误分类 + 差异化恢复策略
 */

export enum ErrorCategory {
  /** 可重试: 429限速、瞬时网络错误、502/503 */
  RETRYABLE = 'retryable',
  /** 认证错误: Token 无效/过期 */
  AUTH = 'auth',
  /** 输入错误: 请求格式错误、schema 违规 */
  INPUT = 'input',
  /** 过载: 上下文窗口满、token 超限 */
  OVERLOAD = 'overload',
  /** 模型错误: 模型内部错误、输出不完整 */
  MODEL_ERROR = 'model_error',
  /** 工具错误: 工具调用失败 */
  TOOL_ERROR = 'tool_error',
  /** 网络错误: DNS解析、连接超时、网络不可达 */
  NETWORK = 'network',
  /** 未知错误 */
  UNKNOWN = 'unknown',
}

export interface ClassifiedError {
  category: ErrorCategory;
  originalError: unknown;
  message: string;
  statusCode?: number;
  retryable: boolean;
  /** 建议的恢复策略 */
  recoveryStrategy: RecoveryStrategy;
  /** 建议的等待时间 (ms) */
  suggestedDelayMs: number;
  /** 是否应该切换模型 */
  shouldSwitchModel: boolean;
}

export type RecoveryStrategy =
  | 'retry_with_backoff'       // 带退避的重试
  | 'switch_model'             // 切换到备选模型
  | 'compact_context'          // 压缩上下文后重试
  | 'refresh_auth'             // 刷新认证后重试
  | 'reformat_input'           // 重新格式化请求
  | 'reduce_output_tokens'     // 减少输出 token 限制
  | 'abort'                    // 终止，通知用户
  | 'degrade_gracefully';      // 降级处理

/** 错误分类器 */
export function classifyError(error: unknown): ClassifiedError {
  const err = normalizeError(error);
  const statusCode = extractStatusCode(err);
  const message = extractMessage(err);

  // 1. 认证错误 (401, 403)
  if (statusCode === 401 || statusCode === 403 || isAuthError(message)) {
    return {
      category: ErrorCategory.AUTH,
      originalError: error,
      message: `认证失败: ${message}`,
      statusCode,
      retryable: false,
      recoveryStrategy: 'refresh_auth',
      suggestedDelayMs: 0,
      shouldSwitchModel: false,
    };
  }

  // 2. 限速 (429)
  if (statusCode === 429 || isRateLimitError(message)) {
    const retryAfter = extractRetryAfter(err);
    return {
      category: ErrorCategory.RETRYABLE,
      originalError: error,
      message: `请求限速: ${message}`,
      statusCode: 429,
      retryable: true,
      recoveryStrategy: 'switch_model', // 限速时直接切换模型更快
      suggestedDelayMs: retryAfter || 2000,
      shouldSwitchModel: true,
    };
  }

  // 3. 上下文过载 (400 with context_length / token limit)
  if (isContextOverloadError(message, statusCode)) {
    return {
      category: ErrorCategory.OVERLOAD,
      originalError: error,
      message: `上下文过载: ${message}`,
      statusCode,
      retryable: true,
      recoveryStrategy: 'compact_context',
      suggestedDelayMs: 0,
      shouldSwitchModel: false,
    };
  }

  // 4. 输入格式错误 (400)
  if (statusCode === 400 && !isContextOverloadError(message, statusCode)) {
    return {
      category: ErrorCategory.INPUT,
      originalError: error,
      message: `请求格式错误: ${message}`,
      statusCode: 400,
      retryable: false,
      recoveryStrategy: 'reformat_input',
      suggestedDelayMs: 0,
      shouldSwitchModel: false,
    };
  }

  // 5. 服务端错误 (500, 502, 503)
  if (statusCode && statusCode >= 500) {
    return {
      category: ErrorCategory.RETRYABLE,
      originalError: error,
      message: `服务端错误: ${message}`,
      statusCode,
      retryable: true,
      recoveryStrategy: statusCode === 503 ? 'switch_model' : 'retry_with_backoff',
      suggestedDelayMs: statusCode === 503 ? 1000 : 500,
      shouldSwitchModel: statusCode === 503,
    };
  }

  // 6. 网络错误
  if (isNetworkError(message)) {
    return {
      category: ErrorCategory.NETWORK,
      originalError: error,
      message: `网络错误: ${message}`,
      retryable: true,
      recoveryStrategy: 'retry_with_backoff',
      suggestedDelayMs: 1000,
      shouldSwitchModel: false,
    };
  }

  // 7. 模型输出错误（JSON 解析失败、输出截断等）
  if (isModelOutputError(message)) {
    return {
      category: ErrorCategory.MODEL_ERROR,
      originalError: error,
      message: `模型输出错误: ${message}`,
      retryable: true,
      recoveryStrategy: 'reduce_output_tokens',
      suggestedDelayMs: 200,
      shouldSwitchModel: false,
    };
  }

  // 8. 未知错误
  return {
    category: ErrorCategory.UNKNOWN,
    originalError: error,
    message: `未知错误: ${message}`,
    retryable: false,
    recoveryStrategy: 'abort',
    suggestedDelayMs: 0,
    shouldSwitchModel: false,
  };
}

// ======================== 辅助函数 ========================

function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, ...(error as any) };
  }
  if (typeof error === 'object' && error !== null) {
    return error as Record<string, unknown>;
  }
  return { message: String(error) };
}

function extractStatusCode(err: Record<string, unknown>): number | undefined {
  return (
    (err.status as number) ||
    (err.statusCode as number) ||
    ((err.response as any)?.status as number) ||
    undefined
  );
}

function extractMessage(err: Record<string, unknown>): string {
  return (
    (err.message as string) ||
    ((err.error as any)?.message as string) ||
    JSON.stringify(err).slice(0, 200)
  );
}

function extractRetryAfter(err: Record<string, unknown>): number | undefined {
  const headers = (err.headers || (err.response as any)?.headers) as any;
  if (headers?.['retry-after']) {
    const val = Number(headers['retry-after']);
    return isNaN(val) ? undefined : val * 1000;
  }
  return undefined;
}

function isAuthError(message: string): boolean {
  const patterns = [
    /invalid.*api.*key/i,
    /unauthorized/i,
    /authentication.*fail/i,
    /invalid.*token/i,
    /expired.*token/i,
    /forbidden/i,
  ];
  return patterns.some(p => p.test(message));
}

function isRateLimitError(message: string): boolean {
  const patterns = [
    /rate.*limit/i,
    /too.*many.*requests/i,
    /quota.*exceeded/i,
    /throttl/i,
  ];
  return patterns.some(p => p.test(message));
}

function isContextOverloadError(message: string, statusCode?: number): boolean {
  const patterns = [
    /context.*length/i,
    /token.*limit/i,
    /maximum.*context/i,
    /too.*long/i,
    /max.*tokens/i,
    /input.*too.*large/i,
    /content.*too.*large/i,
  ];
  return patterns.some(p => p.test(message));
}

function isNetworkError(message: string): boolean {
  const patterns = [
    /ECONNREFUSED/i,
    /ENOTFOUND/i,
    /ETIMEDOUT/i,
    /ECONNRESET/i,
    /network/i,
    /DNS/i,
    /socket.*hang.*up/i,
    /fetch.*fail/i,
  ];
  return patterns.some(p => p.test(message));
}

function isModelOutputError(message: string): boolean {
  const patterns = [
    /JSON.*parse/i,
    /unexpected.*end/i,
    /truncat/i,
    /incomplete/i,
    /malformed/i,
  ];
  return patterns.some(p => p.test(message));
}
