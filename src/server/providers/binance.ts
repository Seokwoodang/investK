import 'server-only';
import { REVALIDATE } from '../env';
import type { Candle, Period } from '@/types';

// 바이낸스 공개 시세 API (해외코인, USDT≈USD). 키 불필요, 요청 제한 넉넉.
export interface CoinQuote {
  price: number;
  pct: number; // 24h 변동률 %
  vol: number; // 24h 거래대금(USDT)
}

// 티커 → 바이낸스 심볼.
export const symbolFor = (ticker: string) => `${ticker}USDT`;

export async function getBinanceQuotes(symbols: string[]): Promise<Record<string, CoinQuote>> {
  if (!symbols.length) return {};
  const param = encodeURIComponent(JSON.stringify(symbols));
  const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${param}`, {
    next: { revalidate: REVALIDATE.quotes },
  });
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const arr = (await res.json()) as Array<{
    symbol: string;
    lastPrice: string;
    priceChangePercent: string;
    quoteVolume: string;
  }>;
  const out: Record<string, CoinQuote> = {};
  for (const t of arr) {
    out[t.symbol] = { price: +t.lastPrice, pct: +t.priceChangePercent, vol: +t.quoteVolume };
  }
  return out;
}

// 바이낸스 캔들(klines). 기간별 interval/limit. 키 불필요. 과거순으로 반환됨.
const BINANCE_CANDLE: Record<Period, { interval: string; limit: number }> = {
  '1분': { interval: '1m', limit: 200 },
  '5분': { interval: '5m', limit: 200 },
  '15분': { interval: '15m', limit: 200 },
  '1시간': { interval: '1h', limit: 168 },
  '일봉': { interval: '1d', limit: 90 },
  '주봉': { interval: '1w', limit: 52 },
  '월봉': { interval: '1M', limit: 36 },
};

export async function getBinanceCandles(symbol: string, period: Period): Promise<Candle[]> {
  const cfg = BINANCE_CANDLE[period];
  const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${cfg.interval}&limit=${cfg.limit}`, {
    next: { revalidate: REVALIDATE.quotes },
  });
  if (!res.ok) throw new Error(`binance candles ${symbol} ${res.status}`);
  const arr = (await res.json()) as Array<[number, string, string, string, string, ...unknown[]]>;
  return arr.map((k) => ({ o: +k[1], h: +k[2], l: +k[3], c: +k[4], t: k[0] }));
}

// 전 종목(USDT 페어 전체) 유니버스. 레버리지/스테이블 토큰류 제외, 거래대금 순.
export async function getBinanceUniverse(): Promise<import('@/types').UniverseRow[]> {
  // 24hr 전체 응답이 ~2.4MB로 Next 데이터캐시 한도(2MB) 초과 → 캐시 시도 자체를 끔(no-store).
  // 페이지 단위 ISR 캐시가 갱신 주기를 담당하므로 시세 신선도엔 영향 없음.
  const arr = (await (
    await fetch('https://api.binance.com/api/v3/ticker/24hr', { cache: 'no-store' })
  ).json()) as Array<{ symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string; volume?: string }>;
  const STABLE = new Set(['USDC', 'FDUSD', 'TUSD', 'BUSD', 'DAI', 'USDP', 'USTC', 'EUR', 'AEUR', 'EURI', 'XUSD']);
  return arr
    .filter((t) => t.symbol.endsWith('USDT') && !/(UP|DOWN|BULL|BEAR)USDT$/.test(t.symbol) && +t.quoteVolume > 0 && +t.lastPrice > 0)
    .map((t) => {
      const base = t.symbol.slice(0, -4);
      return { id: t.symbol, name: base, ticker: base, price: +t.lastPrice, pct: +t.priceChangePercent, vol: +t.quoteVolume, shares: +(t.volume ?? 0) };
    })
    .filter((r) => !STABLE.has(r.ticker));
}
