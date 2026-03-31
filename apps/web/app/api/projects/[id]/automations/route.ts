import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase';
import { requireAuth, handleAuthError } from '@/lib/auth';
import { runAutomation, matchesTrigger, type AutomationDef, type AutomationLog } from '@/lib/automations/engine';

export const runtime = 'nodejs';

// ─── Helpers ───

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
 * GET /api/projects/:id/automations
 * List all automations + recent logs
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const settings = await getProjectSettings(params.id);
    return NextResponse.json({
      automations: settings.automations || [],
      logs: (settings.automationLogs || []).slice(-50),
    });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

/**
 * POST /api/projects/:id/automations
 * Create a new automation
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const body = await request.json();
    const { name, description, triggerType, triggerConfig, actionType, actionConfig } = body;

    if (!name || !triggerType || !actionType) {
      return NextResponse.json({ error: 'name, triggerType, actionType required' }, { status: 400 });
    }

    const settings = await getProjectSettings(params.id);
    const automations: AutomationDef[] = settings.automations || [];

    const newAuto: AutomationDef = {
      id: crypto.randomUUID(),
      name,
      description: description || '',
      triggerType,
      triggerConfig: triggerConfig || {},
      actionType,
      actionConfig: actionConfig || {},
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runCount: 0,
    };

    automations.push(newAuto);
    await saveProjectSettings(params.id, { ...settings, automations });

    return NextResponse.json({ automation: newAuto });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

/**
 * PATCH /api/projects/:id/automations
 * Update or trigger an automation
 * Body: { automationId, action: 'update' | 'toggle' | 'trigger', ...fields }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const body = await request.json();
    const { automationId, action } = body;

    if (!automationId) {
      return NextResponse.json({ error: 'automationId required' }, { status: 400 });
    }

    const settings = await getProjectSettings(params.id);
    const automations: AutomationDef[] = settings.automations || [];
    const idx = automations.findIndex((a) => a.id === automationId);

    if (idx === -1) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }

    if (action === 'toggle') {
      automations[idx].enabled = !automations[idx].enabled;
      automations[idx].updatedAt = new Date().toISOString();
      await saveProjectSettings(params.id, { ...settings, automations });
      return NextResponse.json({ automation: automations[idx] });
    }

    if (action === 'trigger') {
      // Manually trigger the automation
      const auto = automations[idx];
      const log = await runAutomation(auto, body.triggerData || {}, params.id);

      // Update run stats
      auto.lastRunAt = log.timestamp;
      auto.lastRunStatus = log.status;
      auto.runCount = (auto.runCount || 0) + 1;

      // Append log (keep last 100)
      const logs: AutomationLog[] = settings.automationLogs || [];
      logs.push(log);
      if (logs.length > 100) logs.splice(0, logs.length - 100);

      await saveProjectSettings(params.id, { ...settings, automations, automationLogs: logs });

      return NextResponse.json({ log });
    }

    // Default: update fields
    const { name, description, triggerType, triggerConfig, actionType, actionConfig, enabled } = body;
    if (name !== undefined) automations[idx].name = name;
    if (description !== undefined) automations[idx].description = description;
    if (triggerType !== undefined) automations[idx].triggerType = triggerType;
    if (triggerConfig !== undefined) automations[idx].triggerConfig = triggerConfig;
    if (actionType !== undefined) automations[idx].actionType = actionType;
    if (actionConfig !== undefined) automations[idx].actionConfig = actionConfig;
    if (enabled !== undefined) automations[idx].enabled = enabled;
    automations[idx].updatedAt = new Date().toISOString();

    await saveProjectSettings(params.id, { ...settings, automations });
    return NextResponse.json({ automation: automations[idx] });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

/**
 * DELETE /api/projects/:id/automations
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const { automationId } = await request.json();
    const settings = await getProjectSettings(params.id);
    const automations = (settings.automations || []).filter((a: any) => a.id !== automationId);
    await saveProjectSettings(params.id, { ...settings, automations });
    return NextResponse.json({ success: true });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
