import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { COOKIE, verifySession } from '@/lib/auth';

// 로그인 게이트. 세션 쿠키가 유효하면 통과, 아니면 페이지는 /login으로, API는 401.
// matcher에서 제외: /login(로그인 화면), /api/auth(로그인/로그아웃), /api/cron(GitHub Actions가 Bearer로 호출), 정적파일.
export async function middleware(req: NextRequest) {
  const ok = await verifySession(req.cookies.get(COOKIE)?.value);
  if (ok) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!api/auth|api/cron|login|_next/static|_next/image|favicon.ico).*)'],
};
