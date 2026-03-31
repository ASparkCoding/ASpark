import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase';
import { requireAuth, handleAuthError } from '@/lib/auth';

/**
 * POST /api/projects/:id/security
 * Run security analysis on project files
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const supabase = createServiceSupabase();

    // Get latest files
    const { data: files } = await supabase
      .from('project_files')
      .select('path, content, version')
      .eq('project_id', params.id)
      .order('version', { ascending: false });

    if (!files || files.length === 0) {
      return NextResponse.json({ checks: [], score: 0 });
    }

    // Deduplicate by path (latest version)
    const latestFiles = new Map<string, { path: string; content: string }>();
    for (const f of files) {
      if (!latestFiles.has(f.path)) {
        latestFiles.set(f.path, { path: f.path, content: f.content });
      }
    }

    const allFiles = Array.from(latestFiles.values());
    const checks: Array<{
      id: string;
      category: string;
      label: string;
      status: 'pass' | 'warn' | 'fail';
      detail: string;
    }> = [];

    // 1. Check for hardcoded secrets
    const secretPatterns = [
      { pattern: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/gi, label: 'Hardcoded secrets' },
      { pattern: /sk[-_][a-zA-Z0-9]{20,}/g, label: 'API keys in code' },
    ];
    let hasSecrets = false;
    for (const f of allFiles) {
      for (const sp of secretPatterns) {
        if (sp.pattern.test(f.content)) {
          hasSecrets = true;
          checks.push({
            id: `secret-${f.path}`,
            category: 'Secrets',
            label: sp.label,
            status: 'fail',
            detail: `Potential secret found in ${f.path}`,
          });
          sp.pattern.lastIndex = 0;
        }
      }
    }
    if (!hasSecrets) {
      checks.push({
        id: 'secrets-clean',
        category: 'Secrets',
        label: 'No hardcoded secrets',
        status: 'pass',
        detail: 'No hardcoded API keys or secrets detected',
      });
    }

    // 2. Check for .env usage
    const envFile = allFiles.find(f => f.path === '.env');
    checks.push({
      id: 'env-file',
      category: 'Configuration',
      label: 'Environment variables',
      status: envFile ? 'pass' : 'warn',
      detail: envFile ? 'Using .env for configuration' : 'No .env file found — consider using environment variables',
    });

    // 3. Check for error boundary
    const hasErrorBoundary = allFiles.some(f =>
      f.content.includes('ErrorBoundary') || f.content.includes('error-boundary')
    );
    checks.push({
      id: 'error-boundary',
      category: 'Resilience',
      label: 'Error boundary',
      status: hasErrorBoundary ? 'pass' : 'warn',
      detail: hasErrorBoundary ? 'Error boundary component detected' : 'No error boundary — runtime errors may crash the app',
    });

    // 4. Check for input validation (XSS)
    const hasDangerouslySetInnerHTML = allFiles.some(f =>
      f.content.includes('dangerouslySetInnerHTML')
    );
    checks.push({
      id: 'xss-check',
      category: 'XSS Prevention',
      label: 'Unsafe HTML injection',
      status: hasDangerouslySetInnerHTML ? 'warn' : 'pass',
      detail: hasDangerouslySetInnerHTML
        ? 'dangerouslySetInnerHTML found — ensure content is sanitized'
        : 'No unsafe HTML injection patterns detected',
    });

    // 5. Check for Supabase RLS
    const sqlFiles = allFiles.filter(f => f.path.endsWith('.sql'));
    const hasRLS = sqlFiles.some(f =>
      f.content.includes('ROW LEVEL SECURITY') || f.content.includes('CREATE POLICY')
    );
    checks.push({
      id: 'rls-check',
      category: 'Database',
      label: 'Row Level Security',
      status: hasRLS ? 'pass' : 'warn',
      detail: hasRLS
        ? 'RLS policies detected in SQL schema'
        : 'No RLS policies found — database may be publicly accessible',
    });

    // 6. Check for auth usage
    const hasAuth = allFiles.some(f =>
      f.content.includes('useAuth') || f.content.includes('AuthProvider')
    );
    checks.push({
      id: 'auth-check',
      category: 'Authentication',
      label: 'Auth integration',
      status: hasAuth ? 'pass' : 'warn',
      detail: hasAuth
        ? 'Authentication hooks/provider detected'
        : 'No authentication detected — app may be publicly accessible',
    });

    // 7. Check dependencies for known vulnerable patterns
    const pkgJson = allFiles.find(f => f.path === 'package.json');
    if (pkgJson) {
      try {
        const pkg = JSON.parse(pkgJson.content);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        const outdated: string[] = [];
        // Simple version check for known concerns
        if (deps['react'] && deps['react'].includes('17')) outdated.push('react@17 (consider upgrading to 18)');
        checks.push({
          id: 'deps-check',
          category: 'Dependencies',
          label: 'Dependency audit',
          status: outdated.length > 0 ? 'warn' : 'pass',
          detail: outdated.length > 0
            ? `Potentially outdated: ${outdated.join(', ')}`
            : 'Dependencies appear up to date',
        });
      } catch {
        // Invalid package.json
      }
    }

    // Calculate score
    const passCount = checks.filter(c => c.status === 'pass').length;
    const score = Math.round((passCount / checks.length) * 100);

    return NextResponse.json({ checks, score });
  } catch (err) {
    const authErr = handleAuthError(err);
    if (authErr) return authErr;
    throw err;
  }
}
