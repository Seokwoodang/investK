import { NextResponse } from 'next/server';
import { AUTH_CONFIGURED, COOKIE, createSession } from '@/lib/auth';

// 자격은 오직 환경변수로(코드/레포에 실제 값 없음). 회원가입 없음 — 아래 목록 계정만 로그인.
//   APP_USERS=아이디1,아이디2,...   APP_PASS=공통비번   (Vercel/.env.local 에 설정)
// 운영(prod)에서 미설정이면 로그인 불가(fail-closed). 로컬 개발만 dev/dev 폴백.
const isProd = process.env.NODE_ENV === 'production';
const USERS = (process.env.APP_USERS || (isProd ? '' : 'dev')).split(',').map((s) => s.trim()).filter(Boolean);
const PASS = process.env.APP_PASS || (isProd ? '' : 'dev');

export async function POST(req: Request) {
  if (!AUTH_CONFIGURED || !USERS.length || !PASS) {
    return NextResponse.json({ error: '로그인이 아직 설정되지 않았습니다. 서버 환경변수(APP_USERS·APP_PASS·AUTH_SECRET)를 설정해주세요.' }, { status: 503 });
  }
  const { id, pw } = (await req.json().catch(() => ({}))) as { id?: string; pw?: string };
  if (!id || !pw || !USERS.includes(id) || pw !== PASS) {
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
