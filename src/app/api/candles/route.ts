import { NextResponse } from 'next/server';
import { getDomesticCandles, getOverseasCandles } from '@/server/providers/kis';
import { getUpbitCandles } from '@/server/providers/upbit';
import { getBinanceCandles } from '@/server/providers/binance';
import { symbolFor } from '@/server/providers/binance';
import type { Candle, Period, TabId } from '@/types';

// POST /api/candles { tab, ticker, period } → 실제 과거 OHLC. (미들웨어에서 로그인 게이트 — KIS 쿼터 보호)
// 국내주식=KIS 일봉, 해외주식=KIS 해외일봉, 국내코인=업비트, 해외코인=바이낸스.
// 실패 시 candles:null → 클라이언트가 에러 UI 표시(가짜 캔들 폴백 없음).
export async function POST(req: Request) {
  const { tab, ticker, period, from, to } = (await req.json()) as {
    tab: TabId; ticker: string; period: Period; from?: string; to?: string;
  };
  const win = from || to ? { from, to } : undefined; // 'YYYYMMDD' 구간(사용자 지정 기간)
  try {
    let candles: Candle[] = [];
    if (tab === 'kr_stock') candles = await getDomesticCandles(ticker, period, win);
    else if (tab === 'us_stock') candles = await getOverseasCandles(ticker, period, win);
    else if (tab === 'kr_coin') candles = await getUpbitCandles('KRW-' + ticker.split('/')[0], period);
    else if (tab === 'global_coin') candles = await getBinanceCandles(symbolFor(ticker), period);
    if (!candles.length) return NextResponse.json({ candles: null });
    return NextResponse.json({ candles });
  } catch (e) {
    console.error('[candles] failed:', (e as Error).message);
    return NextResponse.json({ candles: null });
  }
}
