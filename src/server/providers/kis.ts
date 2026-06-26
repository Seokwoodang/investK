import 'server-only';
import { env, has, REVALIDATE } from '../env';
import { kvGet, kvSet } from '../kv';
import type { Candle, Period } from '@/types';

// 한국투자증권 KIS Open API adapter (domestic stock quotes).
// Docs: https://apiportal.koreainvestment.com  — requires app key/secret from a
// 한국투자증권 account. Without keys, has.kis() is false and callers use mock data.

export interface Quote {
  price: number;
  pct: number; // day change %
  vol: number; // accumulated volume (shares)
}

interface TokenRec {
  value: string;
  expiresAt: number;
}

const KV_KEY = 'kis_token';
let mem: TokenRec | null = null;
let inflight: Promise<string> | null = null; // 단일비행: 콜드스타트 동시 호출이 토큰을 중복 발급하지 않게

// KIS 토큰은 발급 제한(분당 1회, 1일 1회 원칙)이 있고 24시간 유효 → 반드시 재사용해야 한다.
// 인메모리 → Supabase(kv_store) 순으로 캐시해 서버 재시작/서버리스에서도 공유한다.
// 동시 호출은 inflight 프로미스를 공유 → 발급 요청은 항상 1건만.
async function getToken(): Promise<string> {
  if (mem && mem.expiresAt > Date.now() + 60_000) return mem.value;
  if (inflight) return inflight;
  inflight = issueOrReuse().finally(() => { inflight = null; });
  return inflight;
}

async function issueOrReuse(): Promise<string> {
  const now = Date.now();
  // mem 재확인(대기 중 다른 호출이 채웠을 수 있음)
  if (mem && mem.expiresAt > now + 60_000) return mem.value;

  const stored = await kvGet<TokenRec>(KV_KEY);
  if (stored && stored.expiresAt > now + 60_000) {
    mem = stored;
    return stored.value;
  }

  return (await issueNew()).value;
}

// KIS에서 새 토큰을 발급받아 mem+kv에 저장. 1분당 1회 제한 있으니 빈번 호출 금지.
async function issueNew(): Promise<TokenRec> {
  const res = await fetch(`${env.KIS_BASE}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: env.KIS_APP_KEY,
      appsecret: env.KIS_APP_SECRET,
    }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`KIS token failed: ${res.status} ${body.slice(0, 160)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  const rec: TokenRec = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 86400) * 1000 };
  mem = rec;
  await kvSet(KV_KEY, rec);
  return rec;
}

// 매일 cron(Vercel)에서 호출 — 그날 쓸 토큰을 장 시작 전에 미리 발급해 kv에 저장.
// 아직 충분히 유효하면(>12h) 재발급 생략(중복 발급 방지).
export async function refreshKisToken(): Promise<{ issued: boolean; expiresAt: number }> {
  const cur = mem ?? (await kvGet<TokenRec>(KV_KEY));
  if (cur && cur.expiresAt > Date.now() + 12 * 3600_000) {
    mem = cur;
    return { issued: false, expiresAt: cur.expiresAt };
  }
  const rec = await issueNew();
  return { issued: true, expiresAt: rec.expiresAt };
}

// Fetch a single domestic quote by 6-digit code (e.g. '005930').
export async function getKrQuote(code: string): Promise<Quote> {
  if (!has.kis()) throw new Error('KIS not configured');
  const accessToken = await getToken();
  const url = new URL(`${env.KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-price`);
  url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J');
  url.searchParams.set('FID_INPUT_ISCD', code);

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      appkey: env.KIS_APP_KEY,
      appsecret: env.KIS_APP_SECRET,
      tr_id: 'FHKST01010100',
      custtype: 'P',
    },
    next: { revalidate: REVALIDATE.quotes },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`KIS quote ${code} failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { rt_cd?: string; msg1?: string; output?: Record<string, string> };
  if (json.rt_cd && json.rt_cd !== '0') throw new Error(`KIS quote ${code}: ${json.msg1 ?? json.rt_cd}`);
  const o = json.output;
  if (!o) throw new Error('KIS quote: empty output');
  // prdy_vrss_sign: 1 상한 / 2 상승 / 3 보합 / 4 하한 / 5 하락.
  // prdy_ctrt가 부호 없이 올 수 있어 하락(4·5)이면 음수로 보정.
  let pct = Number(o.prdy_ctrt);
  if ((o.prdy_vrss_sign === '4' || o.prdy_vrss_sign === '5') && pct > 0) pct = -pct;
  return {
    price: Number(o.stck_prpr),
    pct,
    vol: Number(o.acml_vol),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 모든 KIS 요청을 단일 큐로 직렬화 + 간격(throttle). 국내·해외 조회가 병렬로
// 호출돼도 전역적으로 한 번에 하나씩, 150ms 간격으로 나가 EGW00201(초당 제한)을 피한다.
let kisChain: Promise<unknown> = Promise.resolve();
function kisThrottle<T>(fn: () => Promise<T>): Promise<T> {
  const run = kisChain.then(fn, fn);
  kisChain = run.then(() => sleep(150), () => sleep(150));
  return run;
}

// ── 해외주식 현재가 (HHDFS00000300). 무료는 약 15분 지연시세. EXCD: NAS/NYS/AMS. ──
async function getOverseasQuote(symb: string, excd: string): Promise<Quote> {
  if (!has.kis()) throw new Error('KIS not configured');
  const accessToken = await getToken();
  const url = new URL(`${env.KIS_BASE}/uapi/overseas-price/v1/quotations/price`);
  url.searchParams.set('AUTH', '');
  url.searchParams.set('EXCD', excd);
  url.searchParams.set('SYMB', symb);

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      appkey: env.KIS_APP_KEY,
      appsecret: env.KIS_APP_SECRET,
      tr_id: 'HHDFS00000300',
      custtype: 'P',
    },
    next: { revalidate: REVALIDATE.quotes },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`KIS overseas ${symb} failed: ${res.status} ${body.slice(0, 160)}`);
  }
  const json = (await res.json()) as { rt_cd?: string; msg1?: string; output?: Record<string, string> };
  if (json.rt_cd && json.rt_cd !== '0') throw new Error(`KIS overseas ${symb}: ${json.msg1 ?? json.rt_cd}`);
  const o = json.output;
  if (!o || !o.last) throw new Error(`KIS overseas ${symb}: empty output`);
  let pct = Number(o.rate);
  if ((o.sign === '4' || o.sign === '5') && pct > 0) pct = -pct;
  return { price: Number(o.last), pct, vol: Number(o.tvol) };
}

// 해외주식 다건 (순차+throttle, 개별 실패 격리). 기본 거래소 NASDAQ.
export async function getOverseasQuotes(symbols: string[], excd = 'NAS'): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  for (const symb of symbols) {
    try {
      out[symb] = await kisThrottle(() => getOverseasQuote(symb, excd));
    } catch (e) {
      console.error(`[kis] overseas skip ${symb}:`, (e as Error).message);
    }
  }
  return out;
}

export async function getKrQuotes(codes: string[]): Promise<Record<string, Quote>> {
  // 순차 + 간격(throttle) — KIS 초당 거래건수 제한(EGW00201) 회피.
  // 개별 종목 실패는 격리(해당 종목만 목값 유지), 전체 폴백 방지.
  const out: Record<string, Quote> = {};
  for (const code of codes) {
    try {
      out[code] = await kisThrottle(() => getKrQuote(code));
    } catch (e) {
      console.error(`[kis] quote skip ${code}:`, (e as Error).message);
    }
  }
  return out;
}

// ── 지수 (코스피/코스닥 = 국내업종, S&P500/나스닥 = 해외지수) ──
export interface IndexQuote {
  val: number;
  chg: number;
}
export interface IndexSpec {
  name: string;
  kind: 'domestic' | 'overseas';
  code: string;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

// 국내업종 현재지수 (FHPUP02100000). 코스피 0001, 코스닥 1001.
async function getDomesticIndex(code: string): Promise<IndexQuote> {
  if (!has.kis()) throw new Error('KIS not configured');
  const token = await getToken();
  const u = new URL(`${env.KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-index-price`);
  u.searchParams.set('FID_COND_MRKT_DIV_CODE', 'U');
  u.searchParams.set('FID_INPUT_ISCD', code);
  const res = await fetch(u, {
    headers: { authorization: `Bearer ${token}`, appkey: env.KIS_APP_KEY, appsecret: env.KIS_APP_SECRET, tr_id: 'FHPUP02100000', custtype: 'P' },
    next: { revalidate: REVALIDATE.fxIndex },
  });
  if (!res.ok) {
    const b = await res.text().catch(() => '');
    throw new Error(`KIS index ${code} ${res.status} ${b.slice(0, 160)}`);
  }
  const j = (await res.json()) as { rt_cd?: string; msg1?: string; output?: Record<string, string> };
  if (j.rt_cd && j.rt_cd !== '0') throw new Error(`KIS index ${code}: ${j.msg1 ?? j.rt_cd}`);
  const o = j.output;
  if (!o || !o.bstp_nmix_prpr) throw new Error(`KIS index ${code}: empty`);
  let chg = Number(o.bstp_nmix_prdy_ctrt);
  if ((o.prdy_vrss_sign === '4' || o.prdy_vrss_sign === '5') && chg > 0) chg = -chg;
  return { val: Number(o.bstp_nmix_prpr), chg };
}

// 해외지수 (FHKST03030100, 일자별). S&P500 SPX, 나스닥종합 COMP.
async function getOverseasIndex(symb: string): Promise<IndexQuote> {
  if (!has.kis()) throw new Error('KIS not configured');
  const token = await getToken();
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 10);
  const u = new URL(`${env.KIS_BASE}/uapi/overseas-price/v1/quotations/inquire-daily-chartprice`);
  u.searchParams.set('FID_COND_MRKT_DIV_CODE', 'N');
  u.searchParams.set('FID_INPUT_ISCD', symb);
  u.searchParams.set('FID_INPUT_DATE_1', ymd(start));
  u.searchParams.set('FID_INPUT_DATE_2', ymd(now));
  u.searchParams.set('FID_PERIOD_DIV_CODE', 'D');
  const res = await fetch(u, {
    headers: { authorization: `Bearer ${token}`, appkey: env.KIS_APP_KEY, appsecret: env.KIS_APP_SECRET, tr_id: 'FHKST03030100', custtype: 'P' },
    next: { revalidate: REVALIDATE.fxIndex },
  });
  if (!res.ok) {
    const b = await res.text().catch(() => '');
    throw new Error(`KIS oindex ${symb} ${res.status} ${b.slice(0, 160)}`);
  }
  const j = (await res.json()) as { rt_cd?: string; msg1?: string; output1?: Record<string, string> };
  if (j.rt_cd && j.rt_cd !== '0') throw new Error(`KIS oindex ${symb}: ${j.msg1 ?? j.rt_cd}`);
  const o = j.output1;
  if (!o || !o.ovrs_nmix_prpr) throw new Error(`KIS oindex ${symb}: empty`);
  let chg = Number(o.prdy_ctrt);
  if ((o.prdy_vrss_sign === '4' || o.prdy_vrss_sign === '5') && chg > 0) chg = -chg;
  return { val: Number(o.ovrs_nmix_prpr), chg };
}

// ── 캔들(과거 OHLC) ──
// 봉 단위별 조회 기간(일수)과 KIS 기간코드. 주식은 분봉 미지원이라 '1시간'은 일봉으로 대체.
// 분봉(1·5·15분)은 주식 셀렉터에 없으므로 KIS에선 안 쓰이지만, 타입 충족용 폴백(일봉 취급).
const CANDLE_BACK: Record<Period, number> = { '1분': 5, '5분': 5, '15분': 5, '1시간': 40, '일봉': 130, '주봉': 400, '월봉': 1100 };
const PERIOD_DIV: Record<Period, 'D' | 'W' | 'M'> = { '1분': 'D', '5분': 'D', '15분': 'D', '1시간': 'D', '일봉': 'D', '주봉': 'W', '월봉': 'M' };
// 'YYYYMMDD' → epoch ms
const dateMs = (s: string | undefined): number | undefined => {
  if (!s || s.length < 8) return undefined;
  return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
};

// 국내주식 일봉 (FHKST03010100). output2: stck_oprc/hgpr/lwpr/clpr, 최신순.
// opts.from/to('YYYYMMDD') 주어지면 그 구간 조회(사용자 지정 기간), 없으면 기본 CANDLE_BACK.
export async function getDomesticCandles(code: string, period: Period, opts?: { from?: string; to?: string }): Promise<Candle[]> {
  return kisThrottle(async () => {
    const token = await getToken();
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - CANDLE_BACK[period]);
    const u = new URL(`${env.KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`);
    u.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J');
    u.searchParams.set('FID_INPUT_ISCD', code);
    u.searchParams.set('FID_INPUT_DATE_1', opts?.from ?? ymd(start));
    u.searchParams.set('FID_INPUT_DATE_2', opts?.to ?? ymd(now));
    u.searchParams.set('FID_PERIOD_DIV_CODE', PERIOD_DIV[period]);
    u.searchParams.set('FID_ORG_ADJ_PRC', '0');
    const res = await fetch(u, {
      headers: { authorization: `Bearer ${token}`, appkey: env.KIS_APP_KEY, appsecret: env.KIS_APP_SECRET, tr_id: 'FHKST03010100', custtype: 'P' },
      next: { revalidate: REVALIDATE.quotes },
    });
    if (!res.ok) throw new Error(`KIS dcandle ${code} ${res.status}`);
    const j = (await res.json()) as { output2?: Record<string, string>[] };
    const rows = (j.output2 ?? []).filter((o) => Number(o.stck_clpr) > 0);
    return rows
      .map((o) => ({ o: Number(o.stck_oprc), h: Number(o.stck_hgpr), l: Number(o.stck_lwpr), c: Number(o.stck_clpr), t: dateMs(o.stck_bsop_date) }))
      .reverse();
  });
}

// 해외주식 일봉 (FHKST03030100, MRKT_DIV='N' — 지수와 동일 엔드포인트).
// output2: ovrs_nmix_oprc/hgpr/lwpr/prpr, 최신순.
export async function getOverseasCandles(symb: string, period: Period, opts?: { from?: string; to?: string }): Promise<Candle[]> {
  return kisThrottle(async () => {
    const token = await getToken();
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - CANDLE_BACK[period]);
    const u = new URL(`${env.KIS_BASE}/uapi/overseas-price/v1/quotations/inquire-daily-chartprice`);
    u.searchParams.set('FID_COND_MRKT_DIV_CODE', 'N');
    u.searchParams.set('FID_INPUT_ISCD', symb);
    u.searchParams.set('FID_INPUT_DATE_1', opts?.from ?? ymd(start));
    u.searchParams.set('FID_INPUT_DATE_2', opts?.to ?? ymd(now));
    u.searchParams.set('FID_PERIOD_DIV_CODE', PERIOD_DIV[period]);
    const res = await fetch(u, {
      headers: { authorization: `Bearer ${token}`, appkey: env.KIS_APP_KEY, appsecret: env.KIS_APP_SECRET, tr_id: 'FHKST03030100', custtype: 'P' },
      next: { revalidate: REVALIDATE.quotes },
    });
    if (!res.ok) throw new Error(`KIS ocandle ${symb} ${res.status}`);
    const j = (await res.json()) as { output2?: Record<string, string>[] };
    const rows = (j.output2 ?? []).filter((o) => Number(o.ovrs_nmix_prpr) > 0);
    return rows
      .map((o) => ({ o: Number(o.ovrs_nmix_oprc), h: Number(o.ovrs_nmix_hgpr), l: Number(o.ovrs_nmix_lwpr), c: Number(o.ovrs_nmix_prpr), t: dateMs(o.stck_bsop_date) }))
      .reverse();
  });
}

// 지수 다건 (전역 throttle 큐 공유, 개별 실패 격리).
export async function getIndexQuotes(specs: IndexSpec[]): Promise<Record<string, IndexQuote>> {
  const out: Record<string, IndexQuote> = {};
  for (const s of specs) {
    try {
      out[s.name] = await kisThrottle(() => (s.kind === 'domestic' ? getDomesticIndex(s.code) : getOverseasIndex(s.code)));
    } catch (e) {
      console.error(`[kis] index skip ${s.name}:`, (e as Error).message);
    }
  }
  return out;
}
