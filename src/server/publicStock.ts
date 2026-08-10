import 'server-only';
import { getUniverse } from '@/server/data';
import { buildKanalystData } from '@/server/kanalyst';
import { kvGet, kvSet } from '@/server/kv';
import type { KanalystData, Stock } from '@/types';

// 공개 종목 페이지(/stock/[code])용 데이터.
//
// 왜 /instrument와 따로 두는가: /instrument는 KIS 캔들·실시간 토큰을 쓰기 때문에 쿼터
// 문제로 로그인 전용 + noindex다. 그 결과 보유 종목 11,000개 중 검색으로 닿을 수 있는
// 페이지가 하나도 없었다(사이트맵 64개). 여기서는 캔들·실시간을 빼고 유니버스 캐시와
// 재무 지표만 쓴다 → KIS를 전혀 건드리지 않으므로 공개·색인이 가능하다.
// 차트·실시간이 필요한 사용자는 로그인 후 /instrument로 유도한다.
//
// buildKanalystData는 네이버·야후·EDGAR만 호출하고 AI를 쓰지 않는다(AI는 getKanalyst 쪽).
// 크롤러가 수백 페이지를 긁어도 AI 비용이 붙지 않는다.

export type PublicMarket = 'kr' | 'us';
export interface PublicStock { market: PublicMarket; row: Stock }

const KR_CODE = /^\d{6}$/;

/** 코드/티커로 공개 종목 찾기. 국내는 6자리 숫자, 해외는 티커(대소문자 무시). */
export async function resolvePublicStock(code: string): Promise<PublicStock | null> {
  const q = decodeURIComponent(code).trim();
  if (!q) return null;
  const uni = await getUniverse().catch(() => null);
  if (!uni) return null;
  const find = (rows: Stock[] | undefined) =>
    (rows ?? []).find((s) => (s.ticker || s.id).toUpperCase() === q.toUpperCase() || s.id.toUpperCase() === q.toUpperCase()) ?? null;
  // 6자리 숫자면 국내 우선(해외 티커와 형태가 겹치지 않는다).
  if (KR_CODE.test(q)) {
    const kr = find(uni.kr_stock);
    if (kr) return { market: 'kr', row: kr };
  }
  const us = find(uni.us_stock);
  if (us) return { market: 'us', row: us };
  const kr = find(uni.kr_stock);
  return kr ? { market: 'kr', row: kr } : null;
}

// 색인 대상 규모 — 전량(국내 4,294 + 미국 6,752)은 크롤 예산 낭비이고 얇은 페이지가
// 많아져 역효과다. 거래대금 상위만 쓴다. 사이트맵 등재 수와 아래 이웃 링크의 모수가
// 같아야 '사이트맵에는 있는데 어디서도 링크 안 되는' 고아 페이지가 생기지 않는다.
export const INDEXED_COUNT: Record<PublicMarket, number> = { kr: 300, us: 150 };

/** 거래대금 내림차순 정렬된 색인 대상 목록. */
export async function rankedStocks(market: PublicMarket): Promise<Stock[]> {
  const uni = await getUniverse().catch(() => null);
  const rows = (market === 'kr' ? uni?.kr_stock : uni?.us_stock) ?? [];
  return [...rows]
    .filter((s) => (s.vol ?? 0) > 0 && s.name && (s.ticker || s.id))
    .sort((a, z) => (z.vol ?? 0) - (a.vol ?? 0))
    .slice(0, INDEXED_COUNT[market]);
}

/** 거래대금 상위 N — 허브 링크용. */
export async function topStocks(market: PublicMarket, n: number): Promise<Stock[]> {
  return (await rankedStocks(market)).slice(0, n);
}

/**
 * 순위상 이웃 종목 — 상세끼리 사슬로 이어 색인 대상 전체가 링크로 닿게 한다.
 * 허브는 상위 100개만 링크하므로, 이게 없으면 101위 이하가 전부 고아가 된다
 * (ETF 상세 12개가 정확히 그 이유로 색인되지 않았다).
 */
export async function neighborStocks(market: PublicMarket, code: string, n = 12): Promise<Stock[]> {
  const rows = await rankedStocks(market);
  const i = rows.findIndex((s) => (s.ticker || s.id).toUpperCase() === code.toUpperCase());
  if (i < 0) return rows.slice(0, n);
  const half = Math.floor(n / 2);
  const start = Math.max(0, Math.min(i - half, rows.length - n));
  return rows.slice(start, start + n).filter((s) => (s.ticker || s.id).toUpperCase() !== code.toUpperCase());
}

const kstYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/**
 * 재무 지표 조회 + 당일 KV 캐시.
 * (dash) 레이아웃이 cookies()를 써서 페이지가 동적이라, 캐시가 없으면 크롤러가 페이지를
 * 열 때마다 네이버·야후를 때린다. 하루 단위로 묶어 외부 호출을 줄인다.
 */
export async function getPublicFundamentals(market: PublicMarket, row: Stock): Promise<KanalystData | null> {
  const code = row.ticker || row.id;
  const key = `pubstock:${market}:${code}:${kstYmd()}`;
  const cached = await kvGet<KanalystData | { empty: true }>(key).catch(() => null);
  if (cached) return 'empty' in cached ? null : cached;
  const d = await buildKanalystData(market, code, row.name, code, row.price).catch(() => null);
  // 없는 종목을 매번 재조회하지 않도록 '없음'도 기록한다.
  await kvSet(key, d ?? { empty: true }).catch(() => {});
  return d;
}
