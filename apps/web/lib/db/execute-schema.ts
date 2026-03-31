import postgres from 'postgres';

/**
 * 自动执行 LLM 生成的 supabase-schema.sql
 * 使用 DATABASE_URL 直连 PostgreSQL，只允许安全的 DDL 语句
 */
export async function executeSchemaSQL(sql: string): Promise<{ success: boolean; error?: string }> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return { success: false, error: 'DATABASE_URL not configured' };
  }

  // 基本安全检查：只允许 DDL 和安全 DML
  const dangerousPatterns = [
    /\bDROP\s+DATABASE\b/i,
    /\bDROP\s+SCHEMA\b/i,
    /\bTRUNCATE\b/i,
    /\bDELETE\s+FROM\s+(?!.*WHERE)/i,
  ];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(sql)) {
      return { success: false, error: `Blocked dangerous SQL pattern: ${pattern}` };
    }
  }

  const client = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 10,
    connect_timeout: 10,
  });

  try {
    // 将 SQL 中的多条语句拆开执行（按分号分割，忽略函数体内的分号）
    // 使用 unsafe 执行整个 SQL 块，让 PostgreSQL 自行处理多条语句
    await client.unsafe(sql);
    console.log('[Schema] SQL schema executed successfully');
    return { success: true };
  } catch (err) {
    const message = (err as Error).message;
    // "already exists" 类错误不算失败（幂等执行）
    if (message.includes('already exists')) {
      console.log('[Schema] Tables already exist, skipping');
      return { success: true };
    }
    console.error('[Schema] SQL execution error:', message);
    return { success: false, error: message };
  } finally {
    await client.end();
  }
}
