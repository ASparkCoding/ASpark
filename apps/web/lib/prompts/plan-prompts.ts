/**
 * Plan Mode 相关 Prompt
 * - 问题生成 Prompt
 * - Plan 生成 Prompt
 */

export function getPlanQuestionPrompt(userPrompt: string): string {
  return `你是一个专业的应用需求分析师。用户想要构建一个应用，你需要通过3-5个关键问题来澄清需求细节。

用户需求：${userPrompt}

请生成澄清问题，每个问题严格按以下 JSON 格式输出（一个问题一行，不要用 markdown 代码块包裹）：
{"question": "问题文本", "options": [{"label": "选项A描述", "value": "option_a"}, {"label": "选项B描述", "value": "option_b"}, {"label": "选项C描述", "value": "option_c"}]}

要求：
1. 每个问题 3-4 个选项
2. 选项要覆盖常见场景，用简洁明了的语言
3. 问题数量 3-5 个，聚焦最影响架构和功能的关键决策
4. 问题应涵盖：业务场景、用户角色、核心功能优先级、数据规模/复杂度
5. 不要问技术栈相关问题（技术栈已固定为 React + TypeScript + Tailwind + shadcn/ui + Supabase）
6. 每个问题一行 JSON，不要额外输出`;
}

export function getPlanGeneratePrompt(
  userPrompt: string,
  qaHistory: Array<{ question: string; answer: string }>,
  supplement?: string
): string {
  let prompt = `基于以下用户需求和问答澄清，生成一份结构化的应用构建计划。

## 用户原始需求
${userPrompt}

## 需求澄清
${qaHistory.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n')}`;

  if (supplement) {
    prompt += `\n\n## 用户补充说明\n${supplement}`;
  }

  prompt += `

请严格按以下格式输出 Plan（使用 Markdown）：

## Intent & Goal
[1-2段描述系统目标和核心价值]

## Audience & Roles
[列出所有用户角色及其职责，用列表格式]

## Core Flows
[列出核心业务流程，每个流程用编号列表描述关键步骤]

## What NOT to Do
[明确列出不在此次构建范围内的功能]

## Technical Requirements
[技术要求，固定技术栈：React + TypeScript + Tailwind CSS + shadcn/ui + Supabase]

## Design Preferences
[配色方案、布局风格、UI偏好]

## Entities
[列出需要创建的数据实体及其关键字段，每个实体一个子标题]

## Pages
[列出需要创建的页面及其主要功能]

---

同时，请在最后输出一行结构化 JSON（用 \`\`\`json 代码块包裹），包含以下字段：
\`\`\`json
{
  "intent": "系统目标简述",
  "audience": [{"role": "角色名", "description": "职责描述"}],
  "coreFlows": ["流程1简述", "流程2简述"],
  "whatNotToDo": ["不做的事1", "不做的事2"],
  "techRequirements": "技术要求简述",
  "designPreferences": "设计偏好简述",
  "entities": [{"name": "EntityName", "fields": ["id", "name", "..."]}],
  "pages": [{"name": "页面名", "description": "页面描述"}],
  "appIcon": "📊",
  "brandColor": "#3B82F6",
  "appName": "AppName"
}
\`\`\`

其中 appIcon 是最能代表该应用的 emoji，brandColor 是主品牌色 HEX 值，appName 是简短的英文应用名（如 SalesCRM, TaskFlow, EduHub）。`;

  return prompt;
}

/**
 * 从 Plan 生成的 LLM 输出中提取结构化 JSON
 */
export function parsePlanStructuredJson(fullText: string): Record<string, unknown> | null {
  // 尝试从 ```json 代码块中提取
  const jsonBlockMatch = fullText.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    try {
      return JSON.parse(jsonBlockMatch[1].trim());
    } catch {
      // ignore parse error
    }
  }

  // fallback: 尝试找最后一个 { ... } 块
  const lastBrace = fullText.lastIndexOf('}');
  if (lastBrace !== -1) {
    const firstBrace = fullText.lastIndexOf('{', lastBrace);
    if (firstBrace !== -1) {
      // 向前查找完整的 JSON 对象（可能包含嵌套的 { }）
      let depth = 0;
      let start = -1;
      for (let i = lastBrace; i >= 0; i--) {
        if (fullText[i] === '}') depth++;
        if (fullText[i] === '{') depth--;
        if (depth === 0) {
          start = i;
          break;
        }
      }
      if (start !== -1) {
        try {
          return JSON.parse(fullText.slice(start, lastBrace + 1));
        } catch {
          // ignore
        }
      }
    }
  }

  return null;
}

/**
 * 从 Plan LLM 输出中提取 Markdown 部分（去掉 JSON 代码块）
 */
export function extractPlanMarkdown(fullText: string): string {
  return fullText
    .replace(/---\s*\n*```json[\s\S]*```\s*$/, '')
    .replace(/```json[\s\S]*```\s*$/, '')
    .trim();
}
