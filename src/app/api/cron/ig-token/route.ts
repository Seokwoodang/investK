import { NextResponse } from 'next/server';
import { refreshToken, tokenStatus } from '@/server/instagram';

// 인스타 장기 토큰(60일) 자동 갱신 → 갱신본을 KV에 저장.
// 이걸 안 돌리면 토큰 만료와 동시에 모든 인스타 자동 게시가 401로 죽는다.
// (기존엔 refreshToken()이 정의만 돼 있고 호출하는 곳이 없었다.)
// GitHub Actions가 주 1회 호출 — 60일 만료 대비 여유가 충분하다.
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // fail-closed: CRON_SECRET 미설정 배포에서도 절대 공개되지 않게(설정 누락 = 전부 거부).
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const before = await tokenStatus();
    const r = await refreshToken();
    return NextResponse.json({ ok: true, before, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
