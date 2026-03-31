/**
 * GET /api/projects/[id]/cost
 * POST /api/projects/[id]/cost
 * 成本追踪 API - 查询/记录 token 消耗
 */

import { NextRequest, NextResponse } from 'next/server';
import { costTracker } from '@/lib/cost-tracker';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const summary = costTracker.getSummary(params.id);
    const lastCall = costTracker.getLastCallCost();
    const recent = costTracker.getRecentUsage(5);

    return NextResponse.json({
      projectId: params.id,
      summary,
      lastCall,
      recentUsage: recent,
    });
  } catch (error) {
    console.error('[Cost API Error]', error);
    return NextResponse.json({ error: 'Failed to get cost data' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const usage = await req.json();

    costTracker.record({
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      model: usage.model || 'unknown',
      provider: usage.provider || 'unknown',
      type: usage.type || 'unknown',
      timestamp: Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Cost API Error]', error);
    return NextResponse.json({ error: 'Failed to record usage' }, { status: 500 });
  }
}
