'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isSectorKey } from './sectors';

// 관심 분야(섹터) 상태. localStorage 우선 + 로그인 시 서버(user_interests) 합집합 병합.
//  · 대시보드 '/'는 공개 페이지라 비로그인도 관심 분야를 쓸 수 있어야 한다(로그인 벽 없음).
//  · 그래서 usePortfolio(로그인 전용)가 아니라 알림 토글(DashboardContext.toggleAlert)과 같은
//    "localStorage 원본 + 서버 사본" 패턴을 따른다.
//  · SSR/CSR 불일치를 막으려 항상 []로 시작하고 마운트 이펙트에서 채운다.
// 주의: 병합이 합집합이라 로그아웃 상태에서 지운 항목이 서버 사본에서 되살아날 수 있다.
//       기존 알림 동기화와 동일한 트레이드오프로, 관심 분야에선 손실보다 부활이 낫다고 봤다.

const KEY = 'dash_interests';
export const MAX_INTERESTS = 12;

const readLocal = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter(isSectorKey) : [];
  } catch {
    return [];
  }
};

const writeLocal = (v: string[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
};

export function useInterests() {
  const [sectors, setSectors] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef(sectors);
  ref.current = sectors;

  // 마운트: localStorage 즉시 반영 → 서버 사본과 합집합 병합(로그인 시에만 200).
  useEffect(() => {
    let cancelled = false;
    const local = readLocal();
    if (local.length) setSectors(local);

    fetch('/api/interests')
      .then((r) => (r.ok ? r.json() : null)) // 비로그인 401 → null (정상 흐름)
      .then((j) => {
        if (cancelled) return;
        const server: string[] = Array.isArray(j?.sectors) ? j.sectors.filter(isSectorKey) : [];
        if (server.length) {
          const merged = [...new Set([...local, ...server])].slice(0, MAX_INTERESTS);
          setSectors(merged);
          writeLocal(merged);
          // 로컬에만 있던 항목이 있으면 서버에도 올려 양쪽을 맞춘다.
          if (merged.length !== server.length) {
            fetch('/api/interests', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ sectors: merged }),
            }).catch(() => {});
          }
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 낙관적 갱신 + localStorage + 서버 저장(비로그인이면 401로 조용히 실패).
  const save = useCallback((next: string[]) => {
    const v = [...new Set(next.filter(isSectorKey))].slice(0, MAX_INTERESTS);
    setSectors(v);
    writeLocal(v);
    fetch('/api/interests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sectors: v }),
    }).catch(() => {});
  }, []);

  const toggle = useCallback(
    (key: string) => {
      const cur = ref.current;
      save(cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]);
    },
    [save],
  );

  return { sectors, loaded, setSectors: save, toggle };
}
