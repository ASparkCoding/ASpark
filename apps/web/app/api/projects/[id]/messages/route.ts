import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase';
import { requireAuth, handleAuthError } from '@/lib/auth';

/**
 * GET /api/projects/[id]/messages — Load all chat messages for a project
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    const supabase = createServiceSupabase();

    const { data, error } = await supabase
      .from('project_messages')
      .select('*')
      .eq('project_id', params.id)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Map DB rows back to ChatMessage format
    const messages = (data || []).map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      timestamp: row.created_at,
      messageType: row.message_type || 'text',
      modelInfo: row.model_info || undefined,
      fileChanges: row.file_changes || undefined,
      ...(row.metadata || {}),
    }));

    return NextResponse.json(messages);
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

/**
 * POST /api/projects/[id]/messages — Batch upsert chat messages
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    const supabase = createServiceSupabase();
    const { messages } = await request.json();

    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages must be an array' }, { status: 400 });
    }

    if (messages.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const rows = messages.map((msg: {
      id: string;
      role: string;
      content: string;
      timestamp: number;
      messageType?: string;
      modelInfo?: Record<string, unknown>;
      fileChanges?: unknown[];
      planQuestion?: unknown;
      suggestions?: unknown;
    }) => ({
      id: msg.id,
      project_id: params.id,
      role: msg.role,
      content: msg.content || '',
      message_type: msg.messageType || 'text',
      model_info: msg.modelInfo || null,
      file_changes: msg.fileChanges || null,
      metadata: buildMetadata(msg),
      created_at: msg.timestamp,
    }));

    const { error } = await supabase
      .from('project_messages')
      .upsert(rows, { onConflict: 'id' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

/**
 * DELETE /api/projects/[id]/messages — Clear all chat messages
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    const supabase = createServiceSupabase();

    const { error } = await supabase
      .from('project_messages')
      .delete()
      .eq('project_id', params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

/** Extract optional fields into metadata JSONB */
function buildMetadata(msg: {
  planQuestion?: unknown;
  suggestions?: unknown;
}): Record<string, unknown> | null {
  const meta: Record<string, unknown> = {};
  if (msg.planQuestion) meta.planQuestion = msg.planQuestion;
  if (msg.suggestions) meta.suggestions = msg.suggestions;
  return Object.keys(meta).length > 0 ? meta : null;
}
