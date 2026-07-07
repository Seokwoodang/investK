import { NextResponse } from 'next/server';
import { COOKIE } from '@/lib/auth';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}

// GET: 쿠키 정리 후 /login으로 리다이렉트. 승인 폐기(거절·삭제)된 세션을 레이아웃 게이트에서
// 여기로 보내 죽은 쿠키를 지우고 로그인 화면으로 내보낸다.
export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL('/login', req.url));
  res.cookies.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
