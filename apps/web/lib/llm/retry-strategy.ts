/**
 * ASpark Retry Strategy
 * 智能重试引擎，根据错误分类执行差异化恢复
 */

import { classifyError, type ClassifiedError, ErrorCategory } from './error-classifier';

export interface RetryOptions {
  /** 最大重试次数 */
  maxRetries?: number;
  /** 初始延迟 (ms) */
  initialDelayMs?: number;
  /** 最大延迟 (ms) */
  maxDelayMs?: number;
  /** 退避倍数 */
  backoffMultiplier?: number;
  /** 模型 fallback 链 */
  modelFallbackChain?: string[];
  /** 当前模型索引 */
  currentModelIndex?: number;
  /** 上下文压缩回调 */
  onCompactContext?: () => Promise<void>;
  /** 刷新认证回调 */
  onRefreshAuth?: () => Promise<void>;
  /** 模型切换回调 */
  onSwitchModel?: (model: string) => void;
  /** 重试事件回调 */
  onRetry?: (attempt: number, error: ClassifiedError, delay: number) => void;
  /** 减少输出 token 回调 */
  onReduceOutputTokens?: () => void;
}

interface RetryState {
  attempt: number;
  currentModelIndex: number;
  contextCompacted: boolean;
  outputReduced: boolean;
}

/**
 * 带智能恢复的重试执行器
 * 根据错误类型自动选择恢复策略
 */
export async function executeWithSmartRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 200,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    modelFallbackChain = [],
    currentModelIndex = 0,
    onCompactContext,
    onRefreshAuth,
    onSwitchModel,
    onRetry,
    onReduceOutputTokens,
  } = options;

  const state: RetryState = {
    attempt: 0,
    currentModelIndex,
    contextCompacted: false,
    outputReduced: false,
  };

  let lastError: ClassifiedError | null = null;

  while (state.attempt <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      const classified = classifyError(error);
      lastError = classified;
      state.attempt++;

      // 如果不可重试或超过最大重试次数，直接抛出
      if (!classified.retryable || state.attempt > maxRetries) {
        throw new EnhancedError(classified);
      }

      // 根据恢复策略执行不同的操作
      const delay = await executeRecovery(classified, state, {
        initialDelayMs,
        maxDelayMs,
        backoffMultiplier,
        modelFallbackChain,
        onCompactContext,
        onRefreshAuth,
        onSwitchModel,
        onReduceOutputTokens,
      });

      // 触发回调
      onRetry?.(state.attempt, classified, delay);

      // 等待后重试
      if (delay > 0) {
        await sleep(delay);
      }
    }
  }

  // 理论上不会到这里，但作为安全保障
  throw new EnhancedError(lastError!);
}

/**
 * 执行恢复策略，返回建议的等待时间
 */
async function executeRecovery(
  error: ClassifiedError,
  state: RetryState,
  options: {
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    modelFallbackChain: string[];
    onCompactContext?: () => Promise<void>;
    onRefreshAuth?: () => Promise<void>;
    onSwitchModel?: (model: string) => void;
    onReduceOutputTokens?: () => void;
  }
): Promise<number> {
  switch (error.recoveryStrategy) {
    case 'retry_with_backoff': {
      // 带抖动的指数退避
      return calculateBackoffWithJitter(
        state.attempt,
        options.initialDelayMs,
        options.maxDelayMs,
        options.backoffMultiplier
      );
    }

    case 'switch_model': {
      // 切换到 fallback chain 中的下一个模型
      if (options.modelFallbackChain.length > 0) {
        state.currentModelIndex = Math.min(
          state.currentModelIndex + 1,
          options.modelFallbackChain.length - 1
        );
        const nextModel = options.modelFallbackChain[state.currentModelIndex];
        options.onSwitchModel?.(nextModel);
      }
      return error.suggestedDelayMs;
    }

    case 'compact_context': {
      // 压缩上下文（只做一次）
      if (!state.contextCompacted && options.onCompactContext) {
        await options.onCompactContext();
        state.contextCompacted = true;
      }
      return 0;
    }

    case 'refresh_auth': {
      if (options.onRefreshAuth) {
        await options.onRefreshAuth();
      }
      return 500;
    }

    case 'reduce_output_tokens': {
      if (!state.outputReduced && options.onReduceOutputTokens) {
        options.onReduceOutputTokens();
        state.outputReduced = true;
      }
      return 200;
    }

    case 'reformat_input':
      return 0;

    case 'degrade_gracefully':
      return 500;

    case 'abort':
    default:
      return 0;
  }
}

/**
 * 带抖动的指数退避计算
 * 防止多个客户端同时重试导致的"惊群效应"
 */
function calculateBackoffWithJitter(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  multiplier: number
): number {
  // 基础指数退避
  const baseDelay = initialDelay * Math.pow(multiplier, attempt - 1);
  // 限制最大延迟
  const cappedDelay = Math.min(baseDelay, maxDelay);
  // 添加 ±25% 的抖动
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(cappedDelay + jitter));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 增强错误类，包含分类信息
 */
export class EnhancedError extends Error {
  readonly category: ErrorCategory;
  readonly classified: ClassifiedError;

  constructor(classified: ClassifiedError) {
    super(classified.message);
    this.name = 'EnhancedError';
    this.category = classified.category;
    this.classified = classified;
  }
}
