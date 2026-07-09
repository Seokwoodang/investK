import { NextResponse } from 'next/server';
import { getSectorDetail, type SectorMarket } from '@/server/providers/sectors';

// GET /api/sector-detail?market=kr|us&name=반도체&range=3mo
// 섹터 상세 — ETF 캔들(야후) + 대표 종목 실제 뉴스(네이버). '왜 움직이나'를 기사로.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const RANGES = ['1mo', '3mo', '1y'];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const market = (url.searchParams.get('market') ?? 'kr') as SectorMarket;
  const name = url.searchParams.get('name') ?? '';
  const range = url.searchParams.get('range') ?? '3mo';
  if ((market !== 'kr' && market !== 'us') || !name || !RANGES.includes(range)) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const detail = await getSectorDetail(market, name, range);
  if (!detail) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(detail);
}
