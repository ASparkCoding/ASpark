/**
 * ASpark Speculative Execution
 * 对模糊需求并行生成多方案，用户可对比选择
 */

import { worktreeManager, type Worktree, type ABComparison } from '../preview/worktree-manager';

// ======================== Types ========================

export interface SpeculativeVariant {
  id: string;
  label: string;
  /** 变体描述（给 LLM 的指导） */
  styleGuide: string;
  /** 生成状态 */
  status: 'pending' | 'generating' | 'ready' | 'failed';
  /** 生成的文件 */
  files?: Record<string, string>;
  /** 关联的 worktree */
  worktree?: Worktree;
  /** 预览 URL */
  previewUrl?: string;
  /** 错误信息 */
  error?: string;
}

export interface SpeculativeSession {
  id: string;
  projectId: string;
  originalPrompt: string;
  variants: SpeculativeVariant[];
  comparison?: ABComparison;
  selectedVariantId?: string;
  status: 'analyzing' | 'generating' | 'comparing' | 'decided' | 'cancelled';
  createdAt: number;
}

export interface AmbiguityAnalysis {
  isAmbiguous: boolean;
  reason: string;
  suggestedVariants: Array<{
    label: string;
    styleGuide: string;
  }>;
}

// ======================== Ambiguity Detection ========================

/** 模糊性检测关键词 */
const AMBIGUITY_PATTERNS = [
  // 中文
  { pattern: /好看的|美观的|现代的|专业的|漂亮的/g, weight: 0.8 },
  { pattern: /合适的|恰当的|适当的/g, weight: 0.6 },
  { pattern: /设计一个|设计|样式|风格|主题/g, weight: 0.5 },
  { pattern: /首页|主页|落地页|landing/gi, weight: 0.4 },
  { pattern: /仪表盘|dashboard|面板/gi, weight: 0.4 },
  // English
  { pattern: /beautiful|modern|professional|clean|elegant/gi, weight: 0.8 },
  { pattern: /good.*looking|nice.*design|cool.*ui/gi, weight: 0.7 },
  { pattern: /design|style|theme|layout/gi, weight: 0.5 },
];

/** UI 风格变体模板 */
const STYLE_VARIANT_TEMPLATES: Record<string, Array<{ label: string; styleGuide: string }>> = {
  dashboard: [
    {
      label: '极简数据面板',
      styleGuide: '极简设计风格：大量留白，单色调，重点数据突出，卡片式布局，清晰的数据层级。使用大号数字展示 KPI，配合小型趋势图。',
    },
    {
      label: '数据密集面板',
      styleGuide: '信息密集型设计：紧凑布局，充分利用空间，多种图表类型（折线、柱状、饼图、热力图），支持数据钻取。适合专业分析师使用。',
    },
    {
      label: '可视化驱动面板',
      styleGuide: '视觉优先设计：以大型交互式图表为中心，渐变背景，动画过渡，暗色主题，数据可视化优先于表格和数字。',
    },
  ],
  landing: [
    {
      label: '极简品牌页',
      styleGuide: '极简风格落地页：超大标题 + 副标题，居中布局，大量留白，单个 CTA 按钮，渐变背景，滚动动画。',
    },
    {
      label: '功能展示页',
      styleGuide: '功能导向落地页：Hero 区 + 3-4 个功能卡片 + 用户评价 + 定价表 + FAQ + 底部 CTA。分区明确，每区一色。',
    },
    {
      label: '交互体验页',
      styleGuide: '沉浸式体验落地页：全屏 Hero 带动画背景，滚动触发动画，视差效果，动态数字展示，产品演示 GIF/视频嵌入。',
    },
  ],
  general: [
    {
      label: '方案A: 清爽简约',
      styleGuide: '简约设计：浅色背景，清晰的排版层级，标准间距，以功能为导向的布局。优先保证可读性和易用性。',
    },
    {
      label: '方案B: 现代活力',
      styleGuide: '现代设计：渐变色彩，圆角卡片，微动画，hover 效果丰富，品牌色突出。注重视觉吸引力和交互反馈。',
    },
    {
      label: '方案C: 专业商务',
      styleGuide: '商务设计：深色/浅色切换，严谨的栅格系统，数据表格优化，图标一致，信息密度适中。注重信任感和专业性。',
    },
  ],
};

/**
 * 分析 prompt 的模糊性，判断是否应该启动推测执行
 */
export function analyzeAmbiguity(prompt: string): AmbiguityAnalysis {
  let totalWeight = 0;
  const matchedPatterns: string[] = [];

  for (const { pattern, weight } of AMBIGUITY_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = prompt.match(pattern);
    if (matches) {
      totalWeight += weight * matches.length;
      matchedPatterns.push(matches.join(', '));
    }
  }

  const isAmbiguous = totalWeight >= 1.0;

  if (!isAmbiguous) {
    return {
      isAmbiguous: false,
      reason: '需求足够明确，无需多方案对比',
      suggestedVariants: [],
    };
  }

  // 根据 prompt 内容选择变体模板
  const promptLower = prompt.toLowerCase();
  let variantType = 'general';
  if (promptLower.includes('dashboard') || promptLower.includes('仪表盘') || promptLower.includes('面板')) {
    variantType = 'dashboard';
  } else if (promptLower.includes('landing') || promptLower.includes('首页') || promptLower.includes('落地页')) {
    variantType = 'landing';
  }

  return {
    isAmbiguous: true,
    reason: `检测到模糊描述: ${matchedPatterns.join('; ')}`,
    suggestedVariants: STYLE_VARIANT_TEMPLATES[variantType] || STYLE_VARIANT_TEMPLATES.general,
  };
}

// ======================== Speculative Runner ========================

class SpeculativeRunner {
  private sessions: Map<string, SpeculativeSession> = new Map();
  private idCounter = 0;

  /**
   * 创建推测执行会话
   */
  createSession(
    projectId: string,
    originalPrompt: string,
    variants: Array<{ label: string; styleGuide: string }>
  ): SpeculativeSession {
    const session: SpeculativeSession = {
      id: `spec_${++this.idCounter}_${Date.now().toString(36)}`,
      projectId,
      originalPrompt,
      variants: variants.map((v, i) => ({
        id: `var_${i}`,
        label: v.label,
        styleGuide: v.styleGuide,
        status: 'pending' as const,
      })),
      status: 'analyzing',
      createdAt: Date.now(),
    };

    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * 并行生成所有变体
   */
  async generateAllVariants(
    sessionId: string,
    generateFn: (prompt: string, styleGuide: string) => Promise<Record<string, string>>,
    onVariantComplete?: (variant: SpeculativeVariant) => void
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    session.status = 'generating';

    // 创建 A/B 对比
    try {
      session.comparison = await worktreeManager.createABComparison(
        session.projectId,
        session.originalPrompt,
        session.variants.map(v => ({ label: v.label }))
      );
    } catch {
      // worktree 创建失败时继续，不影响生成
    }

    // 并行生成所有变体
    const promises = session.variants.map(async (variant, index) => {
      variant.status = 'generating';

      try {
        const enhancedPrompt = `${session.originalPrompt}\n\n设计风格指导: ${variant.styleGuide}`;
        const files = await generateFn(enhancedPrompt, variant.styleGuide);
        variant.files = files;
        variant.status = 'ready';

        // 如果有 worktree，写入文件
        if (session.comparison && session.comparison.worktrees[index]) {
          const wt = session.comparison.worktrees[index];
          variant.worktree = wt;
          try {
            await worktreeManager.writeFiles(wt.id, files);
            variant.previewUrl = `http://localhost:${wt.previewPort}`;
          } catch { /* worktree write failure is non-fatal */ }
        }

        onVariantComplete?.(variant);
      } catch (error) {
        variant.status = 'failed';
        variant.error = error instanceof Error ? error.message : String(error);
      }
    });

    await Promise.allSettled(promises);
    session.status = 'comparing';
  }

  /**
   * 用户选择最佳变体
   */
  async selectVariant(sessionId: string, variantId: string): Promise<Record<string, string>> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const variant = session.variants.find(v => v.id === variantId);
    if (!variant || !variant.files) throw new Error(`Variant ${variantId} not found or not ready`);

    session.selectedVariantId = variantId;
    session.status = 'decided';

    // 如果有 worktree，合并选中的方案
    if (session.comparison && variant.worktree) {
      try {
        await worktreeManager.selectVariant(session.comparison.id, variant.worktree.id);
      } catch { /* merge failure is non-fatal, files are returned directly */ }
    }

    // 清理未选中方案的 worktree
    this.cleanup(sessionId, variantId);

    return variant.files;
  }

  /**
   * 取消推测执行会话
   */
  async cancel(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'cancelled';

    // 清理所有 worktree
    if (session.comparison) {
      await worktreeManager.cleanupComparison(session.comparison.id);
    }

    this.sessions.delete(sessionId);
  }

  /**
   * 获取会话信息
   */
  getSession(sessionId: string): SpeculativeSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 获取变体的对比摘要
   */
  getComparisonSummary(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) return '';

    return session.variants
      .map(v => {
        const status = v.status === 'ready' ? '✓' : v.status === 'failed' ? '✗' : '...';
        const fileCount = v.files ? Object.keys(v.files).length : 0;
        return `[${status}] ${v.label} (${fileCount} 文件)`;
      })
      .join('\n');
  }

  // ======================== Private ========================

  private async cleanup(sessionId: string, keepVariantId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    for (const variant of session.variants) {
      if (variant.id !== keepVariantId && variant.worktree) {
        try {
          await worktreeManager.removeWorktree(variant.worktree.id);
        } catch { /* best effort cleanup */ }
      }
    }
  }
}

/** 全局单例 */
export const speculativeRunner = new SpeculativeRunner();
