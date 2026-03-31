import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase';
import { requireAuth, handleAuthError } from '@/lib/auth';
import { runAgentChat, type AgentDef, type AgentMessage } from '@/lib/agents/runner';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function getProjectSettings(projectId: string) {
  const supabase = createServiceSupabase();
  const { data } = await supabase
    .from('projects')
    .select('app_settings')
    .eq('id', projectId)
    .single();
  return (data?.app_settings || {}) as Record<string, any>;
}

async function saveProjectSettings(projectId: string, settings: Record<string, any>) {
  const supabase = createServiceSupabase();
  await supabase.from('projects').update({ app_settings: settings }).eq('id', projectId);
}

/**
 * GET /api/projects/:id/agents
 * List all agents
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const settings = await getProjectSettings(params.id);
    return NextResponse.json({ agents: settings.agents || [] });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

/**
 * POST /api/projects/:id/agents
 * Create a new agent or send a chat message to an agent
 * Body: { action: 'create' | 'chat', ... }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const body = await request.json();

    if (body.action === 'chat') {
      // Chat with an agent
      const { agentId, message } = body;
      if (!agentId || !message) {
        return NextResponse.json({ error: 'agentId and message required' }, { status: 400 });
      }

      const settings = await getProjectSettings(params.id);
      const agents: AgentDef[] = settings.agents || [];
      const agent = agents.find((a) => a.id === agentId);

      if (!agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      }

      // Load conversation history
      const chatKey = `agentChats_${agentId}`;
      const chatHistory: AgentMessage[] = settings[chatKey] || [];

      // Add user message
      const userMsg: AgentMessage = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
      chatHistory.push(userMsg);

      // Run agent
      const { response, error } = await runAgentChat(agent, chatHistory, params.id);

      if (error) {
        return NextResponse.json({ error }, { status: 500 });
      }

      // Add assistant message
      const assistantMsg: AgentMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
      };
      chatHistory.push(assistantMsg);

      // Update chat count
      const agentIdx = agents.findIndex((a) => a.id === agentId);
      if (agentIdx >= 0) {
        agents[agentIdx].chatCount = (agents[agentIdx].chatCount || 0) + 1;
      }

      // Keep last 50 messages per agent
      const trimmedHistory = chatHistory.slice(-50);

      await saveProjectSettings(params.id, {
        ...settings,
        agents,
        [chatKey]: trimmedHistory,
      });

      return NextResponse.json({
        message: assistantMsg,
        history: trimmedHistory,
      });
    }

    // Create new agent
    const { name, description, instructions, knowledgeBase, entityAccess, model } = body;

    if (!name || !instructions) {
      return NextResponse.json({ error: 'name and instructions required' }, { status: 400 });
    }

    const settings = await getProjectSettings(params.id);
    const agents: AgentDef[] = settings.agents || [];

    const newAgent: AgentDef = {
      id: crypto.randomUUID(),
      name,
      description: description || '',
      instructions,
      knowledgeBase: knowledgeBase || '',
      entityAccess: entityAccess || [],
      model: model || 'balanced',
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      chatCount: 0,
    };

    agents.push(newAgent);
    await saveProjectSettings(params.id, { ...settings, agents });

    return NextResponse.json({ agent: newAgent });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

/**
 * PATCH /api/projects/:id/agents
 * Update an agent
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const body = await request.json();
    const { agentId, ...updates } = body;

    if (!agentId) {
      return NextResponse.json({ error: 'agentId required' }, { status: 400 });
    }

    const settings = await getProjectSettings(params.id);
    const agents: AgentDef[] = settings.agents || [];
    const idx = agents.findIndex((a) => a.id === agentId);

    if (idx === -1) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Apply updates
    const updatable = ['name', 'description', 'instructions', 'knowledgeBase', 'entityAccess', 'model', 'enabled'];
    for (const key of updatable) {
      if (updates[key] !== undefined) {
        (agents[idx] as any)[key] = updates[key];
      }
    }
    agents[idx].updatedAt = new Date().toISOString();

    await saveProjectSettings(params.id, { ...settings, agents });
    return NextResponse.json({ agent: agents[idx] });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

/**
 * DELETE /api/projects/:id/agents
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const { agentId } = await request.json();

    const settings = await getProjectSettings(params.id);
    const agents = (settings.agents || []).filter((a: any) => a.id !== agentId);

    // Also remove chat history
    const chatKey = `agentChats_${agentId}`;
    delete settings[chatKey];

    await saveProjectSettings(params.id, { ...settings, agents });
    return NextResponse.json({ success: true });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
