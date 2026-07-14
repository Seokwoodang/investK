import 'server-only';
import { getSupabase } from '../supabase';

// KRX 공식 OpenAPI — 유가증권(KOSPI) 일별매매정보. 날짜별 단면(그 시점 상장 전종목)이라
// '상폐 예정 종목도 그 당시엔 포함' → 생존편향 없는 시점별 유니버스 + 가격을 한 API로 얻는다.
//   GET https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd?basDd=YYYYMMDD  (헤더 AUTH_KEY)
//   응답 OutBlock_1[]: BAS_DD·ISU_CD·ISU_NM·TDD_CLSPRC(종가)·MKTCAP(시총)·LIST_SHRS(상장주식수)·OHLC
// 데이터 2010년~. 종가는 수정주가 미반영(raw) → 분할 보정은 읽기 시점(prices.ts)에서 LIST_SHRS로 처리.

const BASE = 'https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd';
const UNIV_TAG = 'kospi200';
const TOP_N = 250; // 시총 상위 여유분(백테스트 topN=최대 50이므로 250이면 충분)

export interface KrxRow { code: string; name: string; close: number; mktcap: number; shrs: number; o: number; h: number; l: number }

const num = (s: string | undefined) => { const n = Number((s ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };

export async function fetchKrxDay(basDd: string): Promise<KrxRow[]> {
  const key = process.env.KRX_API_KEY;
  if (!key) throw new Error('KRX_API_KEY 미설정');
  const res = await fetch(`${BASE}?basDd=${basDd}`, {
    headers: { AUTH_KEY: key },
    redirect: 'follow', // http→https 302
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`KRX ${basDd} HTTP ${res.status}`);
  const j = (await res.json()) as { OutBlock_1?: Record<string, string>[] };
  const rows = j.OutBlock_1 ?? [];
  return rows
    .map((r) => ({
      code: r.ISU_CD, name: r.ISU_NM, close: num(r.TDD_CLSPRC), mktcap: num(r.MKTCAP), shrs: num(r.LIST_SHRS),
      o: num(r.TDD_OPNPRC), h: num(r.TDD_HGPRC), l: num(r.TDD_LWPRC),
    }))
    .filter((r) => r.code && r.close > 0);
}

const iso = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
const pad = (n: number) => String(n).padStart(2, '0');
const ymdOf = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

// 1회성 백필: fromYmd~toYmd 매 거래일 조회 → kr_prices(전종목 raw종가+주식수) + pit_universe(월별 시총 top250) 적재.
// 주말은 건너뛰고 공휴일은 빈 응답이라 자동 스킵. 로컬(타임아웃 없음)에서 실행.
export async function backfillKrx(
  fromYmd: string, toYmd: string, onProgress?: (ymd: string, n: number) => void,
): Promise<{ days: number; priceRows: number; univDays: number }> {
  const sb = getSupabase();
  if (!sb) throw new Error('supabase not configured');
  const start = new Date(iso(fromYmd)), end = new Date(iso(toYmd));
  let days = 0, priceRows = 0, univDays = 0, prevMonth = '';

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // 주말
    const ymd = ymdOf(d);
    let rows: KrxRow[];
    try { rows = await fetchKrxDay(ymd); }
    catch { await new Promise((r) => setTimeout(r, 800)); try { rows = await fetchKrxDay(ymd); } catch { continue; } }
    if (!rows.length) continue; // 공휴일
    days++;

    // 전종목 종가+주식수 upsert(배치)
    const dstr = iso(ymd);
    const pr = rows.map((r) => ({ code: r.code, d: dstr, o: r.o, h: r.h, l: r.l, c: r.close, shrs: r.shrs }));
    for (let i = 0; i < pr.length; i += 1000) {
      const { error } = await sb.from('kr_prices').upsert(pr.slice(i, i + 1000), { onConflict: 'code,d' });
      if (error) throw new Error(`kr_prices ${ymd}: ${error.message}`);
    }
    priceRows += pr.length;

    // 월 첫 거래일 → 시점별 유니버스(시총 top250, 상폐 포함) 스냅샷
    const mkey = dstr.slice(0, 7);
    if (mkey !== prevMonth) {
      prevMonth = mkey;
      const top = [...rows].sort((a, b) => b.mktcap - a.mktcap).slice(0, TOP_N);
      const ur = top.map((r, i) => ({ d: dstr, code: r.code, name: r.name, rank: i + 1, mktcap: r.mktcap }));
      const { error } = await sb.from('pit_universe').upsert(ur, { onConflict: 'd,code' });
      if (!error) univDays++;
    }
    onProgress?.(ymd, rows.length);
    await new Promise((r) => setTimeout(r, 120)); // 예의상 throttle
  }
  return { days, priceRows, univDays };
}

// 매일 증분(오늘 종가) — 크론용.
export async function krxDailyAppend(ymd?: string): Promise<number> {
  const sb = getSupabase();
  if (!sb) throw new Error('supabase not configured');
  const day = ymd ?? ymdOf(new Date());
  const rows = await fetchKrxDay(day);
  if (!rows.length) return 0;
  const dstr = iso(day);
  const pr = rows.map((r) => ({ code: r.code, d: dstr, o: r.o, h: r.h, l: r.l, c: r.close, shrs: r.shrs }));
  for (let i = 0; i < pr.length; i += 1000) {
    const { error } = await sb.from('kr_prices').upsert(pr.slice(i, i + 1000), { onConflict: 'code,d' });
    if (error) throw new Error(`kr_prices daily ${day}: ${error.message}`);
  }
  // 오늘자 시점별 유니버스 스냅샷 갱신(멱등) — 엔진은 리밸런싱일 이하의 최신 스냅샷을 쓴다.
  const top = [...rows].sort((a, b) => b.mktcap - a.mktcap).slice(0, TOP_N);
  await sb.from('pit_universe').upsert(top.map((r, i) => ({ d: dstr, code: r.code, name: r.name, rank: i + 1, mktcap: r.mktcap })), { onConflict: 'd,code' });
  return pr.length;
}

export { UNIV_TAG, TOP_N };
