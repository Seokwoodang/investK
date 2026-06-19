import 'server-only';
import { REVALIDATE } from '../env';

// Yahoo Finance 차트 API(키 불필요) — 달러인덱스(DXY, ICE `DX-Y.NYB`) 실시세.
// 국내(네이버/KIS)·frankfurter에 DXY가 없어 Yahoo로 보완.
export async function getDxy(): Promise<{ val: string; chg: number } | null> {
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=5d', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: REVALIDATE.fxIndex },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number } }> } };
    const m = j?.chart?.result?.[0]?.meta;
    const price = m?.regularMarketPrice;
    const prev = m?.previousClose ?? m?.chartPreviousClose;
    if (!price || !prev) return null;
    return { val: price.toFixed(2), chg: +(((price - prev) / prev) * 100).toFixed(2) };
  } catch {
    return null;
  }
}
