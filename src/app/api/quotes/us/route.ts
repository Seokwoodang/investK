import { NextResponse } from 'next/server';
import { getOverseasQuotes } from '@/server/providers/kis';

// POST /api/quotes/us { symbols: ['NVDA', ...] } → 해외주식 지연시세(약 15분).
// 실시간 소켓(HDFSCNT0)은 KIS 해외 실시간 유료 신청이 필요하므로, 무료 지연 REST를
// 클라이언트가 주기적으로 폴링해 "지연 반영"한다.
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { symbols } = (await req.json()) as { symbols: string[] };
  if (!symbols?.length) return NextResponse.json({ quotes: {} });
  try {
    const q = await getOverseasQuotes(symbols.slice(0, 20));
    return NextResponse.json({ quotes: q });
  } catch (e) {
    console.error('[quotes/us] failed:', (e as Error).message);
    return NextResponse.json({ quotes: {} });
  }
}
