/**
 * ASpark Tool Result Storage
 * 大结果写磁盘，上下文仅保留摘要，按需加载完整内容
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

/** 默认阈值: 超过此字符数的结果将被持久化 */
const DEFAULT_THRESHOLD_CHARS = 8000;
/** 摘要保留的行数 */
const SUMMARY_LINES = 20;
/** 存储根目录 */
const STORAGE_BASE_DIR = '.generated-projects/.result-storage';

export interface StoredResult {
  /** 存储 ID */
  id: string;
  /** 原始内容的摘要 */
  summary: string;
  /** 存储文件路径 */
  filePath: string;
  /** 原始大小（字节） */
  originalSize: number;
  /** 存储时间 */
  storedAt: number;
  /** 关联的项目 ID */
  projectId?: string;
  /** 关联的文件路径 */
  sourceFile?: string;
}

export interface StorageStats {
  totalItems: number;
  totalSizeBytes: number;
  byProject: Record<string, number>;
}

class ResultStorage {
  private index: Map<string, StoredResult> = new Map();
  private thresholdChars: number;

  constructor(thresholdChars: number = DEFAULT_THRESHOLD_CHARS) {
    this.thresholdChars = thresholdChars;
  }

  /**
   * 检查内容是否应该被持久化
   */
  shouldPersist(content: string): boolean {
    return content.length > this.thresholdChars;
  }

  /**
   * 存储大结果到磁盘，返回摘要
   */
  async store(
    content: string,
    options: { projectId?: string; sourceFile?: string } = {}
  ): Promise<StoredResult> {
    const id = this.generateId(content);

    // 如果已存储，直接返回
    if (this.index.has(id)) {
      return this.index.get(id)!;
    }

    const dir = path.resolve(STORAGE_BASE_DIR, options.projectId || '_global');
    await fs.mkdir(dir, { recursive: true });

    const filePath = path.join(dir, `${id}.txt`);
    await fs.writeFile(filePath, content, 'utf-8');

    const summary = this.generateSummary(content, options.sourceFile);

    const result: StoredResult = {
      id,
      summary,
      filePath,
      originalSize: Buffer.byteLength(content, 'utf-8'),
      storedAt: Date.now(),
      projectId: options.projectId,
      sourceFile: options.sourceFile,
    };

    this.index.set(id, result);
    return result;
  }

  /**
   * 处理内容：小内容直接返回，大内容持久化后返回摘要
   */
  async processContent(
    content: string,
    options: { projectId?: string; sourceFile?: string } = {}
  ): Promise<{ content: string; persisted: boolean; storageId?: string }> {
    if (!this.shouldPersist(content)) {
      return { content, persisted: false };
    }

    const stored = await this.store(content, options);
    return {
      content: stored.summary,
      persisted: true,
      storageId: stored.id,
    };
  }

  /**
   * 按需加载完整内容
   */
  async retrieve(id: string): Promise<string | null> {
    const meta = this.index.get(id);
    if (!meta) return null;

    try {
      return await fs.readFile(meta.filePath, 'utf-8');
    } catch {
      // 文件已被清理
      this.index.delete(id);
      return null;
    }
  }

  /**
   * 删除指定项目的所有存储结果
   */
  async cleanupProject(projectId: string): Promise<number> {
    let cleaned = 0;
    for (const [id, result] of this.index.entries()) {
      if (result.projectId === projectId) {
        try {
          await fs.unlink(result.filePath);
        } catch { /* ignore */ }
        this.index.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * 清理超过指定时间的存储结果
   */
  async cleanupStale(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;
    let cleaned = 0;

    for (const [id, result] of this.index.entries()) {
      if (result.storedAt < cutoff) {
        try {
          await fs.unlink(result.filePath);
        } catch { /* ignore */ }
        this.index.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * 获取存储统计信息
   */
  getStats(): StorageStats {
    const byProject: Record<string, number> = {};
    let totalSizeBytes = 0;

    for (const result of this.index.values()) {
      totalSizeBytes += result.originalSize;
      const key = result.projectId || '_global';
      byProject[key] = (byProject[key] || 0) + result.originalSize;
    }

    return {
      totalItems: this.index.size,
      totalSizeBytes,
      byProject,
    };
  }

  /**
   * 生成内容摘要
   */
  private generateSummary(content: string, sourceFile?: string): string {
    const lines = content.split('\n');
    const previewLines = lines.slice(0, SUMMARY_LINES).join('\n');
    const totalLines = lines.length;
    const sizeKb = (Buffer.byteLength(content, 'utf-8') / 1024).toFixed(1);

    let summary = `[已持久化到磁盘 | ${totalLines} 行 | ${sizeKb} KB]`;
    if (sourceFile) {
      summary += `\n文件: ${sourceFile}`;
    }
    summary += `\n--- 前 ${SUMMARY_LINES} 行预览 ---\n${previewLines}`;
    if (totalLines > SUMMARY_LINES) {
      summary += `\n... (还有 ${totalLines - SUMMARY_LINES} 行)`;
    }
    return summary;
  }

  /**
   * 生成内容的唯一 ID
   */
  private generateId(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex').slice(0, 16);
  }
}

/** 全局单例 */
export const resultStorage = new ResultStorage();
