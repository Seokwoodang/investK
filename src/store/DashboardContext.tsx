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
  DashboardData,
  DetailTab,
  EventView,
  Page,
  Period,
  SortDir,
  SortKey,
  TabId,
} from '../types';

// 페이지(라우트)는 이제 URL이 소스 오브 트루스. page→경로 매핑.
const PATH: Record<Exclude<Page, 'detail'>, string> = {
  dashboard: '/',
  daily: '/daily',
  stocks: '/stocks',
  news: '/news',
};

const WATCH_KEY = 'dash_watchlist';
const ALERTS_KEY = 'dash_alerts';

export interface DashboardState {
  activeTab: TabId;
  detailTab: DetailTab;
  period: Period;
  sortKey: SortKey;
  sortDir: SortDir;
  watchlist: string[];
  eventView: EventView;
  eventModalDay: number | null;
  query: string;
  gQuery: string;
  briefDate: string;
  watchOnly: boolean;
  alerts: Record<string, string[]>;
}

const initialState: DashboardState = {
  activeTab: 'kr_stock',
  detailTab: 'chart',
  period: '일봉',
  sortKey: 'vol',
  sortDir: 'desc',
  watchlist: [],
  eventView: 'calendar',
  eventModalDay: null,
  query: '',
  gQuery: '',
  briefDate: '2026-06-15',
  watchOnly: false,
  alerts: {},
};

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
  openEventModal: (day: number) => void;
  closeEventModal: () => void;
  setBriefDate: (d: string) => void;
}

interface Ctx {
  state: DashboardState;
  actions: DashboardActions;
  data: DashboardData;
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
  const [state, setState] = useState<DashboardState>(initialState);

  // Hydrate persisted watchlist + alerts on mount.
  useEffect(() => {
    setState((s) => ({
      ...s,
      watchlist: load<string[]>(WATCH_KEY, [], Array.isArray),
      alerts: load<Record<string, string[]>>(ALERTS_KEY, {}, (v) => typeof v === 'object'),
    }));
  }, []);

  const patch = useCallback((p: Partial<DashboardState>) => setState((s) => ({ ...s, ...p })), []);

  const actions = useMemo<DashboardActions>(() => ({
    navigate: (page) => {
      patch({ eventModalDay: null });
      if (page !== 'detail') router.push(PATH[page]);
    },
    goDashboard: () => router.push('/'),
    goBack: () => router.back(),
    openStock: (id, tab) => {
      setState((s) => ({ ...s, activeTab: tab ?? s.activeTab, detailTab: 'chart', period: '일봉', eventModalDay: null, gQuery: '' }));
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
        return { ...s, alerts };
      }),
    toggleWatchOnly: () => setState((s) => ({ ...s, watchOnly: !s.watchOnly })),
    setQuery: (query) => patch({ query }),
    setGQuery: (gQuery) => patch({ gQuery }),
    setPeriod: (period) => patch({ period }),
    setDetailTab: (detailTab) => patch({ detailTab }),
    setEventView: (eventView) => patch({ eventView }),
    openEventModal: (eventModalDay) => patch({ eventModalDay }),
    closeEventModal: () => patch({ eventModalDay: null }),
    setBriefDate: (briefDate) => patch({ briefDate }),
  }), [patch, router]);

  const value = useMemo(() => ({ state, actions, data }), [state, actions, data]);
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
