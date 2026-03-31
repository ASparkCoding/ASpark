/**
 * Agent Runner — Executes AI Agent conversations
 * Each agent has instructions, knowledge base, and can operate on entity data.
 */

import { streamText } from 'ai';
import { selectModel } from '@/lib/llm/router';
import { createServiceSupabase } from '@/lib/supabase';

// ─── Types ───

export interface AgentDef {
  id: string;
  name: string;
  description: string;
  instructions: string;       // System prompt for the agent
  knowledgeBase: string;      // Context injected into every conversation
  entityAccess: string[];     // Entity table names the agent can read/write
  model: 'fast' | 'balanced' | 'powerful';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  chatCount: number;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

// ─── Agent Execution ───

/**
 * Run a single agent chat turn.
 * Returns the full assistant response text.
 */
export async function runAgentChat(
  agent: AgentDef,
  messages: AgentMessage[],
  projectId: string
): Promise<{ response: string; error: string | null }> {
  try {
    const supabase = createServiceSupabase();

    // Build entity context if agent has data access
    let entityContext = '';
    if (agent.entityAccess.length > 0) {
      for (const table of agent.entityAccess.slice(0, 5)) {
        try {
          const { data } = await supabase
            .from(table)
            .select('*')
            .limit(20)
            .order('created_at', { ascending: false });
          if (data && data.length > 0) {
            entityContext += `\n\n## Data: ${table} (${data.length} records)\n`;
            entityContext += JSON.stringify(data.slice(0, 10), null, 2);
          }
        } catch {
          // Table may not exist
        }
      }
    }

    // Build system prompt
    const systemPrompt = [
      `You are "${agent.name}" — an AI assistant.`,
      agent.instructions,
      agent.knowledgeBase ? `\n## Knowledge Base\n${agent.knowledgeBase}` : '',
      entityContext ? `\n## Available Data${entityContext}` : '',
      '\nRespond concisely in the same language as the user. Use data from the knowledge base and available data to answer questions.',
    ].filter(Boolean).join('\n');

    // Select model based on agent config
    const modelType = agent.model === 'powerful' ? 'reason'
      : agent.model === 'balanced' ? 'iterate'
      : 'complete';

    const model = selectModel({ type: modelType, contextLength: systemPrompt.length });

    // Convert messages to AI SDK format
    const aiMessages = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-10) // Keep last 10 messages
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const result = await streamText({
      model,
      system: systemPrompt,
      messages: aiMessages,
      maxOutputTokens: 2048,
    });

    // Collect full response
    let fullText = '';
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        fullText += part.text;
      }
    }

    return { response: fullText || 'No response generated.', error: null };
  } catch (err) {
    return { response: '', error: (err as Error).message };
  }
}
