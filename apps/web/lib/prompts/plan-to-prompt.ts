/**
 * 将结构化 Plan 转换为增强版 scaffold prompt
 */

export interface PlanStructured {
  intent: string;
  audience: Array<{ role: string; description: string }>;
  coreFlows: string[];
  whatNotToDo: string[];
  techRequirements: string;
  designPreferences: string;
  entities: Array<{ name: string; fields: string[] }>;
  pages: Array<{ name: string; description: string }>;
}

export function planToScaffoldPrompt(
  originalPrompt: string,
  planContent: string,
  planStructured?: PlanStructured | null
): string {
  // 如果有结构化数据，用结构化格式；否则直接用 Markdown Plan
  if (planStructured) {
    return `请根据以下详细计划构建完整的应用。

## 用户原始需求
${originalPrompt}

## 系统目标
${planStructured.intent}

## 用户角色
${planStructured.audience.map((a) => `- ${a.role}: ${a.description}`).join('\n')}

## 核心业务流程
${planStructured.coreFlows.map((f, i) => `${i + 1}. ${f}`).join('\n')}

## 不包含的功能
${planStructured.whatNotToDo.map((x) => `- ${x}`).join('\n')}

## 数据实体
${planStructured.entities.map((e) => `### ${e.name}\n字段: ${e.fields.join(', ')}`).join('\n\n')}

## 页面列表
${planStructured.pages.map((p) => `- ${p.name}: ${p.description}`).join('\n')}

## 设计偏好
${planStructured.designPreferences}

请严格按照此计划构建，不要添加计划外的功能。确保生成的代码包含 src/entities/ 目录，每个实体一个文件，导出类型定义和 Supabase CRUD 函数。`;
  }

  // fallback: 直接用 Markdown Plan
  return `请根据以下详细计划构建完整的应用。

## 用户原始需求
${originalPrompt}

## 构建计划
${planContent}

请严格按照此计划构建，不要添加计划外的功能。`;
}
