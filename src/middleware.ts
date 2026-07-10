import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { COOKIE, verifySession } from '@/lib/auth';

// 보호 경로만 로그인 게이트. 나머지(시장 보기 페이지·읽기 API)는 비로그인 공개.
//  보호: 개인 페이지(내자산·보고서) + 유료 AI 생성(/api/ai/*) + 개인 데이터 API(/api/portfolio, /api/report-history)
//       + 상위 API 쿼터를 소비하는 데이터 API(/api/candles=KIS 캔들, /api/sell-check=KIS+재무 대량) — 게이트 페이지에서만 쓰임.
//  참고: /api/quotes/us·/api/realtime/stocks 는 공개 종목 목록이 사용하므로 의도적으로 공개 유지(서버 캐시로 완충).
const PROTECTED: RegExp[] = [
  /^\/instrument(\/|$)/, // 종목 상세(차트=KIS 캔들·실시간 토큰 사용) → 로그인 전용
  /^\/portfolio(\/|$)/,
  /^\/report(\/|$)/,
  /^\/admin(\/|$)/, // 회원 관리(로그인 필수 + 관리자 신원은 페이지/라우트에서 재검증)
  /^\/api\/admin\//, // 회원 관리 API(로그인 필수 + 라우트에서 관리자 신원 검증)
  /^\/api\/ai\//,
  /^\/api\/portfolio(\/|$)/,
  /^\/api\/report-history(\/|$)/,
  /^\/api\/push\//, // 웹푸시 구독 저장/해지(개인 데이터)
  /^\/api\/alerts(\/|$)/, // 알림 설정 동기화(개인 데이터)
  /^\/api\/candles(\/|$)/,
  /^\/api\/sell-check(\/|$)/,
];

export async function middleware(req: NextRequest) {
  // www → apex 301 리다이렉트(중복 도메인 방지, canonical 일원화).
  const host = req.headers.get('host') || '';
  if (host.startsWith('www.')) {
    const url = req.nextUrl.clone();
    url.host = host.slice(4);
    return NextResponse.redirect(url, 308);
  }

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
