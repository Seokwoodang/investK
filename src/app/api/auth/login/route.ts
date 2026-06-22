import { NextResponse } from 'next/server';
import { COOKIE, createSession } from '@/lib/auth';

// 허용 아이디 목록 + 공통 비밀번호. 회원가입 없음(이 목록에 있는 계정만 로그인 가능).
// env로 덮어쓸 수 있음: APP_USERS(콤마 구분), APP_PASS.
const USERS = (process.env.APP_USERS || 'swoo1427,squface,squface1427').split(',').map((s) => s.trim()).filter(Boolean);
const PASS = process.env.APP_PASS || '1234';

export async function POST(req: Request) {
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
