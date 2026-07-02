import 'server-only';
import { kvGet, kvSet } from './kv';
import { getTopByMarketCap, getTopUsByMarketCap, getKrFinance, type Candidate } from './providers/naverFundamentals';
import { getUsFundamentals } from './providers/yahoo';
import type { Currency } from '@/types';

// "저평가 우량주" 스크리너 v2 — 버핏·그레이엄·그린블라트 원칙을 4개 축으로 점수화.
//   밸류 30%   (그레이엄·그린블라트): 이익수익률 1/PER + 순자산수익률 1/PBR
//   퀄리티 35% (버핏·노비막스):       ROE + 순이익률
//   안정성 20% (그레이엄·버핏):       부채비율↓ + 유동성(당좌/유동비율)
//   환원·성장 15%:                    배당수익률 + 이익성장
// 각 지표를 같은 시장 유니버스 내 백분위(0~100)로 환산해 가중합 → 종합 100점.
// 적자(PER≤0)·이상치(PER>60)·과다부채(부채비율≥400%)·핵심결측은 제외(밸류 함정 회피).
// 국내=네이버 재무제표(실측 ROE·부채비율·이익률) + 시세, 해외=야후 재무지표. 투자 권유 아님(참고용).

export type Market = 'kr' | 'us';
const KEY = (m: Market) => `value_screen:${m}`;
const KR_N = 1000;
const US_N = 300;
const KEEP = 200; // 캐시·페이지네이션 대상 상위 랭킹 수(이만큼을 무한스크롤로 넘겨본다)

export interface ScoredStock {
  code: string;
  name: string;
  price: number;
  cur: Currency;
  marketCapText: string;
  per: number | null;
  fwdPer: number | null;
  pbr: number | null;
  roe: number | null;
  netMargin: number | null;
  debtRatio: number | null;
  divYield: number | null;
  target: number | null;
  upside: number | null;
  recommMean: number | null;
  valueScore: number;
  qualityScore: number;
  safetyScore: number;
  yieldScore: number;
  score: number;
  graham: boolean; // 그레이엄 안전마진 충족
  buffett: boolean; // 버핏형 우량 충족
}

export interface ValueScreen {
  market: Market;
  date: string;
  generatedAt: string;
  universe: number;
  weights: { value: number; quality: number; safety: number; yield: number };
  items: ScoredStock[];
}

// 종목별 통합 지표(시장 무관 공통 형태).
interface Metrics {
  code: string;
  name: string;
  price: number;
  cur: Currency;
  marketCapText: string;
  per: number | null;
  fwdPer: number | null;
  pbr: number | null;
  roe: number | null; // %
  netMargin: number | null; // %
  debtRatio: number | null; // %
  liquidity: number | null; // 당좌/유동비율
  divYield: number | null; // %
  growth: number | null; // 이익성장 %
  target: number | null;
  recommMean: number | null;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

// 값이 클수록 좋은 지표 → 큰 값이 높은 백분위(0~100). null은 중립 50.
function percentiles(vals: (number | null)[]): number[] {
  const idx: { v: number; i: number }[] = [];
  vals.forEach((v, i) => v != null && Number.isFinite(v) && idx.push({ v, i }));
  idx.sort((a, b) => a.v - b.v);
  const out = new Array(vals.length).fill(50);
  idx.forEach((p, rank) => {
    out[p.i] = idx.length > 1 ? (rank / (idx.length - 1)) * 100 : 100;
  });
  return out;
}

const kstDate = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function krMetrics(c: Candidate): Promise<Metrics | null> {
  const f = await getKrFinance(c.code);
  if (!f) return null;
  const price = c.price;
  const per = f.eps && f.eps > 0 ? price / f.eps : null;
  const pbr = f.bps && f.bps > 0 ? price / f.bps : null;
  const fwdPer = f.fwdEps && f.fwdEps > 0 ? price / f.fwdEps : null;
  const divYield = f.dps != null && price > 0 ? (f.dps / price) * 100 : null;
  const growth = f.eps && f.eps > 0 && f.fwdEps != null ? (f.fwdEps / f.eps - 1) * 100 : null;
  return {
    code: c.code, name: c.name, price, cur: '₩', marketCapText: c.marketCapText,
    per, fwdPer, pbr, roe: f.roe, netMargin: f.netMargin, debtRatio: f.debtRatio,
    liquidity: f.quickRatio, divYield, growth, target: null, recommMean: null,
  };
}

async function usMetrics(c: Candidate): Promise<Metrics | null> {
  const f = await getUsFundamentals(c.code);
  if (!f) return null;
  const price = f.price ?? c.price;
  const growth = f.per && f.per > 0 && f.fwdPer && f.fwdPer > 0 ? (f.per / f.fwdPer - 1) * 100 : null;
  return {
    code: c.code, name: c.name, price, cur: '$', marketCapText: c.marketCapText,
    per: f.per, fwdPer: f.fwdPer, pbr: f.pbr, roe: f.roe, netMargin: f.netMargin,
    debtRatio: f.debtToEquity, liquidity: f.currentRatio, divYield: f.divYield, growth,
    target: f.target, recommMean: f.recommMean,
  };
}

export async function buildValueScreen(market: Market): Promise<ValueScreen> {
  const candidates = market === 'kr' ? await getTopByMarketCap(KR_N) : await getTopUsByMarketCap(US_N);
  const raw = market === 'kr' ? await pool(candidates, 10, krMetrics) : await pool(candidates, 6, usMetrics);

  // 함정 회피 게이트: 흑자 + 합리적 PER + 양수 ROE + 과다부채 제외 + 핵심지표 존재.
  const rows = raw.filter(
    (m): m is Metrics =>
      !!m &&
      m.per != null && m.per > 0 && m.per <= 60 &&
      m.pbr != null && m.pbr > 0 &&
      m.roe != null && m.roe > 0 &&
      (m.debtRatio == null || m.debtRatio < 400),
  );

  const pEY = percentiles(rows.map((r) => (r.per ? 1 / r.per : null)));
  const pBY = percentiles(rows.map((r) => (r.pbr ? 1 / r.pbr : null)));
  const pROE = percentiles(rows.map((r) => r.roe));
  const pMargin = percentiles(rows.map((r) => r.netMargin));
  const pDebt = percentiles(rows.map((r) => (r.debtRatio == null ? null : -r.debtRatio))); // 부채 낮을수록 높은 점수
  const pLiq = percentiles(rows.map((r) => r.liquidity));
  const pDiv = percentiles(rows.map((r) => r.divYield ?? 0));
  const pGrowth = percentiles(rows.map((r) => r.growth));

  const w = { value: 0.3, quality: 0.35, safety: 0.2, yield: 0.15 };
  const scored: ScoredStock[] = rows.map((r, k) => {
    const valueScore = (pEY[k] + pBY[k]) / 2;
    const qualityScore = (pROE[k] + pMargin[k]) / 2;
    const safetyScore = (pDebt[k] + pLiq[k]) / 2;
    const yieldScore = (pDiv[k] + pGrowth[k]) / 2;
    const score = w.value * valueScore + w.quality * qualityScore + w.safety * safetyScore + w.yield * yieldScore;
    const per = r.per!, pbr = r.pbr!, roe = r.roe!;
    const graham = per <= 15 && pbr <= 1.5 && per * pbr <= 22.5 && (r.debtRatio == null || r.debtRatio < 100) && roe >= 10;
    const buffett = roe >= 15 && r.netMargin != null && r.netMargin >= 10 && (r.debtRatio == null || r.debtRatio < 100);
    return {
      code: r.code, name: r.name, price: r.price, cur: r.cur, marketCapText: r.marketCapText,
      per: r.per, fwdPer: r.fwdPer, pbr: r.pbr, roe: r.roe, netMargin: r.netMargin, debtRatio: r.debtRatio,
      divYield: r.divYield, target: r.target, upside: r.target && r.price > 0 ? (r.target / r.price - 1) * 100 : null,
      recommMean: r.recommMean,
      valueScore: Math.round(valueScore), qualityScore: Math.round(qualityScore),
      safetyScore: Math.round(safetyScore), yieldScore: Math.round(yieldScore),
      score: Math.round(score * 10) / 10, graham, buffett,
    };
  });
  scored.sort((a, b) => b.score - a.score);

  return { market, date: kstDate(), generatedAt: new Date().toISOString(), universe: rows.length, weights: w, items: scored.slice(0, KEEP) };
}

// 정렬 키(클라 칩과 동일). 서버에서 정렬 후 페이지로 잘라 무한스크롤(네트워크) 지원.
const SORT_FNS: Record<string, { val: (s: ScoredStock) => number; asc?: boolean }> = {
  score: { val: (s) => s.score },
  value: { val: (s) => s.valueScore },
  quality: { val: (s) => s.qualityScore },
  safety: { val: (s) => s.safetyScore },
  yield: { val: (s) => s.yieldScore },
  roe: { val: (s) => s.roe ?? -1 },
  div: { val: (s) => s.divYield ?? -1 },
  per: { val: (s) => (s.per == null ? Infinity : s.per), asc: true },
  pbr: { val: (s) => (s.pbr == null ? Infinity : s.pbr), asc: true },
};

export interface ValuePage {
  date: string;
  universe: number;
  total: number;
  offset: number;
  items: ScoredStock[];
}

// 필터(전체/그레이엄/버핏형) + 정렬 + offset/limit 슬라이스. 캐시된 전체 랭킹(최대 KEEP)을 읽어 해당 페이지만 반환.
export async function getValuePage(market: Market, sort: string, offset: number, limit: number, filter = 'all'): Promise<ValuePage> {
  const screen = await getValueScreen(market);
  let pool = screen.items;
  if (filter === 'graham') pool = pool.filter((s) => s.graham);
  else if (filter === 'buffett') pool = pool.filter((s) => s.buffett);
  const fn = SORT_FNS[sort] ?? SORT_FNS.score;
  const sorted = [...pool].sort((a, b) => (fn.asc ? fn.val(a) - fn.val(b) : fn.val(b) - fn.val(a)));
  return { date: screen.date, universe: screen.universe, total: sorted.length, offset, items: sorted.slice(offset, offset + limit) };
}

// 인메모리 캐시(인스턴스 생존 동안) — 스크롤 페이지마다 Supabase에서 수백 KB blob을 다시 읽지 않게.
const memScreen: Partial<Record<Market, { at: number; screen: ValueScreen }>> = {};
const MEM_TTL = 5 * 60e3;

export async function refreshValueScreen(market: Market): Promise<number> {
  const screen = await buildValueScreen(market);
  await kvSet(KEY(market), screen);
  memScreen[market] = { at: Date.now(), screen };
  return screen.items.length;
}

// 사용자 경로: 절대 재수집하지 않는다 — 메모리 → Supabase 캐시 순으로 읽고, 갱신은 cron(18:00 KST) 전담.
// Supabase 읽기가 순간 실패해도 메모리 사본으로 응답(과거엔 이때 '캐시 없음'으로 오판해 수십 초 전체
// 재수집을 사용자가 떠안았음). 빌드는 캐시가 어디에도 없는 최초 1회뿐.
export async function getValueScreen(market: Market): Promise<ValueScreen> {
  const m = memScreen[market];
  if (m && Date.now() - m.at < MEM_TTL) return m.screen;
  const cached = await kvGet<ValueScreen>(KEY(market));
  if (cached?.items?.length) {
    memScreen[market] = { at: Date.now(), screen: cached };
    return cached;
  }
  if (m) return m.screen; // kv 실패/빈값 — 묵은 메모리 사본이라도 반환(재수집 방지)
  const screen = await buildValueScreen(market);
  await kvSet(KEY(market), screen);
  memScreen[market] = { at: Date.now(), screen };
  return screen;
}
