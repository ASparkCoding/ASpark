/**
 * ASpark Enhanced Features - 统一入口
 *
 * 集成所有增强功能模块，提供统一的 API
 *
 * 功能清单:
 * 1.  智能上下文压缩     context-compactor
 * 2.  增强错误分类与恢复  error-classifier + retry-strategy
 * 3.  工具结果持久化      result-storage
 * 4.  插件/技能系统       skill-loader
 * 5.  任务管理与并行执行  task-manager
 * 6.  Git Worktree 隔离   worktree-manager
 * 7.  LSP 集成           typescript-service
 * 8.  多代理协作系统      coordinator
 * 9.  推测执行            speculative-runner
 * 10. 主动模式           proactive/analyzer
 * 11. 权限与安全分类      code-classifier
 * 12. 会话持久化与恢复    session-storage
 * 13. 成本追踪系统        cost-tracker
 */

// === 1. 上下文压缩 ===
export {
  autoCompact,
  microCompact,
  snipCompact,
  reactiveCompact,
  selectAndCompact,
  estimateTokens,
  type CompactableMessage,
  type CompactionResult,
  type CompactionStrategy,
  type CompactorConfig,
} from '../llm/context-compactor';

// === 2. 错误分类与恢复 ===
export {
  classifyError,
  ErrorCategory,
  type ClassifiedError,
  type RecoveryStrategy,
} from '../llm/error-classifier';

export {
  executeWithSmartRetry,
  EnhancedError,
  type RetryOptions,
} from '../llm/retry-strategy';

// === 3. 工具结果持久化 ===
export {
  resultStorage,
  type StoredResult,
  type StorageStats,
} from '../storage/result-storage';

// === 4. 技能系统 ===
export {
  skillRegistry,
  type SkillManifest,
  type LoadedSkill,
  type SkillMatchResult,
} from '../skills/skill-loader';

// === 5. 任务管理 ===
export {
  taskManager,
  createGenerationTaskGroup,
  type Task,
  type TaskStatus,
  type TaskType,
  type TaskResult,
  type TaskGroup,
  type TaskManagerEvents,
} from '../tasks/task-manager';

// === 6. Git Worktree ===
export {
  worktreeManager,
  type Worktree,
  type WorktreeStatus,
  type ABComparison,
} from '../preview/worktree-manager';

// === 7. LSP 集成 ===
export {
  typescriptService,
  type Diagnostic,
  type CompletionItem,
  type QuickFix,
  type HoverInfo,
} from '../lsp/typescript-service';

// === 8. 多代理协作 ===
export {
  AgentCoordinator,
  AGENT_DEFINITIONS,
  type AgentRole,
  type AgentDefinition,
  type AgentMessage,
  type ArchitecturePlan,
  type ValidationReport,
  type CoordinationResult,
  type CoordinationProgress,
} from '../agents/coordinator';

// === 9. 推测执行 ===
export {
  speculativeRunner,
  analyzeAmbiguity,
  type SpeculativeSession,
  type SpeculativeVariant,
  type AmbiguityAnalysis,
} from '../code-gen/speculative-runner';

// === 10. 主动模式 ===
export {
  runProactiveAnalysis,
  formatAnalysisAsSuggestions,
  type ProactiveIssue,
  type AnalysisResult,
  type AnalysisCategory,
  type IssueSeverity,
} from '../proactive/analyzer';

// === 11. 安全分类 ===
export {
  scanFile,
  scanFiles,
  formatSecurityReport,
  type SecurityIssue,
  type SecurityLevel,
  type SecurityCategory,
  type SecuritySummary,
} from '../security/code-classifier';

// === 12. 会话持久化 ===
export {
  sessionManager,
  type SessionSnapshot,
  type SessionMessage,
  type PlanSessionState,
  type BuildSessionState,
  type EditorSessionState,
  type CostSessionData,
} from '../session/session-storage';

// === 13. 成本追踪 ===
export {
  costTracker,
  type TokenUsage,
  type CostSummary,
  type CostOptimizationSuggestion,
} from '../cost-tracker';
