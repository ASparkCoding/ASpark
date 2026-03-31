# ASpark 产品功能增强分析报告

> 基于对 `D:\桌面\src` AI代理系统源码的深度分析，提取可融入 ASpark 的高价值功能

---

## 分析背景

### ASpark 现状概述

ASpark v1.0.0 是一个开源的 AI 驱动全栈应用生成器，能将自然语言描述转化为完整、可部署的 Web 应用。

**核心技术栈：**
- 前端: Next.js 14 + React 18 + Tailwind CSS + shadcn/ui + Monaco Editor
- 状态管理: Zustand
- 后端: Supabase (PostgreSQL) + Row-Level Security
- AI: DeepSeek / Kimi / Doubao / GPT-5.3-Codex（通过 Vercel AI SDK）
- 部署: Vercel
- 工程化: Turborepo + pnpm

**现有核心功能：**
- Plan Mode（智能需求澄清）
- 多模型路由（按任务类型自动选择 LLM）
- 8 阶段代码生成管线
- 4 阶段自动修复管线
- 实时 Vite 预览（HMR）
- Monaco Editor 工作区
- 一键 Vercel 部署
- 版本历史与回滚
- 45+ 预注入模板文件

### 参考源码概述

`D:\桌面\src` 包含一套生产级 AI 代理平台源码，具备：
- 1,884 个 TypeScript/TSX 文件
- 43 个内置工具 + 87 个斜杠命令
- 多代理编排、MCP 协议、LSP 集成
- 企业级权限系统、会话持久化、上下文压缩
- 插件/技能系统、任务管理、推测执行等高级功能

---

## 第一层：高价值 + 可快速融入（1-2 周）

### 1. 智能上下文压缩系统 (Context Compaction)

**参考源码位置：** `src/services/compact/`（4 种压缩策略）

**ASpark 现状：**
`context-selector.ts` 只做了基础的文件选择（最多 25 个文件），但没有对话历史压缩。随着用户多轮迭代，上下文窗口很快就会爆满。

**融入方案：**

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| **AutoCompact** | 监控 token 使用量，到达阈值时自动压缩旧消息 | 默认策略，全程开启 |
| **MicroCompact** | 精细粒度减少 token 而不丢失语义 | token 接近上限时 |
| **SnipCompact** | 保留关键转折点，折叠中间对话 | 超长对话（10+ 轮） |
| **ReactiveCompact** | 预测未来 token 需求，提前压缩 | 大型项目生成前 |

**实现要点：**
- 在 `lib/llm/` 下新增 `context-compactor.ts`
- 在每次 API 调用前检查 token 预算
- 压缩策略可配置，默认使用 AutoCompact
- 保留最近 3 轮对话的完整内容，更早的对话压缩为摘要

**预期收益：** 用户可进行更多轮迭代而不丢失上下文，减少 LLM 调用成本 30-50%

---

### 2. 增强的错误分类与恢复系统

**参考源码位置：** `src/services/api/errors.ts`（41KB）+ `src/services/api/withRetry.ts`（28KB）

**ASpark 现状：**
`router.ts` 有基础的指数退避重试，但错误分类粗糙（只区分 429/5xx）。

**融入方案：**

```typescript
// 错误分类体系
enum ErrorCategory {
  RETRYABLE,      // 429 限速、瞬时网络错误、502/503
  AUTH,           // Token 无效/过期
  INPUT,          // 请求格式错误、schema 违规
  OVERLOAD,       // 上下文窗口满、token 超限
  MODEL_ERROR,    // 模型内部错误
  TOOL_ERROR,     // 工具调用错误
}

// 每种错误类型对应不同恢复策略
const recoveryStrategies = {
  RETRYABLE:   exponentialBackoffWithJitter,  // 带抖动的退避
  AUTH:        refreshTokenAndRetry,          // 刷新 token
  INPUT:       reformatAndRetry,              // 重新格式化请求
  OVERLOAD:    compactContextAndRetry,        // 压缩上下文后重试
  MODEL_ERROR: switchToFallbackModel,         // 智能降级到次优模型
  TOOL_ERROR:  reportToUser,                  // 通知用户
}
```

**实现要点：**
- 在 `lib/llm/` 下新增 `error-classifier.ts` 和 `retry-strategy.ts`
- 修改 `router.ts` 的 fallback 逻辑，从线性 fallback chain 改为智能降级
- 添加带抖动的退避（防止多用户同时重试导致雪崩）

**预期收益：** 生成成功率提升，减少用户看到的错误

---

### 3. 工具结果持久化 (Tool Result Storage)

**参考源码位置：** `src/utils/toolResultStorage.ts`（38KB）

**ASpark 现状：**
大量生成的代码直接放在内存/上下文中，长对话后占满 token 窗口。

**融入方案：**

```
生成的代码文件 → 检查大小
  ├── < 阈值 → 保留在上下文中
  └── > 阈值 → 写入磁盘，上下文中只保留摘要
                ↓
            需要时按需加载完整内容
```

**实现要点：**
- 新增 `lib/storage/result-storage.ts`
- 超过阈值（如 2000 tokens）的工具结果写入 `.generated-projects/` 目录
- 在上下文中保留文件路径 + 前 20 行摘要
- 每个对话线程独立管理存储

**预期收益：** 大型项目生成时上下文不会爆满，支持更复杂的应用生成

---

## 第二层：高价值 + 中等难度（2-4 周）

### 4. 插件/技能系统 (Plugin & Skill System)

**参考源码位置：** `src/plugins/` + `src/skills/`（34KB loader）

**ASpark 现状：**
模板系统是硬编码的 45+ 文件，没有扩展机制。

**融入方案：**

```
技能包结构：
skills/
├── ecommerce/               # 电商技能包
│   ├── manifest.json         # 技能声明
│   ├── prompts/              # 专用 system prompt 片段
│   ├── templates/            # 模板文件（购物车、支付等）
│   └── validators/           # 验证规则
├── saas/                     # SaaS 技能包
│   ├── manifest.json
│   ├── prompts/              # 订阅、计费 prompt
│   ├── templates/            # 多租户、计费模板
│   └── validators/
└── social/                   # 社交技能包
    ├── manifest.json
    ├── prompts/              # Feed 流、消息 prompt
    ├── templates/            # 用户关系、消息模板
    └── validators/
```

**manifest.json 示例：**
```json
{
  "name": "ecommerce",
  "version": "1.0.0",
  "description": "电商应用生成技能包",
  "promptFragments": ["prompts/cart.md", "prompts/payment.md"],
  "templates": ["templates/**/*"],
  "validators": ["validators/payment-security.ts"],
  "requiredEntities": ["Product", "Order", "Cart", "Payment"]
}
```

**实现要点：**
- 新增 `lib/skills/` 模块，包含 loader、registry、resolver
- 在 `system-prompt.ts` 中支持动态注入技能 prompt 片段
- 在模板系统中支持按需加载技能模板
- 提供 CLI 命令：`aspark skill install <name>`

**预期收益：** 生态扩展能力，社区驱动的模板增长，差异化竞争

---

### 5. 任务管理与并行执行 (Task Management)

**参考源码位置：** `src/tasks/`（7 种任务类型）+ `src/tools/TaskCreateTool/`

**ASpark 现状：**
代码生成是单线程流式输出，一次只能做一件事。

**融入方案：**

```
用户请求 "生成一个电商应用"
           ↓
    ┌──────┼──────┐
    ↓      ↓      ↓
  Task 1  Task 2  Task 3
  前端组件  API路由  数据库Schema
    ↓      ↓      ↓
    └──────┼──────┘
           ↓
      合并 & 验证
           ↓
      预览启动
```

**任务生命周期：**
```typescript
interface Task {
  id: string
  type: 'frontend' | 'backend' | 'database' | 'validate' | 'fix'
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number        // 0-100
  result?: GeneratedFiles
  error?: string
  parentId?: string       // 支持任务依赖
}
```

**实现要点：**
- 新增 `lib/tasks/` 模块：`task-manager.ts`、`task-runner.ts`、`task-merger.ts`
- 使用 Promise.allSettled 并行执行独立任务
- 有依赖关系的任务按拓扑排序串行执行
- BuildProgress 组件改造为支持多任务进度展示

**预期收益：** 生成速度提升 2-3x（并行化），用户体验更流畅

---

### 6. Git Worktree 隔离实验

**参考源码位置：** `src/tools/EnterWorktreeTool/` + `src/utils/worktree.ts`（49KB）

**ASpark 现状：**
文件直接写入项目目录，修改不可逆，版本回滚依赖快照。

**融入方案：**

```
用户请求 "重构导航栏"
         ↓
   创建 Git Worktree（隔离分支）
         ↓
   AI 在隔离环境中生成代码
         ↓
   ┌─────┴─────┐
   ↓           ↓
 预览成功     预览失败
   ↓           ↓
 合并回主分支  丢弃 worktree
   ↓           ↓
 用户看到结果  零影响，可重试
```

**支持 A/B 方案对比：**
```
用户请求 "设计首页"
         ↓
   ┌─────┴─────┐
   ↓           ↓
 Worktree A   Worktree B
 方案一：卡片布局  方案二：列表布局
   ↓           ↓
 预览 A       预览 B
   ↓           ↓
   └─────┬─────┘
         ↓
   用户选择最佳方案
```

**实现要点：**
- 在 `lib/preview/` 下新增 `worktree-manager.ts`
- 每个 worktree 分配独立的 Vite 端口
- 在 WorkspaceHeader 中添加"方案切换"Tab
- 失败的 worktree 自动清理

**预期收益：** 大幅提升迭代安全性，支持 A/B 方案对比

---

### 7. LSP 集成（语言服务器协议）

**参考源码位置：** `src/services/lsp/`

**ASpark 现状：**
代码验证依赖自写的 `validator.ts` 和 `compile-checker.ts`，能力有限。

**融入方案：**

```
生成的代码 → TypeScript Language Server
              ↓
         ┌────┼────┐
         ↓    ↓    ↓
      类型错误  缺失导入  未使用变量
         ↓    ↓    ↓
      自动修复建议
         ↓
      注入到 Auto-Fix 管线
```

**对 Monaco Editor 的增强：**
- 实时类型检查（红色波浪线）
- 智能代码补全（基于项目类型）
- 悬停文档提示
- 引用查找和定义跳转

**实现要点：**
- 新增 `lib/lsp/` 模块，封装 TypeScript Language Server 通信
- 在 `post-gen-validator.ts` 中接入 LSP 诊断结果
- Monaco Editor 配置 LSP worker
- 生成后自动触发 LSP 检查，将结果反馈给 Auto-Fix

**预期收益：** 代码质量显著提升，自动修复精准度提高

---

## 第三层：战略价值 + 需要规划（1-2 月）

### 8. MCP 协议支持 (Model Context Protocol)

**参考源码位置：** `src/services/mcp/`（119KB client + 88KB auth + 51KB config）

**ASpark 现状：**
没有标准化的工具/服务扩展协议。

**融入方案：**

```
ASpark (MCP Host)
    ↓
 ┌──┼──┬──┬──┬──┐
 ↓  ↓  ↓  ↓  ↓  ↓
Figma  DB  Git Slack Deploy Custom
MCP   MCP  MCP MCP  MCP   MCP
Server     Server        Server
```

**具体场景：**
- **Figma MCP Server** → 直接从 Figma 设计稿生成代码
- **Database MCP Server** → 连接真实数据库，生成精确的 schema
- **GitHub MCP Server** → 生成的代码直接推送到仓库
- **Vercel MCP Server** → 更丰富的部署配置
- **自定义 MCP Server** → 用户扩展任意工具

**实现要点：**
- 新增 `lib/mcp/` 模块：`mcp-client.ts`、`mcp-registry.ts`、`mcp-auth.ts`
- 支持 stdio 和 SSE 两种 MCP 传输方式
- 在 system prompt 中动态注入可用 MCP 工具列表
- UI 中添加 MCP Server 管理面板

**预期收益：** 生态系统级的扩展能力，接入无限外部工具

---

### 9. 多代理协作系统 (Multi-Agent Orchestration)

**参考源码位置：** `src/tools/AgentTool/` + `src/tasks/LocalAgentTask/` + `src/coordinator/`

**ASpark 现状：**
`agents/runner.ts` 只是单个 agent 对话。

**融入方案：**

```
用户输入 "生成一个项目管理应用"
              ↓
      ┌───── 协调者 Agent ─────┐
      ↓        ↓        ↓      ↓
  架构 Agent  前端 Agent  后端 Agent  QA Agent
      ↓        ↓        ↓      ↓
  项目结构    React组件   API路由   验证测试
  数据模型    页面布局    数据库逻辑  修复问题
      ↓        ↓        ↓      ↓
      └────── 合并 & 解决冲突 ──────┘
              ↓
          完整应用
```

**Agent 定义：**
```typescript
interface AgentDefinition {
  name: string
  role: 'architect' | 'frontend' | 'backend' | 'qa' | 'coordinator'
  systemPrompt: string       // 专用 prompt
  tools: string[]            // 可用工具子集
  model: ModelPreference     // 推荐模型
  dependencies: string[]     // 依赖的其他 Agent 输出
}
```

**Agent 间通信：**
```typescript
// 架构 Agent → 前端/后端 Agent
{
  type: 'architecture_plan',
  entities: [...],
  pages: [...],
  apiRoutes: [...],
  dataModel: {...}
}

// QA Agent → 协调者
{
  type: 'validation_report',
  errors: [...],
  suggestions: [...],
  needsRegeneration: ['frontend']
}
```

**实现要点：**
- 新增 `lib/agents/` 模块：`coordinator.ts`、`agent-runner.ts`、`message-bus.ts`
- 每个 Agent 有独立的上下文和 system prompt
- 协调者负责任务分配、结果合并、冲突解决
- Agent 间通过结构化消息传递数据

**预期收益：** 生成质量大幅提升（专精分工），支持更复杂的应用

---

### 10. 推测执行 (Speculative Execution)

**参考源码位置：** `src/tasks/DreamTask/`（实验性功能）

**ASpark 现状：**
一次只生成一种方案。

**融入方案：**

```
不确定的需求（如 "设计一个好看的仪表盘"）
              ↓
      ┌───────┼───────┐
      ↓       ↓       ↓
    方案 A   方案 B   方案 C
   极简风格  数据密集  图表为主
      ↓       ↓       ↓
    预览 A   预览 B   预览 C
      ↓       ↓       ↓
      └───────┼───────┘
              ↓
      用户选择最佳方案
      未选中方案自动清理
```

**触发条件：**
- 用户需求描述模糊（检测关键词："好看的"、"合适的"、"专业的"）
- 涉及 UI 设计偏好的请求
- 用户主动请求多方案对比

**实现要点：**
- 在 `lib/code-gen/` 下新增 `speculative-runner.ts`
- 利用 Git Worktree 隔离每个方案
- 每个方案分配独立的 Vite 端口
- UI 中添加方案切换器（左右滑动对比）
- 选择后自动合并，未选中方案延迟清理

**预期收益：** 用户满意度提升（可选择），减少迭代次数

---

### 11. 主动模式 (Proactive Mode)

**参考源码位置：** `src/` 中的 PROACTIVE feature flag 相关代码

**ASpark 现状：**
完全被动，等用户输入。

**融入方案：**

```
代码生成完成
      ↓
┌─────┼─────┬─────┐
↓     ↓     ↓     ↓
安全扫描 性能分析 可访问性 最佳实践
      ↓
  主动推送建议卡片到 ChatPanel
      ↓
  用户点击 → 自动修复
```

**主动检查项：**

| 检查类型 | 说明 | 严重程度 |
|---------|------|---------|
| **安全漏洞** | XSS、SQL 注入、敏感数据暴露 | 高 |
| **性能问题** | 大组件未拆分、缺少 lazy loading | 中 |
| **可访问性** | 缺少 aria 标签、对比度不足 | 中 |
| **最佳实践** | 缺少 error boundary、未处理 loading 状态 | 低 |
| **运行状态** | 预览服务器异常、HMR 断开 | 高 |

**实现要点：**
- 新增 `lib/proactive/` 模块：`analyzer.ts`、`reporter.ts`
- 在 useGeneration hook 中，生成完成后触发后台分析
- 分析结果作为特殊的 SuggestionChips 展示
- 用户点击后自动调用 Auto-Fix 管线

**预期收益：** 从"被动工具"升级为"主动助手"，提升用户信任度

---

## 第四层：差异化竞争功能（长期）

### 12. 权限与安全分类系统

**参考源码位置：** `src/utils/permissions/`（24 个文件，含自动分类器）

**融入方案：**
- 对生成的代码进行安全分类
- 标记危险操作（数据库删除、外部 API 调用、文件系统访问等）
- 在预览前让用户确认危险操作
- 自动分类器学习用户的审批模式

**适用场景：**
```
生成的代码包含 DELETE FROM users
       ↓
  安全分类器标记为 "危险操作"
       ↓
  弹窗提示用户确认
       ↓
  用户确认 → 执行 / 用户拒绝 → AI 改用软删除
```

---

### 13. 会话持久化与恢复

**参考源码位置：** `src/utils/sessionStorage.ts` + `src/history.ts`

**融入方案：**
- 完整的会话序列化/反序列化
- 支持断点续传（浏览器关闭后恢复）
- 跨设备恢复（登录后同步会话）
- 会话快照导出/导入

**数据结构：**
```typescript
interface SessionSnapshot {
  id: string
  projectId: string
  messages: Message[]
  files: FileMap
  planState?: PlanSession
  buildState?: BuildState
  timestamp: Date
  checksum: string    // 完整性校验
}
```

---

### 14. 成本追踪系统

**参考源码位置：** `src/cost-tracker.ts`

**融入方案：**
- 实时显示每次生成的 token 消耗
- 按模型分别统计成本
- 预估剩余预算可支持的生成次数
- 成本优化建议（如：建议使用更便宜的模型做简单修改）

**UI 展示：**
```
┌─────────────────────────────────┐
│ 本次生成:  12,450 tokens  $0.03 │
│ 本项目累计: 89,200 tokens $0.21 │
│ 模型: DeepSeek Chat (最经济)    │
│ 💡 建议: 简单修改可用 Doubao 节省 60% │
└─────────────────────────────────┘
```

---

## 推荐实施路线图

```
v1.1 (1-2周) ─── 稳定性基础 ───────────────────────────
│
├── ✅ 智能上下文压缩
├── ✅ 增强错误分类与恢复
└── ✅ 工具结果持久化
│
v1.2 (2-4周) ─── 效率提升 ─────────────────────────────
│
├── ✅ 任务管理与并行执行
├── ✅ 插件/技能系统
└── ✅ 成本追踪系统
│
v1.3 (2-4周) ─── 质量飞跃 ─────────────────────────────
│
├── ✅ LSP 集成
├── ✅ Git Worktree 隔离
└── ✅ 主动模式（基础版）
│
v1.5 (1-2月) ─── 产品形态升级 ─────────────────────────
│
├── ✅ 多代理协作系统
├── ✅ MCP 协议支持
└── ✅ 会话持久化与恢复
│
v2.0 (长期) ─── 差异化竞争 ────────────────────────────
│
├── ✅ 推测执行
├── ✅ 权限安全分类系统
└── ✅ 高级主动模式
```

### 优先级矩阵

| 功能 | 价值 | 难度 | 价值/难度比 | 推荐阶段 |
|------|------|------|-----------|---------|
| 上下文压缩 | ⭐⭐⭐⭐⭐ | ⭐⭐ | **最高** | v1.1 |
| 错误分类增强 | ⭐⭐⭐⭐ | ⭐⭐ | **高** | v1.1 |
| 工具结果持久化 | ⭐⭐⭐⭐ | ⭐⭐ | **高** | v1.1 |
| 任务并行化 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | **高** | v1.2 |
| 插件/技能系统 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | **高** | v1.2 |
| 成本追踪 | ⭐⭐⭐ | ⭐⭐ | **中高** | v1.2 |
| LSP 集成 | ⭐⭐⭐⭐ | ⭐⭐⭐ | **中高** | v1.3 |
| Git Worktree | ⭐⭐⭐⭐ | ⭐⭐⭐ | **中高** | v1.3 |
| 主动模式 | ⭐⭐⭐⭐ | ⭐⭐⭐ | **中高** | v1.3 |
| 多代理协作 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **中** | v1.5 |
| MCP 协议 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **中** | v1.5 |
| 会话持久化 | ⭐⭐⭐ | ⭐⭐⭐ | **中** | v1.5 |
| 推测执行 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **低** | v2.0 |
| 权限安全系统 | ⭐⭐⭐ | ⭐⭐⭐⭐ | **低** | v2.0 |

### 最优先实施的 Top 3

1. **上下文压缩** — 投入小，回报大，直接解决长对话降质问题
2. **任务并行化** — 用户体验显著提升，技术实现相对清晰
3. **插件/技能系统** — 打开生态扩展通道，为后续所有功能奠定基础
