'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TAB_MAP, type Currency, type FxRow, type RiskLevel, type Stock, type Stocks, type TabId } from '../types';

// 내 보유종목(포트폴리오). 증권사 연동 없이 직접 입력/CSV로 채운다. 개인 데이터라 localStorage에만 저장.
export interface Holding {
  id: string; // 유니버스 매칭 시 종목 id, 미매칭 수동입력은 'manual:<name>'
  name: string;
  ticker: string;
  qty: number; // 보유 수량
  avg: number; // 평균 매입가(해당 통화)
  cur: Currency;
  tab?: TabId; // 매칭된 자산군
  manualPrice?: number; // 유니버스 미매칭 시 사용자가 적은 현재가(선택)
}

const LEGACY_KEY = 'dash_portfolio'; // 예전 localStorage 저장분 → 서버로 1회 마이그레이션용

// 포트폴리오를 로그인 계정에 연동: 서버(Supabase, /api/portfolio)에 유저별로 저장·조회.
// 어느 기기서든 같은 아이디로 로그인하면 같은 포폴이 보인다.
export function usePortfolio() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loaded, setLoaded] = useState(false);
  // 최신 holdings를 콜백에서 안전하게 참조.
  const holdingsRef = useRef(holdings);
  holdingsRef.current = holdings;

  const persist = useCallback((h: Holding[]) => {
    fetch('/api/portfolio', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ holdings: h }) }).catch(() => {});
  }, []);
  const save = useCallback((h: Holding[]) => { setHoldings(h); persist(h); }, [persist]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/portfolio')
      .then((r) => (r.ok ? r.json() : { holdings: [] }))
      .then((j) => {
        if (cancelled) return;
        const server: Holding[] = Array.isArray(j.holdings) ? j.holdings : [];
        if (server.length) { setHoldings(server); setLoaded(true); return; }
        // 서버 비었고 예전 localStorage 데이터가 있으면 한 번 올려준다.
        try {
          const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
          if (Array.isArray(legacy) && legacy.length) {
            setHoldings(legacy);
            persist(legacy);
            localStorage.removeItem(LEGACY_KEY);
          }
        } catch {
          /* ignore */
        }
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [persist]);

  // 같은 id면 합치지 않고 대체(중복 입력 방지).
  const upsert = useCallback((x: Holding) => save([...holdingsRef.current.filter((p) => p.id !== x.id), x]), [save]);
  const remove = useCallback((id: string) => save(holdingsRef.current.filter((p) => p.id !== id)), [save]);
  const clear = useCallback(() => save([]), [save]);

  return { holdings, loaded, upsert, remove, clear, setAll: save };
}

// 유니버스에서 이름/티커로 종목 찾기: 티커 정확 → 이름 정확 → 포함.
export function resolveStock(stocks: Stocks, q: string): { stock: Stock; tab: TabId } | null {
  const query = q.trim().toLowerCase();
  if (!query) return null;
  const tabs = Object.keys(stocks) as TabId[];
  for (const tb of tabs) {
    const f = stocks[tb].find((s) => s.ticker.toLowerCase() === query);
    if (f) return { stock: f, tab: tb };
  }
  for (const tb of tabs) {
    const f = stocks[tb].find((s) => s.name.toLowerCase() === query);
    if (f) return { stock: f, tab: tb };
  }
  for (const tb of tabs) {
    const f = stocks[tb].find((s) => s.name.toLowerCase().includes(query) || s.ticker.toLowerCase().includes(query));
    if (f) return { stock: f, tab: tb };
  }
  return null;
}

// CSV/붙여넣기 파싱: 한 줄당 "이름또는코드, 수량, 평단". 콤마/탭/여러 공백 구분. 헤더 줄 자동 스킵.
export function parseHoldingsText(
  text: string,
  stocks: Stocks,
): { matched: Holding[]; unmatched: string[] } {
  const matched: Holding[] = [];
  const unmatched: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.split(/\s*[,\t]\s*|\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (cols.length < 3) continue;
    const [nameOrCode, qtyStr, avgStr] = cols;
    const qty = Number(qtyStr.replace(/[,\s]/g, ''));
    const avg = Number(avgStr.replace(/[,\s원$]/g, ''));
    if (!Number.isFinite(qty) || !Number.isFinite(avg) || qty <= 0) {
      // 헤더(종목명/수량/평단 등)나 잘못된 줄은 스킵
      if (!/종목|수량|평단|매입|코드/.test(nameOrCode)) unmatched.push(nameOrCode);
      continue;
    }
    const hit = resolveStock(stocks, nameOrCode);
    if (hit) {
      matched.push({ id: hit.stock.id, name: hit.stock.name, ticker: hit.stock.ticker, qty, avg, cur: hit.stock.cur, tab: hit.tab });
    } else {
      // 미매칭: 수동 보유로 보관(통화 ₩ 가정, 현재가는 평단으로 임시).
      matched.push({ id: 'manual:' + nameOrCode, name: nameOrCode, ticker: nameOrCode, qty, avg, cur: '₩', manualPrice: avg });
      unmatched.push(nameOrCode);
    }
  }
  return { matched, unmatched };
}

// USD/KRW 환율(원화 환산용). 없으면 1350 폴백.
export function usdKrwFromFx(fx: FxRow[]): number {
  const r = fx.find((f) => f.pair === 'USD/KRW');
  const n = r ? Number(r.val.replace(/[^0-9.]/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1350;
}

export interface ValuedRow extends Holding {
  price: number;
  tab?: TabId;
  group: string; // 자산군 라벨
  value: number; // 평가액(해당 통화)
  cost: number; // 매입액(해당 통화)
  valueKrw: number;
  costKrw: number;
  pl: number; // 평가손익(해당 통화)
  plPct: number;
  matched: boolean; // 유니버스 매칭(현재가 반영) 여부
  risk?: RiskLevel;
}

export interface PortfolioValuation {
  rows: ValuedRow[];
  totalKrw: number;
  costTotalKrw: number;
  totalPlKrw: number;
  totalPlPct: number;
  groupWeights: { group: string; weight: number }[];
}

// 유니버스에 없는 종목을 네이버로 즉석 조회한 시세(holding.id → 시세). useResolvedPrices가 채움.
export type ResolvedPrices = Map<string, { price: number; cur: Currency; group?: string }>;

// 보유종목을 유니버스(또는 즉석 조회) 시세로 평가(원화 환산 총계·자산군 비중 포함). 자산 페이지·보고서 공용.
export function valuePortfolio(holdings: Holding[], stocks: Stocks, usdkrw: number, extra?: ResolvedPrices): PortfolioValuation {
  const byId = new Map(
    (Object.keys(stocks) as TabId[]).flatMap((tb) => stocks[tb].map((s) => [s.id, { s, tab: tb }] as const)),
  );
  const rows: ValuedRow[] = holdings.map((h) => {
    const u = byId.get(h.id);
    const ex = !u ? extra?.get(h.id) : undefined; // 유니버스에 없으면 즉석 조회 시세 사용
    const price = u ? u.s.price : ex ? ex.price : h.manualPrice ?? h.avg;
    const cur = u ? u.s.cur : ex ? ex.cur : h.cur;
    const tab = u ? u.tab : h.tab;
    const group = u ? TAB_MAP[u.tab] : ex?.group ?? (tab ? TAB_MAP[tab] : '기타');
    const value = h.qty * price;
    const cost = h.qty * h.avg;
    const toKrw = (v: number) => (cur === '$' ? v * usdkrw : v);
    const plPct = h.avg > 0 ? ((price - h.avg) / h.avg) * 100 : 0;
    return {
      ...h, cur, price, tab, value, cost, valueKrw: toKrw(value), costKrw: toKrw(cost),
      pl: value - cost, plPct, group, matched: !!u || !!ex, risk: u?.s.risk,
    };
  });
  const totalKrw = rows.reduce((s, r) => s + r.valueKrw, 0);
  const costTotalKrw = rows.reduce((s, r) => s + r.costKrw, 0);
  const totalPlKrw = totalKrw - costTotalKrw;
  const totalPlPct = costTotalKrw > 0 ? (totalPlKrw / costTotalKrw) * 100 : 0;
  const gm = new Map<string, number>();
  rows.forEach((r) => gm.set(r.group, (gm.get(r.group) || 0) + r.valueKrw));
  const groupWeights = [...gm.entries()]
    .map(([group, v]) => ({ group, weight: totalKrw > 0 ? (v / totalKrw) * 100 : 0 }))
    .sort((a, b) => b.weight - a.weight);
  return { rows, totalKrw, costTotalKrw, totalPlKrw, totalPlPct, groupWeights };
}

// 유니버스에 없는 보유종목(미국 ETF 등)의 현재가를 네이버로 즉석 조회. 페이지 로드/보유 변경 시 갱신.
export function useResolvedPrices(holdings: Holding[], stocks: Stocks): ResolvedPrices {
  const [map, setMap] = useState<ResolvedPrices>(new Map());
  const uniIds = useMemo(
    () => new Set((Object.keys(stocks) as TabId[]).flatMap((tb) => stocks[tb].map((s) => s.id))),
    [stocks],
  );
  // 유니버스에 없고 티커가 있는(코인 페어 제외) 종목만 조회.
  const need = holdings.filter((h) => !uniIds.has(h.id) && h.ticker && !h.ticker.includes('/'));
  const key = need.map((h) => `${h.id}:${h.ticker}`).join('|');
  useEffect(() => {
    if (!need.length) {
      setMap(new Map());
      return;
    }
    let cancelled = false;
    Promise.all(
      need.map((h) =>
        fetch(`/api/resolve?price=${encodeURIComponent(h.ticker)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => (j?.found ? ([h.id, { price: j.price, cur: j.cur, group: j.group }] as const) : null))
          .catch(() => null),
      ),
    ).then((entries) => {
      if (!cancelled) setMap(new Map(entries.filter(Boolean) as [string, { price: number; cur: Currency; group?: string }][]));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}
