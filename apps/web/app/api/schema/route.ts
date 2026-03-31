import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase';
import { validateSQL } from '@/lib/prompts/schema-extractor';
import { requireAuth, handleAuthError } from '@/lib/auth';

export const runtime = 'nodejs';

// POST /api/schema - 执行 SQL Schema（在平台 Supabase 上执行）
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();

    const body = await request.json();
    const { sql, projectId } = body;

    if (!sql?.trim()) {
      return NextResponse.json({ error: 'SQL 不能为空' }, { status: 400 });
    }

    if (!projectId) {
      return NextResponse.json({ error: '缺少 projectId' }, { status: 400 });
    }

    // 安全验证：只允许 DDL 操作
    const validation = validateSQL(sql);
    if (!validation.valid) {
      return NextResponse.json(
        { error: `SQL 安全检查失败: ${validation.reason}` },
        { status: 400 }
      );
    }

    const supabase = createServiceSupabase();

    try {
      // 使用 Supabase 的 rpc 来执行 SQL
      // 注意：需要先在 Supabase 中创建 exec_sql 函数
      // 如果没有该函数，回退到直接通过 REST API 记录 SQL
      const { error } = await supabase.rpc('exec_sql', { query: sql });

      if (error) {
        // 如果 exec_sql 函数不存在，将 SQL 保存到 project_files 中供用户手动执行
        if (error.message.includes('exec_sql')) {
          // 将 SQL 保存为项目文件
          await supabase.from('project_files').insert({
            project_id: projectId,
            path: 'supabase-schema.sql',
            content: sql,
            version: 1,
          });

          return NextResponse.json({
            success: true,
            executed: false,
            message: 'SQL 已保存为 supabase-schema.sql。请在 Supabase Dashboard 中手动执行。',
          });
        }

        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // 将成功执行的 SQL 也保存记录
      await supabase.from('project_files').upsert(
        {
          project_id: projectId,
          path: 'supabase-schema.sql',
          content: sql,
          version: 1,
        },
        { onConflict: 'project_id,path,version' }
      );

      return NextResponse.json({
        success: true,
        executed: true,
        message: 'SQL Schema 已成功执行',
      });
    } catch (error) {
      return NextResponse.json(
        { error: `执行失败: ${(error as Error).message}` },
        { status: 500 }
      );
    }
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
