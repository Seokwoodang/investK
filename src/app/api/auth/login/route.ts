import { NextResponse } from 'next/server';
import { COOKIE, createSession } from '@/lib/auth';

// 아이디/비밀번호는 환경변수로(공개 레포라 하드코딩 금지). 미설정 시 로컬 개발용 기본값.
const USER = process.env.APP_USER || 'admin';
const PASS = process.env.APP_PASS || 'investkang';

export async function POST(req: Request) {
  const { id, pw } = (await req.json().catch(() => ({}))) as { id?: string; pw?: string };
  if (!id || !pw || id !== USER || pw !== PASS) {
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
