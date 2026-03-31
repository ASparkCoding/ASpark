import type { GenerationType, ConversationMessage } from '@/types';
import { estimateTokens, getContextTokenLimit } from './token-estimator';
import {
  TECH_STACK_DECLARATION,
  AVAILABLE_COMPONENTS_LIST,
  PRE_INJECTED_FILES,
  ENTITY_PATTERN,
  CRITICAL_RULES,
  UI_STANDARDS,
  SCHEMA_RULES,
  ENTRY_STANDARDS,
  SCAFFOLD_INSTRUCTIONS,
  GOLDEN_EXAMPLE,
} from './prompt-layers';

interface PromptContext {
  type: GenerationType;
  existingFiles?: { path: string; content: string }[];
  conversationHistory?: ConversationMessage[];
}

// ============================================================
// Core prompt — shared across all generation types (~300 tokens)
// ============================================================
const CORE_PROMPT = `You are Zaovate — an expert AI app builder. Output complete files using <file path="...">code</file> XML tags. Every file must be complete, never use placeholders.

NEVER output setup instructions, README, or "how to run" text. The platform automates everything.
Only output code files and a brief 1-2 sentence summary.

## Output Format
<file path="relative/path">file content</file>

For database schemas:
<file path="supabase-schema.sql">CREATE TABLE ...</file>

${TECH_STACK_DECLARATION}

${AVAILABLE_COMPONENTS_LIST}`;

/**
 * Build the complete System Prompt based on generation task type
 */
export function buildSystemPrompt(ctx: PromptContext): string {
  switch (ctx.type) {
    case 'scaffold':
      return buildScaffoldPrompt();
    case 'iterate':
      return buildIteratePrompt(ctx);
    case 'refactor':
      return buildRefactorPrompt(ctx);
    case 'complete':
      return buildCompletePrompt(ctx);
    case 'reason':
      return buildReasonPrompt(ctx);
    default:
      return buildScaffoldPrompt();
  }
}

function buildScaffoldPrompt(): string {
  return `${CORE_PROMPT}

${ENTITY_PATTERN}

${UI_STANDARDS}

${SCHEMA_RULES}

${ENTRY_STANDARDS}

${PRE_INJECTED_FILES}

${SCAFFOLD_INSTRUCTIONS}

${GOLDEN_EXAMPLE}

${CRITICAL_RULES}`;
}

function buildIteratePrompt(ctx: PromptContext): string {
  let prompt = `${CORE_PROMPT}

## Task: Iterate (incremental modification)
Output only files that need to be modified or added. Do not output unchanged files.

### Rules:
1. Keep existing code style consistent
2. Only output changed files to reduce token usage
3. If database changes needed, output updated supabase-schema.sql
4. The project uses createEntityService SDK — keep entity patterns consistent
5. Use pre-installed shadcn/ui components (25 available), don't regenerate them
6. If adding new pages: create page in src/pages/, add Route in App.tsx, add nav in Sidebar

### Critical — Do Not Break:
- src/App.tsx — ADD routes, don't replace existing
- Entity service files — use createEntityService pattern
- src/lib/supabase.ts — do not modify

${CRITICAL_RULES}`;

  if (ctx.existingFiles?.length) {
    const structureSummary = buildProjectStructureSummary(ctx.existingFiles);
    prompt += `\n\n## Project Structure\n${structureSummary}`;

    const entitySummary = buildEntitySummary(ctx.existingFiles);
    if (entitySummary) {
      prompt += `\n\n## Entity Types (reference, do not modify unless asked)\n${entitySummary}`;
    }

    const compressed = compressContext(ctx.existingFiles, 'iterate');
    prompt += `\n\n## Existing Project Files\n${compressed}`;
  }

  return prompt;
}

function buildRefactorPrompt(ctx: PromptContext): string {
  let prompt = `${CORE_PROMPT}

## Task: Refactor (architecture restructuring)
Perform large-scale refactoring. Output all affected files.

Rules:
1. Analyze architecture issues and propose improvements
2. Keep external interfaces unchanged unless explicitly requested
3. Follow SOLID principles and React best practices
4. Use createEntityService SDK pattern for entities
5. Extract common logic into hooks or utils

${CRITICAL_RULES}`;

  if (ctx.existingFiles?.length) {
    const fileList = ctx.existingFiles
      .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
      .join('\n\n');
    prompt += `\n\n## Full Project Code\n${fileList}`;
  }

  return prompt;
}

function buildCompletePrompt(ctx: PromptContext): string {
  let prompt = `${CORE_PROMPT}

## Task: Code Completion
Provide smart code completion based on context. Be fast and concise.
Use components and utils already in the project. Keep consistent style.`;

  if (ctx.existingFiles?.length) {
    const compressed = compressContext(ctx.existingFiles, 'complete');
    prompt += `\n\n## Current File Context\n${compressed}`;
  }

  return prompt;
}

function buildReasonPrompt(ctx: PromptContext): string {
  let prompt = `${CORE_PROMPT}

## Task: Complex Reasoning
Deep thinking to solve complex problems.

Requirements:
1. Analyze the problem first, clarify logical relationships
2. Consider edge cases and error handling
3. Output complete implementation with proper types
4. Use createEntityService SDK for data entities

${CRITICAL_RULES}`;

  if (ctx.existingFiles?.length) {
    const compressed = compressContext(ctx.existingFiles, 'reason');
    prompt += `\n\n## Existing Project Files\n${compressed}`;
  }

  return prompt;
}

/**
 * Build project structure summary for iterate mode
 */
function buildProjectStructureSummary(files: { path: string; content: string }[]): string {
  const tree: string[] = ['Project files:'];
  const grouped = new Map<string, string[]>();

  for (const f of files) {
    const dir = f.path.split('/').slice(0, -1).join('/') || '.';
    if (!grouped.has(dir)) grouped.set(dir, []);
    grouped.get(dir)!.push(f.path.split('/').pop()!);
  }

  for (const [dir, fileNames] of Array.from(grouped.entries()).sort()) {
    tree.push(`${dir}/`);
    for (const name of fileNames) {
      tree.push(`  - ${name}`);
    }
  }

  return tree.join('\n');
}

/**
 * Build entity type summary to prevent inconsistencies during iteration
 */
function buildEntitySummary(files: { path: string; content: string }[]): string | null {
  const entityFiles = files.filter(f => f.path.includes('entities/'));
  if (entityFiles.length === 0) return null;

  const summaries: string[] = [];
  for (const ef of entityFiles) {
    const interfaceMatch = ef.content.match(/export interface \w+ \{[^}]+\}/);
    if (interfaceMatch) {
      summaries.push(`### ${ef.path}\n\`\`\`typescript\n${interfaceMatch[0]}\n\`\`\``);
    }
  }

  return summaries.length > 0 ? summaries.join('\n\n') : null;
}

/**
 * Smart context compression — token-aware file prioritization
 */
function compressContext(
  files: { path: string; content: string }[],
  type: string = 'iterate'
): string {
  const MAX_TOKENS = getContextTokenLimit(type);
  let totalTokens = 0;

  const prioritized = [...files].sort(
    (a, b) => getFilePriority(a.path) - getFilePriority(b.path)
  );

  const result: string[] = [];

  for (const file of prioritized) {
    if (totalTokens > MAX_TOKENS) {
      result.push(
        `### ${file.path}\n(omitted, ~${estimateTokens(file.content)} tokens)`
      );
      continue;
    }

    const fileTokens = estimateTokens(file.content);

    if (fileTokens > 1500 && totalTokens + fileTokens > MAX_TOKENS) {
      const head = file.content.slice(0, 2000);
      const tail = file.content.slice(-1000);
      const truncatedTokens = estimateTokens(head + tail);
      result.push(
        `### ${file.path}\n\`\`\`\n${head}\n... (omitted ~${fileTokens - truncatedTokens} tokens) ...\n${tail}\n\`\`\``
      );
      totalTokens += truncatedTokens;
    } else {
      result.push(`### ${file.path}\n\`\`\`\n${file.content}\n\`\`\``);
      totalTokens += fileTokens;
    }
  }

  return result.join('\n\n');
}

function getFilePriority(path: string): number {
  if (path.includes('package.json')) return 1;
  if (path.includes('types/')) return 2;
  if (path.includes('schema.sql')) return 3;
  if (path.includes('entities/')) return 4;
  if (path.includes('lib/')) return 5;
  if (path.includes('App.tsx')) return 6;
  if (path.includes('pages/')) return 7;
  if (path.includes('components/ui/')) return 10;
  return 9;
}

/**
 * Suggestion prompt for recommending next steps after generation
 */
export function getSuggestionPrompt(generatedFiles: string[]): string {
  return `基于以下已生成的应用文件列表，推荐 3-4 个最有价值的下一步优化操作。

## 已生成文件
${generatedFiles.join('\n')}

请严格输出 JSON 数组格式（不要包裹在 markdown 代码块中）：
[{"label": "4-8字的短标签", "prompt": "详细的操作描述，可直接作为AI的输入指令"}]

要求：
1. label 简洁（4-8个字），如"添加数据图表"、"优化移动端"、"添加搜索功能"
2. prompt 要具体、可操作，描述清楚要做什么
3. 优先推荐能显著提升用户体验的功能
4. 不要推荐已经实现的功能
5. 输出 3-4 个建议`;
}

/**
 * Build user messages with conversation history context
 */
export function buildUserMessage(
  prompt: string,
  history?: ConversationMessage[],
  maxHistoryRounds: number = 5
): ConversationMessage[] {
  const messages: ConversationMessage[] = [];

  if (history && history.length > 0) {
    const recentHistory = history.slice(-(maxHistoryRounds * 2));
    messages.push(...recentHistory);
  }

  messages.push({ role: 'user', content: prompt });
  return messages;
}
