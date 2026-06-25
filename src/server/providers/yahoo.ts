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

async function getCrumb(force = false): Promise<{ cookie: string; crumb: string } | null> {
  if (crumbCache && !force) return crumbCache;
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
  }
}

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
}

const n = (x: { raw?: number } | undefined): number | null => (x && typeof x.raw === 'number' ? x.raw : null);

// 미국 종목 한 개의 재무지표(키통계+요약+재무). crumb 만료(401) 시 1회 재발급 후 재시도.
export async function getUsFundamentals(symbol: string, retry = true): Promise<UsFundamentals | null> {
  const cc = await getCrumb();
  if (!cc) return null;
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,defaultKeyStatistics,financialData&crumb=${encodeURIComponent(cc.crumb)}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Cookie: cc.cookie } });
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
    };
  } catch {
    return null;
  }
}
