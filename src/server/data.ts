import 'server-only';
import { MACRO, NEWS, BRIEFING, STOCKS } from '@/data';
import type { AssetSummary, Currency, DashboardData, FxRow, IndexRow, MacroEvent, Stock, Stocks, TabId, UniverseRow } from '@/types';
import { has } from './env';
import { getIndexQuotes, type IndexSpec } from './providers/kis';
import { getUpbitUniverse } from './providers/upbit';
import { getBinanceUniverse } from './providers/binance';
import { getFxQuotes } from './providers/frankfurter';
import { getDxy } from './providers/yahoo';
import { getEconomicCalendar } from './providers/nasdaqCalendar';
import { getKrStockUniverse, getUsStockUniverse, type KrUniverseRow } from './providers/naver';

// Assembles the full dashboard payload. Each domain pulls from its real provider
// when configured, and falls back to bundled mock data otherwise — so the app
// runs with zero API keys and lights up incrementally as keys are added.
//
// 실연동: 주식·코인 유니버스(네이버/업비트/바이낸스), 지수(KIS), 환율(frankfurter), DXY(Yahoo),
// 경제 캘린더(Nasdaq), 뉴스(RSS+AI). 키 없으면 각 영역 mock 폴백.
// 전 종목 유니버스(주식·코인). 무겁다(수천 행) — 첫 페이로드엔 싣지 않고 /api/universe로 클라가 별도 로드.
export async function getUniverse(): Promise<Stocks> {
  const [krStocks, usStocks, krCoins, globalCoins] = await Promise.all([
    withKrUniverse(),
    withUniverse(getUsStockUniverse, '$', STOCKS.us_stock),
    withUniverse(getUpbitUniverse, '₩', STOCKS.kr_coin),
    withUniverse(getBinanceUniverse, '$', STOCKS.global_coin),
  ]);
  return { ...STOCKS, kr_stock: krStocks, us_stock: usStocks, kr_coin: krCoins, global_coin: globalCoins };
}

// 자산군 카드용 집계(전체 유니버스 기준). 전 종목 배열 대신 이 작은 요약만 첫 페이로드로 보낸다.
function summarize(arr: Stock[]): AssetSummary {
  if (!arr.length) return { count: 0, avgPct: 0, top: null };
  const avg = arr.reduce((s, x) => s + x.pct, 0) / arr.length;
  const top = arr.reduce((m, x) => (x.pct > m.pct ? x : m), arr[0]);
  return { count: arr.length, avgPct: avg, top: { name: top.name, pct: top.pct } };
}

export async function getDashboardData(): Promise<DashboardData> {
  const [universe, fx, indices, events] = await Promise.all([
    getUniverse(),
    withFxLive(MACRO.fx),
    withIndicesLive(MACRO.indices),
    withCalendarLive(MACRO.events),
  ]);

  const tabs = Object.keys(universe) as TabId[];
  const assetSummary = Object.fromEntries(tabs.map((t) => [t, summarize(universe[t])])) as Record<TabId, AssetSummary>;

  return {
    macro: { ...MACRO, fx, indices, events },
    news: NEWS,
    briefing: BRIEFING,
    // 첫 페이로드는 큐레이션 소수만(~5.9MB → 수십 KB). 전체 유니버스는 클라가 /api/universe로 채운다.
    stocks: STOCKS,
    assetSummary,
  };
}

// 지수: KIS 오버레이 (코스피/코스닥 = 국내업종, S&P500/나스닥 = 해외지수).
const INDEX_SPECS: IndexSpec[] = [
  { name: 'S&P 500', kind: 'overseas', code: 'SPX' },
  { name: '나스닥', kind: 'overseas', code: 'COMP' },
  { name: '코스피', kind: 'domestic', code: '0001' },
  { name: '코스닥', kind: 'domestic', code: '1001' },
];

async function withIndicesLive(indices: IndexRow[]): Promise<IndexRow[]> {
  if (!has.kis()) return indices;
  try {
    const q = await getIndexQuotes(INDEX_SPECS);
    return indices.map((r) => {
      const x = q[r.name];
      return x
        ? { ...r, val: x.val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), chg: +x.chg.toFixed(2) }
        : r;
    });
  } catch (e) {
    console.error('[data] indices overlay failed, using mock:', e);
    return indices;
  }
}

// 경제 캘린더: Nasdaq 경제지표 실연동(글로벌 고영향 지표). 실패/빈값 시 mock 폴백.
async function withCalendarLive(events: MacroEvent[]): Promise<MacroEvent[]> {
  try {
    const live = await getEconomicCalendar();
    return live.length ? live : events;
  } catch (e) {
    console.error('[data] calendar overlay failed, using mock:', e);
    return events;
  }
}

// 환율: frankfurter 실환율(USD/KRW·EUR/KRW·USD/JPY) + DXY는 Yahoo Finance 오버레이.
async function withFxLive(fx: FxRow[]): Promise<FxRow[]> {
  try {
    const [live, dxy] = await Promise.all([getFxQuotes(), getDxy()]);
    return fx.map((r) => {
      if (live[r.pair]) return { ...r, val: live[r.pair].val, chg: live[r.pair].chg };
      if (r.pair === 'DXY' && dxy) return { ...r, val: dxy.val, chg: dxy.chg };
      return r;
    });
  } catch (e) {
    console.error('[data] FX overlay failed, using mock FX:', e);
    return fx;
  }
}

// 전 종목 유니버스(해외주식·코인 공용): 거래소/네이버 목록으로 전체 구성. 큐레이션 종목은
// 수기 콘텐츠 유지+실시세, 나머지는 정량지표 자동 산출. 거래대금/거래량 순 정렬. 실패 시 목 폴백.
async function withUniverse(
  fetchUniverse: () => Promise<UniverseRow[]>,
  cur: Currency,
  mock: Stock[],
): Promise<Stock[]> {
  try {
    const rows = await fetchUniverse();
    if (!rows.length) return mock;
    const curated = Object.fromEntries(mock.map((s) => [s.ticker, s]));
    return rows
      .map((u): Stock => {
        const c = curated[u.ticker];
        if (c) return { ...c, price: u.price, pct: u.pct, vol: u.vol };
        const risk4 = proxyRisk4(u);
        const score = Math.round((risk4.vol + risk4.liq + risk4.evt) / 3);
        const risk = score < 40 ? 'low' : score < 70 ? 'mid' : 'high';
        return {
          id: u.id, name: u.name, ticker: u.ticker, price: u.price, cur, pct: u.pct, risk,
          issue: `${u.name}의 가격·거래량 흐름을 확인하세요.`,
          chartNote: '최근 가격 흐름입니다.',
          news: [], ai: { pos: [], neg: [], caution: [] }, risk4,
          riskNote: '시세·거래량 기반으로 자동 산출한 정량 지표입니다.', vol: u.vol,
        };
      })
      .sort((a, b) => (b.vol ?? 0) - (a.vol ?? 0));
  } catch (e) {
    console.error('[data] coin universe failed, using mock:', e);
    return mock;
  }
}

// 국내주식 전 종목: 네이버 금융 일괄 시세로 KOSPI+KOSDAQ 전부 구성.
// 큐레이션된 6종목(삼성전자 등)은 손으로 쓴 상세 콘텐츠(이슈·뉴스·risk4)를 유지하고
// 실시세만 덮어쓴다. 나머지 수천 종목은 정량 지표를 자동 산출(이벤트·감성은 뉴스/캘린더
// 연동 전까지 근사값). 네이버 실패 시 기존 목 6종목으로 폴백.
async function withKrUniverse(): Promise<Stock[]> {
  try {
    const universe = await getKrStockUniverse();
    if (!universe.length) return STOCKS.kr_stock;
    return buildKrStocks(universe);
  } catch (e) {
    console.error('[data] Naver KR universe failed, using mock 6:', e);
    return STOCKS.kr_stock;
  }
}

function buildKrStocks(universe: KrUniverseRow[]): Stock[] {
  const curated = Object.fromEntries(STOCKS.kr_stock.map((s) => [s.ticker, s]));
  return universe.map((u) => {
    const c = curated[u.code];
    // 큐레이션 콘텐츠 유지 + 실시세. id·ticker는 반드시 실제 KIS 코드로 고정 —
    // 큐레이션 슬러그 id(samsung 등)를 쓰면 KIS 실시간 구독이 코드를 못 알아들어 틱이 안 온다.
    if (c) return { ...c, id: u.code, ticker: u.code, price: u.price, pct: u.pct, vol: u.vol };
    const risk4 = proxyRisk4(u);
    const score = Math.round((risk4.vol + risk4.liq + risk4.evt) / 3);
    const risk = score < 40 ? 'low' : score < 70 ? 'mid' : 'high';
    return {
      id: u.code, name: u.name, ticker: u.code, price: u.price, cur: '₩', pct: u.pct, risk,
      issue: `${u.name}의 가격·거래량 흐름을 확인하세요.`,
      chartNote: '최근 가격 흐름입니다.',
      news: [],
      ai: { pos: [], neg: [], caution: [] },
      risk4,
      riskNote: '시세·거래량 기반으로 자동 산출한 정량 지표입니다. (이벤트·뉴스 감성은 추후 정교화)',
    };
  });
}

// 정량 위험4지표 근사: 변동성은 당일 등락폭, 유동성은 거래대금 규모로(클수록 안전→낮은 점수).
// 이벤트·감성은 뉴스·캘린더 연동 전까지 중립(50). 종목 상세에서 자동 표시됨.
// vol은 거래대금(통화 단위는 탭별로 다르지만 같은 탭 안에서의 상대 순위는 유지됨).
function proxyRisk4(u: { pct: number; vol: number }) {
  const vol = Math.max(5, Math.min(95, Math.round(Math.abs(u.pct) * 7)));
  const liq = u.vol > 1e11 ? 15 : u.vol > 1e10 ? 30 : u.vol > 1e9 ? 45 : u.vol > 1e8 ? 60 : 78;
  return { vol, liq, evt: 50, sent: 50 };
}
