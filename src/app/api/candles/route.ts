import { NextResponse } from 'next/server';
import { getDomesticCandles, getOverseasCandles } from '@/server/providers/kis';
import { getUpbitCandles } from '@/server/providers/upbit';
import { getBinanceCandles } from '@/server/providers/binance';
import { symbolFor } from '@/server/providers/binance';
import type { Candle, Period, TabId } from '@/types';

// POST /api/candles { tab, ticker, period } → 실제 과거 OHLC.
// 국내주식=KIS 일봉, 해외주식=KIS 해외일봉, 국내코인=업비트, 해외코인=바이낸스.
// 실패 시 candles:null → 클라이언트가 mock(genCandles)로 폴백.
export async function POST(req: Request) {
  const { tab, ticker, period } = (await req.json()) as { tab: TabId; ticker: string; period: Period };
  try {
    let candles: Candle[] = [];
    if (tab === 'kr_stock') candles = await getDomesticCandles(ticker, period);
    else if (tab === 'us_stock') candles = await getOverseasCandles(ticker, period);
    else if (tab === 'kr_coin') candles = await getUpbitCandles('KRW-' + ticker.split('/')[0], period);
    else if (tab === 'global_coin') candles = await getBinanceCandles(symbolFor(ticker), period);
    if (!candles.length) return NextResponse.json({ candles: null });
    return NextResponse.json({ candles });
  } catch (e) {
    console.error('[candles] failed:', (e as Error).message);
    return NextResponse.json({ candles: null });
  }
}
