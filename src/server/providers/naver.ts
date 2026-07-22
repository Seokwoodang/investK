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
  shares: number; // 거래량(주 수)
}

// 거래량(주 수). raw 우선.
const tradeShares = (s: NaverStock) => Number(String(s.accumulatedTradingVolumeRaw ?? s.accumulatedTradingVolume ?? '').replace(/,/g, '')) || 0;

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
    return { code: s.itemCode, name: s.stockName, price: num(s.closePrice), pct, vol: tradeValue(s), shares: tradeShares(s) };
  });
}

export async function getKrStockUniverse(): Promise<KrUniverseRow[]> {
  // KOSPI·KOSDAQ를 동시에(병렬) 수집 — 두 시장 사이 직렬 대기 제거.
  const fetchMarket = async (mkt: 'KOSPI' | 'KOSDAQ'): Promise<KrUniverseRow[]> => {
    const rows: KrUniverseRow[] = [];
    let first;
    try {
      first = await fetchPage(mkt, 1);
    } catch {
      return rows; // 1페이지 실패 → 이 시장 스킵(전체 폴백 방지)
    }
    rows.push(...toRows(first.stocks));
    const pages = Math.ceil(first.totalCount / 100);
    const rest: number[] = [];
    for (let p = 2; p <= pages; p++) rest.push(p);
    for (let i = 0; i < rest.length; i += 6) {
      const results = await Promise.allSettled(rest.slice(i, i + 6).map((p) => fetchPage(mkt, p)));
      results.forEach((r) => {
        if (r.status === 'fulfilled') rows.push(...toRows(r.value.stocks));
      });
    }
    return rows;
  };
  const [kospi, kosdaq] = await Promise.all([fetchMarket('KOSPI'), fetchMarket('KOSDAQ')]);
  return [...kospi, ...kosdaq];
}

// 해외주식(미국) 전 종목: 네이버 NASDAQ+NYSE 일괄 시세(지연 ~15분). 이름 한국어 제공.
export async function getUsStockUniverse(): Promise<import('@/types').UniverseRow[]> {
  type Row = import('@/types').UniverseRow;
  // NASDAQ·NYSE를 동시에(병렬) 수집 — 두 거래소 사이 직렬 대기 제거.
  const fetchExchange = async (ex: 'NASDAQ' | 'NYSE'): Promise<Row[]> => {
    const rows: Row[] = [];
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
        if (code && num(s.closePrice) > 0) rows.push({ id: code, name: s.stockName, ticker: code, price: num(s.closePrice), pct, vol: tradeValue(s), shares: tradeShares(s) });
      });
    let first;
    try {
      first = await get(1);
    } catch {
      return rows; // 1페이지 실패 → 이 거래소 스킵(전체 폴백 방지)
    }
    push(first.stocks);
    const pages = Math.min(60, Math.ceil(first.totalCount / 100));
    const rest: number[] = [];
    for (let p = 2; p <= pages; p++) rest.push(p);
    for (let i = 0; i < rest.length; i += 8) {
      const results = await Promise.allSettled(rest.slice(i, i + 8).map((p) => get(p)));
      results.forEach((r) => {
        if (r.status === 'fulfilled') push(r.value.stocks);
      });
    }
    return rows;
  };
  const [nasdaq, nyse] = await Promise.all([fetchExchange('NASDAQ'), fetchExchange('NYSE')]);
  return [...nasdaq, ...nyse];
}

// ── 국내 ETF 프로필(네이버 etfAnalysis) — Yahoo가 한국 ETF엔 구성종목·운용사를 안 줘서 네이버로 보강. ──
//  운용사·추종지수·보수·순자산·배당 + 구성종목 top10·섹터 비중·기간 수익률(누적). 차트는 Yahoo(.KS/.KQ) 재사용.
import type { EtfProfile } from './yahoo';
import { fetchDailyCandles } from './yahoo';

const NAVER_ETF_UA = { 'User-Agent': 'Mozilla/5.0', Referer: 'https://m.stock.naver.com/' };
// "32.76%" → 0.3276 · "-"/빈값 → 0(비중 미제공 = 이름만 표시)
function parseWeightPct(w: unknown): number {
  if (w == null) return 0;
  const f = parseFloat(String(w).replace('%', '').replace(/,/g, ''));
  return Number.isFinite(f) ? f / 100 : 0;
}
const pctRatio = (v: unknown): number | null => (typeof v === 'number' ? v / 100 : null); // 네이버 %숫자 → 비율

export async function getNaverEtfProfile(code: string): Promise<EtfProfile | null> {
  if (!/^\d{6}$/.test(code)) return null;
  try {
    const [aRes, ksCandles] = await Promise.all([
      fetch(`https://m.stock.naver.com/api/stock/${code}/etfAnalysis`, { headers: NAVER_ETF_UA, next: { revalidate: 3600 } }),
      fetchDailyCandles(`${code}.KS`, '1y'),
    ]);
    if (!aRes.ok) return null;
    const a = (await aRes.json()) as Record<string, any>;
    if (!a || !a.itemName) return null; // ETF 아님/데이터 없음
    const candles = ksCandles.length ? ksCandles : await fetchDailyCandles(`${code}.KQ`, '1y'); // 코스닥 ETF 폴백
    const holdings = (a.etfTop10MajorConstituentAssets ?? [])
      .map((h: any) => ({ symbol: h.itemCode || null, name: h.itemName ?? null, weight: parseWeightPct(h.etfWeight) }))
      .filter((h: { name: string | null }) => h.name);
    const sectors = (a.sectorPortfolioList ?? [])
      .map((s: any) => ({ key: String(s.detailTypeCode ?? ''), weight: typeof s.weight === 'number' ? s.weight / 100 : 0 }))
      .filter((s: { key: string; weight: number }) => s.key && s.weight > 0);
    const tr = a.themeReturns ?? {};
    const lastC = candles.length ? candles[candles.length - 1].c : null;
    const week52High = candles.length ? Math.max(...candles.map((c) => c.h)) : null;
    const week52Low = candles.length ? Math.min(...candles.map((c) => c.l)) : null;
    // 구성종목·운용사 어느 것도 없으면 ETF 프로필로 볼 수 없음 → null(Yahoo 폴백에 맡김).
    if (!holdings.length && !a.issuerName) return null;
    return {
      symbol: code,
      name: a.itemName,
      currency: 'KRW',
      price: lastC,
      changePct: typeof tr.returnRate1d === 'number' ? +tr.returnRate1d.toFixed(2) : null,
      family: a.issuerName ?? null,
      category: null,
      trackingIndex: a.etfBaseIndex ?? null,
      legalType: 'ETF',
      expenseRatio: typeof a.totalFee === 'number' ? a.totalFee / 100 : null,
      totalAssets: null,
      totalAssetsText: a.totalNav ?? a.marketValue ?? null,
      yield: a.dividend && typeof a.dividend.dividendYieldTtm === 'number' ? a.dividend.dividendYieldTtm / 100 : null,
      summary: a.etfSummary ?? null,
      holdings,
      sectors,
      // 네이버 기간 수익률은 '누적(총)' 기준 → Yahoo(누적으로 변환함)와 통일.
      returns: {
        m1: pctRatio(tr.returnRate1m), m3: pctRatio(tr.returnRate3m), ytd: pctRatio(tr.returnRateYtd),
        y1: pctRatio(tr.returnRate1y), y3: pctRatio(tr.returnRate3y), y5: pctRatio(tr.returnRate5y),
      },
      week52High,
      week52Low,
      volume: null,
      website: null,
      candles,
    };
  } catch {
    return null;
  }
}
