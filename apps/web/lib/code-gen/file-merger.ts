import type { ParsedFile } from './parser';

export interface ProjectFile {
  path: string;
  content: string;
  version: number;
}

/**
 * 将 LLM 生成的新文件合并到现有项目文件中
 * - 如果新文件路径已存在，替换内容并增加版本号
 * - 如果新文件路径不存在，作为新文件添加
 * - 现有文件如果未被新生成覆盖，保持不变
 */
export function mergeFiles(
  existingFiles: ProjectFile[],
  newFiles: ParsedFile[]
): { merged: ProjectFile[]; changes: FileChangeRecord[] } {
  const result = new Map<string, ProjectFile>();
  const changes: FileChangeRecord[] = [];

  // 先放入所有现有文件
  for (const file of existingFiles) {
    result.set(file.path, { ...file });
  }

  // 合并新文件
  for (const newFile of newFiles) {
    const existing = result.get(newFile.path);

    if (existing) {
      // 文件已存在：检查内容是否有变化
      if (existing.content !== newFile.content) {
        result.set(newFile.path, {
          path: newFile.path,
          content: newFile.content,
          version: existing.version + 1,
        });
        changes.push({
          path: newFile.path,
          action: 'update',
          oldVersion: existing.version,
          newVersion: existing.version + 1,
        });
      }
      // 内容相同，跳过
    } else {
      // 新文件
      result.set(newFile.path, {
        path: newFile.path,
        content: newFile.content,
        version: 1,
      });
      changes.push({
        path: newFile.path,
        action: 'create',
        oldVersion: 0,
        newVersion: 1,
      });
    }
  }

  return {
    merged: Array.from(result.values()),
    changes,
  };
}

export interface FileChangeRecord {
  path: string;
  action: 'create' | 'update' | 'delete';
  oldVersion: number;
  newVersion: number;
}

/**
 * 计算两段文本的差异行数（简化版 diff）
 */
export function countChangedLines(oldContent: string, newContent: string): {
  added: number;
  removed: number;
} {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  let added = 0;
  let removed = 0;

  for (const line of newLines) {
    if (!oldSet.has(line)) added++;
  }
  for (const line of oldLines) {
    if (!newSet.has(line)) removed++;
  }

  return { added, removed };
}
