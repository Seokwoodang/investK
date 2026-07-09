import 'server-only';
import type { SectorRow } from '../../types';

// 업종(섹터) 흐름. 각 섹터를 '실제 매매되는 대표 ETF'의 일봉 종가로 대리(推測 없음).
//  - 오늘 등락률: 최근 종가 vs 전일 종가
//  - 연속 추세('N일째'): 마지막 일간 변화의 방향으로, 같은 방향이 이어진 거래일 수
// 소스: Yahoo Finance chart API(키 불필요). 한국 ETF는 .KS 접미사.

export type SectorMarket = 'kr' | 'us';

interface Def { name: string; symbol: string; proxy: string }

// 한국: 대표 섹터 ETF(KODEX·TIGER). 종가는 실제 펀드 가격.
const KR: Def[] = [
  { name: '반도체', symbol: '091160.KS', proxy: 'KODEX 반도체' },
  { name: 'IT·전기전자', symbol: '139260.KS', proxy: 'TIGER 200 IT' },
  { name: '2차전지', symbol: '305720.KS', proxy: 'KODEX 2차전지산업' },
  { name: '자동차', symbol: '091180.KS', proxy: 'KODEX 자동차' },
  { name: '바이오', symbol: '244580.KS', proxy: 'KODEX 바이오' },
  { name: '헬스케어', symbol: '266420.KS', proxy: 'KODEX 헬스케어' },
  { name: '은행', symbol: '091170.KS', proxy: 'KODEX 은행' },
  { name: '증권', symbol: '102970.KS', proxy: 'KODEX 증권' },
  { name: '철강', symbol: '117680.KS', proxy: 'KODEX 철강' },
  { name: '건설', symbol: '117700.KS', proxy: 'KODEX 건설' },
  { name: '조선', symbol: '466920.KS', proxy: 'SOL 조선TOP3플러스' },
  { name: '방산', symbol: '449450.KS', proxy: 'PLUS K방산' },
];

// 미국: SPDR 섹터 ETF + 반도체(SMH). 종가는 실제 펀드 가격.
const US: Def[] = [
  { name: '반도체', symbol: 'SMH', proxy: 'VanEck 반도체' },
  { name: '기술', symbol: 'XLK', proxy: 'Tech Select' },
  { name: '커뮤니케이션', symbol: 'XLC', proxy: 'Comm. Services' },
  { name: '임의소비재', symbol: 'XLY', proxy: 'Consumer Disc.' },
  { name: '필수소비재', symbol: 'XLP', proxy: 'Consumer Staples' },
  { name: '에너지', symbol: 'XLE', proxy: 'Energy Select' },
  { name: '금융', symbol: 'XLF', proxy: 'Financials' },
  { name: '헬스케어', symbol: 'XLV', proxy: 'Health Care' },
  { name: '산업재', symbol: 'XLI', proxy: 'Industrials' },
  { name: '소재', symbol: 'XLB', proxy: 'Materials' },
  { name: '부동산', symbol: 'XLRE', proxy: 'Real Estate' },
  { name: '유틸리티', symbol: 'XLU', proxy: 'Utilities' },
];

const UA = { 'User-Agent': 'Mozilla/5.0' };

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

async function closes(symbol: string): Promise<number[]> {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`,
      { headers: UA, next: { revalidate: 900 } },
    );
    if (!r.ok) return [];
    const j = (await r.json()) as { chart?: { result?: Array<{ indicators?: { quote?: Array<{ close?: (number | null)[] }> } }> } };
    const raw = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    return raw.filter((c): c is number => c != null); // 휴장·결측 제외
  } catch {
    return [];
  }
}

// 종가 배열 → 오늘 등락률 + 연속 추세.
function derive(cl: number[], d: Def): SectorRow | null {
  if (cl.length < 2) return null;
  const last = cl[cl.length - 1];
  const prev = cl[cl.length - 2];
  const changePct = prev === 0 ? 0 : ((last - prev) / prev) * 100;

  // 일간 변화 부호 배열을 끝에서부터 훑어 같은 방향 연속 일수 계산.
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
  return { name: d.name, proxy: d.proxy, changePct, streakDir, streakDays: days };
}

export async function getSectors(market: SectorMarket): Promise<SectorRow[]> {
  const defs = market === 'kr' ? KR : US;
  const rows = await pool(defs, 6, async (d) => derive(await closes(d.symbol), d));
  return rows
    .filter((r): r is SectorRow => r !== null)
    .sort((a, b) => b.changePct - a.changePct); // 상승 상위 → 하락 상위
}
