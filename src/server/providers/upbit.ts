import 'server-only';
import { REVALIDATE } from '../env';
import type { Candle, Period } from '@/types';

// 업비트 공개 시세 API (국내코인). 키 불필요.
// 마켓별로 개별 조회(Promise.allSettled)해 상장폐지된 마켓 하나가 전체를 막지 않게 한다.
export interface CoinQuote {
  price: number;
  pct: number; // 24h 변동률 %
  vol: number; // 24h 누적 거래대금(KRW)
}

export async function getUpbitQuotes(markets: string[]): Promise<Record<string, CoinQuote>> {
  if (!markets.length) return {};
  const results = await Promise.allSettled(
    markets.map(async (m) => {
      const res = await fetch(`https://api.upbit.com/v1/ticker?markets=${m}`, {
        next: { revalidate: REVALIDATE.quotes },
      });
      if (!res.ok) throw new Error(`upbit ${m} ${res.status}`);
      const arr = (await res.json()) as Array<{
        trade_price: number;
        signed_change_rate: number;
        acc_trade_price_24h: number;
      }>;
      const t = arr[0];
      return [m, { price: t.trade_price, pct: t.signed_change_rate * 100, vol: t.acc_trade_price_24h }] as const;
    }),
  );
  const out: Record<string, CoinQuote> = {};
  for (const r of results) if (r.status === 'fulfilled') out[r.value[0]] = r.value[1];
  return out;
}

// 업비트 캔들 (과거 OHLC). 기간별로 분/일봉 선택. 키 불필요.
const UPBIT_CANDLE: Record<Period, { path: string; count: number }> = {
  '1분': { path: 'minutes/1', count: 200 },
  '5분': { path: 'minutes/5', count: 200 },
  '15분': { path: 'minutes/15', count: 200 },
  '1시간': { path: 'minutes/60', count: 168 },
  '일봉': { path: 'days', count: 90 },
  '주봉': { path: 'weeks', count: 52 },
  '월봉': { path: 'months', count: 36 },
};

export async function getUpbitCandles(market: string, period: Period): Promise<Candle[]> {
  const cfg = UPBIT_CANDLE[period];
  const res = await fetch(`https://api.upbit.com/v1/candles/${cfg.path}?market=${market}&count=${cfg.count}`, {
    next: { revalidate: REVALIDATE.quotes },
  });
  if (!res.ok) throw new Error(`upbit candles ${market} ${res.status}`);
  const arr = (await res.json()) as Array<{ opening_price: number; high_price: number; low_price: number; trade_price: number; candle_date_time_utc: string }>;
  // 업비트는 최신순 → 과거순으로 뒤집기
  return arr
    .map((k) => ({ o: k.opening_price, h: k.high_price, l: k.low_price, c: k.trade_price, t: Date.parse(k.candle_date_time_utc + 'Z') }))
    .reverse();
}

// 전 종목(KRW 마켓 전체) 유니버스: 마스터(이름)+ticker(시세)를 묶어 반환.
export async function getUpbitUniverse(): Promise<import('@/types').UniverseRow[]> {
  const markets = (await (
    await fetch('https://api.upbit.com/v1/market/all?isDetails=false', { next: { revalidate: REVALIDATE.quotes } })
  ).json()) as Array<{ market: string; korean_name: string }>;
  const krw = markets.filter((m) => m.market.startsWith('KRW-'));
  const byMarket: Record<string, { trade_price: number; signed_change_rate: number; acc_trade_price_24h: number }> = {};
  const codes = krw.map((m) => m.market);
  for (let i = 0; i < codes.length; i += 100) {
    const chunk = codes.slice(i, i + 100);
    const arr = (await (
      await fetch(`https://api.upbit.com/v1/ticker?markets=${chunk.join(',')}`, { next: { revalidate: REVALIDATE.quotes } })
    ).json()) as Array<{ market: string; trade_price: number; signed_change_rate: number; acc_trade_price_24h: number }>;
    arr.forEach((t) => (byMarket[t.market] = t));
  }
  return krw
    .map((m) => {
      const t = byMarket[m.market];
      const base = m.market.slice(4);
      return { id: m.market, name: m.korean_name, ticker: `${base}/KRW`, price: t?.trade_price ?? 0, pct: (t?.signed_change_rate ?? 0) * 100, vol: t?.acc_trade_price_24h ?? 0 };
    })
    .filter((r) => r.price > 0);
}
