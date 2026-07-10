import { NextResponse } from 'next/server';

// 아이디/비밀번호 로그인은 폐지됨. 로그인·가입은 카카오 로그인(/api/auth/kakao)으로만.
export const runtime = 'nodejs';

export async function POST() {
  return NextResponse.json({ error: '로그인은 카카오 로그인으로만 가능합니다.' }, { status: 410 });
}
