import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { selectModel } from '@/lib/llm/router';
import { requireAuth, handleAuthError } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/projects/:id/clarity-check
 * Lightweight LLM call to check if a user prompt needs clarification.
 * Returns 1-2 follow-up questions if the prompt is ambiguous.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();

    const { prompt } = await request.json();
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ needsClarification: false });
    }

    // Skip clarity check for short, specific prompts or action-oriented prompts
    const trimmed = prompt.trim();
    if (trimmed.length > 200 || trimmed.length < 5) {
      // Very detailed prompts are likely clear enough; very short ones too
      return NextResponse.json({ needsClarification: false });
    }

    // Use the cheapest/fastest model for this lightweight check
    const model = selectModel({ type: 'complete', contextLength: 500 });

    const { text } = await generateText({
      model,
      maxOutputTokens: 300,
      system: `你是一个需求分析助手。用户要修改一个已有的 Web 应用。
判断用户的需求描述是否足够清晰，能让 AI 直接开始编码。

如果需求明确（如"把按钮改成蓝色"、"添加一个搜索框"），回复：
CLEAR

如果需求模糊需要澄清，回复 1-2 个关键问题，每行一个，以 Q: 开头。
只问最关键的问题，不要问显而易见的。

示例不清晰的需求："改一下样式" → 需要问改哪里、改成什么样
示例清晰的需求："把导航栏背景色改成深蓝色" → CLEAR`,
      prompt: `用户需求：${trimmed}`,
    });

    const cleaned = text.trim();
    if (cleaned === 'CLEAR' || !cleaned.includes('Q:')) {
      return NextResponse.json({ needsClarification: false });
    }

    // Parse questions from response
    const questions = cleaned
      .split('\n')
      .filter((line) => line.trim().startsWith('Q:'))
      .map((line) => line.replace(/^Q:\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 2);

    if (questions.length === 0) {
      return NextResponse.json({ needsClarification: false });
    }

    return NextResponse.json({
      needsClarification: true,
      questions,
    });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    // On any error, just proceed without questions
    return NextResponse.json({ needsClarification: false });
  }
}
