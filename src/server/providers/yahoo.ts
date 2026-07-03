import 'server-only';
import { REVALIDATE } from '../env';

// Yahoo Finance 차트 API(키 불필요) — 심볼 하나의 현재가/전일대비. DXY(`DX-Y.NYB`)·VIX(`^VIX`)·美10년물(`^TNX`) 등.
export async function getYahooQuote(symbol: string): Promise<{ price: number; chg: number } | null> {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: REVALIDATE.fxIndex },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number } }> } };
    const m = j?.chart?.result?.[0]?.meta;
    const price = m?.regularMarketPrice;
    const prev = m?.previousClose ?? m?.chartPreviousClose;
    if (price == null || prev == null) return null;
    return { price, chg: +(((price - prev) / prev) * 100).toFixed(2) };
  } catch {
    return null;
  }
}

// 달러인덱스(DXY). 국내(네이버/KIS)·frankfurter에 없어 Yahoo로 보완.
export async function getDxy(): Promise<{ val: string; chg: number } | null> {
  const q = await getYahooQuote('DX-Y.NYB');
  return q ? { val: q.price.toFixed(2), chg: q.chg } : null;
}

// ── Yahoo quoteSummary(재무지표) — crumb 인증 필요. 쿠키+crumb를 받아 재사용한다. ──
let crumbCache: { cookie: string; crumb: string } | null = null;
let crumbInflight: Promise<{ cookie: string; crumb: string } | null> | null = null;

// 단일비행: 콜드 스타트에 워커 여러 개가 동시에 fc.yahoo.com을 두드리지 않게 발급을 공유.
async function getCrumb(force = false): Promise<{ cookie: string; crumb: string } | null> {
  if (crumbCache && !force) return crumbCache;
  if (crumbInflight) return crumbInflight;
  crumbInflight = (async () => {
    try {
      const c = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const cookie = (c.headers.getSetCookie?.() ?? []).map((s) => s.split(';')[0]).join('; ');
      const r = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        headers: { 'User-Agent': 'Mozilla/5.0', Cookie: cookie },
      });
      const crumb = (await r.text()).trim();
      if (!crumb || crumb.includes('<')) return null;
      crumbCache = { cookie, crumb };
      return crumbCache;
    } catch {
      return null;
    } finally {
      crumbInflight = null;
    }
  })();
  return crumbInflight;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface UsFundamentals {
  per: number | null;
  fwdPer: number | null;
  pbr: number | null;
  roe: number | null; // %
  netMargin: number | null; // %
  debtToEquity: number | null; // %
  currentRatio: number | null;
  divYield: number | null; // %
  target: number | null;
  recommMean: number | null;
  price: number | null;
  hi52: number | null; // 52주 최고가
}

const n = (x: { raw?: number } | undefined): number | null => (x && typeof x.raw === 'number' ? x.raw : null);

// 미국 종목 한 개의 재무지표(키통계+요약+재무). crumb 만료(401) 시 1회 재발급 후 재시도.
// 429(레이트리밋)는 야후가 가장 흔히 주는 오류 — 짧은 백오프 후 1회 재시도(무음 탈락 최소화).
export async function getUsFundamentals(symbol: string, retry = true): Promise<UsFundamentals | null> {
  const cc = await getCrumb();
  if (!cc) return null;
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,defaultKeyStatistics,financialData&crumb=${encodeURIComponent(cc.crumb)}`;
    let r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Cookie: cc.cookie } });
    if (r.status === 429 && retry) {
      await sleep(1500 + Math.random() * 1500);
      r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Cookie: cc.cookie } });
    }
    if (r.status === 401 && retry) {
      crumbCache = null;
      await getCrumb(true);
      return getUsFundamentals(symbol, false);
    }
    if (!r.ok) return null;
    const j = (await r.json()) as { quoteSummary?: { result?: Array<Record<string, Record<string, { raw?: number }>>> } };
    const res = j?.quoteSummary?.result?.[0];
    if (!res) return null;
    const sd = res.summaryDetail ?? {};
    const ks = res.defaultKeyStatistics ?? {};
    const fd = res.financialData ?? {};
    const pctOf = (x: { raw?: number } | undefined) => (n(x) == null ? null : +(n(x)! * 100).toFixed(2));
    return {
      per: n(sd.trailingPE),
      fwdPer: n(sd.forwardPE),
      pbr: n(ks.priceToBook),
      roe: pctOf(fd.returnOnEquity),
      netMargin: pctOf(fd.profitMargins),
      debtToEquity: n(fd.debtToEquity),
      currentRatio: n(fd.currentRatio),
      divYield: pctOf(sd.dividendYield),
      target: n(fd.targetMeanPrice),
      recommMean: n(fd.recommendationMean),
      price: n(fd.currentPrice),
      hi52: n(sd.fiftyTwoWeekHigh),
    };
  } catch {
    return null;
  }
}

// ── K-리서치용 확장 지표(밸류에이션·컨센서스·추천분포·성장률·프로필). 재무 시계열은 EDGAR가 담당. ──
export interface UsResearch {
  sector: string | null;
  industry: string | null;
  summary: string | null; // 사업 개요(원문 영어)
  marketCapText: string | null;
  per: number | null;
  fwdPer: number | null;
  pbr: number | null;
  pegRatio: number | null;
  evToEbitda: number | null;
  divYield: number | null; // %
  roe: number | null; // %
  netMargin: number | null; // %
  debtToEquity: number | null; // %
  currentRatio: number | null;
  fcf: number | null;
  revenueGrowth: number | null; // % (YoY)
  earningsGrowth: number | null; // % (YoY)
  fwdEpsGrowth: number | null; // % (+1y 추정)
  price: number | null;
  hi52: number | null;
  lo52: number | null;
  target: number | null;
  targetHigh: number | null;
  targetLow: number | null;
  recommMean: number | null; // 1매수~5매도
  recommKey: string | null; // 'buy'|'hold'|...
  numAnalysts: number | null;
  // 애널리스트 추천 분포(막대/파이용)
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

const pct = (x: { raw?: number } | undefined) => (n(x) == null ? null : +(n(x)! * 100).toFixed(2));

export async function getUsResearch(symbol: string, retry = true): Promise<UsResearch | null> {
  const cc = await getCrumb();
  if (!cc) return null;
  try {
    const mods = 'assetProfile,summaryDetail,defaultKeyStatistics,financialData,recommendationTrend,earningsTrend,price';
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${mods}&crumb=${encodeURIComponent(cc.crumb)}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Cookie: cc.cookie }, next: { revalidate: 3600 } });
    if (r.status === 401 && retry) {
      crumbCache = null;
      await getCrumb(true);
      return getUsResearch(symbol, false);
    }
    if (!r.ok) return null;
    const j = (await r.json()) as { quoteSummary?: { result?: Array<Record<string, any>> } };
    const res = j?.quoteSummary?.result?.[0];
    if (!res) return null;
    const ap = res.assetProfile ?? {};
    const sd = res.summaryDetail ?? {};
    const ks = res.defaultKeyStatistics ?? {};
    const fd = res.financialData ?? {};
    const pr = res.price ?? {};
    const trend = (res.recommendationTrend?.trend ?? [])[0] ?? {};
    const et = (res.earningsTrend?.trend ?? []).find((t: any) => t.period === '+1y');
    return {
      sector: ap.sector ?? null,
      industry: ap.industry ?? null,
      summary: ap.longBusinessSummary ?? null,
      marketCapText: sd.marketCap?.fmt ?? pr.marketCap?.fmt ?? null,
      per: n(sd.trailingPE),
      fwdPer: n(sd.forwardPE),
      pbr: n(ks.priceToBook),
      pegRatio: n(ks.pegRatio),
      evToEbitda: n(ks.enterpriseToEbitda),
      divYield: pct(sd.dividendYield),
      roe: pct(fd.returnOnEquity),
      netMargin: pct(fd.profitMargins),
      debtToEquity: n(fd.debtToEquity),
      currentRatio: n(fd.currentRatio),
      fcf: n(fd.freeCashflow),
      revenueGrowth: pct(fd.revenueGrowth),
      earningsGrowth: pct(fd.earningsGrowth),
      fwdEpsGrowth: pct(et?.growth),
      price: n(fd.currentPrice) ?? n(pr.regularMarketPrice),
      hi52: n(sd.fiftyTwoWeekHigh),
      lo52: n(sd.fiftyTwoWeekLow),
      target: n(fd.targetMeanPrice),
      targetHigh: n(fd.targetHighPrice),
      targetLow: n(fd.targetLowPrice),
      recommMean: n(fd.recommendationMean),
      recommKey: fd.recommendationKey ?? null,
      numAnalysts: n(fd.numberOfAnalystOpinions),
      strongBuy: trend.strongBuy ?? 0,
      buy: trend.buy ?? 0,
      hold: trend.hold ?? 0,
      sell: trend.sell ?? 0,
      strongSell: trend.strongSell ?? 0,
    };
  } catch {
    return null;
  }
}
