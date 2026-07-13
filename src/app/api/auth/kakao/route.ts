import { NextResponse } from 'next/server';
import { env, has } from '@/server/env';
import { SITE_URL } from '@/lib/site';

// GET /api/auth/kakao — 카카오 인가(authorize)로 리다이렉트. CSRF 방지용 state를 쿠키에 저장.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!has.kakao()) return NextResponse.redirect(new URL('/login?error=kakao_unconfigured', SITE_URL));

  const state = crypto.randomUUID();
  const url = new URL('https://kauth.kakao.com/oauth/authorize');
  url.searchParams.set('client_id', env.KAKAO_REST_API_KEY);
  url.searchParams.set('redirect_uri', `${SITE_URL}/api/auth/kakao/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  url.searchParams.set('scope', 'profile_nickname'); // 닉네임 동의 요청(콘솔 동의항목에 닉네임 추가 필요)
  // 카카오 세션이 남아 '묻지도 않고 이전 계정으로 바로 로그인'되는 것 방지 → 로그인/계정선택 화면 강제.
  url.searchParams.set('prompt', 'login');

  const res = NextResponse.redirect(url.toString());
  res.cookies.set('kakao_state', state, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600,
  });
  return res;
}
