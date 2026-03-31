import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface AuthResult {
  userId: string;
  email: string;
}

/**
 * 环境变量控制是否强制认证
 * MVP 阶段默认关闭，设置 REQUIRE_AUTH=true 开启
 */
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true';

/**
 * 从请求中验证用户身份
 * 返回 AuthResult 或抛出 AuthError
 */
export async function requireAuth(): Promise<AuthResult> {
  if (!REQUIRE_AUTH) {
    return { userId: '00000000-0000-0000-0000-000000000000', email: 'dev@local' };
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthError('Unauthorized');
  }

  return { userId: user.id, email: user.email || '' };
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * 处理 AuthError，返回 401 响应
 */
export function handleAuthError(err: unknown): NextResponse | null {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
