import { NextResponse } from 'next/server';
import { checkSell, type SellHolding } from '@/server/sellCheck';

// 보유 종목 매도 점검. 클라가 보유 목록(코드·평단수익률·비중·현재가)을 보내면 규칙 기반 신호를 돌려준다.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { holdings?: SellHolding[] };
    const holdings = (body.holdings ?? []).filter((h) => h && h.code && h.tab).slice(0, 60);
    if (!holdings.length) return NextResponse.json({ results: [] });
    const results = await checkSell(holdings);
    return NextResponse.json({ results });
  } catch (e) {
    console.error('[sell-check] failed:', e);
    return NextResponse.json({ error: 'sell_check_failed' }, { status: 500 });
  }
}
