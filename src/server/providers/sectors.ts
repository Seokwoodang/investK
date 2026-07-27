import 'server-only';
import type { Candle, SectorPhase, SectorRow } from '../../types';
import { SECTOR_DEFS, type SectorDef, type SectorMarket } from '../../data/sectors';
import { getKrStockNews, getWorldStockNews, type NewsArticle } from './naverNews';

// 섹터 정의(대표 ETF·대표 종목)는 src/data/sectors.ts 로 이전 — 관심 분야 피커 등
// 클라이언트에서도 같은 목록을 써야 하기 때문. 이 파일은 server-only 로직만 유지.
export type { SectorMarket } from '../../data/sectors';

// 업종(섹터) 흐름 + 상세. 각 섹터를 '실제 매매되는 대표 ETF'의 일봉 종가로 대리(推測 없음).
//  - 오늘 등락률: 최근 종가 vs 전일 종가
//  - 연속 추세('N일째'): 마지막 일간 변화의 방향으로, 같은 방향이 이어진 거래일 수
//  - 상세(클릭): 섹터 ETF 캔들 + '대표 종목'들의 실제 뉴스(왜 움직이나 — 지어내지 않고 기사로)
// 소스: Yahoo Finance(차트, 키 불필요) · 네이버 금융(대표 종목 뉴스).

const UA = { 'User-Agent': 'Mozilla/5.0' };

// 가격 흐름은 대리 ETF가 있는 시장(kr·us)만 — 코인 테마는 etf가 없어 여기서 제외된다.
type PricedDef = SectorDef & { etf: string; proxy: string };
const hasEtf = (d: SectorDef): d is PricedDef => !!d.etf && !!d.proxy;
const defsOf = (m: SectorMarket): PricedDef[] => SECTOR_DEFS.filter((d) => d.market === m && hasEtf(d)) as PricedDef[];
const findDef = (m: SectorMarket, name: string) => defsOf(m).find((d) => d.name === name) ?? null;

// 동시성 제한 map(야후 과다요청 방지).
async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function fetchCandles(symbol: string, range: string): Promise<Candle[]> {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`,
      { headers: UA, next: { revalidate: 900 } },
    );
    if (!r.ok) return [];
    const j = (await r.json()) as {
      chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[] }> } }> };
    };
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

// n거래일 전 종가 대비 등락률(%). 데이터가 부족하면 가장 오래된 종가 기준.
function pctBack(cl: number[], n: number): number {
  const last = cl[cl.length - 1];
  const idx = cl.length - 1 - n;
  const base = idx >= 0 ? cl[idx] : cl[0];
  return base === 0 ? 0 : ((last - base) / base) * 100;
}

// 종가 배열 → 오늘·1주·1개월 등락률 + 연속 추세.
function derive(cl: number[], d: PricedDef): SectorRow | null {
  if (cl.length < 2) return null;
  const last = cl[cl.length - 1];
  const prev = cl[cl.length - 2];

  const sign = (a: number, b: number) => (a > b ? 1 : a < b ? -1 : 0);
  const lastSign = sign(last, prev);
  let days = 0;
  if (lastSign !== 0) {
    for (let k = cl.length - 1; k >= 1; k--) {
      if (sign(cl[k], cl[k - 1]) === lastSign) days++;
      else break;
    }
  }
  const streakDir = lastSign > 0 ? 'up' : lastSign < 0 ? 'down' : 'flat';
  const change20d = pctBack(cl, 20); // 1개월
  // 상태 = 1개월 추세 × 단기 방향(연속 방향). 1개월이 거의 평평하면 횡보.
  const FLAT = 1.5; // 1개월 |등락| 1.5% 미만 = 횡보
  let phase: SectorPhase;
  if (Math.abs(change20d) < FLAT) phase = 'flat';
  else if (change20d > 0) phase = streakDir === 'down' ? 'rollover' : 'up';
  else phase = streakDir === 'up' ? 'rebound' : 'down';

  return {
    name: d.name,
    proxy: d.proxy,
    changePct: pctBack(cl, 1), // 오늘
    change5d: pctBack(cl, 5), // 1주
    change20d,
    streakDir,
    streakDays: days,
    phase,
  };
}

export async function getSectors(market: SectorMarket): Promise<SectorRow[]> {
  const defs = defsOf(market);
  // 3mo로 받아 20거래일(1개월) 등락을 안정적으로 계산.
  const rows = await pool(defs, 6, async (d) => derive((await fetchCandles(d.etf, '3mo')).map((c) => c.c), d));
  return rows
    .filter((r): r is SectorRow => r !== null)
    .sort((a, b) => b.change20d - a.change20d); // 1개월(추세) 기준 정렬
}

export interface SectorDetail {
  name: string;
  proxy: string;
  candles: Candle[];
  leaders: string[]; // 대표 종목명(표시용)
  news: NewsArticle[]; // 대표 종목 실제 기사 — '왜'의 근거
}

export async function getSectorDetail(market: SectorMarket, name: string, range: string): Promise<SectorDetail | null> {
  const def = findDef(market, name);
  if (!def) return null;

  const [candles, newsGroups] = await Promise.all([
    fetchCandles(def.etf, range),
    pool(def.leaders, 3, (ld) =>
      market === 'kr' ? getKrStockNews(ld.ref, ld.name, 4) : getWorldStockNews(ld.ref, ld.name, 4),
    ),
  ]);

  // 대표 종목 기사 병합 → 제목 중복 제거 → 최신순 → 상위 10.
  const seen = new Set<string>();
  const news = newsGroups
    .flat()
    .filter((a) => a.title && !seen.has(a.title) && (seen.add(a.title), true))
    .sort((a, b) => (b.datetime || '').localeCompare(a.datetime || ''))
    .slice(0, 10);

  return { name: def.name, proxy: def.proxy, candles, leaders: def.leaders.map((l) => l.name), news };
}
