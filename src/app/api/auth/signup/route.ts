import { NextResponse } from 'next/server';

// 아이디/비밀번호 가입은 종료됨. 신규 가입·로그인은 카카오 로그인(/api/auth/kakao)으로만.
//  (아이디/비번 다계정 양산으로 AI 비용이 남용되는 것을 막기 위함)
export const runtime = 'nodejs';

export async function POST() {
  return NextResponse.json({ error: '신규 가입은 카카오 로그인으로만 가능합니다.' }, { status: 410 });
}
