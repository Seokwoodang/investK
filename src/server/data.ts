import 'server-only';
import { MACRO, NEWS, BRIEFING, STOCKS } from '@/data';
import type { AssetSummary, Currency, DashboardData, FxRow, IndexRow, MacroEvent, MarketIndicators, Stock, Stocks, TabId, UniverseRow } from '@/types';
import { has } from './env';
import { getIndexQuotes, type IndexSpec } from './providers/kis';
import { getUpbitUniverse } from './providers/upbit';
import { getBinanceUniverse } from './providers/binance';
import { getFxQuotes } from './providers/frankfurter';
import { getDxy } from './providers/yahoo';
import { getEconomicCalendar } from './providers/nasdaqCalendar';
import { kvGet, kvSet } from './kv';
import { getKrStockUniverse, getUsStockUniverse, type KrUniverseRow } from './providers/naver';
import { getMarketIndicators } from './providers/marketIndicators';

// Assembles the full dashboard payload. Each domain pulls from its real provider
// when configured, and falls back to bundled mock data otherwise — so the app
// runs with zero API keys and lights up incrementally as keys are added.
//
// 실연동: 주식·코인 유니버스(네이버/업비트/바이낸스), 지수(KIS), 환율(frankfurter), DXY(Yahoo),
// 경제 캘린더(Nasdaq), 뉴스(RSS+AI). 키 없으면 각 영역 mock 폴백.
// 전 종목 유니버스(주식·코인). 무겁다(수천 행) — 첫 페이로드엔 싣지 않고 /api/universe로 클라가 별도 로드.
// 바이낸스 전종목(2.4MB)은 Next 데이터캐시 한도(2MB) 초과라 fetch 캐시가 안 걸린다 →
// 앱 레벨 메모리 캐시(90초)로 감싸 같은 워엄 인스턴스의 다중 요청이 한 번의 페치를 공유하게 한다.
// (시세 신선도는 실시간 채널이 담당하므로 스냅샷 90초는 충분)
let universeCache: { at: number; data: Stocks } | null = null;
const UNIVERSE_TTL_MS = 90_000;
export async function getUniverse(): Promise<Stocks> {
  if (universeCache && Date.now() - universeCache.at < UNIVERSE_TTL_MS) return universeCache.data;
  const [krStocks, usStocks, krCoins, globalCoins] = await Promise.all([
    withKrUniverse(),
    withUniverse(getUsStockUniverse, '$', STOCKS.us_stock),
    withUniverse(getUpbitUniverse, '₩', STOCKS.kr_coin),
    withUniverse(getBinanceUniverse, '$', STOCKS.global_coin),
  ]);
  const data = { ...STOCKS, kr_stock: krStocks, us_stock: usStocks, kr_coin: krCoins, global_coin: globalCoins };
  universeCache = { at: Date.now(), data };
  return data;
}

// 자산군 카드용 집계(전체 유니버스 기준). 전 종목 배열 대신 이 작은 요약만 첫 페이로드로 보낸다.
function summarize(arr: Stock[]): AssetSummary {
  if (!arr.length) return { count: 0, avgPct: 0, top: null };
  const avg = arr.reduce((s, x) => s + x.pct, 0) / arr.length;
  const top = arr.reduce((m, x) => (x.pct > m.pct ? x : m), arr[0]);
  return { count: arr.length, avgPct: avg, top: { name: top.name, pct: top.pct } };
}

const EMPTY_SUMMARY: Record<TabId, AssetSummary> = Object.fromEntries(
  (Object.keys(STOCKS) as TabId[]).map((t) => [t, { count: 0, avgPct: 0, top: null }]),
) as Record<TabId, AssetSummary>;

// withUniverse 기본 false — 유저 첫 진입(SSR)은 전 종목 유니버스(네이버·업비트·바이낸스 2.4MB)를
// 기다리지 않고 즉시 응답한다. 자산군 요약은 클라가 /api/universe 받을 때 계산해 채운다.
// cron(브리핑)만 withUniverse:true로 서버에서 집계한다.
function usdkrwFromFxRows(fx: FxRow[]): number | null {
  const row = fx.find((r) => /USD\s*\/\s*KRW/i.test(r.pair) || r.pair.includes('USD/KRW'));
  return row ? Number(row.val.replace(/,/g, '')) || null : null;
}

// 지수(KIS)·일정(Nasdaq)·시장지표(Yahoo)는 콜드 SSR을 무겁게 해 첫 페인트를 늦춘다 →
// 유저 경로에선 생략하고 클라가 /api/macro로 받아 채운다. (환율 fx는 포트폴리오 원화환산에
// 필요해 SSR 유지.) 김프용 USD/KRW는 여기서 fx를 다시 받아 계산(revalidate 캐시라 저렴).
export async function getMacroExtras(): Promise<{ indices: IndexRow[]; events: MacroEvent[]; market: MarketIndicators | undefined }> {
  const [fx, indices, events] = await Promise.all([
    withFxLive(MACRO.fx),
    withIndicesLive(MACRO.indices),
    withCalendarLive(MACRO.events),
  ]);
  const market = await getMarketIndicators(usdkrwFromFxRows(fx)).catch(() => undefined);
  return { indices, events, market };
}

// withUniverse/withMacroExtras 기본 false — 유저 첫 진입(SSR)은 환율만 받아 즉시 응답한다.
// 지수·일정·시장지표는 클라가 /api/macro로, 자산군 요약은 /api/universe로 채운다.
// cron(브리핑)만 둘 다 true로 서버에서 완전 집계.
export async function getDashboardData(opts?: { withUniverse?: boolean; withMacroExtras?: boolean }): Promise<DashboardData> {
  const fx = await withFxLive(MACRO.fx);

  let indices: IndexRow[] = [];
  let events: MacroEvent[] = [];
  let market: MarketIndicators | undefined;
  if (opts?.withMacroExtras) {
    ({ indices, events, market } = await getMacroExtras());
  }

  let assetSummary = EMPTY_SUMMARY;
  if (opts?.withUniverse) {
    const universe = await getUniverse();
    const tabs = Object.keys(universe) as TabId[];
    assetSummary = Object.fromEntries(tabs.map((t) => [t, summarize(universe[t])])) as Record<TabId, AssetSummary>;
  }

  return {
    // fx만 실데이터, 지수·일정·시장지표는 빈 값(클라가 /api/macro로 채움 — 목 숫자 노출 방지).
    macro: { ...MACRO, fx, indices, events, market },
    news: NEWS,
    briefing: BRIEFING,
    // 첫 페이로드는 큐레이션 소수만. 전체 유니버스는 클라가 /api/universe로 채운다.
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
// 나스닥 경제 캘린더는 수십 날짜를 mapPool+재시도로 긁어 콜드에 ~11초 걸린다. 인스턴스별
// fetch 캐시는 새 람다마다 다시 콜드 → durable KV(Supabase, 인스턴스 공유)에 6시간 캐시한다.
//  - KV가 신선(<6h)하면 즉시 반환(콜드 인스턴스도 Supabase 1회 읽고 빠름)
//  - 스테일/없음이면 라이브로 갱신(이 11초는 5분 워머가 대부분 대신 먹음)
//  - 라이브 실패 시 스테일 KV라도 사용, 그것도 없으면 mock
const CAL_KV_KEY = 'macro:events';
const CAL_FRESH_MS = 6 * 60 * 60 * 1000;
async function withCalendarLive(events: MacroEvent[]): Promise<MacroEvent[]> {
  const cached = await kvGet<{ at: number; events: MacroEvent[] }>(CAL_KV_KEY).catch(() => null);
  if (cached?.events?.length && Date.now() - cached.at < CAL_FRESH_MS) return cached.events;
  try {
    const live = await getEconomicCalendar();
    if (live.length) {
      await kvSet(CAL_KV_KEY, { at: Date.now(), events: live }).catch(() => {});
      return live;
    }
    return cached?.events?.length ? cached.events : events;
  } catch (e) {
    console.error('[data] calendar overlay failed:', e);
    return cached?.events?.length ? cached.events : events; // 스테일 폴백
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
        if (c) return { ...c, price: u.price, pct: u.pct, vol: u.vol, shares: u.shares };
        const risk4 = proxyRisk4(u);
        const score = Math.round((risk4.vol + risk4.liq + risk4.evt) / 3);
        const risk = score < 40 ? 'low' : score < 70 ? 'mid' : 'high';
        return {
          id: u.id, name: u.name, ticker: u.ticker, price: u.price, cur, pct: u.pct, risk,
          issue: `${u.name}의 가격·거래량 흐름을 확인하세요.`,
          chartNote: '최근 가격 흐름입니다.',
          news: [], ai: { pos: [], neg: [], caution: [] }, risk4,
          riskNote: '시세·거래량 기반으로 자동 산출한 정량 지표입니다.', vol: u.vol, shares: u.shares,
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
    if (c) return { ...c, id: u.code, ticker: u.code, price: u.price, pct: u.pct, vol: u.vol, shares: u.shares };
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
      vol: u.vol, shares: u.shares, // vol 누락 버그 수정 — 비큐레이션 KR 종목도 실거래대금 사용
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
