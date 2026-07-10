import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { env } from '@/server/env';
import { SITE_URL } from '@/lib/site';
import { COOKIE, createSession } from '@/lib/auth';
import { getSupabase } from '@/server/supabase';

// GET /api/auth/kakao/callback — 카카오가 code와 함께 리다이렉트. code→토큰→사용자정보→세션 발급.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = cookies().get('kakao_state')?.value;
  // 실패는 /login?error=kakao로. 원인은 서버 로그(console.error)에만 남긴다(URL 노출 X).
  const fail = (reason: string) => {
    console.error('[kakao callback]', reason);
    return NextResponse.redirect(new URL('/login?error=kakao', SITE_URL));
  };

  // CSRF: state 쿠키와 일치해야 진행.
  if (!code) return fail('no_code');
  if (!state || !cookieState || state !== cookieState) return fail('state_mismatch');

  try {
    // 1) 인가코드 → 액세스 토큰
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.KAKAO_REST_API_KEY,
      redirect_uri: `${SITE_URL}/api/auth/kakao/callback`,
      code,
    });
    if (env.KAKAO_CLIENT_SECRET) body.set('client_secret', env.KAKAO_CLIENT_SECRET);
    const tokRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body,
      cache: 'no-store',
    });
    const tokText = await tokRes.text();
    if (!tokRes.ok) {
      console.error('[kakao token]', tokRes.status, tokText);
      // 카카오 에러코드(error_code)를 진단용으로 노출.
      let ec = '';
      try { ec = (JSON.parse(tokText).error_code || JSON.parse(tokText).error || '') as string; } catch { /* */ }
      return fail(`token_${tokRes.status}_${ec}`);
    }
    const tok = JSON.parse(tokText) as { access_token?: string };
    if (!tok.access_token) return fail('no_access_token');

    // 2) 사용자 정보(고유 id + 닉네임)
    const meRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
      cache: 'no-store',
    });
    if (!meRes.ok) return fail(`me_${meRes.status}`);
    const me = (await meRes.json()) as {
      id?: number;
      properties?: { nickname?: string };
      kakao_account?: { profile?: { nickname?: string } };
    };
    if (!me.id) return fail('no_id');

    const username = `kakao_${me.id}`;
    const nickname = me.kakao_account?.profile?.nickname || me.properties?.nickname || '카카오사용자';

    // 3) 회원 upsert(자동승인). is_admin 등 기존 값은 upsert payload에 없어 보존됨.
    const sb = getSupabase();
    if (sb) {
      await sb.from('app_users').upsert(
        { username, provider: 'kakao', display_name: nickname, status: 'approved' },
        { onConflict: 'username' },
      );
    }

    // 4) 세션 쿠키 발급 후 홈으로.
    const res = NextResponse.redirect(new URL('/', SITE_URL));
    res.cookies.set(COOKIE, await createSession(username, 30), {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 30 * 86400,
    });
    res.cookies.set('kakao_state', '', { path: '/', maxAge: 0 }); // state 쿠키 정리
    return res;
  } catch (e) {
    console.error('[kakao callback]', (e as Error).message);
    return fail(`exception_${(e as Error).message}`.slice(0, 80));
  }
}
