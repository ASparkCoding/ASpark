import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase';
import { requireAuth, handleAuthError } from '@/lib/auth';

export const runtime = 'nodejs';

const VERCEL_API = 'https://api.vercel.com';

function getVercelHeaders() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN not configured');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * GET /api/projects/:id/domains
 * List custom domains — syncs status from Vercel if possible
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
    const domains = settings.domains || [];

    // Try to sync domain status from Vercel
    const token = process.env.VERCEL_TOKEN;
    if (token && domains.length > 0) {
      let updated = false;
      for (const d of domains) {
        if (d.vercelProjectName && d.status !== 'active') {
          try {
            const res = await fetch(
              `${VERCEL_API}/v9/projects/${d.vercelProjectName}/domains/${d.domain}`,
              { headers: getVercelHeaders() }
            );
            if (res.ok) {
              const data = await res.json();
              const newStatus = data.verified ? 'active' : 'verifying';
              if (d.status !== newStatus) {
                d.status = newStatus;
                updated = true;
              }
            }
          } catch { /* non-fatal */ }
        }
      }
      if (updated) {
        await supabase
          .from('projects')
          .update({ app_settings: { ...settings, domains } })
          .eq('id', params.id);
      }
    }

    return NextResponse.json({ domains });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

/**
 * POST /api/projects/:id/domains
 * Add a custom domain via Vercel API + store in DB
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const { domain } = await request.json();

    if (!domain || typeof domain !== 'string') {
      return NextResponse.json({ error: 'Domain is required' }, { status: 400 });
    }

    const domainRegex = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 });
    }

    const supabase = createServiceSupabase();

    const { data: project } = await supabase
      .from('projects')
      .select('app_settings, name')
      .eq('id', params.id)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const settings = (project.app_settings || {}) as Record<string, any>;
    const domains = settings.domains || [];

    if (domains.some((d: any) => d.domain === domain)) {
      return NextResponse.json({ error: 'Domain already exists' }, { status: 409 });
    }

    // Try to add domain via Vercel API
    const token = process.env.VERCEL_TOKEN;
    let vercelProjectName = settings.vercelProjectName || '';
    let dnsRecords = [{ type: 'CNAME', name: domain, value: 'cname.vercel-dns.com' }];
    let status: 'pending' | 'verifying' | 'active' | 'error' = 'pending';

    if (token && vercelProjectName) {
      try {
        const res = await fetch(
          `${VERCEL_API}/v10/projects/${vercelProjectName}/domains`,
          {
            method: 'POST',
            headers: getVercelHeaders(),
            body: JSON.stringify({ name: domain }),
          }
        );

        if (res.ok) {
          const data = await res.json();
          status = data.verified ? 'active' : 'verifying';

          // Vercel returns required DNS records for verification
          if (data.verification) {
            dnsRecords = data.verification.map((v: any) => ({
              type: v.type,
              name: v.domain,
              value: v.value,
            }));
          }

          console.log(`[Domains] Added ${domain} to Vercel project ${vercelProjectName}`);
        } else {
          const errData = await res.json().catch(() => ({}));
          console.error(`[Domains] Vercel API error:`, errData);

          // If project not found, domain is still saved locally with pending status
          if (res.status === 404) {
            console.warn(`[Domains] Vercel project "${vercelProjectName}" not found. Saving domain locally.`);
          } else {
            return NextResponse.json(
              { error: `Vercel API: ${errData.error?.message || res.statusText}` },
              { status: 502 }
            );
          }
        }
      } catch (err) {
        console.error(`[Domains] Vercel API call failed:`, err);
        // Continue with local storage
      }
    }

    const newDomain = {
      id: crypto.randomUUID(),
      domain,
      status,
      createdAt: new Date().toISOString(),
      vercelProjectName: vercelProjectName || undefined,
      dnsRecords,
    };

    domains.push(newDomain);

    await supabase
      .from('projects')
      .update({ app_settings: { ...settings, domains } })
      .eq('id', params.id);

    return NextResponse.json({ domain: newDomain });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

/**
 * PATCH /api/projects/:id/domains
 * Verify a domain's DNS configuration
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const { domainId } = await request.json();

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
    const domains = settings.domains || [];
    const domainEntry = domains.find((d: any) => d.id === domainId);

    if (!domainEntry) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    // Try to verify via Vercel API
    const token = process.env.VERCEL_TOKEN;
    if (token && domainEntry.vercelProjectName) {
      try {
        const res = await fetch(
          `${VERCEL_API}/v9/projects/${domainEntry.vercelProjectName}/domains/${domainEntry.domain}/verify`,
          { method: 'POST', headers: getVercelHeaders() }
        );

        if (res.ok) {
          const data = await res.json();
          domainEntry.status = data.verified ? 'active' : 'verifying';
        } else {
          domainEntry.status = 'error';
        }
      } catch {
        domainEntry.status = 'error';
      }
    } else {
      // Without Vercel, do a basic DNS lookup check
      try {
        const dnsRes = await fetch(`https://dns.google/resolve?name=${domainEntry.domain}&type=CNAME`);
        const dnsData = await dnsRes.json();
        const hasCname = dnsData.Answer?.some((a: any) =>
          a.data?.includes('vercel') || a.data?.includes('now.sh')
        );
        domainEntry.status = hasCname ? 'active' : 'verifying';
      } catch {
        domainEntry.status = 'verifying';
      }
    }

    await supabase
      .from('projects')
      .update({ app_settings: { ...settings, domains } })
      .eq('id', params.id);

    return NextResponse.json({ domain: domainEntry });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}

/**
 * DELETE /api/projects/:id/domains
 * Remove a custom domain from Vercel + DB
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const { domainId } = await request.json();

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
    const domainEntry = (settings.domains || []).find((d: any) => d.id === domainId);

    // Remove from Vercel if possible
    const token = process.env.VERCEL_TOKEN;
    if (token && domainEntry?.vercelProjectName && domainEntry?.domain) {
      try {
        await fetch(
          `${VERCEL_API}/v9/projects/${domainEntry.vercelProjectName}/domains/${domainEntry.domain}`,
          { method: 'DELETE', headers: getVercelHeaders() }
        );
        console.log(`[Domains] Removed ${domainEntry.domain} from Vercel`);
      } catch { /* non-fatal */ }
    }

    const domains = (settings.domains || []).filter((d: any) => d.id !== domainId);

    await supabase
      .from('projects')
      .update({ app_settings: { ...settings, domains } })
      .eq('id', params.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
