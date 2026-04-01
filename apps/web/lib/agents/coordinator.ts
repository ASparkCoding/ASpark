/**
 * ASpark Multi-Agent Coordinator (v2)
 * 多代理协作系统 - 真正接入 AI SDK + TaskManager
 *
 * 流程: Architect → (Frontend + Backend 并行) → QA 验证 → 修复
 * 通过 taskManager 追踪每个 Agent 的进度
 */

import { generateText } from 'ai';
import { selectModel } from '@/lib/llm/router';
import { taskManager, type TaskResult, type TaskType } from '../tasks/task-manager';
import { parseGeneratedCode } from '@/lib/code-gen/parser';
import type { GenerationType } from '@/types';

// ======================== Types ========================

export type AgentRole = 'coordinator' | 'architect' | 'frontend' | 'backend' | 'qa';

export interface AgentDefinition {
  name: string;
  role: AgentRole;
  systemPrompt: string;
  /** 推荐模型类型（映射到 router 的 GenerationType） */
  modelType: GenerationType;
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
  | 'status_update';

export interface ArchitecturePlan {
  entities: Array<{ name: string; fields: string[]; relationships: string[] }>;
  pages: Array<{ path: string; name: string; components: string[] }>;
  apiRoutes: Array<{ method: string; path: string; description: string }>;
  dataModel: string;
  techDecisions: string[];
}

export interface ValidationReport {
  passed: boolean;
  errors: Array<{ file: string; message: string; severity: 'error' | 'warning' }>;
  suggestions: string[];
  needsFix: boolean;
}

export interface CoordinationResult {
  success: boolean;
  files: Array<{ path: string; content: string }>;
  plan?: ArchitecturePlan;
  validation?: ValidationReport;
  logs: AgentMessage[];
  duration: number;
  taskGroupId?: string;
}

export interface CoordinationProgress {
  phase: 'architecture' | 'parallel_generation' | 'validation' | 'fixing' | 'complete';
  detail: string;
  agentRole?: AgentRole;
  progress: number; // 0-100
}

// ======================== Agent Definitions ========================

const AGENT_DEFS: Record<AgentRole, AgentDefinition> = {
  coordinator: {
    name: 'Coordinator',
    role: 'coordinator',
    systemPrompt: '',
    modelType: 'iterate',
    filePatterns: ['**/*'],
  },
  architect: {
    name: 'Architect',
    role: 'architect',
    systemPrompt: `你是系统架构师。根据用户需求输出 JSON 格式的架构设计。
只输出设计，不写代码。

输出格式 (strict JSON):
{
  "entities": [{"name": "...", "fields": ["id uuid PK", "name text", ...], "relationships": ["belongs_to User"]}],
  "pages": [{"path": "/", "name": "Home", "components": ["Header", "HeroSection", "Footer"]}],
  "apiRoutes": [{"method": "GET", "path": "/api/items", "description": "List items"}],
  "dataModel": "CREATE TABLE ...",
  "techDecisions": ["Use React Router for navigation", ...]
}

技术栈: React 18 + TypeScript + Tailwind CSS + shadcn/ui + Supabase + Vite
可用 shadcn/ui 组件: Button, Card, Input, Select, Dialog, Tabs, Table, Badge, Avatar, Tooltip, DropdownMenu, Sheet, Separator, ScrollArea, Switch, Slider, Progress, Skeleton, Textarea, Label, Checkbox, RadioGroup, Alert, Popover, Command
实体模式: createEntityService(supabase, 'table_name')`,
    modelType: 'reason',
    filePatterns: [],
  },
  frontend: {
    name: 'Frontend Developer',
    role: 'frontend',
    systemPrompt: `你是前端开发专家。根据架构设计实现 React 组件和页面。

规则:
1. 使用 <file path="...">code</file> XML 格式输出
2. 使用 Tailwind CSS 样式，不用内联 style
3. 使用已安装的 shadcn/ui 组件（从 @/components/ui/ 导入）
4. 页面放在 src/pages/，组件放在 src/components/
5. 导入 Entity Service 用 @/entities/xxx
6. 导入 Supabase 用 @/lib/supabase
7. 每个文件必须完整，不能有省略号或 placeholder

技术栈: React 18 + TypeScript + Tailwind CSS + shadcn/ui + React Router`,
    modelType: 'scaffold',
    filePatterns: ['src/components/**', 'src/pages/**', 'src/hooks/**', 'src/App.tsx'],
  },
  backend: {
    name: 'Backend Developer',
    role: 'backend',
    systemPrompt: `你是后端开发专家。根据架构设计实现数据库 Schema 和数据服务。

规则:
1. 使用 <file path="...">code</file> XML 格式输出
2. SQL Schema 放在 supabase-schema.sql
3. Entity Service 使用 createEntityService 模式:
   import { supabase } from '@/lib/supabase';
   export const xxxService = createEntityService(supabase, 'table_name');
4. 必须包含 RLS 策略
5. 每个文件必须完整

技术栈: Supabase (PostgreSQL) + TypeScript`,
    modelType: 'scaffold',
    filePatterns: ['src/entities/**', 'src/lib/data-service.ts', '*.sql'],
  },
  qa: {
    name: 'QA Engineer',
    role: 'qa',
    systemPrompt: `你是 QA 工程师。验证代码一致性并输出验证报告。

检查清单:
1. 导入路径是否指向实际存在的文件
2. 路由配置是否与页面文件匹配
3. Entity Service 调用是否与 SQL Schema 一致
4. 组件 props 类型是否正确
5. 是否缺少必要文件（App.tsx, main.tsx 等）

输出格式 (strict JSON):
{
  "passed": true/false,
  "errors": [{"file": "path", "message": "description", "severity": "error"|"warning"}],
  "suggestions": ["suggestion text"],
  "needsFix": true/false
}`,
    modelType: 'complete',
    filePatterns: ['**/*'],
  },
};

// ======================== LLM Call Helper ========================

async function callAgent(
  role: AgentRole,
  userPrompt: string,
  maxTokens: number = 16000,
): Promise<string> {
  const def = AGENT_DEFS[role];
  const model = selectModel({ type: def.modelType, contextLength: def.systemPrompt.length + userPrompt.length });

  const { text } = await generateText({
    model,
    system: def.systemPrompt,
    prompt: userPrompt,
    maxOutputTokens: maxTokens,
  });

  return text;
}

// ======================== Agent Coordinator ========================

export class AgentCoordinator {
  private logs: AgentMessage[] = [];
  private onProgress?: (progress: CoordinationProgress) => void;

  constructor(options?: { onProgress?: (progress: CoordinationProgress) => void }) {
    this.onProgress = options?.onProgress;
  }

  /**
   * 协调多个 Agent 完成完整的应用生成
   *
   * 流程:
   * 1. Architect Agent → 设计架构 (JSON)
   * 2. Frontend + Backend Agents → 并行生成代码
   * 3. QA Agent → 验证一致性
   * 4. 如有问题 → 自动修复一轮
   */
  async orchestrate(
    prompt: string,
    existingFiles: Array<{ path: string; content: string }>,
  ): Promise<CoordinationResult> {
    const startTime = Date.now();
    this.logs = [];

    // 创建 TaskManager 任务组
    const architectTask = taskManager.createTask({
      type: 'custom',
      name: 'Architecture Design',
      description: '架构师设计系统结构',
      execute: async () => {
        const plan = await this.runArchitect(prompt);
        return { data: plan };
      },
    });

    try {
      // ═══ Phase 1: Architecture ═══
      this.emitProgress('architecture', '架构师正在设计系统结构...', 'architect', 10);
      await taskManager.executeTask(architectTask);
      const plan = architectTask.result?.data as ArchitecturePlan;

      if (!plan || !plan.pages || plan.pages.length === 0) {
        return this.fail(existingFiles, startTime, 'Architecture design returned empty plan');
      }

      this.log('architect', 'all', 'architecture_plan', {
        entities: plan.entities?.length || 0,
        pages: plan.pages?.length || 0,
      });

      // ═══ Phase 2: Parallel Frontend + Backend ═══
      this.emitProgress('parallel_generation', '前端和后端并行生成中...', undefined, 30);

      const frontendTask = taskManager.createTask({
        type: 'frontend',
        name: 'Frontend Generation',
        description: '前端开发生成组件和页面',
        execute: async () => {
          const files = await this.runFrontend(prompt, plan);
          return { files };
        },
      });

      const backendTask = taskManager.createTask({
        type: 'backend',
        name: 'Backend Generation',
        description: '后端开发生成数据模型和服务',
        execute: async () => {
          const files = await this.runBackend(prompt, plan);
          return { files };
        },
      });

      // 并行执行
      const [frontendResult, backendResult] = await Promise.allSettled([
        taskManager.executeTask(frontendTask),
        taskManager.executeTask(backendTask),
      ]);

      const frontendFiles = frontendResult.status === 'fulfilled' ? (frontendTask.result?.files || {}) : {};
      const backendFiles = backendResult.status === 'fulfilled' ? (backendTask.result?.files || {}) : {};

      this.log('frontend', 'coordinator', 'code_delivery', { fileCount: Object.keys(frontendFiles).length });
      this.log('backend', 'coordinator', 'code_delivery', { fileCount: Object.keys(backendFiles).length });

      // 合并所有文件（后端先，前端覆盖，保证 App.tsx 等入口以前端为准）
      const mergedMap: Record<string, string> = {};
      for (const f of existingFiles) mergedMap[f.path] = f.content;
      Object.assign(mergedMap, backendFiles, frontendFiles);

      this.emitProgress('parallel_generation', `生成完成: 前端 ${Object.keys(frontendFiles).length} 文件, 后端 ${Object.keys(backendFiles).length} 文件`, undefined, 60);

      // ═══ Phase 3: QA Validation ═══
      this.emitProgress('validation', 'QA 正在验证代码一致性...', 'qa', 75);

      const qaTask = taskManager.createTask({
        type: 'validate',
        name: 'QA Validation',
        description: 'QA 工程师验证代码一致性',
        execute: async () => {
          const validation = await this.runQA(mergedMap, plan);
          return { data: validation };
        },
      });

      await taskManager.executeTask(qaTask);
      const validation = qaTask.result?.data as ValidationReport;

      this.log('qa', 'coordinator', 'validation_report', validation);

      // ═══ Phase 4: Fix if needed ═══
      let finalMap = mergedMap;
      if (validation && validation.needsFix && validation.errors.length > 0) {
        this.emitProgress('fixing', `修复 ${validation.errors.length} 个问题...`, undefined, 85);
        finalMap = await this.applyFixes(mergedMap, validation, plan);
      }

      this.emitProgress('complete', '多 Agent 协作完成', undefined, 100);

      // 转为 array 格式
      const finalFiles = Object.entries(finalMap).map(([path, content]) => ({ path, content }));

      return {
        success: true,
        files: finalFiles,
        plan,
        validation,
        logs: this.logs,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[Coordinator] Orchestration failed:', error);
      return this.fail(existingFiles, startTime, (error as Error).message);
    } finally {
      taskManager.cleanup();
    }
  }

  // ======================== Agent Runners ========================

  private async runArchitect(prompt: string): Promise<ArchitecturePlan> {
    const userPrompt = `根据以下需求，设计完整的系统架构。

需求: ${prompt}

输出 strict JSON（不要 markdown 代码块，不要额外说明）:`;

    const result = await callAgent('architect', userPrompt, 4096);

    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ArchitecturePlan;
      }
    } catch { /* fallback */ }

    // Fallback: 从 prompt 推断基础架构
    return {
      entities: [],
      pages: [{ path: '/', name: 'Home', components: ['Header', 'Main', 'Footer'] }],
      apiRoutes: [],
      dataModel: '',
      techDecisions: ['React + TypeScript + Tailwind CSS + Supabase'],
    };
  }

  private async runFrontend(prompt: string, plan: ArchitecturePlan): Promise<Record<string, string>> {
    const planSummary = this.summarizePlan(plan);

    const userPrompt = `基于以下架构设计，实现所有前端组件和页面。

原始需求: ${prompt}

架构设计:
${planSummary}

页面列表:
${plan.pages.map(p => `- ${p.path}: ${p.name} (组件: ${p.components.join(', ')})`).join('\n')}

实体列表:
${plan.entities.map(e => `- ${e.name}: ${e.fields.join(', ')}`).join('\n')}

请用 <file path="...">code</file> 格式输出所有前端文件。
必须包含: src/App.tsx (路由配置), 所有页面, 所有组件。`;

    const result = await callAgent('frontend', userPrompt, 32000);
    return this.extractFileMap(result);
  }

  private async runBackend(prompt: string, plan: ArchitecturePlan): Promise<Record<string, string>> {
    const userPrompt = `基于以下架构设计，实现所有后端数据服务。

原始需求: ${prompt}

数据实体:
${plan.entities.map(e => `- ${e.name}: 字段 [${e.fields.join(', ')}], 关系 [${e.relationships.join(', ')}]`).join('\n')}

SQL Schema 参考:
${plan.dataModel || '(请根据实体设计生成)'}

请用 <file path="...">code</file> 格式输出:
1. supabase-schema.sql (建表 + RLS)
2. src/entities/ 下每个实体的 service 文件
3. src/lib/supabase.ts (如果还没有)`;

    const result = await callAgent('backend', userPrompt, 16000);
    return this.extractFileMap(result);
  }

  private async runQA(files: Record<string, string>, plan: ArchitecturePlan): Promise<ValidationReport> {
    // 构建文件清单和导入关系
    const fileList = Object.entries(files)
      .filter(([p]) => /\.(tsx?|jsx?|sql)$/.test(p))
      .map(([path, content]) => {
        const imports = content.match(/^import\s+.*from\s+['"].*['"]/gm) || [];
        const lineCount = content.split('\n').length;
        return `${path} (${lineCount} lines):\n  imports: ${imports.map(i => i.replace(/^import\s+/, '').trim()).join(', ') || 'none'}`;
      })
      .join('\n');

    const userPrompt = `验证以下项目的代码一致性。

文件及导入关系:
${fileList}

架构计划:
- 页面: ${plan.pages.map(p => `${p.name}(${p.path})`).join(', ')}
- 实体: ${plan.entities.map(e => e.name).join(', ')}

输出 strict JSON（不要 markdown 代码块）:`;

    const result = await callAgent('qa', userPrompt, 4096);

    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ValidationReport;
      }
    } catch { /* fallback */ }

    return { passed: true, errors: [], suggestions: [], needsFix: false };
  }

  private async applyFixes(
    files: Record<string, string>,
    validation: ValidationReport,
    plan: ArchitecturePlan,
  ): Promise<Record<string, string>> {
    const errorSummary = validation.errors
      .filter(e => e.severity === 'error')
      .slice(0, 10)
      .map(e => `- [${e.severity}] ${e.file}: ${e.message}`)
      .join('\n');

    const relevantFileContents = validation.errors
      .map(e => e.file)
      .filter((f, i, arr) => arr.indexOf(f) === i)
      .slice(0, 5)
      .map(f => files[f] ? `<file path="${f}">\n${files[f]}\n</file>` : '')
      .filter(Boolean)
      .join('\n\n');

    const fixPrompt = `以下代码存在问题，请修复。只输出需要修改的文件。

## 问题列表
${errorSummary}

## 修复建议
${validation.suggestions.slice(0, 5).join('\n')}

## 当前相关文件
${relevantFileContents}

请用 <file path="...">code</file> 格式输出修复后的文件。`;

    const result = await callAgent('frontend', fixPrompt, 16000);
    const fixedFiles = this.extractFileMap(result);

    return { ...files, ...fixedFiles };
  }

  // ======================== Helpers ========================

  private summarizePlan(plan: ArchitecturePlan): string {
    const parts: string[] = [];
    if (plan.entities.length > 0) {
      parts.push(`实体: ${plan.entities.map(e => e.name).join(', ')}`);
    }
    if (plan.pages.length > 0) {
      parts.push(`页面: ${plan.pages.map(p => `${p.name}(${p.path})`).join(', ')}`);
    }
    if (plan.apiRoutes.length > 0) {
      parts.push(`API: ${plan.apiRoutes.map(r => `${r.method} ${r.path}`).join(', ')}`);
    }
    if (plan.techDecisions.length > 0) {
      parts.push(`技术决策: ${plan.techDecisions.join('; ')}`);
    }
    return parts.join('\n');
  }

  private extractFileMap(content: string): Record<string, string> {
    const parsed = parseGeneratedCode(content);
    const files: Record<string, string> = {};
    for (const f of parsed) {
      files[f.path] = f.content;
    }
    return files;
  }

  private log(from: AgentRole, to: AgentRole | 'all', type: AgentMessageType, payload: unknown): void {
    this.logs.push({ from, to, type, payload, timestamp: Date.now() });
  }

  private emitProgress(
    phase: CoordinationProgress['phase'],
    detail: string,
    agentRole?: AgentRole,
    progress: number = 0,
  ): void {
    this.onProgress?.({ phase, detail, agentRole, progress });
  }

  private fail(
    existingFiles: Array<{ path: string; content: string }>,
    startTime: number,
    error: string,
  ): CoordinationResult {
    this.log('coordinator', 'all', 'status_update', { error });
    return {
      success: false,
      files: existingFiles,
      logs: this.logs,
      duration: Date.now() - startTime,
    };
  }
}

// ======================== Exports ========================

export { AGENT_DEFS as AGENT_DEFINITIONS };
