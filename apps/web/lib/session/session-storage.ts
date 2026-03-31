/**
 * ASpark Session Persistence & Recovery
 * 完整会话序列化/反序列化、断点续传、跨设备恢复
 */

import crypto from 'crypto';

// ======================== Types ========================

export interface SessionSnapshot {
  /** 快照 ID */
  id: string;
  /** 项目 ID */
  projectId: string;
  /** 会话版本 (用于向前兼容) */
  version: number;
  /** 聊天消息 */
  messages: SessionMessage[];
  /** 项目文件 */
  files: Record<string, string>;
  /** 文件版本号 */
  fileVersions: Record<string, number>;
  /** Plan 模式状态 */
  planState?: PlanSessionState;
  /** 构建状态 */
  buildState?: BuildSessionState;
  /** 编辑器状态 */
  editorState?: EditorSessionState;
  /** 成本追踪数据 */
  costData?: CostSessionData;
  /** 快照时间 */
  createdAt: number;
  /** 最后修改时间 */
  updatedAt: number;
  /** 完整性校验 */
  checksum: string;
}

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  modelInfo?: { provider: string; model: string };
  messageType?: string;
  fileChanges?: string[];
}

export interface PlanSessionState {
  planSessionId: string;
  status: string;
  questions: Array<{ question: string; options: string[]; answer?: string }>;
  planContent?: string;
  planStructured?: Record<string, unknown>;
}

export interface BuildSessionState {
  buildPhase: string;
  buildSteps: Array<{ file: string; action: string; status: string; category: string }>;
  lastBuildTime?: number;
}

export interface EditorSessionState {
  activeTab: string;
  activeFilePath?: string;
  previewUrl?: string;
  previewStatus: string;
}

export interface CostSessionData {
  usageHistory: Array<{
    inputTokens: number;
    outputTokens: number;
    model: string;
    provider: string;
    type: string;
    timestamp: number;
  }>;
  sessionStartTime: number;
}

// ======================== Session Manager ========================

const SESSION_VERSION = 1;
const STORAGE_KEY_PREFIX = 'aspark_session_';
const AUTO_SAVE_INTERVAL_MS = 30_000; // 30 秒自动保存

class SessionManager {
  private autoSaveTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * 创建会话快照
   */
  createSnapshot(
    projectId: string,
    data: {
      messages: SessionMessage[];
      files: Record<string, string>;
      fileVersions?: Record<string, number>;
      planState?: PlanSessionState;
      buildState?: BuildSessionState;
      editorState?: EditorSessionState;
      costData?: CostSessionData;
    }
  ): SessionSnapshot {
    const now = Date.now();
    const snapshot: SessionSnapshot = {
      id: this.generateSnapshotId(),
      projectId,
      version: SESSION_VERSION,
      messages: data.messages,
      files: data.files,
      fileVersions: data.fileVersions || {},
      planState: data.planState,
      buildState: data.buildState,
      editorState: data.editorState,
      costData: data.costData,
      createdAt: now,
      updatedAt: now,
      checksum: '',
    };

    snapshot.checksum = this.calculateChecksum(snapshot);
    return snapshot;
  }

  /**
   * 保存快照到 localStorage（客户端）
   */
  saveToLocalStorage(snapshot: SessionSnapshot): void {
    const key = `${STORAGE_KEY_PREFIX}${snapshot.projectId}`;
    try {
      const serialized = JSON.stringify(snapshot);
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, serialized);
      }
    } catch (error) {
      console.warn('[SessionManager] Failed to save to localStorage:', error);
    }
  }

  /**
   * 从 localStorage 恢复快照
   */
  loadFromLocalStorage(projectId: string): SessionSnapshot | null {
    const key = `${STORAGE_KEY_PREFIX}${projectId}`;
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const serialized = window.localStorage.getItem(key);
      if (!serialized) return null;

      const snapshot: SessionSnapshot = JSON.parse(serialized);

      // 版本检查
      if (snapshot.version !== SESSION_VERSION) {
        console.warn('[SessionManager] Snapshot version mismatch, attempting migration');
        return this.migrateSnapshot(snapshot);
      }

      // 完整性检查
      if (!this.verifyChecksum(snapshot)) {
        console.warn('[SessionManager] Snapshot checksum mismatch, data may be corrupted');
        return null;
      }

      return snapshot;
    } catch (error) {
      console.warn('[SessionManager] Failed to load from localStorage:', error);
      return null;
    }
  }

  /**
   * 序列化为可传输/存储的 JSON 字符串
   */
  serialize(snapshot: SessionSnapshot): string {
    return JSON.stringify(snapshot);
  }

  /**
   * 从 JSON 字符串反序列化
   */
  deserialize(json: string): SessionSnapshot | null {
    try {
      const snapshot: SessionSnapshot = JSON.parse(json);
      if (!this.verifyChecksum(snapshot)) {
        return null;
      }
      return snapshot;
    } catch {
      return null;
    }
  }

  /**
   * 导出快照为可下载的文件内容
   */
  exportSnapshot(snapshot: SessionSnapshot): { filename: string; content: string } {
    return {
      filename: `aspark-session-${snapshot.projectId}-${new Date().toISOString().slice(0, 10)}.json`,
      content: JSON.stringify(snapshot, null, 2),
    };
  }

  /**
   * 从导入的文件内容恢复
   */
  importSnapshot(content: string): SessionSnapshot | null {
    return this.deserialize(content);
  }

  /**
   * 开启自动保存（客户端调用）
   */
  startAutoSave(
    projectId: string,
    getSnapshotData: () => Parameters<SessionManager['createSnapshot']>[1]
  ): void {
    this.stopAutoSave(projectId);

    const timer = setInterval(() => {
      try {
        const data = getSnapshotData();
        const snapshot = this.createSnapshot(projectId, data);
        this.saveToLocalStorage(snapshot);
      } catch (error) {
        console.warn('[SessionManager] Auto-save failed:', error);
      }
    }, AUTO_SAVE_INTERVAL_MS);

    this.autoSaveTimers.set(projectId, timer as unknown as NodeJS.Timeout);
  }

  /**
   * 停止自动保存
   */
  stopAutoSave(projectId: string): void {
    const timer = this.autoSaveTimers.get(projectId);
    if (timer) {
      clearInterval(timer);
      this.autoSaveTimers.delete(projectId);
    }
  }

  /**
   * 清理指定项目的快照
   */
  clearSession(projectId: string): void {
    this.stopAutoSave(projectId);
    const key = `${STORAGE_KEY_PREFIX}${projectId}`;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  }

  /**
   * 列出所有已保存的会话
   */
  listSavedSessions(): Array<{ projectId: string; updatedAt: number; messageCount: number }> {
    if (typeof window === 'undefined' || !window.localStorage) return [];

    const sessions: Array<{ projectId: string; updatedAt: number; messageCount: number }> = [];

    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(STORAGE_KEY_PREFIX)) {
        try {
          const data = JSON.parse(window.localStorage.getItem(key) || '');
          sessions.push({
            projectId: data.projectId,
            updatedAt: data.updatedAt,
            messageCount: data.messages?.length || 0,
          });
        } catch { /* skip corrupted entries */ }
      }
    }

    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * 增量更新快照（只更新变化的部分）
   */
  updateSnapshot(
    existing: SessionSnapshot,
    updates: Partial<Pick<SessionSnapshot, 'messages' | 'files' | 'fileVersions' | 'planState' | 'buildState' | 'editorState' | 'costData'>>
  ): SessionSnapshot {
    const updated: SessionSnapshot = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };
    updated.checksum = this.calculateChecksum(updated);
    return updated;
  }

  /**
   * 获取两个快照之间的差异
   */
  diffSnapshots(
    older: SessionSnapshot,
    newer: SessionSnapshot
  ): {
    newMessages: number;
    changedFiles: string[];
    addedFiles: string[];
    removedFiles: string[];
  } {
    const newMessages = newer.messages.length - older.messages.length;

    const olderFiles = new Set(Object.keys(older.files));
    const newerFiles = new Set(Object.keys(newer.files));

    const addedFiles = [...newerFiles].filter(f => !olderFiles.has(f));
    const removedFiles = [...olderFiles].filter(f => !newerFiles.has(f));
    const changedFiles = [...newerFiles].filter(f =>
      olderFiles.has(f) && older.files[f] !== newer.files[f]
    );

    return { newMessages, changedFiles, addedFiles, removedFiles };
  }

  // ======================== Private ========================

  private generateSnapshotId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `snap_${timestamp}_${random}`;
  }

  private calculateChecksum(snapshot: SessionSnapshot): string {
    const data = JSON.stringify({
      messages: snapshot.messages.length,
      files: Object.keys(snapshot.files).sort(),
      projectId: snapshot.projectId,
      version: snapshot.version,
    });
    return crypto.createHash('md5').update(data).digest('hex').slice(0, 12);
  }

  private verifyChecksum(snapshot: SessionSnapshot): boolean {
    const expected = this.calculateChecksum({
      ...snapshot,
      checksum: '', // 排除 checksum 本身
    });
    return snapshot.checksum === expected;
  }

  private migrateSnapshot(snapshot: SessionSnapshot): SessionSnapshot | null {
    // 未来版本迁移逻辑
    // v0 -> v1: 直接兼容
    if (snapshot.version === 0 || !snapshot.version) {
      return {
        ...snapshot,
        version: SESSION_VERSION,
        fileVersions: snapshot.fileVersions || {},
        checksum: this.calculateChecksum({ ...snapshot, version: SESSION_VERSION, checksum: '' } as SessionSnapshot),
      };
    }
    return null;
  }
}

/** 全局单例 */
export const sessionManager = new SessionManager();
