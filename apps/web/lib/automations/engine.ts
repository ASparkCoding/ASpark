/**
 * Automations Engine
 * Evaluates triggers and executes actions for project automations.
 */

import { createServiceSupabase } from '@/lib/supabase';

// ─── Types ───

export type TriggerType = 'data_insert' | 'data_update' | 'data_delete' | 'schedule' | 'webhook' | 'manual';
export type ActionType = 'update_data' | 'call_api' | 'run_function' | 'log';

export interface AutomationDef {
  id: string;
  name: string;
  description?: string;
  triggerType: TriggerType;
  triggerConfig: Record<string, any>;
  actionType: ActionType;
  actionConfig: Record<string, any>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'error';
  runCount: number;
}

export interface AutomationLog {
  id: string;
  automationId: string;
  automationName: string;
  status: 'success' | 'error';
  triggerData?: any;
  result?: any;
  error?: string;
  duration: number;
  timestamp: string;
}

// ─── Trigger Matching ───

export function matchesTrigger(
  automation: AutomationDef,
  event: { type: TriggerType; table?: string; data?: any }
): boolean {
  if (!automation.enabled) return false;
  if (automation.triggerType !== event.type) return false;

  const cfg = automation.triggerConfig;

  switch (event.type) {
    case 'data_insert':
    case 'data_update':
    case 'data_delete':
      return !cfg.tableName || cfg.tableName === event.table;

    case 'webhook':
      return true; // Webhook automations always match their endpoint

    case 'manual':
      return true;

    case 'schedule':
      // Schedule matching is handled by the cron checker
      return true;

    default:
      return false;
  }
}

// ─── Action Execution ───

export async function executeAction(
  automation: AutomationDef,
  triggerData: any,
  projectId: string
): Promise<{ result: any; error: string | null; duration: number }> {
  const startTime = Date.now();

  try {
    const supabase = createServiceSupabase();

    switch (automation.actionType) {
      case 'update_data': {
        const { tableName, updates, filters } = automation.actionConfig;
        if (!tableName) return { result: null, error: 'No tableName configured', duration: 0 };

        let query = supabase.from(tableName).update(updates || {});
        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            query = query.eq(key, value);
          }
        }
        const { data, error } = await query.select();
        const duration = Date.now() - startTime;
        if (error) return { result: null, error: error.message, duration };
        return { result: data, error: null, duration };
      }

      case 'call_api': {
        const { url, method = 'POST', headers = {}, body } = automation.actionConfig;
        if (!url) return { result: null, error: 'No URL configured', duration: 0 };

        // Replace {{trigger.*}} placeholders with trigger data
        const resolvedBody = body
          ? JSON.parse(JSON.stringify(body).replace(/\{\{trigger\.(\w+)\}\}/g, (_: string, key: string) => {
              return triggerData?.[key] ?? '';
            }))
          : triggerData;

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(resolvedBody),
        });

        const duration = Date.now() - startTime;
        const responseData = await res.json().catch(() => res.text());

        if (!res.ok) {
          return { result: responseData, error: `HTTP ${res.status}`, duration };
        }
        return { result: responseData, error: null, duration };
      }

      case 'run_function': {
        const { functionId } = automation.actionConfig;
        if (!functionId) return { result: null, error: 'No functionId configured', duration: 0 };

        // Load function from project settings
        const { data: project } = await supabase
          .from('projects')
          .select('app_settings')
          .eq('id', projectId)
          .single();

        const functions = (project?.app_settings as any)?.functions || [];
        const func = functions.find((f: any) => f.id === functionId);

        if (!func) return { result: null, error: `Function ${functionId} not found`, duration: 0 };

        // Execute the function
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const fn = new AsyncFunction('payload', 'supabase', 'fetch', `
          try {
            ${func.code}
            if (typeof handler === 'function') return await handler(payload);
            return { error: 'No handler function defined' };
          } catch (e) { return { error: e.message || String(e) }; }
        `);

        const fnResult = await Promise.race([
          fn(triggerData || {}, supabase, fetch),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout (30s)')), 30000)),
        ]);

        const duration = Date.now() - startTime;
        return { result: fnResult, error: null, duration };
      }

      case 'log': {
        const duration = Date.now() - startTime;
        console.log(`[Automation:${automation.name}] Log action:`, triggerData);
        return { result: { logged: true, data: triggerData }, error: null, duration };
      }

      default:
        return { result: null, error: `Unknown action type: ${automation.actionType}`, duration: Date.now() - startTime };
    }
  } catch (err) {
    return { result: null, error: (err as Error).message, duration: Date.now() - startTime };
  }
}

// ─── Run Automation ───

export async function runAutomation(
  automation: AutomationDef,
  triggerData: any,
  projectId: string
): Promise<AutomationLog> {
  const { result, error, duration } = await executeAction(automation, triggerData, projectId);

  const log: AutomationLog = {
    id: crypto.randomUUID(),
    automationId: automation.id,
    automationName: automation.name,
    status: error ? 'error' : 'success',
    triggerData,
    result,
    error: error || undefined,
    duration,
    timestamp: new Date().toISOString(),
  };

  return log;
}
