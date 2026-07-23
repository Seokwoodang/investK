import { NextResponse } from 'next/server';
import { refreshValueScreen } from '@/server/valueScreen';

// 하루 1회(장 마감 후) 국내·해외 시총 상위 유니버스의 재무지표를 받아 점수·랭킹을 미리 만들어 저장.
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  // fail-closed: CRON_SECRET 미설정 배포에서도 절대 공개되지 않게(설정 누락 = 전부 거부).
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const out: Record<string, number> = {};
  for (const market of ['kr', 'us'] as const) {
    try {
      out[market] = await refreshValueScreen(market);
    } catch (e) {
      out[market] = -1;
      console.error(`[cron/value-screen] ${market} failed:`, (e as Error).message);
    }
  }
  // 한 시장이라도 실패(-1)나 0건이면 500 → GitHub Action이 빨간불로 표시(조용한 실패 방지).
  const failed = (['kr', 'us'] as const).some((m) => out[m] <= 0);
  return NextResponse.json({ ok: !failed, counts: out }, { status: failed ? 500 : 200 });
}
