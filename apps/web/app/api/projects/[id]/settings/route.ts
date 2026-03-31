import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase';
import { requireAuth, handleAuthError } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const body = await request.json();
    const supabase = createServiceSupabase();

    const { data: project } = await supabase
      .from('projects')
      .select('app_settings')
      .eq('id', params.id)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const currentSettings = project.app_settings || {};
    const newSettings = { ...currentSettings, ...body };

    const { error } = await supabase
      .from('projects')
      .update({ app_settings: newSettings })
      .eq('id', params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, settings: newSettings });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const supabase = createServiceSupabase();
    const { data } = await supabase
      .from('projects')
      .select('app_settings')
      .eq('id', params.id)
      .single();

    return NextResponse.json({ settings: data?.app_settings || {} });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
