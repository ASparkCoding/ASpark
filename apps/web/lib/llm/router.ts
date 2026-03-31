import { createDeepSeek } from '@ai-sdk/deepseek';
import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { GenerationType, LLMProvider } from '@/types';

// ============================================================
// 显式初始化所有 Provider，确保 API Key 和 Base URL 正确传入
// ============================================================

// 豆包：通过 OpenAI 兼容接口接入（火山引擎方舟平台）
const doubao = createOpenAI({
  baseURL: process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
  apiKey: process.env.DOUBAO_API_KEY || '',
});

// DeepSeek：显式传入 apiKey（SDK 默认 baseURL 是 https://api.deepseek.com，不需要 /v1）
const deepseekProvider = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
});

// Kimi / Moonshot：必须显式传入 baseURL
// SDK 默认是 https://api.moonshot.ai/v1，但国内 API Key 对应的是 https://api.moonshot.cn/v1
const kimiProvider = createMoonshotAI({
  apiKey: process.env.MOONSHOT_API_KEY || '',
  baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
});

// GPT-5.3-Codex：通过 OpenRouter 接入（OpenAI 兼容接口）
const codexProvider = createOpenAI({
  baseURL: process.env.OPENROUTER_CODEX_BASE_URL || 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_CODEX_API_KEY || '',
});

// ============================================================
// 模型 ID 配置
// ============================================================

function getModelIds() {
  return {
    kimi: process.env.KIMI_MODEL_ID || 'kimi-k2.5',
    deepseekChat: process.env.DEEPSEEK_MODEL_ID || 'deepseek-chat',
    deepseekReasoner: process.env.DEEPSEEK_REASONER_MODEL_ID || 'deepseek-reasoner',
    doubao: process.env.DOUBAO_MODEL_ID || 'doubao-seed-2-0-pro-260215',
    doubaoFlash: process.env.DOUBAO_FLASH_MODEL_ID || 'doubao-seed-1-6-flash-250115',
    codex: process.env.OPENROUTER_CODEX_MODEL_ID || 'openai/gpt-5.3-codex',
  };
}

// ============================================================
// 回退链定义：每种任务类型按优先级排列的模型列表
// 如果主模型失败（限流/超时/API错误），依次尝试回退模型
// ============================================================

interface ModelEntry {
  provider: LLMProvider;
  createModel: () => LanguageModel;
  displayName: string;
}

function getFallbackChain(type: GenerationType): ModelEntry[] {
  const ids = getModelIds();

  switch (type) {
    case 'scaffold':
      // 脚手架：Codex → Kimi K2.5 → DeepSeek Chat
      return [
        { provider: 'codex', createModel: () => codexProvider(ids.codex), displayName: ids.codex },
        { provider: 'kimi', createModel: () => kimiProvider(ids.kimi), displayName: ids.kimi },
        { provider: 'deepseek', createModel: () => deepseekProvider(ids.deepseekChat), displayName: ids.deepseekChat },
      ];

    case 'iterate':
      // 迭代：Kimi K2.5 → DeepSeek Chat → Doubao
      return [
        { provider: 'kimi', createModel: () => kimiProvider(ids.kimi), displayName: ids.kimi },
        { provider: 'deepseek', createModel: () => deepseekProvider(ids.deepseekChat), displayName: ids.deepseekChat },
        { provider: 'doubao', createModel: () => doubao(ids.doubao), displayName: ids.doubao },
      ];

    case 'refactor':
      // 重构：Codex → Kimi K2.5 → DeepSeek Chat
      return [
        { provider: 'codex', createModel: () => codexProvider(ids.codex), displayName: ids.codex },
        { provider: 'kimi', createModel: () => kimiProvider(ids.kimi), displayName: ids.kimi },
        { provider: 'deepseek', createModel: () => deepseekProvider(ids.deepseekChat), displayName: ids.deepseekChat },
      ];

    case 'reason':
      // 推理：DeepSeek Reasoner → Kimi K2.5 → DeepSeek Chat
      return [
        { provider: 'deepseek', createModel: () => deepseekProvider(ids.deepseekReasoner), displayName: ids.deepseekReasoner },
        { provider: 'kimi', createModel: () => kimiProvider(ids.kimi), displayName: ids.kimi },
        { provider: 'deepseek', createModel: () => deepseekProvider(ids.deepseekChat), displayName: ids.deepseekChat },
      ];

    case 'complete':
      // 补全：Doubao Flash → DeepSeek Chat
      return [
        { provider: 'doubao', createModel: () => doubao(ids.doubaoFlash), displayName: ids.doubaoFlash },
        { provider: 'deepseek', createModel: () => deepseekProvider(ids.deepseekChat), displayName: ids.deepseekChat },
      ];

    default:
      return [
        { provider: 'deepseek', createModel: () => deepseekProvider(ids.deepseekChat), displayName: ids.deepseekChat },
      ];
  }
}

/**
 * 根据任务类型自动路由最优模型
 */
export function selectModel(req: {
  type: GenerationType;
  contextLength?: number;
  forceVision?: boolean;
}): LanguageModel {
  const ids = getModelIds();

  // ★ G2: Force vision model for image uploads
  if (req.forceVision) {
    console.log(`[LLM Router] forceVision → doubao: ${ids.doubao}`);
    return doubao(ids.doubao);
  }

  // 超长上下文（>128K tokens）→ Kimi K2.5 是唯一选择
  if (req.contextLength && req.contextLength > 128000) {
    console.log(`[LLM Router] Long context detected (${req.contextLength}), routing to Kimi: ${ids.kimi}`);
    return kimiProvider(ids.kimi);
  }

  // 获取回退链中的首选模型
  const chain = getFallbackChain(req.type);
  const primary = chain[0];
  console.log(`[LLM Router] ${req.type} → ${primary.provider}: ${primary.displayName}`);
  return primary.createModel();
}

/**
 * 带回退的模型选择：当主模型失败时，自动尝试回退链中的下一个模型
 *
 * @param type - 生成类型
 * @param attemptFn - 使用模型执行的函数，失败时抛出异常
 * @param maxRetries - 每个模型的最大重试次数（默认 1）
 * @returns 成功的结果
 */
export async function selectModelWithFallback<T>(
  type: GenerationType,
  attemptFn: (model: LanguageModel, provider: LLMProvider, displayName: string) => Promise<T>,
  maxRetries: number = 1
): Promise<T> {
  const chain = getFallbackChain(type);

  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i];
    let lastError: Error | undefined;

    for (let retry = 0; retry <= maxRetries; retry++) {
      try {
        if (retry > 0) {
          // 指数退避：200ms, 400ms, 800ms...
          const delay = 200 * Math.pow(2, retry - 1);
          console.log(`[LLM Router] Retry ${retry}/${maxRetries} for ${entry.displayName} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        console.log(`[LLM Router] ${type} → ${entry.provider}: ${entry.displayName}${i > 0 ? ` (fallback #${i})` : ''}`);
        const model = entry.createModel();
        return await attemptFn(model, entry.provider, entry.displayName);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const isRateLimit = lastError.message.includes('429') || lastError.message.includes('rate limit');
        const isTimeout = lastError.message.includes('timeout') || lastError.message.includes('ETIMEDOUT');
        const isServerError = lastError.message.includes('500') || lastError.message.includes('502') || lastError.message.includes('503');

        console.warn(
          `[LLM Router] ${entry.displayName} failed (retry ${retry}/${maxRetries}): ${lastError.message.slice(0, 100)}`
        );

        // 如果是限流或服务端错误，当前模型不再重试，直接切换到下一个
        if (isRateLimit || isServerError) {
          console.log(`[LLM Router] ${isRateLimit ? 'Rate limited' : 'Server error'}, switching to fallback...`);
          break;
        }

        // 如果是超时，允许重试当前模型
        if (!isTimeout && retry >= maxRetries) break;
      }
    }

    // 当前模型所有重试用完，尝试下一个
    if (i < chain.length - 1) {
      console.log(`[LLM Router] Falling back from ${entry.displayName} to ${chain[i + 1].displayName}`);
    }
  }

  throw new Error(`[LLM Router] All models in fallback chain failed for type: ${type}`);
}

/**
 * 获取模型的显示名称（用于日志和数据库记录）
 */
export function getModelDisplayName(provider: LLMProvider, type: GenerationType): string {
  switch (provider) {
    case 'doubao':
      return type === 'complete'
        ? (process.env.DOUBAO_FLASH_MODEL_ID || 'doubao-seed-1.6-flash')
        : (process.env.DOUBAO_MODEL_ID || 'doubao-seed-2.0-pro');
    case 'deepseek':
      return type === 'reason'
        ? (process.env.DEEPSEEK_REASONER_MODEL_ID || 'deepseek-reasoner')
        : (process.env.DEEPSEEK_MODEL_ID || 'deepseek-chat');
    case 'kimi':
      return process.env.KIMI_MODEL_ID || 'kimi-k2.5';
    case 'codex':
      return process.env.OPENROUTER_CODEX_MODEL_ID || 'openai/gpt-5.3-codex';
    default:
      return 'deepseek-chat';
  }
}

/**
 * 根据任务类型获取默认的提供商
 */
export function getDefaultProvider(type: GenerationType): LLMProvider {
  const chain = getFallbackChain(type);
  return chain[0]?.provider || 'deepseek';
}
