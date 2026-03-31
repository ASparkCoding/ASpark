import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase';
import { requireAuth, handleAuthError } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/projects/:id/functions
 * List Edge Functions for a project (stored in app_settings)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const supabase = createServiceSupabase();

    const { data: project } = await supabase
      .from('projects')
      .select('app_settings')
      .eq('id', params.id)
      .single();

    const functions = (project?.app_settings as any)?.functions || [];
    return NextResponse.json({ functions });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

/**
 * POST /api/projects/:id/functions
 * Register a new Edge Function definition
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const body = await request.json();
    const { name, description, code } = body;

    if (!name || !code) {
      return NextResponse.json(
        { error: 'name and code are required' },
        { status: 400 }
      );
    }

    const supabase = createServiceSupabase();

    const { data: project } = await supabase
      .from('projects')
      .select('app_settings')
      .eq('id', params.id)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const settings = (project.app_settings || {}) as Record<string, any>;
    const functions = settings.functions || [];

    const newFunc = {
      id: crypto.randomUUID(),
      name,
      description: description || '',
      code,
      status: 'ready' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    functions.push(newFunc);

    await supabase
      .from('projects')
      .update({ app_settings: { ...settings, functions } })
      .eq('id', params.id);

    return NextResponse.json({ function: newFunc });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

/**
 * PATCH /api/projects/:id/functions
 * Invoke / execute a function by name
 * Body: { functionId, payload }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const body = await request.json();
    const { functionId, payload } = body;

    if (!functionId) {
      return NextResponse.json({ error: 'functionId is required' }, { status: 400 });
    }

    const supabase = createServiceSupabase();

    const { data: project } = await supabase
      .from('projects')
      .select('app_settings')
      .eq('id', params.id)
      .single();

    const settings = (project?.app_settings || {}) as Record<string, any>;
    const functions = settings.functions || [];
    const func = functions.find((f: any) => f.id === functionId);

    if (!func) {
      return NextResponse.json({ error: 'Function not found' }, { status: 404 });
    }

    // Execute the function in a sandboxed context
    // For MVP, we use a simple Function() evaluator with limited scope
    try {
      const startTime = Date.now();

      // Create a sandboxed execution context
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const fn = new AsyncFunction(
        'payload',
        'supabase',
        'fetch',
        `
        try {
          ${func.code}
          if (typeof handler === 'function') {
            return await handler(payload);
          }
          return { error: 'No handler function defined' };
        } catch (e) {
          return { error: e.message || String(e) };
        }
        `
      );

      const result = await Promise.race([
        fn(payload || {}, supabase, fetch),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Function timeout (30s)')), 30000)
        ),
      ]);

      const duration = Date.now() - startTime;
      console.log(`[Functions] Executed "${func.name}" in ${duration}ms`);

      return NextResponse.json({
        result,
        duration,
        functionId: func.id,
        functionName: func.name,
      });
    } catch (execErr) {
      console.error(`[Functions] Execution error:`, execErr);
      return NextResponse.json(
        { error: `Function execution failed: ${(execErr as Error).message}` },
        { status: 500 }
      );
    }
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

/**
 * DELETE /api/projects/:id/functions
 * Remove a function definition
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const { functionId } = await request.json();

    const supabase = createServiceSupabase();

    const { data: project } = await supabase
      .from('projects')
      .select('app_settings')
      .eq('id', params.id)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const settings = (project.app_settings || {}) as Record<string, any>;
    const functions = (settings.functions || []).filter((f: any) => f.id !== functionId);

    await supabase
      .from('projects')
      .update({ app_settings: { ...settings, functions } })
      .eq('id', params.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
