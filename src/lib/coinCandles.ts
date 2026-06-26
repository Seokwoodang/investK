import type { Candle, Period, TabId } from '../types';

// 코인 캔들은 브라우저에서 거래소 REST에 직접 요청(업비트/바이낸스 둘 다 CORS 허용).
// 서버 경유보다 안정적이고(샌드박스 TLS 회피) 키도 불필요. 봉 단위(period)별 간격·개수.
const UPBIT: Record<Period, { path: string }> = {
  '1분': { path: 'minutes/1' },
  '5분': { path: 'minutes/5' },
  '15분': { path: 'minutes/15' },
  '1시간': { path: 'minutes/60' },
  '일봉': { path: 'days' },
  '주봉': { path: 'weeks' },
  '월봉': { path: 'months' },
};

const BINANCE: Record<Period, { interval: string }> = {
  '1분': { interval: '1m' },
  '5분': { interval: '5m' },
  '15분': { interval: '15m' },
  '1시간': { interval: '1h' },
  '일봉': { interval: '1d' },
  '주봉': { interval: '1w' },
  '월봉': { interval: '1M' },
};

// 봉 1개의 대략 길이(ms) — 기간에서 캔들 개수를 산출하는 데 사용.
const SPAN_MS: Record<Period, number> = {
  '1분': 60e3,
  '5분': 300e3,
  '15분': 900e3,
  '1시간': 3600e3,
  '일봉': 86400e3,
  '주봉': 7 * 86400e3,
  '월봉': 30 * 86400e3,
};

// 기본 개수(기간 미지정 시) — 기존 동작 유지.
const DEFAULT_COUNT: Record<Period, number> = { '1분': 200, '5분': 200, '15분': 200, '1시간': 168, '일봉': 90, '주봉': 52, '월봉': 36 };

// 기간(fromMs~toMs)을 덮을 캔들 개수. 거래소 1회 호출 상한(cap) 안으로 제한.
function countFor(period: Period, fromMs: number | undefined, toMs: number | undefined, cap: number): number {
  if (fromMs == null || toMs == null) return Math.min(cap, DEFAULT_COUNT[period]);
  return Math.min(cap, Math.max(2, Math.ceil((toMs - fromMs) / SPAN_MS[period]) + 2));
}

// opts.fromMs~toMs 가 주어지면 그 구간을 덮도록 가져온다(차트/수익률이 사용자가 고른 기간을 따름).
export async function fetchCoinCandles(
  tab: TabId,
  ticker: string,
  period: Period,
  opts?: { fromMs?: number; toMs?: number },
): Promise<Candle[] | null> {
  const fromMs = opts?.fromMs;
  const toMs = opts?.toMs;
  try {
    if (tab === 'kr_coin') {
      const market = 'KRW-' + ticker.split('/')[0];
      const count = countFor(period, fromMs, toMs, 200); // 업비트 1회 최대 200
      const u = new URL(`https://api.upbit.com/v1/candles/${UPBIT[period].path}`);
      u.searchParams.set('market', market);
      u.searchParams.set('count', String(count));
      if (toMs != null) u.searchParams.set('to', new Date(toMs).toISOString()); // 해당 시각 이전 count개
      const r = await fetch(u);
      if (!r.ok) return null;
      const arr = (await r.json()) as Array<{ opening_price: number; high_price: number; low_price: number; trade_price: number; candle_date_time_utc: string }>;
      return arr
        .map((k) => ({ o: k.opening_price, h: k.high_price, l: k.low_price, c: k.trade_price, t: Date.parse(k.candle_date_time_utc + 'Z') }))
        .reverse();
    }
    if (tab === 'global_coin') {
      const limit = countFor(period, fromMs, toMs, 1000); // 바이낸스 1회 최대 1000
      const u = new URL('https://api.binance.com/api/v3/klines');
      u.searchParams.set('symbol', ticker + 'USDT');
      u.searchParams.set('interval', BINANCE[period].interval);
      u.searchParams.set('limit', String(limit));
      if (fromMs != null) u.searchParams.set('startTime', String(Math.floor(fromMs)));
      if (toMs != null) u.searchParams.set('endTime', String(Math.floor(toMs)));
      const r = await fetch(u);
      if (!r.ok) return null;
      const arr = (await r.json()) as Array<[number, string, string, string, string, ...unknown[]]>;
      return arr.map((k) => ({ o: +k[1], h: +k[2], l: +k[3], c: +k[4], t: k[0] }));
    }
    return null;
  } catch {
    return null;
  }
}
