/**
 * ASpark Cost Tracker
 * 实时追踪 token 消耗、按模型统计成本、提供优化建议
 */

// 各模型每百万 token 的价格（美元）
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // DeepSeek
  'deepseek-chat': { input: 0.27, output: 1.10 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
  // Kimi / Moonshot
  'moonshot-v1-auto': { input: 0.80, output: 0.80 },
  'kimi-k2-5': { input: 0.80, output: 0.80 },
  // Doubao / VolcEngine
  'doubao-1-5-thinking-pro': { input: 0.50, output: 0.50 },
  'doubao-1-5-pro-256k': { input: 0.50, output: 0.50 },
  'doubao-1-5-vision-pro-32k': { input: 0.50, output: 0.50 },
  // OpenRouter / Codex
  'gpt-5.3-codex': { input: 2.50, output: 10.00 },
  // 默认（未知模型）
  default: { input: 1.00, output: 3.00 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string;
  type: string; // scaffold, iterate, refactor, reason, complete
  timestamp: number;
}

export interface CostSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  byModel: Record<string, {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    callCount: number;
  }>;
  byType: Record<string, {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    callCount: number;
  }>;
  callCount: number;
  avgCostPerCall: number;
  suggestions: CostOptimizationSuggestion[];
}

export interface CostOptimizationSuggestion {
  type: 'model_switch' | 'context_reduction' | 'batch_optimization' | 'cache_hit';
  message: string;
  estimatedSavings: number; // percentage
}

class CostTracker {
  private usageHistory: TokenUsage[] = [];
  private sessionStartTime: number = Date.now();

  /**
   * 记录一次 LLM 调用的 token 使用量
   */
  record(usage: TokenUsage): void {
    this.usageHistory.push({
      ...usage,
      timestamp: Date.now(),
    });
  }

  /**
   * 计算单次调用的成本
   */
  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING.default;
    return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
  }

  /**
   * 获取项目维度的成本摘要
   */
  getSummary(projectId?: string): CostSummary {
    const records = this.usageHistory;

    const byModel: CostSummary['byModel'] = {};
    const byType: CostSummary['byType'] = {};
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostUsd = 0;

    for (const record of records) {
      const cost = this.calculateCost(record.model, record.inputTokens, record.outputTokens);
      totalInputTokens += record.inputTokens;
      totalOutputTokens += record.outputTokens;
      totalCostUsd += cost;

      // 按模型聚合
      if (!byModel[record.model]) {
        byModel[record.model] = { inputTokens: 0, outputTokens: 0, costUsd: 0, callCount: 0 };
      }
      byModel[record.model].inputTokens += record.inputTokens;
      byModel[record.model].outputTokens += record.outputTokens;
      byModel[record.model].costUsd += cost;
      byModel[record.model].callCount += 1;

      // 按类型聚合
      if (!byType[record.type]) {
        byType[record.type] = { inputTokens: 0, outputTokens: 0, costUsd: 0, callCount: 0 };
      }
      byType[record.type].inputTokens += record.inputTokens;
      byType[record.type].outputTokens += record.outputTokens;
      byType[record.type].costUsd += cost;
      byType[record.type].callCount += 1;
    }

    const callCount = records.length;

    return {
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd,
      byModel,
      byType,
      callCount,
      avgCostPerCall: callCount > 0 ? totalCostUsd / callCount : 0,
      suggestions: this.generateSuggestions(byModel, byType, totalCostUsd),
    };
  }

  /**
   * 获取最近 N 条使用记录
   */
  getRecentUsage(limit: number = 10): TokenUsage[] {
    return this.usageHistory.slice(-limit);
  }

  /**
   * 获取最后一次调用的成本
   */
  getLastCallCost(): { tokens: TokenUsage; costUsd: number } | null {
    if (this.usageHistory.length === 0) return null;
    const last = this.usageHistory[this.usageHistory.length - 1];
    return {
      tokens: last,
      costUsd: this.calculateCost(last.model, last.inputTokens, last.outputTokens),
    };
  }

  /**
   * 估算剩余预算可支持的调用次数
   */
  estimateRemainingCalls(budgetUsd: number): number {
    const summary = this.getSummary();
    if (summary.avgCostPerCall === 0) return Infinity;
    const remaining = budgetUsd - summary.totalCostUsd;
    return Math.max(0, Math.floor(remaining / summary.avgCostPerCall));
  }

  /**
   * 生成成本优化建议
   */
  private generateSuggestions(
    byModel: CostSummary['byModel'],
    byType: CostSummary['byType'],
    totalCost: number
  ): CostOptimizationSuggestion[] {
    const suggestions: CostOptimizationSuggestion[] = [];

    // 建议1: iterate 任务使用了昂贵模型
    if (byType['iterate']) {
      const iterateCalls = byType['iterate'];
      const avgIterateTokens = iterateCalls.outputTokens / iterateCalls.callCount;
      if (avgIterateTokens < 2000 && byModel['gpt-5.3-codex']?.callCount) {
        suggestions.push({
          type: 'model_switch',
          message: '简单修改建议使用 DeepSeek Chat 替代 Codex，可节省约 60% 成本',
          estimatedSavings: 60,
        });
      }
    }

    // 建议2: 输入 token 过高，可能需要上下文压缩
    const avgInputTokens = Object.values(byModel).reduce(
      (sum, m) => sum + m.inputTokens, 0
    ) / Math.max(1, Object.values(byModel).reduce((sum, m) => sum + m.callCount, 0));

    if (avgInputTokens > 50000) {
      suggestions.push({
        type: 'context_reduction',
        message: '平均输入 token 超过 50K，建议启用上下文压缩以减少成本',
        estimatedSavings: 30,
      });
    }

    // 建议3: 大量 complete 类型调用
    if (byType['complete'] && byType['complete'].callCount > 10) {
      suggestions.push({
        type: 'batch_optimization',
        message: '频繁的代码补全调用可合并为批量请求',
        estimatedSavings: 20,
      });
    }

    // 建议4: scaffold 后紧接多次 iterate，说明首次生成质量不够
    if (byType['scaffold'] && byType['iterate']) {
      const ratio = byType['iterate'].callCount / byType['scaffold'].callCount;
      if (ratio > 5) {
        suggestions.push({
          type: 'context_reduction',
          message: '迭代次数过多，建议使用 Plan Mode 提前明确需求以减少迭代',
          estimatedSavings: 40,
        });
      }
    }

    return suggestions;
  }

  /**
   * 重置追踪器
   */
  reset(): void {
    this.usageHistory = [];
    this.sessionStartTime = Date.now();
  }

  /**
   * 导出所有使用数据（用于持久化）
   */
  exportData(): { usageHistory: TokenUsage[]; sessionStartTime: number } {
    return {
      usageHistory: [...this.usageHistory],
      sessionStartTime: this.sessionStartTime,
    };
  }

  /**
   * 从导出数据恢复
   */
  importData(data: { usageHistory: TokenUsage[]; sessionStartTime: number }): void {
    this.usageHistory = data.usageHistory;
    this.sessionStartTime = data.sessionStartTime;
  }
}

// 全局单例
export const costTracker = new CostTracker();
