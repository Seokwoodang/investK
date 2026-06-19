import type { Candle, Period, TabId } from '../types';

// 코인 캔들은 브라우저에서 거래소 REST에 직접 요청(업비트/바이낸스 둘 다 CORS 허용).
// 서버 경유보다 안정적이고(샌드박스 TLS 회피) 키도 불필요. 봉 단위(period)별 간격·개수.
const UPBIT: Record<Period, { path: string; count: number }> = {
  '1시간': { path: 'minutes/60', count: 168 },
  '일봉': { path: 'days', count: 90 },
  '주봉': { path: 'weeks', count: 52 },
  '월봉': { path: 'months', count: 36 },
};

const BINANCE: Record<Period, { interval: string; limit: number }> = {
  '1시간': { interval: '1h', limit: 168 },
  '일봉': { interval: '1d', limit: 90 },
  '주봉': { interval: '1w', limit: 52 },
  '월봉': { interval: '1M', limit: 36 },
};

export async function fetchCoinCandles(tab: TabId, ticker: string, period: Period): Promise<Candle[] | null> {
  try {
    if (tab === 'kr_coin') {
      const market = 'KRW-' + ticker.split('/')[0];
      const cfg = UPBIT[period];
      const r = await fetch(`https://api.upbit.com/v1/candles/${cfg.path}?market=${market}&count=${cfg.count}`);
      if (!r.ok) return null;
      const arr = (await r.json()) as Array<{ opening_price: number; high_price: number; low_price: number; trade_price: number; candle_date_time_utc: string }>;
      return arr
        .map((k) => ({ o: k.opening_price, h: k.high_price, l: k.low_price, c: k.trade_price, t: Date.parse(k.candle_date_time_utc + 'Z') }))
        .reverse();
    }
    if (tab === 'global_coin') {
      const cfg = BINANCE[period];
      const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${ticker}USDT&interval=${cfg.interval}&limit=${cfg.limit}`);
      if (!r.ok) return null;
      const arr = (await r.json()) as Array<[number, string, string, string, string, ...unknown[]]>;
      return arr.map((k) => ({ o: +k[1], h: +k[2], l: +k[3], c: +k[4], t: k[0] }));
    }
    return null;
  } catch {
    return null;
  }
}
