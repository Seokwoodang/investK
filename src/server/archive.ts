import 'server-only';
import { kvGet, kvSet } from './kv';
import type { StockPickData, WeekReviewData, StockMarket } from './cardData';

// 콘텐츠 아카이브 — 인스타 카드로만 나가고 사라지던 데이터를 날짜별로 남겨
// 색인 가능한 웹 페이지(/today/{날짜}, /review/{주차})로 다시 발행하기 위한 저장소.
//
// 왜: 하루 여러 건씩 생성하는 '화제의 종목'·'주간 리뷰'가 이미지로만 게시돼
// 검색엔진 관점에선 콘텐츠가 0개였다. 같은 데이터를 저장해 두면 페이지가 매일 쌓인다.
// 이력은 저장을 시작한 시점부터 누적된다(과거분 소급 생성 불가).

const DAYS_KEEP = 90; // 화제의 종목 보관 일수
const WEEKS_KEEP = 52; // 주간 리뷰 보관 주차 수

const stockDataKey = (m: StockMarket, ymd: string) => `ig:stock:data:${m}:${ymd}`;
const stockDaysKey = (m: StockMarket) => `ig:stock:days:${m}`;
const weekDataKey = (key: string) => `ig:week:data:${key}`;
const WEEK_LIST_KEY = 'ig:week:list';

/** 인덱스 배열 앞에 새 키를 넣고 상한까지 자른다(중복 제거). */
function pushIndex(list: string[], key: string, keep: number): string[] {
  return [key, ...list.filter((x) => x !== key)].slice(0, keep);
}

export async function saveStockSnapshot(market: StockMarket, ymd: string, data: StockPickData): Promise<void> {
  await kvSet(stockDataKey(market, ymd), { ...data, ymd });
  const days = (await kvGet<string[]>(stockDaysKey(market))) ?? [];
  if (days[0] !== ymd) await kvSet(stockDaysKey(market), pushIndex(days, ymd, DAYS_KEEP));
}

export type StockSnapshot = StockPickData & { ymd: string };

export async function getStockSnapshot(market: StockMarket, ymd: string): Promise<StockSnapshot | null> {
  return kvGet<StockSnapshot>(stockDataKey(market, ymd));
}

/** 저장된 날짜 목록(최신순). */
export async function listStockDays(market: StockMarket): Promise<string[]> {
  return (await kvGet<string[]>(stockDaysKey(market))) ?? [];
}

export async function saveWeekSnapshot(key: string, data: WeekReviewData): Promise<void> {
  await kvSet(weekDataKey(key), { ...data, key });
  const list = (await kvGet<string[]>(WEEK_LIST_KEY)) ?? [];
  if (list[0] !== key) await kvSet(WEEK_LIST_KEY, pushIndex(list, key, WEEKS_KEEP));
}

export type WeekSnapshot = WeekReviewData & { key: string };

export async function getWeekSnapshot(key: string): Promise<WeekSnapshot | null> {
  return kvGet<WeekSnapshot>(weekDataKey(key));
}

/** 저장된 주차 목록(최신순). */
export async function listWeeks(): Promise<string[]> {
  return (await kvGet<string[]>(WEEK_LIST_KEY)) ?? [];
}

/** '2026-08-10' → '8월 10일' (KST 기준 문자열이라 파싱만 한다). */
export function ymdLabel(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${+m}월 ${+d}일`;
}

/** '2026W32' → '2026년 32주차' */
export function weekLabel(key: string): string {
  const [y, w] = key.split('W');
  return `${y}년 ${w}주차`;
}
