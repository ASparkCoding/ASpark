import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase';
import { requireAuth, handleAuthError } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/projects/:id/analytics
 * Get analytics data for a project
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

    const settings = (project?.app_settings || {}) as Record<string, any>;
    const analytics = settings.analytics || { events: [], summary: {} };

    return NextResponse.json(analytics);
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

/**
 * POST /api/projects/:id/analytics
 * Track an analytics event (called from generated app's tracking script)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // No auth required for tracking events (called from client-side apps)
    const body = await request.json();
    const { eventType, pagePath, metadata, sessionId } = body;

    if (!eventType) {
      return NextResponse.json({ error: 'eventType required' }, { status: 400 });
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
    const analytics = settings.analytics || { events: [], summary: {} };

    // Add event
    const event = {
      id: crypto.randomUUID(),
      type: eventType,
      page: pagePath || '/',
      metadata: metadata || {},
      sessionId: sessionId || 'anonymous',
      timestamp: new Date().toISOString(),
    };

    analytics.events = analytics.events || [];
    analytics.events.push(event);

    // Keep last 1000 events
    if (analytics.events.length > 1000) {
      analytics.events = analytics.events.slice(-1000);
    }

    // Update summary counters
    const summary = analytics.summary || {};
    summary.totalEvents = (summary.totalEvents || 0) + 1;

    if (eventType === 'page_view') {
      summary.totalPageViews = (summary.totalPageViews || 0) + 1;

      // Track page-level views
      const pageViews = summary.pageViews || {};
      pageViews[pagePath || '/'] = (pageViews[pagePath || '/'] || 0) + 1;
      summary.pageViews = pageViews;

      // Track unique sessions
      const sessions = new Set(summary.uniqueSessions || []);
      sessions.add(sessionId || 'anonymous');
      summary.uniqueSessions = Array.from(sessions).slice(-500);
      summary.uniqueVisitors = sessions.size;
    }

    if (eventType === 'error') {
      summary.totalErrors = (summary.totalErrors || 0) + 1;
    }

    if (eventType === 'performance') {
      // Track Core Web Vitals
      const perfMetrics = summary.performance || { lcp: [], fid: [], cls: [] };
      if (metadata?.lcp) perfMetrics.lcp = [...(perfMetrics.lcp || []).slice(-50), metadata.lcp];
      if (metadata?.fid) perfMetrics.fid = [...(perfMetrics.fid || []).slice(-50), metadata.fid];
      if (metadata?.cls) perfMetrics.cls = [...(perfMetrics.cls || []).slice(-50), metadata.cls];
      summary.performance = perfMetrics;
    }

    // Track daily activity
    const today = new Date().toISOString().split('T')[0];
    const daily = summary.dailyActivity || {};
    daily[today] = (daily[today] || 0) + 1;
    // Keep last 30 days
    const sortedDays = Object.keys(daily).sort().slice(-30);
    summary.dailyActivity = Object.fromEntries(sortedDays.map((d) => [d, daily[d]]));

    analytics.summary = summary;

    await supabase
      .from('projects')
      .update({ app_settings: { ...settings, analytics } })
      .eq('id', params.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    // Don't fail tracking requests
    console.error('[Analytics] Track error:', err);
    return NextResponse.json({ success: false });
  }
}
