/**
 * POST /api/projects/[id]/analyze
 * 主动分析 API - 代码安全、性能、最佳实践检查
 */

import { NextRequest, NextResponse } from 'next/server';
import { runProactiveAnalysis, formatAnalysisAsSuggestions } from '@/lib/proactive/analyzer';
import { requireAuth, handleAuthError } from '@/lib/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    const { files } = await req.json() as { files: Record<string, string> };

    if (!files || Object.keys(files).length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // 运行主动分析
    const result = runProactiveAnalysis(files);

    // 格式化为建议
    const suggestions = formatAnalysisAsSuggestions(result);

    return NextResponse.json({
      projectId: params.id,
      analysis: result.summary,
      issues: result.issues.slice(0, 20), // 限制返回数量
      suggestions,
      analyzedFiles: result.analyzedFiles,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error('[Analyze API Error]', error);
    return NextResponse.json(
      { error: 'Analysis failed' },
      { status: 500 }
    );
  }
}
