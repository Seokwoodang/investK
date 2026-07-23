import 'server-only';
import { REVALIDATE } from '../env';
import type { Candle, Period } from '../../types';

// Yahoo 차트 캔들 공통 조회(키 불필요) — interval/range로 봉 단위를 지정.
async function yahooChart(symbol: string, interval: string, range: string): Promise<Candle[]> {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 3600 },
    });
    if (!r.ok) return [];
    const j = (await r.json()) as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[] }> } }> } };
    const res = j?.chart?.result?.[0];
    const ts = res?.timestamp ?? [];
    const q = res?.indicators?.quote?.[0];
    if (!q) return [];
    const out: Candle[] = [];
    for (let k = 0; k < ts.length; k++) {
      const o = q.open?.[k], h = q.high?.[k], l = q.low?.[k], c = q.close?.[k];
      if (o == null || h == null || l == null || c == null) continue;
      out.push({ o, h, l, c, t: ts[k] * 1000 });
    }
    return out;
  } catch {
    return [];
  }
}

// Yahoo 일봉 캔들 — ETF 가격 차트용. (국내 ETF는 <코드>.KS/.KQ)
export async function fetchDailyCandles(symbol: string, range = '1y'): Promise<Candle[]> {
  return yahooChart(symbol, '1d', range);
}

// 우리 봉 단위(Period) → Yahoo interval/range. 분·시간봉은 Yahoo가 과거 구간을 제한하므로 range도 맞춘다.
const YF_INTERVAL: Record<Period, { interval: string; range: string }> = {
  '1분': { interval: '1m', range: '5d' },
  '5분': { interval: '5m', range: '1mo' },
  '15분': { interval: '15m', range: '1mo' },
  '30분': { interval: '30m', range: '1mo' },
  '1시간': { interval: '60m', range: '6mo' },
  '4시간': { interval: '60m', range: '6mo' }, // Yahoo에 4시간봉 없음 → 1시간봉으로 근사
  '일봉': { interval: '1d', range: '2y' },
  '주봉': { interval: '1wk', range: '5y' },
  '월봉': { interval: '1mo', range: 'max' },
};

// 해외주식 폴백용 — 선택한 봉 단위(Period)에 맞는 Yahoo 캔들. KIS가 못 주는 티커(ADR·리네임 등)에 사용.
export async function fetchYahooCandles(symbol: string, period: Period): Promise<Candle[]> {
  const m = YF_INTERVAL[period] ?? { interval: '1d', range: '2y' };
  return yahooChart(symbol, m.interval, m.range);
}

// Yahoo Finance 차트 API(키 불필요) — 심볼 하나의 현재가/전일대비. DXY(`DX-Y.NYB`)·VIX(`^VIX`)·美10년물(`^TNX`) 등.
export async function getYahooQuote(symbol: string): Promise<{ price: number; chg: number } | null> {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: REVALIDATE.fxIndex },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number };
          indicators?: { quote?: Array<{ close?: (number | null)[] }> };
        }>;
      };
    };
    const res = j?.chart?.result?.[0];
    const m = res?.meta;
    const price = m?.regularMarketPrice;
    // '전일 대비'가 정확하려면 진짜 직전 거래일 종가가 필요.
    // previousClose 결측 시 chartPreviousClose(5일 창의 시작 전 종가=5일 전)로 폴백하면
    // 며칠치 누적 변동이 '전일'로 잘못 표시됨 → 일봉 종가 배열의 직전 값으로 대체.
    const closes = (res?.indicators?.quote?.[0]?.close ?? []).filter((c): c is number => c != null);
    const prev = m?.previousClose ?? (closes.length >= 2 ? closes[closes.length - 2] : undefined);
    if (price == null || prev == null || prev === 0) return null;
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

// ── ETF 프로필: 국내 유니버스에 없는 해외 ETF 보유 종목을 '상세 없음' 대신 ETF답게 소개. ──
//  운용사·추종 카테고리·보수·순자산·배당 + 실제 구성종목(top holdings)·섹터 비중·개요. 전부 Yahoo 실데이터.
export interface EtfProfile {
  symbol: string;
  name: string | null;      // 정식 명칭(Invesco QQQ Trust 등)
  currency: string | null;
  price: number | null;
  changePct: number | null;
  family: string | null;    // 운용사(Invesco·State Street 등)
  category: string | null;  // 분류(Large Growth 등)
  trackingIndex: string | null; // 추종 지수(코스피200·NASDAQ 100 등, 주로 국내 ETF)
  legalType: string | null; // Exchange Traded Fund 등
  expenseRatio: number | null; // 연 보수(비율, 0.0018=0.18%)
  totalAssets: number | null;  // 순자산(AUM, 숫자)
  totalAssetsText: string | null; // 순자산(이미 포맷된 문자열, 국내 소스용 "24조 3,297억")
  yield: number | null;        // 배당수익률(비율)
  summary: string | null;      // 개요(영문)
  holdings: { symbol: string | null; name: string | null; weight: number }[]; // 구성종목(비중 내림차순)
  sectors: { key: string; weight: number }[]; // 섹터 비중
  // 확장(v0.23.2): 기간 수익률·52주 범위·거래량·공식 링크·가격 캔들(1년 일봉)
  returns: { m1: number | null; m3: number | null; ytd: number | null; y1: number | null; y3: number | null; y5: number | null };
  week52High: number | null;
  week52Low: number | null;
  volume: number | null;
  website: string | null;
  candles: Candle[]; // 1년 일봉(차트용) — UI에서 뒤에서 잘라 1M/3M/1Y 토글
}

// 이름/티커로 Yahoo ETF 심볼 해석(공개 search, crumb 불필요). ETF 결과 중 첫 번째 심볼.
//  예: 'Invesco NASDAQ 100 ETF' → 'QQQM'. 티커가 애매한 해외 ETF를 이름으로 찾을 때 사용.
export async function resolveEtfSymbol(query: string): Promise<string | null> {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=6&newsCount=0`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 86400 },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { quotes?: Array<{ symbol?: string; quoteType?: string }> };
    const etf = (j.quotes ?? []).find((q) => String(q.quoteType).toUpperCase() === 'ETF' && q.symbol);
    return etf?.symbol ?? null;
  } catch {
    return null;
  }
}

export async function getEtfProfile(symbol: string, retry = true): Promise<EtfProfile | null> {
  const cc = await getCrumb();
  if (!cc) return null;
  try {
    const mods = 'topHoldings,fundProfile,assetProfile,summaryDetail,fundPerformance,price';
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${mods}&crumb=${encodeURIComponent(cc.crumb)}`;
    // 프로필(quoteSummary)과 1년 일봉(차트)을 병렬로.
    const [sumRes, candles] = await Promise.all([
      (async () => {
        let r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Cookie: cc.cookie }, next: { revalidate: 3600 } });
        if (r.status === 429 && retry) { await sleep(1200 + Math.random() * 1200); r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Cookie: cc.cookie } }); }
        return r;
      })(),
      fetchDailyCandles(symbol, '1y'),
    ]);
    let r = sumRes;
    if (r.status === 401 && retry) { crumbCache = null; await getCrumb(true); return getEtfProfile(symbol, false); }
    if (!r.ok) return null;
    const j = (await r.json()) as { quoteSummary?: { result?: Array<Record<string, any>> } };
    const res = j?.quoteSummary?.result?.[0];
    if (!res) return null;
    const pr = res.price ?? {}, fp = res.fundProfile ?? {}, th = res.topHoldings ?? {}, ap = res.assetProfile ?? {}, sd = res.summaryDetail ?? {};
    const tr = res.fundPerformance?.trailingReturns ?? {};
    // ETF/펀드가 아니면(개별주 등) 프로필 대상 아님 → null(정직하게 폴백).
    const qt = String(pr.quoteType ?? '').toUpperCase();
    if (qt !== 'ETF' && qt !== 'MUTUALFUND') return null;
    const holdings = (th.holdings ?? [])
      .map((h: any) => ({ symbol: h.symbol ?? null, name: h.holdingName ?? null, weight: typeof h.holdingPercent?.raw === 'number' ? h.holdingPercent.raw : 0 }))
      .filter((h: { weight: number }) => h.weight > 0)
      .sort((a: { weight: number }, b: { weight: number }) => b.weight - a.weight);
    const sectors = (th.sectorWeightings ?? [])
      .map((o: Record<string, { raw?: number }>) => { const k = Object.keys(o)[0]; return { key: k, weight: typeof o[k]?.raw === 'number' ? o[k].raw! : 0 }; })
      .filter((s: { weight: number }) => s.weight > 0)
      .sort((a: { weight: number }, b: { weight: number }) => b.weight - a.weight);
    // quoteType이 ETF/펀드로 확인됐으면 구성종목이 없어도(한국 상장 ETF 등 Yahoo가 보유내역 미제공) 프로필 반환
    // → 이름·가격·차트·52주·수익률만이라도 일관되게 보여줌.
    return {
      symbol: pr.symbol ?? symbol,
      name: pr.longName ?? pr.shortName ?? null,
      currency: pr.currency ?? null,
      price: n(pr.regularMarketPrice),
      changePct: n(pr.regularMarketChangePercent) != null ? +(n(pr.regularMarketChangePercent)! * 100).toFixed(2) : null,
      family: fp.family ?? null,
      category: fp.categoryName ?? null,
      trackingIndex: null,
      legalType: fp.legalType ?? null,
      expenseRatio: n(fp.feesExpensesInvestment?.annualReportExpenseRatio) ?? n(fp.feesExpensesInvestment?.netExpRatio) ?? null,
      totalAssets: n(sd.totalAssets),
      totalAssetsText: null,
      yield: n(sd.yield),
      summary: ap.longBusinessSummary ?? null,
      holdings,
      sectors,
      // 수익률은 '누적(총)'으로 통일. Yahoo 3·5년은 연환산(CAGR)이라 누적으로 변환((1+연)^년-1).
      returns: {
        m1: n(tr.oneMonth), m3: n(tr.threeMonth), ytd: n(tr.ytd), y1: n(tr.oneYear),
        y3: n(tr.threeYear) != null ? Math.pow(1 + n(tr.threeYear)!, 3) - 1 : null,
        y5: n(tr.fiveYear) != null ? Math.pow(1 + n(tr.fiveYear)!, 5) - 1 : null,
      },
      week52High: n(sd.fiftyTwoWeekHigh),
      week52Low: n(sd.fiftyTwoWeekLow),
      volume: n(sd.volume) ?? n(pr.regularMarketVolume),
      website: ap.website ?? null,
      candles,
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
