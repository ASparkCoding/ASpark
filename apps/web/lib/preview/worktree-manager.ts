/**
 * ASpark Git Worktree Manager
 * 隔离分支实验、A/B 方案对比、自动清理
 */

import { execSync, exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

// ======================== Types ========================

export interface Worktree {
  /** 唯一 ID */
  id: string;
  /** 分支名 */
  branch: string;
  /** 工作目录路径 */
  worktreePath: string;
  /** 关联的项目 ID */
  projectId: string;
  /** 方案名称/描述 */
  label: string;
  /** 分配的预览端口 */
  previewPort?: number;
  /** 状态 */
  status: WorktreeStatus;
  /** 创建时间 */
  createdAt: number;
  /** 文件变更数 */
  changedFiles: number;
}

export type WorktreeStatus =
  | 'creating'
  | 'ready'
  | 'running'      // 正在运行预览
  | 'merging'
  | 'merged'
  | 'failed'
  | 'cleaning';

export interface ABComparison {
  id: string;
  projectId: string;
  description: string;
  worktrees: Worktree[];
  selectedWorktreeId?: string;
  status: 'preparing' | 'comparing' | 'decided' | 'cleaned';
  createdAt: number;
}

// ======================== Worktree Manager ========================

const BASE_DIR = '.generated-projects';
const WORKTREE_PREFIX = 'wt-';
/** 预览端口起始范围（与主预览分开） */
const WORKTREE_PORT_START = 4100;
const WORKTREE_PORT_END = 4200;

class WorktreeManager {
  private worktrees: Map<string, Worktree> = new Map();
  private comparisons: Map<string, ABComparison> = new Map();
  private nextPort: number = WORKTREE_PORT_START;
  private idCounter: number = 0;

  /**
   * 创建隔离的 git worktree
   */
  async createWorktree(
    projectId: string,
    label: string,
    options: { baseBranch?: string } = {}
  ): Promise<Worktree> {
    const id = `${WORKTREE_PREFIX}${++this.idCounter}_${Date.now().toString(36)}`;
    const branch = `experiment/${id}`;
    const projectDir = path.resolve(BASE_DIR, `project-${projectId}`);
    const worktreePath = path.resolve(BASE_DIR, `.worktrees/${id}`);

    const worktree: Worktree = {
      id,
      branch,
      worktreePath,
      projectId,
      label,
      status: 'creating',
      createdAt: Date.now(),
      changedFiles: 0,
    };
    this.worktrees.set(id, worktree);

    try {
      // 确保项目目录是 git 仓库
      await this.ensureGitRepo(projectDir);

      // 确保 worktree 目录存在
      await fs.mkdir(path.dirname(worktreePath), { recursive: true });

      // 创建 worktree
      const baseBranch = options.baseBranch || 'main';
      execSync(
        `git worktree add -b "${branch}" "${worktreePath}" "${baseBranch}"`,
        { cwd: projectDir, stdio: 'pipe' }
      );

      worktree.status = 'ready';
      worktree.previewPort = this.allocatePort();

      return worktree;
    } catch (error) {
      worktree.status = 'failed';
      throw new Error(`Failed to create worktree: ${error}`);
    }
  }

  /**
   * 在 worktree 中写入文件
   */
  async writeFiles(
    worktreeId: string,
    files: Record<string, string>
  ): Promise<void> {
    const worktree = this.worktrees.get(worktreeId);
    if (!worktree) throw new Error(`Worktree ${worktreeId} not found`);

    let changedCount = 0;
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(worktree.worktreePath, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
      changedCount++;
    }

    worktree.changedFiles = changedCount;
  }

  /**
   * 将 worktree 的变更合并回主分支
   */
  async mergeWorktree(worktreeId: string): Promise<{ success: boolean; conflicts?: string[] }> {
    const worktree = this.worktrees.get(worktreeId);
    if (!worktree) throw new Error(`Worktree ${worktreeId} not found`);

    const projectDir = path.resolve(BASE_DIR, `project-${worktree.projectId}`);
    worktree.status = 'merging';

    try {
      // 在 worktree 中提交变更
      execSync('git add -A', { cwd: worktree.worktreePath, stdio: 'pipe' });
      execSync(
        `git commit -m "Experiment: ${worktree.label}" --allow-empty`,
        { cwd: worktree.worktreePath, stdio: 'pipe' }
      );

      // 在主项目中合并 worktree 分支
      execSync(`git merge "${worktree.branch}" --no-edit`, {
        cwd: projectDir,
        stdio: 'pipe',
      });

      worktree.status = 'merged';
      return { success: true };
    } catch (error) {
      const errorMsg = String(error);
      if (errorMsg.includes('CONFLICT')) {
        // 提取冲突文件
        const conflicts = this.extractConflictFiles(projectDir);
        worktree.status = 'failed';
        return { success: false, conflicts };
      }
      worktree.status = 'failed';
      throw error;
    }
  }

  /**
   * 删除 worktree 并清理
   */
  async removeWorktree(worktreeId: string): Promise<void> {
    const worktree = this.worktrees.get(worktreeId);
    if (!worktree) return;

    worktree.status = 'cleaning';
    const projectDir = path.resolve(BASE_DIR, `project-${worktree.projectId}`);

    try {
      // 移除 worktree
      execSync(`git worktree remove "${worktree.worktreePath}" --force`, {
        cwd: projectDir,
        stdio: 'pipe',
      });
    } catch {
      // 如果 git worktree remove 失败，手动清理
      try {
        await fs.rm(worktree.worktreePath, { recursive: true, force: true });
        execSync('git worktree prune', { cwd: projectDir, stdio: 'pipe' });
      } catch { /* 静默 */ }
    }

    // 删除分支
    try {
      execSync(`git branch -D "${worktree.branch}"`, {
        cwd: projectDir,
        stdio: 'pipe',
      });
    } catch { /* 分支可能已被删除 */ }

    this.worktrees.delete(worktreeId);
  }

  /**
   * 创建 A/B 方案对比
   */
  async createABComparison(
    projectId: string,
    description: string,
    variants: Array<{ label: string }>
  ): Promise<ABComparison> {
    const worktrees: Worktree[] = [];

    for (const variant of variants) {
      const worktree = await this.createWorktree(projectId, variant.label);
      worktrees.push(worktree);
    }

    const comparison: ABComparison = {
      id: `cmp_${++this.idCounter}_${Date.now().toString(36)}`,
      projectId,
      description,
      worktrees,
      status: 'preparing',
      createdAt: Date.now(),
    };

    this.comparisons.set(comparison.id, comparison);
    return comparison;
  }

  /**
   * 选择 A/B 对比中的最佳方案并合并
   */
  async selectVariant(comparisonId: string, worktreeId: string): Promise<void> {
    const comparison = this.comparisons.get(comparisonId);
    if (!comparison) throw new Error(`Comparison ${comparisonId} not found`);

    comparison.selectedWorktreeId = worktreeId;

    // 合并选中的方案
    await this.mergeWorktree(worktreeId);

    // 清理未选中的方案
    for (const wt of comparison.worktrees) {
      if (wt.id !== worktreeId) {
        await this.removeWorktree(wt.id);
      }
    }

    comparison.status = 'decided';
  }

  /**
   * 清理所有 A/B 方案
   */
  async cleanupComparison(comparisonId: string): Promise<void> {
    const comparison = this.comparisons.get(comparisonId);
    if (!comparison) return;

    for (const wt of comparison.worktrees) {
      await this.removeWorktree(wt.id);
    }

    comparison.status = 'cleaned';
    this.comparisons.delete(comparisonId);
  }

  /**
   * 获取 worktree 信息
   */
  getWorktree(id: string): Worktree | undefined {
    return this.worktrees.get(id);
  }

  /**
   * 获取项目的所有 worktree
   */
  getProjectWorktrees(projectId: string): Worktree[] {
    return Array.from(this.worktrees.values())
      .filter(wt => wt.projectId === projectId);
  }

  /**
   * 获取 A/B 对比信息
   */
  getComparison(id: string): ABComparison | undefined {
    return this.comparisons.get(id);
  }

  /**
   * 清理项目的所有 worktree
   */
  async cleanupProject(projectId: string): Promise<void> {
    const worktrees = this.getProjectWorktrees(projectId);
    for (const wt of worktrees) {
      await this.removeWorktree(wt.id);
    }

    // 清理关联的对比
    for (const [id, cmp] of this.comparisons) {
      if (cmp.projectId === projectId) {
        this.comparisons.delete(id);
      }
    }
  }

  // ======================== Private ========================

  private async ensureGitRepo(dir: string): Promise<void> {
    try {
      execSync('git rev-parse --is-inside-work-tree', { cwd: dir, stdio: 'pipe' });
    } catch {
      // 初始化 git 仓库
      execSync('git init', { cwd: dir, stdio: 'pipe' });
      execSync('git add -A', { cwd: dir, stdio: 'pipe' });
      execSync('git commit -m "Initial commit" --allow-empty', {
        cwd: dir,
        stdio: 'pipe',
      });
    }
  }

  private allocatePort(): number {
    const port = this.nextPort;
    this.nextPort++;
    if (this.nextPort > WORKTREE_PORT_END) {
      this.nextPort = WORKTREE_PORT_START;
    }
    return port;
  }

  private extractConflictFiles(projectDir: string): string[] {
    try {
      const output = execSync('git diff --name-only --diff-filter=U', {
        cwd: projectDir,
        encoding: 'utf-8',
      });
      return output.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
}

/** 全局单例 */
export const worktreeManager = new WorktreeManager();
