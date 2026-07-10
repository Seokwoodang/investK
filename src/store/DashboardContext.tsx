'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  AlertKey,
  AssetSummary,
  DashboardData,
  DetailTab,
  EventView,
  IndexRow,
  MacroEvent,
  MarketIndicators,
  Page,
  Period,
  SortDir,
  SortKey,
  Stock,
  Stocks,
  TabId,
} from '../types';

type MacroExtras = { indices: IndexRow[]; events: MacroEvent[]; market?: MarketIndicators };

// 자산군 요약(자산군 현황 카드) — 서버 SSR은 유니버스를 안 싣고 즉시 응답하므로,
// 클라가 /api/universe를 받은 뒤 여기서 집계해 채운다(서버 data.ts summarize와 동일 로직).
function summarizeTab(arr: Stock[]): AssetSummary {
  if (!arr.length) return { count: 0, avgPct: 0, top: null };
  const avg = arr.reduce((s, x) => s + x.pct, 0) / arr.length;
  const top = arr.reduce((m, x) => (x.pct > m.pct ? x : m), arr[0]);
  return { count: arr.length, avgPct: avg, top: { name: top.name, pct: top.pct } };
}

// 모달에 띄울 일정: 클릭 시점의 (연·월·일)과 그 달의 이벤트 목록을 함께 저장 → 달 이동/목록 어디서 열어도 정확.
export interface EventModalPayload {
  year: number;
  month: number; // 0-indexed
  day: number;
  events: MacroEvent[];
}

// 달력이 보여주는 "기본(현재) 달" = 다가오는 일정(macro.events)이 속한 달.
function homeYM(data: DashboardData): { y: number; m: number } {
  const d = data.macro.events[0]?.date;
  if (d) return { y: parseInt(d.slice(0, 4), 10), m: parseInt(d.slice(5, 7), 10) - 1 };
  const now = new Date(); // 이벤트가 없으면 현재 달(과거엔 2026-06 하드코딩이라 시간이 지나면 과거 달로 고정)
  return { y: now.getFullYear(), m: now.getMonth() };
}

// 페이지(라우트)는 이제 URL이 소스 오브 트루스. page→경로 매핑.
const PATH: Record<Exclude<Page, 'detail'>, string> = {
  dashboard: '/',
  daily: '/daily',
  stocks: '/stocks',
  portfolio: '/portfolio',
  report: '/report',
  news: '/news',
};

const WATCH_KEY = 'dash_watchlist';
const ALERTS_KEY = 'dash_alerts';
const LF_KEY = 'dash_large_font';
const THEME_KEY = 'dash_theme';

export interface DashboardState {
  activeTab: TabId;
  detailTab: DetailTab;
  period: Period;
  sortKey: SortKey;
  sortDir: SortDir;
  watchlist: string[];
  eventView: EventView;
  eventModal: EventModalPayload | null;
  calYear: number;
  calMonth: number; // 0-indexed, 달력이 현재 보여주는 달
  calEvents: MacroEvent[]; // calYear/calMonth 달의 일정
  calLoading: boolean;
  today: { y: number; m: number; d: number } | null; // 클라이언트 마운트 후 실제 오늘(서버/UTC 불일치 방지)
  query: string;
  gQuery: string;
  briefDate: string;
  watchOnly: boolean;
  largeFont: boolean; // 큰글씨(어르신) 버전
  theme: Theme; // 'system'(OS 설정 따름) | 'light' | 'dark'
  alerts: Record<string, string[]>;
}

export type Theme = 'system' | 'light' | 'dark';

const baseState = {
  activeTab: 'kr_stock' as TabId,
  detailTab: 'kanalyst' as DetailTab,
  period: '일봉' as Period,
  sortKey: 'vol' as SortKey,
  sortDir: 'desc' as SortDir,
  watchlist: [] as string[],
  eventView: 'calendar' as EventView,
  eventModal: null as EventModalPayload | null,
  calLoading: false,
  today: null as { y: number; m: number; d: number } | null,
  query: '',
  gQuery: '',
  briefDate: '', // 빈 값 = 오늘(마운트 후 KST 기준으로 설정)
  watchOnly: false,
  largeFont: false,
  theme: 'system' as Theme,
  alerts: {} as Record<string, string[]>,
};

// 달력 기본 달·이벤트는 서버 payload(data)에서 결정 → SSR/CSR 동일(하이드레이션 안전).
function makeInitial(data: DashboardData): DashboardState {
  const h = homeYM(data);
  return { ...baseState, calYear: h.y, calMonth: h.m, calEvents: data.macro.events };
}

export interface DashboardActions {
  navigate: (page: Page) => void;
  goDashboard: () => void;
  goBack: () => void;
  openStock: (id: string, tab?: TabId) => void;
  setTab: (tab: TabId) => void;
  openTabbedStocks: (tab: TabId) => void;
  setSort: (key: SortKey) => void;
  toggleWatch: (id: string) => void;
  toggleAlert: (id: string, key: AlertKey) => void;
  toggleWatchOnly: () => void;
  setQuery: (q: string) => void;
  setGQuery: (q: string) => void;
  setPeriod: (p: Period) => void;
  setDetailTab: (t: DetailTab) => void;
  setEventView: (v: EventView) => void;
  openEventModal: (payload: EventModalPayload) => void;
  closeEventModal: () => void;
  gotoCalMonth: (delta: number) => void;
  setBriefDate: (d: string) => void;
  toggleLargeFont: () => void;
  toggleTheme: () => void; // 라이트 ↔ 다크 토글(초기값 'system'=OS 자동, 토글하면 명시 선택)
}

interface Ctx {
  state: DashboardState;
  actions: DashboardActions;
  data: DashboardData;
  universeReady: boolean; // /api/universe(라이브 전 종목)가 도착했는지. 그 전엔 data.stocks가 큐레이션(목가격)이라 평가 신뢰 불가.
  macroReady: boolean; // /api/macro(지수·일정·시장지표)가 도착했는지. 그 전엔 로딩 표시.
}

const DashboardCtx = createContext<Ctx | null>(null);

function load<T>(key: string, fallback: T, guard: (v: unknown) => boolean): T {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    if (raw != null && guard(raw)) return raw as T;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function DashboardProvider({ data, children }: { data: DashboardData; children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<DashboardState>(() => makeInitial(data));
  // 첫 페이로드엔 큐레이션 소수만 들어온다(HTML 경량화). 전체 유니버스는 마운트 후 한 번 받아 채운다.
  const [stocks, setStocks] = useState<Stocks>(data.stocks);
  const [universeReady, setUniverseReady] = useState(false);
  const [assetSummary, setAssetSummary] = useState<Record<TabId, AssetSummary> | null>(null);
  // 지수·일정·시장지표는 SSR에서 빠졌음(콜드 첫 페인트 단축) → 마운트 후 받아 채운다.
  const [macroExtras, setMacroExtras] = useState<MacroExtras | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/macro')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: MacroExtras | null) => {
        if (!cancelled && j && Array.isArray(j.indices)) setMacroExtras(j);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/universe')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Stocks | null) => {
        if (!cancelled && j && j.kr_stock) {
          setStocks(j);
          setUniverseReady(true);
          // 자산군 현황 카드용 요약을 유니버스에서 직접 집계(서버 SSR은 생략했음).
          setAssetSummary(Object.fromEntries((Object.keys(j) as TabId[]).map((t) => [t, summarizeTab(j[t])])) as Record<TabId, AssetSummary>);
        }
      })
      .catch(() => {
        /* 실패 시 큐레이션 목록 유지(검색은 /api/resolve 원격 폴백으로 동작) */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Hydrate persisted watchlist + alerts + 큰글씨 + 실제 오늘 날짜(클라이언트 기준) on mount.
  useEffect(() => {
    const n = new Date();
    const todayStr = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    const savedTheme = (() => {
      try {
        const t = localStorage.getItem(THEME_KEY);
        return t === 'light' || t === 'dark' || t === 'system' ? (t as Theme) : 'system';
      } catch {
        return 'system' as Theme;
      }
    })();
    setState((s) => ({
      ...s,
      watchlist: load<string[]>(WATCH_KEY, [], Array.isArray),
      alerts: load<Record<string, string[]>>(ALERTS_KEY, {}, (v) => typeof v === 'object'),
      largeFont: load<boolean>(LF_KEY, false, (v) => typeof v === 'boolean'),
      theme: savedTheme,
      today: { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() },
      briefDate: s.briefDate || todayStr,
    }));

    // 서버에 저장된 알림 설정(다른 기기에서 켠 것)과 합집합 병합 — 로그인 상태에서만 성공(익명은 401 무시).
    // 크론은 서버 사본으로 판정하므로, 병합 결과를 다시 서버에 올려 두 사본을 일치시킨다.
    fetch('/api/alerts')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const server = (j?.alerts ?? null) as Record<string, string[]> | null;
        if (!server || !Object.keys(server).length) return;
        setState((s) => {
          const merged: Record<string, string[]> = { ...server };
          for (const [id, keys] of Object.entries(s.alerts)) {
            merged[id] = [...new Set([...(merged[id] ?? []), ...keys])];
          }
          try { localStorage.setItem(ALERTS_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
          fetch('/api/alerts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ alerts: merged }) }).catch(() => {});
          return { ...s, alerts: merged };
        });
      })
      .catch(() => {});
  }, []);

  // 큰글씨(어르신) 버전: <html>에 클래스 토글 → CSS zoom으로 전체 UI 확대.
  useEffect(() => {
    document.documentElement.classList.toggle('large-font', state.largeFont);
  }, [state.largeFont]);

  // 테마 강제: system이면 클래스 없음(OS 설정 따름), light/dark면 해당 클래스로 강제.
  useEffect(() => {
    const d = document.documentElement;
    d.classList.toggle('theme-light', state.theme === 'light');
    d.classList.toggle('theme-dark', state.theme === 'dark');
  }, [state.theme]);

  // 달력이 보는 달이 바뀌면 해당 달 일정을 가져온다. 기본(현재) 달이면 이미 받은 data.macro.events 사용(요청 없음).
  useEffect(() => {
    const h = homeYM(data);
    if (state.calYear === h.y && state.calMonth === h.m) {
      setState((s) => ({ ...s, calEvents: data.macro.events, calLoading: false }));
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, calLoading: true }));
    fetch(`/api/calendar?year=${state.calYear}&month=${state.calMonth}`)
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((j) => {
        if (!cancelled) setState((s) => ({ ...s, calEvents: (j?.events as MacroEvent[]) ?? [], calLoading: false }));
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, calEvents: [], calLoading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [state.calYear, state.calMonth, data]);

  const patch = useCallback((p: Partial<DashboardState>) => setState((s) => ({ ...s, ...p })), []);

  const actions = useMemo<DashboardActions>(() => ({
    navigate: (page) => {
      patch({ eventModal: null });
      if (page !== 'detail') router.push(PATH[page]);
    },
    goDashboard: () => router.push('/'),
    goBack: () => router.back(),
    openStock: (id, tab) => {
      setState((s) => ({ ...s, activeTab: tab ?? s.activeTab, detailTab: 'kanalyst', period: '일봉', eventModal: null, gQuery: '' }));
      router.push(`/instrument/${id}`);
    },
    setTab: (tab) => patch({ activeTab: tab }),
    openTabbedStocks: (tab) => {
      patch({ activeTab: tab });
      router.push('/stocks');
    },
    setSort: (key) =>
      setState((s) =>
        s.sortKey === key
          ? { ...s, sortDir: s.sortDir === 'desc' ? 'asc' : 'desc' }
          : { ...s, sortKey: key, sortDir: 'desc' },
      ),
    toggleWatch: (id) =>
      setState((s) => {
        const has = s.watchlist.includes(id);
        const watchlist = has ? s.watchlist.filter((x) => x !== id) : [...s.watchlist, id];
        try {
          localStorage.setItem(WATCH_KEY, JSON.stringify(watchlist));
        } catch {
          /* ignore */
        }
        return { ...s, watchlist };
      }),
    toggleAlert: (id, key) =>
      setState((s) => {
        const cur = s.alerts[id] || [];
        const arr = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
        const alerts = { ...s.alerts, [id]: arr };
        try {
          localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
        } catch {
          /* ignore */
        }
        // 서버 사본 동기화(크론 판정용). 알림 토글은 로그인 전용 화면(종목 상세)에서만 가능.
        fetch('/api/alerts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ alerts }) }).catch(() => {});
        return { ...s, alerts };
      }),
    toggleWatchOnly: () => setState((s) => ({ ...s, watchOnly: !s.watchOnly })),
    setQuery: (query) => patch({ query }),
    setGQuery: (gQuery) => patch({ gQuery }),
    setPeriod: (period) => patch({ period }),
    setDetailTab: (detailTab) => patch({ detailTab }),
    setEventView: (eventView) => patch({ eventView }),
    openEventModal: (eventModal) => patch({ eventModal }),
    closeEventModal: () => patch({ eventModal: null }),
    gotoCalMonth: (delta) =>
      setState((s) => {
        let m = s.calMonth + delta;
        let y = s.calYear;
        while (m < 0) { m += 12; y -= 1; }
        while (m > 11) { m -= 12; y += 1; }
        return { ...s, calYear: y, calMonth: m };
      }),
    setBriefDate: (briefDate) => patch({ briefDate }),
    toggleLargeFont: () =>
      setState((s) => {
        const largeFont = !s.largeFont;
        try {
          localStorage.setItem(LF_KEY, JSON.stringify(largeFont));
        } catch {
          /* ignore */
        }
        return { ...s, largeFont };
      }),
    toggleTheme: () =>
      setState((s) => {
        // system 포함 현재 '실효' 테마를 계산해 그 반대로만 토글(라이트↔다크). system은 초기값으로만 존재.
        const osDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const effDark = s.theme === 'dark' || (s.theme === 'system' && osDark);
        const next: Theme = effDark ? 'light' : 'dark';
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          /* ignore */
        }
        return { ...s, theme: next };
      }),
  }), [patch, router]);

  // 컨텍스트로 노출하는 data는 클라가 채운 전체 유니버스(stocks)로 덮어쓴다. macro/news/briefing/assetSummary는 서버 값 유지.
  const mergedData = useMemo<DashboardData>(() => ({
    ...data,
    stocks,
    assetSummary: assetSummary ?? data.assetSummary,
    // 지수·일정·시장지표는 클라가 받은 라이브로 덮어쓴다(도착 전엔 빈 값 → 로딩 UI).
    macro: macroExtras ? { ...data.macro, indices: macroExtras.indices, events: macroExtras.events, market: macroExtras.market } : data.macro,
  }), [data, stocks, assetSummary, macroExtras]);
  const value = useMemo(() => ({ state, actions, data: mergedData, universeReady, macroReady: macroExtras !== null }), [state, actions, mergedData, universeReady, macroExtras]);
  return <DashboardCtx.Provider value={value}>{children}</DashboardCtx.Provider>;
}

export function useDashboard(): Ctx {
  const ctx = useContext(DashboardCtx);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}

// Convenience accessor for the server-provided data payload.
export function useData(): DashboardData {
  return useDashboard().data;
}
