import 'server-only';
import { getSupabase } from '../supabase';
import { getDomesticCandles } from '../providers/kis';

// 백테스트용 국내주식 일별 종가 저장소(Supabase kr_prices). look-ahead 없는 정직한 백테스트를 위해
// 가격은 "그 날의 실제 종가"만 보관한다(재무처럼 시점 보정이 필요 없음 — 종가는 그 날 확정값).
// KIS 일봉은 요청당 ~100봉이라, from/to 윈도우를 과거로 밀며 페이지네이션해 다년치를 모은다.

const DAY = 86400000;
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
// epoch ms(UTC 자정 기준, getDomesticCandles가 Date.UTC로 만든 값) → 'YYYY-MM-DD'
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export interface PriceRow { d: string; c: number }

// 한 종목의 과거 일봉을 startYmd(포함)까지 윈도우 페이지네이션으로 모아 kr_prices에 upsert.
// 반환: 저장(갱신 포함)된 행 수.
export async function ingestOne(code: string, startYmd: string): Promise<number> {
  const sb = getSupabase();
  if (!sb) throw new Error('supabase not configured');
  const startMs = Date.UTC(+startYmd.slice(0, 4), +startYmd.slice(4, 6) - 1, +startYmd.slice(6, 8));
  const seen = new Map<string, { o: number; h: number; l: number; c: number }>();
  let toMs = Date.now();
  // 각 윈도우 ~140일(거래일 ~95개 < KIS 100봉 한계). 최대 60회(≈ 23년) 안전장치.
  for (let iter = 0; iter < 60; iter++) {
    const to = new Date(toMs);
    // 윈도우 ~118일(거래일 ~84 < KIS 100봉 상한) — 140일이면 상한에 걸려 일부 봉이 누락됨.
    const from = new Date(toMs - 118 * DAY);
    // 윈도우별 재시도: KIS 순간 제한(EGW00201) 등 일시 오류로 과거 구간을 통째로 잃지 않게.
    let candles: Awaited<ReturnType<typeof getDomesticCandles>> | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { candles = await getDomesticCandles(code, '일봉', { from: ymd(from), to: ymd(to) }); break; }
      catch { await new Promise((r) => setTimeout(r, 400 * (attempt + 1))); }
    }
    if (candles == null) break; // 3회 재시도 실패 — 여기까지만
    if (!candles.length) break;
    let oldest = toMs;
    for (const c of candles) {
      if (c.t == null || !(c.c > 0)) continue;
      oldest = Math.min(oldest, c.t);
      if (c.t < startMs) continue;
      seen.set(iso(c.t), { o: c.o, h: c.h, l: c.l, c: c.c });
    }
    if (oldest <= startMs) break; // 목표 시작일 도달
    const next = oldest - DAY;
    if (next >= toMs) break; // 진전 없음(무한루프 방지)
    toMs = next;
  }
  if (!seen.size) return 0;
  const rows = [...seen.entries()].map(([d, v]) => ({ code, d, o: v.o, h: v.h, l: v.l, c: v.c }));
  // 배치 upsert(한 번에 너무 크면 나눔).
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await sb.from('kr_prices').upsert(rows.slice(i, i + 1000), { onConflict: 'code,d' });
    if (error) throw new Error(`kr_prices upsert ${code}: ${error.message}`);
  }
  return rows.length;
}

// 여러 종목 순차 수집(KIS 레이트리밋 대비 — getDomesticCandles 내부 throttle에 맡기고 순차 진행).
export async function ingestMany(codes: string[], startYmd: string, onProgress?: (i: number, code: string, n: number) => void): Promise<{ code: string; n: number }[]> {
  const out: { code: string; n: number }[] = [];
  for (let i = 0; i < codes.length; i++) {
    let n = 0;
    try { n = await ingestOne(codes[i], startYmd); } catch { n = -1; }
    out.push({ code: codes[i], n });
    onProgress?.(i, codes[i], n);
  }
  return out;
}

// 일별 증분(최근 ~10일)만 받아 upsert — 매일 크론용(장 마감 후).
export async function appendRecent(codes: string[]): Promise<number> {
  const sb = getSupabase();
  if (!sb) throw new Error('supabase not configured');
  const to = new Date();
  const from = new Date(to.getTime() - 12 * DAY);
  let total = 0;
  for (const code of codes) {
    let candles;
    try { candles = await getDomesticCandles(code, '일봉', { from: ymd(from), to: ymd(to) }); } catch { continue; }
    const rows = candles
      .filter((c) => c.t != null && c.c > 0)
      .map((c) => ({ code, d: iso(c.t as number), o: c.o, h: c.h, l: c.l, c: c.c }));
    if (!rows.length) continue;
    const { error } = await sb.from('kr_prices').upsert(rows, { onConflict: 'code,d' });
    if (!error) total += rows.length;
  }
  return total;
}

// 유니버스 전체 종가 매트릭스를 메모리에 캐시(웜 인스턴스). 40만 행을 순차로 읽으면 ~30초라
// 요청마다 반복하면 느리고 Vercel 60초 한계에 근접 → 종목별 병렬 읽기 + 1시간 캐시로 완화.
let matrixCache: { key: string; at: number; map: Map<string, PriceRow[]> } | null = null;
const MATRIX_TTL = 60 * 60e3;

async function loadFullMatrix(codes: string[]): Promise<Map<string, PriceRow[]>> {
  const key = [...codes].sort().join(',');
  if (matrixCache && matrixCache.key === key && Date.now() - matrixCache.at < MATRIX_TTL) return matrixCache.map;
  const sb = getSupabase();
  if (!sb) throw new Error('supabase not configured');
  const map = new Map<string, PriceRow[]>();
  let idx = 0;
  const worker = async () => {
    while (idx < codes.length) {
      const code = codes[idx++];
      const arr: PriceRow[] = [];
      let offset = 0;
      for (;;) {
        const { data, error } = await sb.from('kr_prices').select('d,c').eq('code', code).order('d', { ascending: true }).range(offset, offset + 999);
        if (error) throw new Error(`kr_prices read ${code}: ${error.message}`);
        if (!data || !data.length) break;
        for (const r of data as { d: string; c: number }[]) arr.push({ d: r.d, c: r.c });
        if (data.length < 1000) break;
        offset += 1000;
      }
      if (arr.length) map.set(code, arr);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker)); // 8병렬
  matrixCache = { key, at: Date.now(), map };
  return map;
}

// 백테스트 입력: 종목별 (날짜 오름차순) 종가 시계열. from/to는 'YYYY-MM-DD'. 캐시된 전체 매트릭스를 메모리 슬라이스.
export async function getPriceSeries(codes: string[], from: string, to: string): Promise<Map<string, PriceRow[]>> {
  const full = await loadFullMatrix(codes);
  const out = new Map<string, PriceRow[]>();
  for (const [code, arr] of full) {
    const sliced = arr.filter((r) => r.d >= from && r.d <= to);
    if (sliced.length) out.set(code, sliced);
  }
  return out;
}

// 저장소 현황(UI 상태 표시용): 행 수, 날짜 범위.
export async function priceCoverage(): Promise<{ rows: number; minDate: string | null; maxDate: string | null }> {
  const sb = getSupabase();
  if (!sb) return { rows: 0, minDate: null, maxDate: null };
  const { count } = await sb.from('kr_prices').select('*', { count: 'exact', head: true });
  const { data: mn } = await sb.from('kr_prices').select('d').order('d', { ascending: true }).limit(1);
  const { data: mx } = await sb.from('kr_prices').select('d').order('d', { ascending: false }).limit(1);
  return { rows: count ?? 0, minDate: mn?.[0]?.d ?? null, maxDate: mx?.[0]?.d ?? null };
}
