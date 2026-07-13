import type { Candle, Period, TabId } from '../types';
import { fetchCoinCandles } from './coinCandles';

// 무한 스크롤용 '과거 캔들' 로더 — 현재 로드된 가장 오래된 봉(oldestMs) 이전 구간을 더 가져온다.
//  · 코인: 브라우저에서 거래소 직접(fetchCoinCandles, toMs로 그 이전 구간).
//  · 주식: 서버(/api/candles)에 from/to(YYYYMMDD) 구간 조회. KIS는 요청당 ~100봉이라 한 번에 그만큼씩.

const BACK_DAYS: Record<Period, number> = { '1분': 1, '5분': 2, '15분': 5, '1시간': 20, '일봉': 160, '주봉': 800, '월봉': 2600 };
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

export async function fetchOlderCandles(tab: TabId, ticker: string, period: Period, oldestMs: number): Promise<Candle[]> {
  const isCoin = tab === 'kr_coin' || tab === 'global_coin';
  if (isCoin) {
    try { return (await fetchCoinCandles(tab, ticker, period, { toMs: oldestMs - 1 })) ?? []; } catch { return []; }
  }
  const to = new Date(oldestMs - 86400000); // 가장 오래된 봉 하루 전까지
  const from = new Date(to.getTime() - BACK_DAYS[period] * 86400000);
  try {
    const r = await fetch('/api/candles', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tab, ticker, period, from: ymd(from), to: ymd(to) }),
    });
    if (!r.ok) return [];
    const j = await r.json();
    return (j?.candles as Candle[]) ?? [];
  } catch { return []; }
}
