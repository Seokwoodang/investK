import type { Candle, Period, Stock, TabId } from '../types';

// Deterministic mock generators (seeded PRNG off the instrument id).
// In production these are replaced by real volume + OHLC candle data.

function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function prng(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function genVol(stock: Stock, tab: TabId): number {
  const r = prng(hashId(stock.id) * 7 + 131)();
  const coin = tab.indexOf('coin') >= 0;
  return Math.round((0.35 + r * 1.7) * (coin ? 5.5e6 : 1.4e7));
}

const PERIOD_CFG: Record<Period, { n: number; s: number }> = {
  '1분': { n: 60, s: 5 },
  '5분': { n: 60, s: 7 },
  '15분': { n: 60, s: 9 },
  '1시간': { n: 56, s: 11 },
  '일봉': { n: 90, s: 23 },
  '주봉': { n: 52, s: 37 },
  '월봉': { n: 36, s: 53 },
};

export function genCandles(stock: Stock, period: Period): Candle[] {
  const cfg = PERIOD_CFG[period];
  const rnd = prng(hashId(stock.id) ^ (cfg.s * 2654435761));
  const drift = stock.pct > 0 ? 0.07 : stock.pct < 0 ? -0.07 : 0;
  const volF = stock.risk === 'high' ? 0.022 : stock.risk === 'mid' ? 0.014 : 0.008;
  let price = stock.price * (1 - drift * cfg.n * 0.18);
  const out: Candle[] = [];
  for (let i = 0; i < cfg.n; i++) {
    const o = price;
    const dir = (rnd() - 0.5) * 2 + drift;
    const c = o * (1 + dir * volF);
    const h = Math.max(o, c) * (1 + rnd() * volF * 0.5);
    const l = Math.min(o, c) * (1 - rnd() * volF * 0.5);
    out.push({ o, h, l, c });
    price = c;
  }
  return out;
}
