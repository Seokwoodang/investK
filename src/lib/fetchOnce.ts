'use client';

// 같은 요청을 같은 화면에서 두 번 쏘지 않게 묶어주는 초경량 메모.
// 대시보드는 '내 관심'과 기존 카드(뉴스 TOP3·업종 흐름)가 같은 엔드포인트를 쓰는데,
// 그대로 두면 /api/news{kr_stock}·/api/sectors?market=kr 가 매 로드마다 2번씩 나간다
// (특히 /api/sectors는 Yahoo로 ETF 12개를 팬아웃한다).
//
// TTL 안에서만 공유하고 그 뒤엔 새로 받는다. 실패한 요청은 캐시에 남기지 않는다.

interface Entry { at: number; p: Promise<unknown> }
const mem = new Map<string, Entry>();
const TTL = 60_000;

export function fetchOnce<T>(key: string, fn: () => Promise<T>, ttl = TTL): Promise<T> {
  const now = Date.now();
  const hit = mem.get(key);
  if (hit && now - hit.at < ttl) return hit.p as Promise<T>;
  const p = fn().catch((e) => {
    mem.delete(key); // 실패는 캐싱하지 않음 — 다음 시도에서 다시 요청
    throw e;
  });
  mem.set(key, { at: now, p });
  return p;
}

// 랭킹 뉴스(탭 단위 공개 캐시) — NewsTopCard / InterestSection 공용.
export function fetchTabNews<T = unknown>(tab: string): Promise<T[]> {
  return fetchOnce(`news:${tab}`, () =>
    fetch('/api/news', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tab }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.news as T[]) ?? [])
      .catch(() => [] as T[]),
  );
}

// 업종 흐름(시장 단위) — SectorFlowCard / InterestSection 공용.
export function fetchSectors<T = unknown>(market: string): Promise<T[]> {
  return fetchOnce(`sectors:${market}`, () =>
    fetch(`/api/sectors?market=${market}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.rows as T[]) ?? [])
      .catch(() => [] as T[]),
  );
}
