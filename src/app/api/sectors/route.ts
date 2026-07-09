import { NextResponse } from 'next/server';
import { getSectors, type SectorMarket } from '@/server/providers/sectors';

// GET /api/sectors?market=kr|us
// 업종(섹터) 흐름 — 대표 ETF 종가 기준 오늘 등락 + 연속 추세. 공개 데이터 + 서버 캐시.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  const market = (new URL(req.url).searchParams.get('market') ?? 'kr') as SectorMarket;
  if (market !== 'kr' && market !== 'us') {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const rows = await getSectors(market);
  if (!rows.length) return NextResponse.json({ error: 'no data' }, { status: 502 });
  return NextResponse.json({ rows });
}
