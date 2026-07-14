import 'server-only';
import { gzipSync, gunzipSync } from 'zlib';
import { getSupabase } from '../supabase';
import { getPriceSeries, getPitUniverse, type PriceRow, type PitSnapshot } from './prices';
import { getExtSeries } from './ext';

// 백테스트 입력 전체(분할보정 가격 매트릭스 + 시점별 유니버스 + 미국지수)를 하나의 gzip 블롭으로
// 미리 만들어 Storage에 저장. Vercel은 요청마다 다른 인스턴스라 메모리 캐시가 안 먹고, 매 요청 461종목을
// 콜드로 읽으면 60초 타임아웃 → 대신 블롭 1개(~2MB)만 내려받아 파싱하면 콜드도 몇 초 안에 끝난다.

const BUCKET = 'cache';
const KEY = 'backtest-matrix.json.gz';
// 날짜는 종목 간 대부분 공유되므로 마스터 캘린더 1개 + 종목별 종가 배열(정렬)로 압축.
interface Blob {
  builtAt: string;
  from: string; to: string;
  dates: string[];                          // 마스터 거래일(합집합, 오름차순)
  series: Record<string, (number | null)[]>; // 종목별 분할보정 종가(마스터 인덱스 정렬, 없으면 null)
  snapshots: PitSnapshot[];
  names: Record<string, string>;
  ext: Record<string, PriceRow[]>;          // SPX·NDX·USDKRW
}

export interface BacktestData {
  priceMap: Map<string, PriceRow[]>;
  snapshots: PitSnapshot[];
  names: Record<string, string>;
  ext: Record<string, PriceRow[]>;
  builtAt: string;
}

// ── 빌드(크론/로컬): 느린 전종목 로드를 1회 수행해 블롭 저장 ──
export async function buildBacktestCache(from = '2016-01-01', to?: string): Promise<{ codes: number; dates: number; bytes: number }> {
  const sb = getSupabase();
  if (!sb) throw new Error('supabase not configured');
  const end = to ?? new Date().toISOString().slice(0, 10);
  const { snapshots, names } = await getPitUniverse(from, end);
  const codeSet = new Set<string>();
  for (const s of snapshots) for (const c of s.codes) codeSet.add(c);
  const codes = [...codeSet];

  const priceMap = await getPriceSeries(codes, from, end); // 분할보정된 전체 매트릭스(느린 부분)
  const ext = await getExtSeries(from, end);

  // 마스터 캘린더 + 정렬 종가 배열
  const dateSet = new Set<string>();
  for (const rows of priceMap.values()) for (const r of rows) dateSet.add(r.d);
  const dates = [...dateSet].sort();
  const idx = new Map(dates.map((d, i) => [d, i]));
  const series: Record<string, (number | null)[]> = {};
  for (const [code, rows] of priceMap) {
    const arr: (number | null)[] = new Array(dates.length).fill(null);
    for (const r of rows) { const i = idx.get(r.d); if (i != null) arr[i] = r.c; }
    series[code] = arr;
  }

  const blob: Blob = { builtAt: new Date().toISOString(), from, to: end, dates, series, snapshots, names, ext };
  const gz = gzipSync(Buffer.from(JSON.stringify(blob)));
  await sb.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  const { error } = await sb.storage.from(BUCKET).upload(KEY, gz, { contentType: 'application/gzip', upsert: true });
  if (error) throw new Error(`cache upload: ${error.message}`);
  return { codes: codes.length, dates: dates.length, bytes: gz.length };
}

// ── 읽기(API): 블롭 1개 다운로드 → 파싱. 웜 인스턴스는 메모리 캐시(1시간). ──
let mem: { at: number; data: BacktestData } | null = null;
const TTL = 60 * 60e3;

export async function loadBacktestCache(): Promise<BacktestData | null> {
  if (mem && Date.now() - mem.at < TTL) return mem.data;
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.storage.from(BUCKET).download(KEY);
  if (error || !data) return null;
  const gz = Buffer.from(await data.arrayBuffer());
  const blob = JSON.parse(gunzipSync(gz).toString()) as Blob;
  const priceMap = new Map<string, PriceRow[]>();
  for (const [code, arr] of Object.entries(blob.series)) {
    const rows: PriceRow[] = [];
    for (let i = 0; i < arr.length; i++) { const c = arr[i]; if (c != null) rows.push({ d: blob.dates[i], c }); }
    if (rows.length) priceMap.set(code, rows);
  }
  const built: BacktestData = { priceMap, snapshots: blob.snapshots, names: blob.names, ext: blob.ext, builtAt: blob.builtAt };
  mem = { at: Date.now(), data: built };
  return built;
}

// ext(미국지수) 슬라이스 헬퍼 — 캐시된 전체에서 from/to만.
export function sliceExt(ext: Record<string, PriceRow[]>, from: string, to: string): Record<string, PriceRow[]> {
  const out: Record<string, PriceRow[]> = {};
  for (const [k, rows] of Object.entries(ext)) out[k] = rows.filter((r) => r.d >= from && r.d <= to);
  return out;
}
