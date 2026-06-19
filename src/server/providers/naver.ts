import 'server-only';
import { REVALIDATE } from '../env';

// 네이버 금융: 국내 전 종목(KOSPI+KOSDAQ) 일괄 시세. 키 불필요.
// 거래소 마스터 + 시세를 페이지 단위로 한꺼번에 받아 "전 종목"을 구성한다.
export interface KrUniverseRow {
  code: string;
  name: string;
  price: number;
  pct: number;
  vol: number; // 거래대금(원). 코인과 동일하게 거래대금 기준 정렬·표시.
}

interface NaverStock {
  itemCode: string;
  symbolCode?: string; // 해외주식은 symbolCode(NVDA 등)
  stockName: string;
  closePrice: string;
  fluctuationsRatio: string;
  compareToPreviousPrice?: { code: string };
  accumulatedTradingVolume: string;
  accumulatedTradingValueRaw?: string; // 거래대금(원/달러) — 정렬·표시는 거래대금 기준
  closePriceRaw?: string;
  accumulatedTradingVolumeRaw?: string;
}

const num = (s: string | undefined) => Number(String(s ?? '').replace(/,/g, '')) || 0;

// 거래대금(원/달러). raw 우선, 없으면 현재가×거래량으로 근사.
function tradeValue(s: NaverStock): number {
  const v = num(s.accumulatedTradingValueRaw);
  if (v > 0) return v;
  const price = num(s.closePriceRaw) || num(s.closePrice);
  const shares = num(s.accumulatedTradingVolumeRaw) || num(s.accumulatedTradingVolume);
  return price * shares;
}

async function fetchPage(mkt: 'KOSPI' | 'KOSDAQ', page: number): Promise<{ stocks: NaverStock[]; totalCount: number }> {
  const res = await fetch(`https://m.stock.naver.com/api/stocks/marketValue/${mkt}?page=${page}&pageSize=100`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    next: { revalidate: REVALIDATE.fxIndex },
  });
  if (!res.ok) throw new Error(`naver ${mkt} p${page} ${res.status}`);
  return (await res.json()) as { stocks: NaverStock[]; totalCount: number };
}

function toRows(stocks: NaverStock[]): KrUniverseRow[] {
  return stocks.map((s) => {
    let pct = num(s.fluctuationsRatio);
    const sign = s.compareToPreviousPrice?.code;
    if ((sign === '4' || sign === '5') && pct > 0) pct = -pct;
    return { code: s.itemCode, name: s.stockName, price: num(s.closePrice), pct, vol: tradeValue(s) };
  });
}

export async function getKrStockUniverse(): Promise<KrUniverseRow[]> {
  const out: KrUniverseRow[] = [];
  for (const mkt of ['KOSPI', 'KOSDAQ'] as const) {
    let first;
    try {
      first = await fetchPage(mkt, 1);
    } catch {
      continue; // 이 거래소 1페이지 실패 → 건너뜀(전체 폴백 방지)
    }
    out.push(...toRows(first.stocks));
    const pages = Math.ceil(first.totalCount / 100);
    const rest: number[] = [];
    for (let p = 2; p <= pages; p++) rest.push(p);
    // 6개씩 병렬, 일부 페이지 실패는 무시(allSettled) — 한 페이지 때문에 전체가 죽지 않게.
    for (let i = 0; i < rest.length; i += 6) {
      const batch = rest.slice(i, i + 6);
      const results = await Promise.allSettled(batch.map((p) => fetchPage(mkt, p)));
      results.forEach((r) => {
        if (r.status === 'fulfilled') out.push(...toRows(r.value.stocks));
      });
    }
  }
  return out;
}

// 해외주식(미국) 전 종목: 네이버 NASDAQ+NYSE 일괄 시세(지연 ~15분). 이름 한국어 제공.
export async function getUsStockUniverse(): Promise<import('@/types').UniverseRow[]> {
  const out: import('@/types').UniverseRow[] = [];
  for (const ex of ['NASDAQ', 'NYSE'] as const) {
    const base = `https://api.stock.naver.com/stock/exchange/${ex}/marketValue`;
    const get = async (page: number) => {
      const res = await fetch(`${base}?page=${page}&pageSize=100`, {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://m.stock.naver.com/' },
        next: { revalidate: REVALIDATE.fxIndex },
      });
      if (!res.ok) throw new Error(`naver ${ex} p${page} ${res.status}`);
      return (await res.json()) as { stocks: NaverStock[]; totalCount: number };
    };
    const push = (arr: NaverStock[]) =>
      arr.forEach((s) => {
        let pct = num(s.fluctuationsRatio);
        const sign = s.compareToPreviousPrice?.code;
        if ((sign === '4' || sign === '5') && pct > 0) pct = -pct;
        const code = s.symbolCode ?? s.itemCode;
        if (code && num(s.closePrice) > 0) out.push({ id: code, name: s.stockName, ticker: code, price: num(s.closePrice), pct, vol: tradeValue(s) });
      });
    let first;
    try {
      first = await get(1);
    } catch {
      continue; // 이 거래소 1페이지 실패 → 건너뜀(전체 폴백 방지)
    }
    push(first.stocks);
    const pages = Math.min(60, Math.ceil(first.totalCount / 100));
    const rest: number[] = [];
    for (let p = 2; p <= pages; p++) rest.push(p);
    for (let i = 0; i < rest.length; i += 8) {
      const batch = rest.slice(i, i + 8);
      const results = await Promise.allSettled(batch.map((p) => get(p)));
      results.forEach((r) => {
        if (r.status === 'fulfilled') push(r.value.stocks);
      });
    }
  }
  return out;
}
