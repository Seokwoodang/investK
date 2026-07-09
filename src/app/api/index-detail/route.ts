import { NextResponse } from 'next/server';
import { getIndexCandles, getInvestorTrend, INDEX_NAMES, type IndexRange } from '@/server/providers/indexDetail';

// GET /api/index-detail?name=코스피&range=3mo
// 지수 캔들(야후) + 코스피·코스닥은 투자자별 매매동향(네이버, 억원)까지.
// 공개 데이터 + 서버 캐시(fetch revalidate)라 공개 라우트.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const RANGES: IndexRange[] = ['1mo', '3mo', '1y'];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get('name') ?? '';
  const range = (url.searchParams.get('range') ?? '3mo') as IndexRange;
  if (!INDEX_NAMES.includes(name) || !RANGES.includes(range)) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const [candles, trend] = await Promise.all([
    getIndexCandles(name, range),
    getInvestorTrend(name), // 해외 지수는 빈 배열
  ]);
  if (!candles.length) return NextResponse.json({ error: 'no data' }, { status: 502 });
  return NextResponse.json({ candles, trend });
}
