import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { AUTH_CONFIGURED, COOKIE, createSession } from '@/lib/auth';
import { getSupabase } from '@/server/supabase';

// 로그인: 자격은 Supabase `app_users` 테이블에 저장(코드/레포·env에 비번 없음).
//   app_users(username text pk, pass_hash text)  — pass_hash 형식: "scrypt$<saltHex>$<hashHex>"
// 서버가 username으로 조회 → scrypt 해시 비교. 세션은 서명 쿠키(AUTH_SECRET).  회원가입 없음.
export const runtime = 'nodejs';

function verifyPassword(stored: string, pw: string): boolean {
  const [algo, salt, hash] = (stored || '').split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const calc = crypto.scryptSync(pw, salt, 32);
  const want = Buffer.from(hash, 'hex');
  return want.length === calc.length && crypto.timingSafeEqual(calc, want);
}

export async function POST(req: Request) {
  if (!AUTH_CONFIGURED) {
    return NextResponse.json({ error: '서버에 AUTH_SECRET이 설정되지 않았습니다.' }, { status: 503 });
  }
  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ error: '서버에 Supabase가 설정되지 않았습니다.' }, { status: 503 });
  }

  const { id, pw } = (await req.json().catch(() => ({}))) as { id?: string; pw?: string };
  if (!id || !pw) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  const { data } = await sb.from('app_users').select('pass_hash').eq('username', id).maybeSingle();
  if (!data?.pass_hash || !verifyPassword(data.pass_hash as string, pw)) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await createSession(30), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 86400,
  });
  return res;
}
