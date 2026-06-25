import { NextResponse } from 'next/server';
import { refreshValueScreen } from '@/server/valueScreen';

// 하루 1회(장 마감 후) 국내·해외 시총 상위 유니버스의 재무지표를 받아 점수·랭킹을 미리 만들어 저장.
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
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
  return NextResponse.json({ ok: true, counts: out });
}
