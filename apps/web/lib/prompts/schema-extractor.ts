import type { ParsedFile } from '@/types';

/**
 * 从解析后的文件列表中提取 SQL Schema
 */
export function extractSchemaFiles(files: ParsedFile[]): ParsedFile[] {
  return files.filter(
    (f) => f.path.endsWith('.sql') || f.path === 'supabase-schema.sql'
  );
}

/**
 * 从原始 LLM 输出中直接提取 SQL 代码块（兜底方案）
 */
export function extractSQLFromRaw(raw: string): string[] {
  const sqlBlocks: string[] = [];

  // 匹配 ```sql ... ``` 代码块
  const sqlRegex = /```sql\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = sqlRegex.exec(raw)) !== null) {
    const sql = match[1].trim();
    if (sql.length > 0) {
      sqlBlocks.push(sql);
    }
  }

  return sqlBlocks;
}

/**
 * 验证 SQL 语句的基本安全性
 * 只允许 DDL 操作（CREATE, ALTER, DROP TABLE），禁止 DML 中的危险操作
 */
export function validateSQL(sql: string): { valid: boolean; reason?: string } {
  const upper = sql.toUpperCase().trim();

  // 禁止的危险操作
  const forbidden = [
    'DROP DATABASE',
    'DROP SCHEMA',
    'TRUNCATE',
    'DELETE FROM',
    'UPDATE ',
    'INSERT INTO',
    'GRANT ',
    'REVOKE ',
    'CREATE ROLE',
    'ALTER ROLE',
    'DROP ROLE',
    'CREATE EXTENSION',
  ];

  for (const keyword of forbidden) {
    // 允许 INSERT 在 RLS policy 内使用（如 FOR INSERT）
    if (keyword === 'INSERT INTO' && upper.includes('FOR INSERT')) continue;
    if (keyword === 'DELETE FROM' && upper.includes('FOR DELETE')) continue;
    if (keyword === 'UPDATE ' && upper.includes('FOR UPDATE')) continue;

    if (upper.includes(keyword)) {
      return { valid: false, reason: `禁止的 SQL 操作: ${keyword}` };
    }
  }

  // 允许的操作
  const allowed = [
    'CREATE TABLE',
    'CREATE INDEX',
    'CREATE UNIQUE INDEX',
    'CREATE TYPE',
    'CREATE OR REPLACE FUNCTION',
    'CREATE TRIGGER',
    'CREATE POLICY',
    'ALTER TABLE',
    'DROP TABLE IF EXISTS',
    'DROP INDEX IF EXISTS',
    'DROP POLICY IF EXISTS',
    'ENABLE ROW LEVEL SECURITY',
    'COMMENT ON',
  ];

  // 拆分为独立语句检查
  const statements = sql.split(';').filter((s) => s.trim().length > 0);

  for (const stmt of statements) {
    const trimmed = stmt.trim().toUpperCase();
    if (!trimmed) continue;

    const isAllowed = allowed.some((a) => trimmed.startsWith(a));
    if (!isAllowed) {
      // 允许以 -- 开头的注释行
      if (trimmed.startsWith('--')) continue;
      // 允许空行
      if (trimmed.length === 0) continue;

      return { valid: false, reason: `未被允许的 SQL 语句: ${stmt.trim().slice(0, 50)}...` };
    }
  }

  return { valid: true };
}
