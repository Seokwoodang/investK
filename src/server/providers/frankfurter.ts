import 'server-only';
import { REVALIDATE } from '../env';

// 환율: frankfurter.app (ECB 기준, 키 불필요, 일 1회 고시).
// EUR 기준 환율을 받아 우리 페어로 환산하고, 전일 대비 변동률을 계산한다.
// DXY(달러인덱스)는 frankfurter에 없어 Yahoo(getDxy)로 제공한다.
export interface FxQuote {
  val: string;
  chg: number;
}

interface Rates {
  date: string;
  rates: { USD: number; KRW: number; JPY: number };
}

async function fetchRates(date: string): Promise<Rates> {
  const res = await fetch(`https://api.frankfurter.app/${date}?from=EUR&to=USD,KRW,JPY`, {
    next: { revalidate: REVALIDATE.fxIndex },
  });
  if (!res.ok) throw new Error(`frankfurter ${date} ${res.status}`);
  return (await res.json()) as Rates;
}

// EUR 기준 rates → 표시 페어 값.
function pairs(r: Rates['rates']) {
  return {
    'USD/KRW': r.KRW / r.USD,
    'EUR/KRW': r.KRW,
    'USD/JPY': r.JPY / r.USD,
  } as Record<string, number>;
}

export async function getFxQuotes(): Promise<Record<string, FxQuote>> {
  const latest = await fetchRates('latest');
  const d = new Date(latest.date);
  d.setUTCDate(d.getUTCDate() - 1);
  const prev = await fetchRates(d.toISOString().slice(0, 10)); // 주말이면 직전 영업일로 자동 해석

  const cur = pairs(latest.rates);
  const old = pairs(prev.rates);
  const out: Record<string, FxQuote> = {};
  for (const k of Object.keys(cur)) {
    const v = cur[k];
    const o = old[k];
    const chg = o ? ((v - o) / o) * 100 : 0;
    out[k] = { val: v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), chg };
  }
  return out;
}
