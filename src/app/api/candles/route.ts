import { NextResponse } from 'next/server';
import { getDomesticCandles, getDomesticMinuteCandles, getOverseasCandles } from '@/server/providers/kis';
import { getUpbitCandles } from '@/server/providers/upbit';
import { getBinanceCandles } from '@/server/providers/binance';
import { symbolFor } from '@/server/providers/binance';
import { fetchYahooCandles } from '@/server/providers/yahoo';
import type { Candle, Period, TabId } from '@/types';

// POST /api/candles { tab, ticker, period } → 실제 과거 OHLC. (미들웨어에서 로그인 게이트 — KIS 쿼터 보호)
// 국내주식=KIS 일봉, 해외주식=KIS 해외일봉, 국내코인=업비트, 해외코인=바이낸스.
// 해외주식은 KIS가 못 주면 Yahoo 일봉으로 폴백(최근 리네임 티커 — 예: 바릭 GOLD→B — 를 KIS가 아직 미반영).
// 실패 시 candles:null → 클라이언트가 에러 UI 표시(가짜 캔들 폴백 없음).
export async function POST(req: Request) {
  const { tab, ticker, period, from, to } = (await req.json()) as {
    tab: TabId; ticker: string; period: Period; from?: string; to?: string;
  };
  const win = from || to ? { from, to } : undefined; // 'YYYYMMDD' 구간(사용자 지정 기간)
  const isMinute = period === '1분' || period === '5분' || period === '15분' || period === '30분' || period === '1시간';
  try {
    let candles: Candle[] = [];
    if (tab === 'kr_stock') candles = isMinute ? await getDomesticMinuteCandles(ticker, period) : await getDomesticCandles(ticker, period, win);
    else if (tab === 'us_stock') {
      candles = await getOverseasCandles(ticker, period, win);
      // KIS 해외차트에 없는 티커는 Yahoo로 폴백 — 공개 v8 차트(crumb 불필요), 선택한 봉 단위 그대로.
      //  KIS는 ADR·최근 리네임 티커(바릭 GOLD→B 등)에서 rt_cd 0인데 0봉을 주는 구멍이 넓다.
      //  Yahoo는 클래스주 구분에 점이 아니라 대시를 쓴다: BRK.B→BRK-B.
      if (!candles.length) candles = await fetchYahooCandles(ticker.replace(/\./g, '-'), period, win);
    }
    else if (tab === 'kr_coin') candles = await getUpbitCandles('KRW-' + ticker.split('/')[0], period);
    else if (tab === 'global_coin') candles = await getBinanceCandles(symbolFor(ticker), period);
    if (!candles.length) return NextResponse.json({ candles: null });
    return NextResponse.json({ candles });
  } catch (e) {
    console.error('[candles] failed:', (e as Error).message);
    return NextResponse.json({ candles: null });
  }
}
