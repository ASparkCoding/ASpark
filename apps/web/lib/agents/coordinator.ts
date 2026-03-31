/**
 * ASpark Multi-Agent Coordinator
 * 多代理协作系统 - 架构/前端/后端/QA 专精分工
 */

import { taskManager, type TaskResult, type TaskType } from '../tasks/task-manager';

// ======================== Types ========================

export type AgentRole = 'coordinator' | 'architect' | 'frontend' | 'backend' | 'qa';

export interface AgentDefinition {
  name: string;
  role: AgentRole;
  /** 专用 system prompt */
  systemPrompt: string;
  /** 可用工具子集 */
  capabilities: string[];
  /** 推荐模型（快/平衡/强） */
  modelPreference: 'fast' | 'balanced' | 'powerful';
  /** 负责的文件模式 */
  filePatterns: string[];
}

export interface AgentMessage {
  from: AgentRole;
  to: AgentRole | 'all';
  type: AgentMessageType;
  payload: unknown;
  timestamp: number;
}

export type AgentMessageType =
  | 'architecture_plan'
  | 'task_assignment'
  | 'code_delivery'
  | 'validation_report'
  | 'fix_request'
  | 'merge_request'
  | 'status_update';

export interface ArchitecturePlan {
  entities: Array<{ name: string; fields: string[]; relationships: string[] }>;
  pages: Array<{ path: string; name: string; components: string[] }>;
  apiRoutes: Array<{ method: string; path: string; description: string }>;
  dataModel: string; // SQL schema
  techDecisions: string[];
}

export interface ValidationReport {
  passed: boolean;
  errors: Array<{ file: string; message: string; severity: 'error' | 'warning' }>;
  suggestions: string[];
  needsRegeneration: AgentRole[];
}

export interface CoordinationResult {
  success: boolean;
  files: Record<string, string>;
  plan?: ArchitecturePlan;
  validation?: ValidationReport;
  logs: AgentMessage[];
  duration: number;
}

// ======================== Agent Definitions ========================

export const AGENT_DEFINITIONS: Record<AgentRole, AgentDefinition> = {
  coordinator: {
    name: 'Coordinator',
    role: 'coordinator',
    systemPrompt: `你是项目协调者。你的职责是：
1. 分析用户需求，分解为子任务
2. 分配任务给专业 Agent
3. 合并各 Agent 的输出
4. 解决冲突和不一致
5. 确保最终交付物完整可用`,
    capabilities: ['plan', 'merge', 'validate'],
    modelPreference: 'powerful',
    filePatterns: ['**/*'],
  },
  architect: {
    name: 'Architect',
    role: 'architect',
    systemPrompt: `你是系统架构师 Agent。你的职责是：
1. 设计数据模型和实体关系
2. 规划页面结构和路由
3. 定义 API 接口
4. 做出技术决策
只输出架构设计，不要写具体代码实现。`,
    capabilities: ['design', 'plan'],
    modelPreference: 'powerful',
    filePatterns: [],
  },
  frontend: {
    name: 'Frontend Developer',
    role: 'frontend',
    systemPrompt: `你是前端开发 Agent。你的职责是：
1. 根据架构设计实现 React 组件和页面
2. 使用 Tailwind CSS 和 shadcn/ui 构建 UI
3. 实现路由和导航
4. 处理表单和用户交互
只生成前端相关文件（components/, pages/, hooks/）。`,
    capabilities: ['code_frontend', 'ui_design'],
    modelPreference: 'balanced',
    filePatterns: ['src/components/**', 'src/pages/**', 'src/hooks/**', 'src/App.tsx'],
  },
  backend: {
    name: 'Backend Developer',
    role: 'backend',
    systemPrompt: `你是后端开发 Agent。你的职责是：
1. 根据架构设计实现数据库 Schema
2. 创建 Supabase 数据服务
3. 实现业务逻辑和数据验证
4. 设置 RLS 安全策略
只生成后端相关文件（entities/, lib/data-service.ts, SQL schema）。`,
    capabilities: ['code_backend', 'database'],
    modelPreference: 'balanced',
    filePatterns: ['src/entities/**', 'src/lib/data-service.ts', 'src/lib/supabase.ts', '*.sql'],
  },
  qa: {
    name: 'QA Engineer',
    role: 'qa',
    systemPrompt: `你是 QA 工程师 Agent。你的职责是：
1. 验证代码的一致性和完整性
2. 检查导入/导出是否正确
3. 验证路由和页面结构
4. 检查数据模型和 API 的一致性
5. 发现潜在的 bug 和安全问题
输出验证报告和修复建议。`,
    capabilities: ['validate', 'review'],
    modelPreference: 'fast',
    filePatterns: ['**/*'],
  },
};

// ======================== Message Bus ========================

class MessageBus {
  private messages: AgentMessage[] = [];
  private listeners: Map<AgentRole, Array<(msg: AgentMessage) => void>> = new Map();

  send(message: Omit<AgentMessage, 'timestamp'>): void {
    const msg: AgentMessage = { ...message, timestamp: Date.now() };
    this.messages.push(msg);

    // 通知监听者
    if (msg.to === 'all') {
      for (const [, handlers] of this.listeners) {
        handlers.forEach(h => h(msg));
      }
    } else {
      const handlers = this.listeners.get(msg.to) || [];
      handlers.forEach(h => h(msg));
    }
  }

  subscribe(role: AgentRole, handler: (msg: AgentMessage) => void): () => void {
    if (!this.listeners.has(role)) {
      this.listeners.set(role, []);
    }
    this.listeners.get(role)!.push(handler);

    return () => {
      const handlers = this.listeners.get(role);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      }
    };
  }

  getHistory(): AgentMessage[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages = [];
    this.listeners.clear();
  }
}

// ======================== Agent Coordinator ========================

export class AgentCoordinator {
  private messageBus: MessageBus = new MessageBus();
  private onProgress?: (phase: string, detail: string) => void;

  constructor(options?: { onProgress?: (phase: string, detail: string) => void }) {
    this.onProgress = options?.onProgress;
  }

  /**
   * 协调多个 Agent 完成完整的应用生成
   *
   * 流程:
   * 1. Architect Agent → 生成架构设计
   * 2. Frontend + Backend Agents → 并行生成代码
   * 3. QA Agent → 验证和修复
   * 4. Coordinator → 合并最终结果
   */
  async orchestrate(
    prompt: string,
    existingFiles: Record<string, string>,
    generateFn: (systemPrompt: string, userPrompt: string, model: string) => Promise<string>
  ): Promise<CoordinationResult> {
    const startTime = Date.now();

    try {
      // Phase 1: 架构设计
      this.onProgress?.('architecture', '架构师正在设计系统...');
      const plan = await this.runArchitect(prompt, generateFn);

      this.messageBus.send({
        from: 'architect',
        to: 'all',
        type: 'architecture_plan',
        payload: plan,
      });

      // Phase 2: 并行生成前端和后端
      this.onProgress?.('parallel_generation', '前端和后端正在并行生成...');
      const [frontendResult, backendResult] = await Promise.allSettled([
        this.runFrontend(prompt, plan, existingFiles, generateFn),
        this.runBackend(prompt, plan, existingFiles, generateFn),
      ]);

      const frontendFiles = frontendResult.status === 'fulfilled' ? frontendResult.value : {};
      const backendFiles = backendResult.status === 'fulfilled' ? backendResult.value : {};

      // 合并文件
      const mergedFiles = { ...existingFiles, ...backendFiles, ...frontendFiles };

      this.messageBus.send({
        from: 'frontend',
        to: 'coordinator',
        type: 'code_delivery',
        payload: { fileCount: Object.keys(frontendFiles).length },
      });

      this.messageBus.send({
        from: 'backend',
        to: 'coordinator',
        type: 'code_delivery',
        payload: { fileCount: Object.keys(backendFiles).length },
      });

      // Phase 3: QA 验证
      this.onProgress?.('validation', 'QA 正在验证代码...');
      const validation = await this.runQA(mergedFiles, plan, generateFn);

      this.messageBus.send({
        from: 'qa',
        to: 'coordinator',
        type: 'validation_report',
        payload: validation,
      });

      // Phase 4: 如果有问题需要修复
      let finalFiles = mergedFiles;
      if (!validation.passed && validation.needsRegeneration.length > 0) {
        this.onProgress?.('fixing', '修复验证发现的问题...');
        finalFiles = await this.applyFixes(mergedFiles, validation, plan, generateFn);
      }

      this.onProgress?.('complete', '协作完成');

      return {
        success: true,
        files: finalFiles,
        plan,
        validation,
        logs: this.messageBus.getHistory(),
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        files: existingFiles,
        logs: this.messageBus.getHistory(),
        duration: Date.now() - startTime,
      };
    }
  }

  // ======================== Agent Runners ========================

  private async runArchitect(
    prompt: string,
    generateFn: (systemPrompt: string, userPrompt: string, model: string) => Promise<string>
  ): Promise<ArchitecturePlan> {
    const def = AGENT_DEFINITIONS.architect;
    const userPrompt = `根据以下需求，设计完整的系统架构。

需求: ${prompt}

请输出 JSON 格式的架构设计，包含：
- entities: 数据实体列表（名称、字段、关系）
- pages: 页面列表（路径、名称、包含的组件）
- apiRoutes: API 路由列表
- dataModel: SQL 建表语句
- techDecisions: 技术决策说明

只输出 JSON，不要其他内容。`;

    const result = await generateFn(def.systemPrompt, userPrompt, def.modelPreference);

    try {
      // 尝试提取 JSON
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ArchitecturePlan;
      }
    } catch { /* fallback below */ }

    // Fallback: 返回基础架构
    return {
      entities: [],
      pages: [{ path: '/', name: 'Home', components: ['Header', 'Main', 'Footer'] }],
      apiRoutes: [],
      dataModel: '',
      techDecisions: ['React + TypeScript + Tailwind CSS + Supabase'],
    };
  }

  private async runFrontend(
    prompt: string,
    plan: ArchitecturePlan,
    existingFiles: Record<string, string>,
    generateFn: (systemPrompt: string, userPrompt: string, model: string) => Promise<string>
  ): Promise<Record<string, string>> {
    const def = AGENT_DEFINITIONS.frontend;
    const planSummary = this.summarizePlan(plan);

    const userPrompt = `基于以下架构设计，实现所有前端组件和页面。

原始需求: ${prompt}

架构设计:
${planSummary}

页面列表:
${plan.pages.map(p => `- ${p.path}: ${p.name} (组件: ${p.components.join(', ')})`).join('\n')}

请用 <file path="...">code</file> 格式输出所有前端文件。`;

    const result = await generateFn(def.systemPrompt, userPrompt, def.modelPreference);
    return this.extractFiles(result);
  }

  private async runBackend(
    prompt: string,
    plan: ArchitecturePlan,
    existingFiles: Record<string, string>,
    generateFn: (systemPrompt: string, userPrompt: string, model: string) => Promise<string>
  ): Promise<Record<string, string>> {
    const def = AGENT_DEFINITIONS.backend;

    const userPrompt = `基于以下架构设计，实现所有后端数据服务。

原始需求: ${prompt}

数据实体:
${plan.entities.map(e => `- ${e.name}: ${e.fields.join(', ')}`).join('\n')}

SQL Schema:
${plan.dataModel}

请用 <file path="...">code</file> 格式输出所有后端文件（entities, data-service, schema SQL）。`;

    const result = await generateFn(def.systemPrompt, userPrompt, def.modelPreference);
    return this.extractFiles(result);
  }

  private async runQA(
    files: Record<string, string>,
    plan: ArchitecturePlan,
    generateFn: (systemPrompt: string, userPrompt: string, model: string) => Promise<string>
  ): Promise<ValidationReport> {
    const def = AGENT_DEFINITIONS.qa;

    // 构建文件清单
    const fileList = Object.entries(files)
      .filter(([path]) => /\.(tsx?|jsx?)$/.test(path))
      .map(([path, content]) => {
        const lines = content.split('\n').length;
        return `${path} (${lines} lines)`;
      })
      .join('\n');

    // 构建导入检查上下文
    const importContext = Object.entries(files)
      .filter(([path]) => /\.(tsx?|jsx?)$/.test(path))
      .map(([path, content]) => {
        const imports = content.match(/^import\s+.*from\s+['"].*['"]/gm) || [];
        return `${path}:\n${imports.join('\n')}`;
      })
      .join('\n\n');

    const userPrompt = `验证以下项目的代码一致性。

文件列表:
${fileList}

导入关系:
${importContext}

架构计划中的页面:
${plan.pages.map(p => p.path).join(', ')}

架构计划中的实体:
${plan.entities.map(e => e.name).join(', ')}

请检查：
1. 所有导入是否能解析到实际存在的文件
2. 路由是否与页面列表一致
3. 实体类型是否与数据服务一致
4. 是否缺少必要文件

输出 JSON 格式的验证报告：
{ "passed": boolean, "errors": [...], "suggestions": [...], "needsRegeneration": [...] }`;

    const result = await generateFn(def.systemPrompt, userPrompt, def.modelPreference);

    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ValidationReport;
      }
    } catch { /* fallback */ }

    return { passed: true, errors: [], suggestions: [], needsRegeneration: [] };
  }

  private async applyFixes(
    files: Record<string, string>,
    validation: ValidationReport,
    plan: ArchitecturePlan,
    generateFn: (systemPrompt: string, userPrompt: string, model: string) => Promise<string>
  ): Promise<Record<string, string>> {
    // 简化修复：将错误信息注入到 prompt 中重新生成有问题的部分
    const errorSummary = validation.errors
      .map(e => `[${e.severity}] ${e.file}: ${e.message}`)
      .join('\n');

    const fixPrompt = `以下代码存在问题，请修复：

问题列表:
${errorSummary}

修复建议:
${validation.suggestions.join('\n')}

请只输出需要修改的文件，使用 <file path="...">code</file> 格式。`;

    const result = await generateFn(
      AGENT_DEFINITIONS.coordinator.systemPrompt,
      fixPrompt,
      'powerful'
    );

    const fixedFiles = this.extractFiles(result);
    return { ...files, ...fixedFiles };
  }

  // ======================== Helpers ========================

  private summarizePlan(plan: ArchitecturePlan): string {
    const parts: string[] = [];
    parts.push(`实体: ${plan.entities.map(e => e.name).join(', ')}`);
    parts.push(`页面: ${plan.pages.map(p => `${p.name}(${p.path})`).join(', ')}`);
    parts.push(`API: ${plan.apiRoutes.map(r => `${r.method} ${r.path}`).join(', ')}`);
    parts.push(`技术决策: ${plan.techDecisions.join('; ')}`);
    return parts.join('\n');
  }

  private extractFiles(content: string): Record<string, string> {
    const files: Record<string, string> = {};
    const fileRegex = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g;
    let match;

    while ((match = fileRegex.exec(content)) !== null) {
      files[match[1]] = match[2].trim();
    }

    return files;
  }
}
