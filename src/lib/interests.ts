'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isSectorKey } from './sectors';

// 관심사(분야 + 종목) 상태. localStorage 우선 + 로그인 시 서버(user_interests) 합집합 병합.
//  · 대시보드 '/'는 공개 페이지라 비로그인도 관심사를 쓸 수 있어야 한다(로그인 벽 없음).
//  · 그래서 usePortfolio(로그인 전용)가 아니라 알림 토글과 같은
//    "localStorage 원본 + 서버 사본" 패턴을 따른다.
//  · SSR/CSR 불일치를 막으려 항상 빈 값으로 시작하고 마운트 이펙트에서 채운다.
// 주의: 병합이 합집합이라 로그아웃 상태에서 지운 항목이 서버 사본에서 되살아날 수 있다.
//       기존 알림 동기화와 동일한 트레이드오프.

const KEY = 'dash_interests';
export const MAX_INTERESTS = 12;
export const MAX_INTEREST_STOCKS = 30;

export interface InterestStockRef {
  id: string;
  name: string;
  ticker: string;
  tab?: string;
}

export interface Interests {
  sectors: string[];
  stocks: InterestStockRef[];
}

const EMPTY: Interests = { sectors: [], stocks: [] };

const cleanStocks = (v: unknown): InterestStockRef[] =>
  Array.isArray(v)
    ? v.filter((x): x is InterestStockRef => !!x && typeof x === 'object' && typeof (x as InterestStockRef).id === 'string' && typeof (x as InterestStockRef).name === 'string')
    : [];

const dedupeStocks = (arr: InterestStockRef[]): InterestStockRef[] => {
  const seen = new Set<string>();
  return arr.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true))).slice(0, MAX_INTEREST_STOCKS);
};

// null = 저장 이력 없음(최초 방문) → 보유·관심종목 자동 시드 대상.
function readLocal(): Interests | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    // v1은 섹터 키 배열이었다 → v2 { sectors, stocks }로 마이그레이션.
    if (Array.isArray(v)) return { sectors: v.filter(isSectorKey), stocks: [] };
    return { sectors: (v?.sectors ?? []).filter(isSectorKey), stocks: cleanStocks(v?.stocks) };
  } catch {
    return null;
  }
}

const writeLocal = (v: Interests) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
};

export function useInterests() {
  const [interests, setInterests] = useState<Interests>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  // 저장 이력이 있으면 자동 시드를 하지 않는다(사용자가 지운 종목이 되살아나지 않게).
  const [seedable, setSeedable] = useState(false);
  const ref = useRef(interests);
  ref.current = interests;

  const persist = useCallback((v: Interests) => {
    writeLocal(v);
    fetch('/api/interests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(v),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const local = readLocal();
    if (local) setInterests(local);

    fetch('/api/interests')
      .then((r) => (r.ok ? r.json() : null)) // 비로그인 401 → null (정상 흐름)
      .then((j) => {
        if (cancelled) return;
        const server: Interests = {
          sectors: Array.isArray(j?.sectors) ? j.sectors.filter(isSectorKey) : [],
          stocks: cleanStocks(j?.stocks),
        };
        const hasServer = server.sectors.length > 0 || server.stocks.length > 0;
        if (hasServer) {
          const merged: Interests = {
            sectors: [...new Set([...(local?.sectors ?? []), ...server.sectors])].slice(0, MAX_INTERESTS),
            stocks: dedupeStocks([...(local?.stocks ?? []), ...server.stocks]),
          };
          setInterests(merged);
          writeLocal(merged);
          const grew = merged.sectors.length !== server.sectors.length || merged.stocks.length !== server.stocks.length;
          if (grew) {
            fetch('/api/interests', {
              method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(merged),
            }).catch(() => {});
          }
        }
        // 로컬·서버 모두 이력이 없을 때만 시드 허용.
        setSeedable(!local && !hasServer);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) { setSeedable(!local); setLoaded(true); }
      });
    return () => { cancelled = true; };
  }, []);

  const save = useCallback((next: Interests) => {
    const v: Interests = {
      sectors: [...new Set(next.sectors.filter(isSectorKey))].slice(0, MAX_INTERESTS),
      stocks: dedupeStocks(next.stocks),
    };
    setInterests(v);
    setSeedable(false);
    persist(v);
  }, [persist]);

  const setSectors = useCallback((sectors: string[]) => save({ ...ref.current, sectors }), [save]);
  const setStocks = useCallback((stocks: InterestStockRef[]) => save({ ...ref.current, stocks }), [save]);
  // 분야·종목을 한 번에 — 개별 setter를 연달아 부르면 두 번째가 낡은 ref로 첫 번째를 덮어쓴다.
  const setAll = useCallback((v: Interests) => save(v), [save]);

  // 최초 방문 1회 — 보유·☆관심종목을 관심 종목으로 자동 채운다. 이후엔 사용자가 직접 관리.
  const seedStocks = useCallback((candidates: InterestStockRef[]) => {
    if (!candidates.length) return;
    setSeedable(false);
    const v: Interests = { sectors: ref.current.sectors, stocks: dedupeStocks(candidates) };
    setInterests(v);
    persist(v);
  }, [persist]);

  return {
    sectors: interests.sectors,
    stocks: interests.stocks,
    loaded,
    seedable,
    setSectors,
    setStocks,
    setAll,
    seedStocks,
  };
}
