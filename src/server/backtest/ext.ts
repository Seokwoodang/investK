import 'server-only';
import { getSupabase } from '../supabase';

// 미국 지수(S&P500·나스닥100) + 원/달러 환율 — Yahoo Finance에서 받아 ext_series에 저장.
// 백테스트 그래프에 '원화로 산 S&P500/나스닥' 비교선을 그리기 위함(한국 투자자 기준 공정 비교).
//   원화가치_t = 원금 × (지수_t/지수_0) × (환율_t/환율_0)  ← 지수 상승 + 환차익까지 반영.

const YF = 'https://query1.finance.yahoo.com/v8/finance/chart/';
// ext_series 코드 → Yahoo 심볼. SPX=S&P500, NDX=나스닥100, USDKRW=원/달러.
const SYMBOLS: Record<string, string> = { SPX: '^GSPC', NDX: '^NDX', USDKRW: 'KRW=X' };

interface Pt { d: string; c: number }

async function fetchYahoo(symbol: string, fromSec: number, toSec: number): Promise<Pt[]> {
  const url = `${YF}${encodeURIComponent(symbol)}?period1=${fromSec}&period2=${toSec}&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`yahoo ${symbol} ${res.status}`);
  const j = (await res.json()) as { chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[]; error?: unknown } };
  const r = j.chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const cl = r?.indicators?.quote?.[0]?.close ?? [];
  const out: Pt[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = cl[i];
    if (c == null || !Number.isFinite(c)) continue;
    out.push({ d: new Date(ts[i] * 1000).toISOString().slice(0, 10), c });
  }
  return out;
}

async function upsert(code: string, pts: Pt[]): Promise<number> {
  const sb = getSupabase();
  if (!sb || !pts.length) return 0;
  const rows = pts.map((p) => ({ code, d: p.d, c: p.c }));
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await sb.from('ext_series').upsert(rows.slice(i, i + 1000), { onConflict: 'code,d' });
    if (error) throw new Error(`ext_series ${code}: ${error.message}`);
  }
  return rows.length;
}

// 전체 백필(2015~현재). 소량(3계열)이라 앱에서 바로 실행 가능.
export async function ingestExtBackfill(fromYmd = '20150101'): Promise<Record<string, number>> {
  const fromSec = Math.floor(Date.UTC(+fromYmd.slice(0, 4), +fromYmd.slice(4, 6) - 1, +fromYmd.slice(6, 8)) / 1000);
  const toSec = Math.floor(Date.now() / 1000);
  const out: Record<string, number> = {};
  for (const [code, sym] of Object.entries(SYMBOLS)) {
    try { out[code] = await upsert(code, await fetchYahoo(sym, fromSec, toSec)); }
    catch (e) { out[code] = -1; console.error('[ext]', code, (e as Error).message); }
  }
  return out;
}

// 매일 증분(최근 ~10일).
export async function ingestExtDaily(): Promise<Record<string, number>> {
  const fromSec = Math.floor((Date.now() - 12 * 86400000) / 1000);
  const toSec = Math.floor(Date.now() / 1000);
  const out: Record<string, number> = {};
  for (const [code, sym] of Object.entries(SYMBOLS)) {
    try { out[code] = await upsert(code, await fetchYahoo(sym, fromSec, toSec)); } catch { out[code] = -1; }
  }
  return out;
}

// 백테스트 비교선용: 코드별 (날짜 오름차순) 시계열. from/to는 'YYYY-MM-DD'.
export async function getExtSeries(from: string, to: string): Promise<Record<string, Pt[]>> {
  const sb = getSupabase();
  if (!sb) return {};
  const out: Record<string, Pt[]> = {};
  for (const code of Object.keys(SYMBOLS)) {
    const arr: Pt[] = [];
    let offset = 0;
    for (;;) { // Supabase 기본 1000행 상한 → range로 전부 읽기(10년 ≈ 2500행)
      const { data } = await sb.from('ext_series').select('d,c').eq('code', code).gte('d', from).lte('d', to).order('d', { ascending: true }).range(offset, offset + 999);
      if (!data || !data.length) break;
      arr.push(...(data as Pt[]));
      if (data.length < 1000) break;
      offset += 1000;
    }
    out[code] = arr;
  }
  return out;
}
