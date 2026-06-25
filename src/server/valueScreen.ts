import 'server-only';
import { kvGet, kvSet } from './kv';
import { getTopByMarketCap, getFundamentals, type Candidate, type Fundamentals } from './providers/naverFundamentals';

// "저평가 우량주" 스크리너: 시총 상위 유니버스에 대해 밸류·퀄리티·환원을 각각 백분위 점수화하고
// 가중합(밸류 0.4 + 퀄리티 0.4 + 환원 0.2)으로 종합 랭킹한다(마법공식류 복합 점수). 재무는 자주
// 바뀌지 않으므로 하루 1회 precompute해 Supabase(kv_store)에 저장하고, 화면은 그 결과만 즉시 읽는다.
//
// 참고: ROE는 PBR/PER로 도출(EPS/BPS), 성장은 추정EPS/EPS(또는 PER/추정PER)로 근사. 적자(PER≤0)·
// 이상치(PER>80)·핵심 결측은 제외(밸류 함정 회피). 투자 권유가 아니라 참고용 정량 스크린.

const KEY = 'value_screen:kr';
const UNIVERSE = 1000; // 시총 상위 N
const POOL = 12; // 동시 요청 수(네이버 예의)
const TOP = 80; // 화면 노출 상위

export interface ScoredStock {
  code: string;
  name: string;
  price: number;
  marketCapText: string;
  per: number | null;
  fwdPer: number | null;
  pbr: number | null;
  roe: number | null; // % (PBR/PER 도출)
  divYield: number | null; // %
  dps: number | null;
  targetPrice: number | null;
  upside: number | null; // 목표주가 대비 상승여력 %
  recommMean: number | null;
  valueScore: number; // 0-100
  qualityScore: number; // 0-100
  returnScore: number; // 0-100
  score: number; // 0-100 종합
}

export interface ValueScreen {
  date: string; // YYYY-MM-DD (생성일, KST)
  generatedAt: string; // ISO
  universe: number; // 평가에 사용된 종목 수
  weights: { value: number; quality: number; ret: number };
  items: ScoredStock[];
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

// 값이 클수록 좋은 지표 → 큰 값이 높은 백분위(0-100). null은 중립 50.
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

export async function buildValueScreen(): Promise<ValueScreen> {
  const candidates = await getTopByMarketCap(UNIVERSE);
  const funds = await pool<Candidate, Fundamentals | null>(candidates, POOL, (c) => getFundamentals(c.code));

  // 후보 + 재무 결합 후 파생지표 계산.
  type Row = Candidate & {
    f: Fundamentals;
    roe: number | null;
    earnYield: number | null;
    bookYield: number | null;
    growth: number | null;
    upside: number | null;
  };
  const rows: Row[] = [];
  candidates.forEach((c, k) => {
    const f = funds[k];
    if (!f) return;
    const per = f.per;
    const pbr = f.pbr;
    // 적자·이상치·핵심 결측 제외 = 밸류 함정 회피.
    if (per == null || per <= 0 || per > 80 || pbr == null || pbr <= 0) return;
    const roe = (pbr / per) * 100;
    const earnYield = 100 / per;
    const bookYield = 1 / pbr;
    const growth =
      f.eps && f.eps > 0 && f.fwdEps != null
        ? (f.fwdEps / f.eps - 1) * 100
        : f.fwdPer && f.fwdPer > 0
          ? (per / f.fwdPer - 1) * 100
          : null;
    const upside = f.targetPrice && c.price > 0 ? (f.targetPrice / c.price - 1) * 100 : null;
    rows.push({ ...c, f, roe, earnYield, bookYield, growth, upside });
  });

  // 백분위(높을수록 좋음).
  const pEarn = percentiles(rows.map((r) => r.earnYield));
  const pBook = percentiles(rows.map((r) => r.bookYield));
  const pRoe = percentiles(rows.map((r) => r.roe));
  const pGrowth = percentiles(rows.map((r) => r.growth));
  const pDiv = percentiles(rows.map((r) => r.f.divYield ?? 0));

  const w = { value: 0.4, quality: 0.4, ret: 0.2 };
  const scored: ScoredStock[] = rows.map((r, k) => {
    const valueScore = (pEarn[k] + pBook[k]) / 2;
    const qualityScore = (pRoe[k] + pGrowth[k]) / 2;
    const returnScore = pDiv[k];
    const score = w.value * valueScore + w.quality * qualityScore + w.ret * returnScore;
    return {
      code: r.code,
      name: r.name,
      price: r.price,
      marketCapText: r.marketCapText,
      per: r.f.per,
      fwdPer: r.f.fwdPer,
      pbr: r.f.pbr,
      roe: r.roe,
      divYield: r.f.divYield,
      dps: r.f.dps,
      targetPrice: r.f.targetPrice,
      upside: r.upside,
      recommMean: r.f.recommMean,
      valueScore: Math.round(valueScore),
      qualityScore: Math.round(qualityScore),
      returnScore: Math.round(returnScore),
      score: Math.round(score * 10) / 10,
    };
  });
  scored.sort((a, b) => b.score - a.score);

  return {
    date: kstDate(),
    generatedAt: new Date().toISOString(),
    universe: rows.length,
    weights: w,
    items: scored.slice(0, TOP),
  };
}

// cron 전용: 항상 새로 생성·저장.
export async function refreshValueScreen(): Promise<number> {
  const screen = await buildValueScreen();
  await kvSet(KEY, screen);
  return screen.items.length;
}

// 화면용: 캐시 우선(오늘자면 즉시). 없거나 오래됐으면 생성·저장(콜드 1회만 느림).
export async function getValueScreen(): Promise<ValueScreen> {
  const cached = await kvGet<ValueScreen>(KEY);
  if (cached && cached.date === kstDate()) return cached;
  const screen = await buildValueScreen();
  await kvSet(KEY, screen);
  return screen;
}
