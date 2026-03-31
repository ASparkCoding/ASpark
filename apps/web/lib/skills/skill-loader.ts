/**
 * ASpark Skill System
 * 技能包加载、注册、动态 prompt 注入
 */

import { promises as fs } from 'fs';
import path from 'path';

// ======================== Types ========================

export interface SkillManifest {
  /** 技能名称 */
  name: string;
  /** 版本号 */
  version: string;
  /** 描述 */
  description: string;
  /** 分类标签 */
  tags: string[];
  /** system prompt 片段文件路径 */
  promptFragments: string[];
  /** 模板文件路径（glob 模式） */
  templates: string[];
  /** 验证规则文件路径 */
  validators: string[];
  /** 必需的实体类型 */
  requiredEntities: string[];
  /** 推荐的 UI 组件 */
  recommendedComponents: string[];
  /** 依赖的其他技能 */
  dependencies: string[];
  /** 示例 prompt */
  examplePrompts: string[];
}

export interface LoadedSkill {
  manifest: SkillManifest;
  /** 合并后的 prompt 片段 */
  promptContent: string;
  /** 模板文件内容 */
  templateFiles: Record<string, string>;
  /** 技能包根路径 */
  rootPath: string;
  /** 是否为内置技能 */
  isBuiltin: boolean;
}

export interface SkillMatchResult {
  skill: LoadedSkill;
  /** 匹配分数 (0-1) */
  score: number;
  /** 匹配原因 */
  reason: string;
}

// ======================== Skill Registry ========================

class SkillRegistry {
  private skills: Map<string, LoadedSkill> = new Map();
  private builtinSkillsDir: string;
  private customSkillsDir: string;

  constructor() {
    this.builtinSkillsDir = path.resolve(process.cwd(), 'lib/skills/builtin');
    this.customSkillsDir = path.resolve(process.cwd(), 'skills');
  }

  /**
   * 初始化：加载所有内置和自定义技能
   */
  async initialize(): Promise<void> {
    // 加载内置技能
    await this.loadSkillsFromDirectory(this.builtinSkillsDir, true);
    // 加载自定义技能
    await this.loadSkillsFromDirectory(this.customSkillsDir, false);
  }

  /**
   * 注册一个技能
   */
  register(skill: LoadedSkill): void {
    this.skills.set(skill.manifest.name, skill);
  }

  /**
   * 获取指定技能
   */
  get(name: string): LoadedSkill | undefined {
    return this.skills.get(name);
  }

  /**
   * 列出所有已注册技能
   */
  list(): LoadedSkill[] {
    return Array.from(this.skills.values());
  }

  /**
   * 根据用户 prompt 自动匹配最相关的技能
   */
  matchSkills(prompt: string, topN: number = 3): SkillMatchResult[] {
    const results: SkillMatchResult[] = [];
    const promptLower = prompt.toLowerCase();
    const promptWords = promptLower.split(/\s+/);

    for (const skill of this.skills.values()) {
      let score = 0;
      const reasons: string[] = [];

      // 1. 标签匹配
      for (const tag of skill.manifest.tags) {
        if (promptLower.includes(tag.toLowerCase())) {
          score += 0.3;
          reasons.push(`标签匹配: ${tag}`);
        }
      }

      // 2. 描述关键词匹配
      const descWords = skill.manifest.description.toLowerCase().split(/\s+/);
      const descOverlap = promptWords.filter(w => descWords.includes(w)).length;
      if (descOverlap > 0) {
        score += 0.2 * Math.min(descOverlap / 3, 1);
        reasons.push(`描述匹配: ${descOverlap} 个关键词`);
      }

      // 3. 实体类型匹配
      for (const entity of skill.manifest.requiredEntities) {
        if (promptLower.includes(entity.toLowerCase())) {
          score += 0.25;
          reasons.push(`实体匹配: ${entity}`);
        }
      }

      // 4. 示例 prompt 相似度
      for (const example of skill.manifest.examplePrompts) {
        const exampleWords = example.toLowerCase().split(/\s+/);
        const overlap = promptWords.filter(w => exampleWords.includes(w)).length;
        const similarity = overlap / Math.max(promptWords.length, exampleWords.length);
        if (similarity > 0.3) {
          score += 0.25 * similarity;
          reasons.push(`示例匹配: "${example.slice(0, 50)}..."`);
        }
      }

      if (score > 0.1) {
        results.push({
          skill,
          score: Math.min(score, 1),
          reason: reasons.join('; '),
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }

  /**
   * 为生成注入技能 prompt
   */
  getSkillPromptInjection(skillNames: string[]): string {
    const fragments: string[] = [];

    for (const name of skillNames) {
      const skill = this.skills.get(name);
      if (skill && skill.promptContent) {
        fragments.push(
          `\n<!-- Skill: ${skill.manifest.name} v${skill.manifest.version} -->\n` +
          skill.promptContent
        );
      }
    }

    return fragments.length > 0
      ? `\n\n--- 已激活的技能包 ---\n${fragments.join('\n\n')}\n--- 技能包结束 ---\n`
      : '';
  }

  /**
   * 获取技能的模板文件
   */
  getSkillTemplates(skillNames: string[]): Record<string, string> {
    const templates: Record<string, string> = {};

    for (const name of skillNames) {
      const skill = this.skills.get(name);
      if (skill) {
        Object.assign(templates, skill.templateFiles);
      }
    }

    return templates;
  }

  // ======================== Private ========================

  private async loadSkillsFromDirectory(dir: string, isBuiltin: boolean): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            const skill = await this.loadSkill(path.join(dir, entry.name), isBuiltin);
            if (skill) {
              this.register(skill);
            }
          } catch (error) {
            console.warn(`[SkillLoader] Failed to load skill "${entry.name}":`, error);
          }
        }
      }
    } catch {
      // 目录不存在，静默忽略
    }
  }

  private async loadSkill(skillDir: string, isBuiltin: boolean): Promise<LoadedSkill | null> {
    const manifestPath = path.join(skillDir, 'manifest.json');

    try {
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest: SkillManifest = JSON.parse(manifestContent);

      // 加载 prompt 片段
      let promptContent = '';
      for (const fragment of manifest.promptFragments) {
        try {
          const content = await fs.readFile(path.join(skillDir, fragment), 'utf-8');
          promptContent += content + '\n';
        } catch { /* skip missing fragments */ }
      }

      // 加载模板文件
      const templateFiles: Record<string, string> = {};
      for (const templatePattern of manifest.templates) {
        try {
          const templateDir = path.join(skillDir, path.dirname(templatePattern));
          const files = await fs.readdir(templateDir, { recursive: true });
          for (const file of files) {
            const filePath = path.join(templateDir, file.toString());
            const stat = await fs.stat(filePath);
            if (stat.isFile()) {
              const relativePath = path.relative(skillDir, filePath).replace(/\\/g, '/');
              templateFiles[relativePath] = await fs.readFile(filePath, 'utf-8');
            }
          }
        } catch { /* skip missing templates */ }
      }

      return {
        manifest,
        promptContent,
        templateFiles,
        rootPath: skillDir,
        isBuiltin,
      };
    } catch {
      return null;
    }
  }
}

/** 全局单例 */
export const skillRegistry = new SkillRegistry();
