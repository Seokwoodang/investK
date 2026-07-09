import 'server-only';
import type { Candle, SectorRow } from '../../types';
import { getKrStockNews, getWorldStockNews, type NewsArticle } from './naverNews';

// 업종(섹터) 흐름 + 상세. 각 섹터를 '실제 매매되는 대표 ETF'의 일봉 종가로 대리(推測 없음).
//  - 오늘 등락률: 최근 종가 vs 전일 종가
//  - 연속 추세('N일째'): 마지막 일간 변화의 방향으로, 같은 방향이 이어진 거래일 수
//  - 상세(클릭): 섹터 ETF 캔들 + '대표 종목'들의 실제 뉴스(왜 움직이나 — 지어내지 않고 기사로)
// 소스: Yahoo Finance(차트, 키 불필요) · 네이버 금융(대표 종목 뉴스).

export type SectorMarket = 'kr' | 'us';

// 대표 종목: KR은 6자리 코드, US는 네이버 worldStock RIC(나스닥 .O / 뉴욕 .N).
interface Leader { name: string; ref: string }
interface Def { name: string; etf: string; proxy: string; leaders: Leader[] }

// 한국: 대표 섹터 ETF(KODEX·TIGER) + 대표 종목. 종가는 실제 펀드 가격.
const KR: Def[] = [
  { name: '반도체', etf: '091160.KS', proxy: 'KODEX 반도체', leaders: [{ name: '삼성전자', ref: '005930' }, { name: 'SK하이닉스', ref: '000660' }, { name: '한미반도체', ref: '042700' }] },
  { name: 'IT·전기전자', etf: '139260.KS', proxy: 'TIGER 200 IT', leaders: [{ name: '삼성전자', ref: '005930' }, { name: 'LG전자', ref: '066570' }, { name: '삼성전기', ref: '009150' }] },
  { name: '2차전지', etf: '305720.KS', proxy: 'KODEX 2차전지산업', leaders: [{ name: 'LG에너지솔루션', ref: '373220' }, { name: '삼성SDI', ref: '006400' }, { name: 'POSCO퓨처엠', ref: '003670' }] },
  { name: '자동차', etf: '091180.KS', proxy: 'KODEX 자동차', leaders: [{ name: '현대차', ref: '005380' }, { name: '기아', ref: '000270' }, { name: '현대모비스', ref: '012330' }] },
  { name: '바이오', etf: '244580.KS', proxy: 'KODEX 바이오', leaders: [{ name: '삼성바이오로직스', ref: '207940' }, { name: '셀트리온', ref: '068270' }, { name: '유한양행', ref: '000100' }] },
  { name: '헬스케어', etf: '266420.KS', proxy: 'KODEX 헬스케어', leaders: [{ name: '삼성바이오로직스', ref: '207940' }, { name: '셀트리온', ref: '068270' }, { name: 'SK바이오팜', ref: '326030' }] },
  { name: '은행', etf: '091170.KS', proxy: 'KODEX 은행', leaders: [{ name: 'KB금융', ref: '105560' }, { name: '신한지주', ref: '055550' }, { name: '하나금융지주', ref: '086790' }] },
  { name: '증권', etf: '102970.KS', proxy: 'KODEX 증권', leaders: [{ name: '미래에셋증권', ref: '006800' }, { name: '삼성증권', ref: '016360' }, { name: '키움증권', ref: '039490' }] },
  { name: '철강', etf: '117680.KS', proxy: 'KODEX 철강', leaders: [{ name: 'POSCO홀딩스', ref: '005490' }, { name: '현대제철', ref: '004020' }, { name: '고려아연', ref: '010130' }] },
  { name: '건설', etf: '117700.KS', proxy: 'KODEX 건설', leaders: [{ name: '현대건설', ref: '000720' }, { name: 'GS건설', ref: '006360' }, { name: 'DL이앤씨', ref: '375500' }] },
  { name: '조선', etf: '466920.KS', proxy: 'SOL 조선TOP3플러스', leaders: [{ name: 'HD한국조선해양', ref: '009540' }, { name: '한화오션', ref: '042660' }, { name: '삼성중공업', ref: '010140' }] },
  { name: '방산', etf: '449450.KS', proxy: 'PLUS K방산', leaders: [{ name: '한화에어로스페이스', ref: '012450' }, { name: '한국항공우주', ref: '047810' }, { name: 'LIG넥스원', ref: '079550' }] },
];

// 미국: SPDR 섹터 ETF + 반도체(SMH) + 대표 종목. 종가는 실제 펀드 가격.
const US: Def[] = [
  { name: '반도체', etf: 'SMH', proxy: 'VanEck 반도체', leaders: [{ name: 'NVIDIA', ref: 'NVDA.O' }, { name: 'TSMC', ref: 'TSM.N' }, { name: 'Broadcom', ref: 'AVGO.O' }] },
  { name: '기술', etf: 'XLK', proxy: 'Tech Select', leaders: [{ name: 'Apple', ref: 'AAPL.O' }, { name: 'Microsoft', ref: 'MSFT.O' }, { name: 'Oracle', ref: 'ORCL.N' }] },
  { name: '커뮤니케이션', etf: 'XLC', proxy: 'Comm. Services', leaders: [{ name: 'Alphabet', ref: 'GOOGL.O' }, { name: 'Meta', ref: 'META.O' }, { name: 'Netflix', ref: 'NFLX.O' }] },
  { name: '임의소비재', etf: 'XLY', proxy: 'Consumer Disc.', leaders: [{ name: 'Amazon', ref: 'AMZN.O' }, { name: 'Tesla', ref: 'TSLA.O' }, { name: 'Home Depot', ref: 'HD.N' }] },
  { name: '필수소비재', etf: 'XLP', proxy: 'Consumer Staples', leaders: [{ name: 'Procter & Gamble', ref: 'PG.N' }, { name: 'Coca-Cola', ref: 'KO.N' }, { name: 'Costco', ref: 'COST.O' }] },
  { name: '에너지', etf: 'XLE', proxy: 'Energy Select', leaders: [{ name: 'Exxon Mobil', ref: 'XOM.N' }, { name: 'Chevron', ref: 'CVX.N' }, { name: 'ConocoPhillips', ref: 'COP.N' }] },
  { name: '금융', etf: 'XLF', proxy: 'Financials', leaders: [{ name: 'JPMorgan', ref: 'JPM.N' }, { name: 'Bank of America', ref: 'BAC.N' }, { name: 'Wells Fargo', ref: 'WFC.N' }] },
  { name: '헬스케어', etf: 'XLV', proxy: 'Health Care', leaders: [{ name: 'Eli Lilly', ref: 'LLY.N' }, { name: 'UnitedHealth', ref: 'UNH.N' }, { name: 'J&J', ref: 'JNJ.N' }] },
  { name: '산업재', etf: 'XLI', proxy: 'Industrials', leaders: [{ name: 'Caterpillar', ref: 'CAT.N' }, { name: 'GE Aerospace', ref: 'GE.N' }, { name: 'RTX', ref: 'RTX.N' }] },
  { name: '소재', etf: 'XLB', proxy: 'Materials', leaders: [{ name: 'Linde', ref: 'LIN.O' }, { name: 'Sherwin-Williams', ref: 'SHW.N' }, { name: 'Freeport-McMoRan', ref: 'FCX.N' }] },
  { name: '부동산', etf: 'XLRE', proxy: 'Real Estate', leaders: [{ name: 'Prologis', ref: 'PLD.N' }, { name: 'American Tower', ref: 'AMT.N' }, { name: 'Equinix', ref: 'EQIX.O' }] },
  { name: '유틸리티', etf: 'XLU', proxy: 'Utilities', leaders: [{ name: 'NextEra', ref: 'NEE.N' }, { name: 'Duke Energy', ref: 'DUK.N' }, { name: 'Southern Co', ref: 'SO.N' }] },
];

const UA = { 'User-Agent': 'Mozilla/5.0' };

const defsOf = (m: SectorMarket) => (m === 'kr' ? KR : US);
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

// 종가 배열 → 오늘 등락률 + 연속 추세.
function derive(cl: number[], d: Def): SectorRow | null {
  if (cl.length < 2) return null;
  const last = cl[cl.length - 1];
  const prev = cl[cl.length - 2];
  const changePct = prev === 0 ? 0 : ((last - prev) / prev) * 100;

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
  const defs = defsOf(market);
  const rows = await pool(defs, 6, async (d) => derive((await fetchCandles(d.etf, '1mo')).map((c) => c.c), d));
  return rows
    .filter((r): r is SectorRow => r !== null)
    .sort((a, b) => b.changePct - a.changePct);
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
