import { NextRequest } from 'next/server';
import { selectModel } from '@/lib/llm/router';
import { generateText } from 'ai';
import { getSuggestionPrompt } from '@/lib/prompts/system-prompt';
import { requireAuth, handleAuthError } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();

    const { id: projectId } = await params;
    const { filePaths } = await request.json();

    if (!filePaths?.length) {
      return Response.json({ suggestions: [] });
    }

    const prompt = getSuggestionPrompt(filePaths);
    const model = selectModel({ type: 'complete', contextLength: prompt.length });

    try {
      const { text } = await generateText({
        model,
        prompt,
        temperature: 0.7,
        maxOutputTokens: 1024,
      });

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const suggestions = JSON.parse(jsonMatch[0])
          .filter((s: { label?: string; prompt?: string }) => s.label && s.prompt)
          .slice(0, 4);
        return Response.json({ suggestions });
      }

      return Response.json({ suggestions: [] });
    } catch (err) {
      console.error(`[Suggestions] Failed for project ${projectId}:`, err);
      return Response.json({ suggestions: [] });
    }
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
