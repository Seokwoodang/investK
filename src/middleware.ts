import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { COOKIE, verifySession } from '@/lib/auth';

// 보호 경로만 로그인 게이트. 나머지(시장 보기 페이지·읽기 API)는 비로그인 공개.
//  보호: 개인 페이지(내자산·보고서) + 유료 AI 생성(/api/ai/*) + 개인 데이터 API(/api/portfolio, /api/report-history)
const PROTECTED: RegExp[] = [
  /^\/portfolio(\/|$)/,
  /^\/report(\/|$)/,
  /^\/api\/ai\//,
  /^\/api\/portfolio(\/|$)/,
  /^\/api\/report-history(\/|$)/,
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((re) => re.test(pathname))) return NextResponse.next(); // 공개 경로 통과

  const ok = await verifySession(req.cookies.get(COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith('/api')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
