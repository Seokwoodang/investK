import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { AUTH_CONFIGURED, COOKIE, createSession } from '@/lib/auth';
import { getSupabase } from '@/server/supabase';

// 로그인: 자격은 Supabase `app_users` 테이블에 저장(코드/레포·env에 비번 없음).
//   app_users(username text pk, pass_hash text)  — pass_hash 형식: "scrypt$<saltHex>$<hashHex>"
// 서버가 username으로 조회 → scrypt 해시 비교. 세션은 서명 쿠키(AUTH_SECRET).  회원가입 없음.
export const runtime = 'nodejs';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;

// brute-force 완화: IP+아이디별 슬라이딩 윈도(15분에 8회). 인메모리라 인스턴스별이지만
// 개인 사이트 규모에선 충분하고, 최소한 단일 IP의 무한 대입은 차단된다.
const attempts = new Map<string, number[]>();
const WINDOW_MS = 15 * 60e3;
const MAX_TRIES = 8;
function rateLimited(key: string): boolean {
  const now = Date.now();
  const arr = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_TRIES) {
    attempts.set(key, arr);
    return true;
  }
  arr.push(now);
  attempts.set(key, arr);
  if (attempts.size > 1000) attempts.clear(); // 무한 성장 방지(러프하지만 충분)
  return false;
}

async function verifyPassword(stored: string, pw: string): Promise<boolean> {
  const [algo, salt, hash] = (stored || '').split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const calc = await scrypt(pw, salt, 32); // 비동기 — 이벤트루프 블로킹 없음
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

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (rateLimited(`${ip}:${id}`)) {
    return NextResponse.json({ error: '시도가 너무 많습니다. 15분 후 다시 시도해주세요.' }, { status: 429 });
  }

  const { data } = await sb.from('app_users').select('pass_hash, status').eq('username', id).maybeSingle();
  if (!data?.pass_hash || !(await verifyPassword(data.pass_hash as string, pw))) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }
  // 승인제: status가 approved가 아니면 로그인 차단(대기/거절 안내). 컬럼 없는 구계정은 approved로 백필됨.
  const status = (data.status as string | null) ?? 'approved';
  if (status !== 'approved') {
    const msg = status === 'pending' ? '가입 승인 대기 중입니다. 관리자 승인 후 로그인할 수 있습니다.' : '가입이 거절된 계정입니다.';
    return NextResponse.json({ error: msg }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await createSession(id, 30), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 86400,
  });
  return res;
}
