// Domain types for the investment monitoring dashboard.

export type TabId = 'kr_stock' | 'us_stock' | 'kr_coin' | 'global_coin';
export type Page = 'dashboard' | 'daily' | 'stocks' | 'portfolio' | 'report' | 'news' | 'detail';
export type DetailTab = 'chart' | 'news' | 'ai' | 'risk';
// 봉(캔들) 단위. 코인은 4종 전부, 주식(KIS)은 일/주/월 지원(1시간 선택 시 일봉으로 대체).
export type Period = '1시간' | '일봉' | '주봉' | '월봉';
export type SortKey = 'vol' | 'price' | 'pct' | 'risk';
export type SortDir = 'desc' | 'asc';
export type EventView = 'list' | 'calendar';
export type RiskLevel = 'low' | 'mid' | 'high';
export type Currency = '₩' | '$';
export type Impact = '고영향' | '중간';
export type AlertKey = 'target' | 'swing' | 'risk';
export type Direction = 'up' | 'down' | 'flat';

export interface FxRow {
  pair: string;
  val: string;
  chg: number;
}

export interface IndexRow {
  name: string;
  val: string;
  chg: number;
}

export interface MacroEvent {
  date: string; // YYYY-MM-DD
  time: string;
  name: string;
  tag: Impact;
  rel: { title: string; src: string };
  desc?: string; // 이 일정이 무엇인지·왜 중요한지 (이벤트 설명)
  interpret?: string; // 결과가 어떻게 나오면 호재/악재인지 방향 해석
  previous?: string; // 직전 발표치
  consensus?: string; // 시장 예상치(컨센서스)
}

export interface Macro {
  fx: FxRow[];
  indices: IndexRow[];
  events: MacroEvent[];
}

export interface NewsItem {
  hot: boolean;
  title: string;
  summary: string;
  src: string;
  tags: string[];
}

export type News = Record<TabId, NewsItem[]>;

export interface BriefingFact {
  k: string;
  t: string;
}

export interface BriefingAsset {
  label: string;
  line: string;
  dir: Direction;
}

export interface BriefingCheckpoint {
  when: string;
  name: string;
  tag: Impact;
}

export interface BriefingDay {
  headline: string;
  facts: BriefingFact[];
  causes: string[][];
  byAsset: BriefingAsset[];
  checkpoints: BriefingCheckpoint[];
}

export type Briefing = Record<string, BriefingDay>;

export type Glossary = Record<string, string>;

export interface AiPoint {
  p: string;
  r: string;
}

export interface Risk4 {
  vol: number;
  liq: number;
  evt: number;
  sent: number;
}

export interface RelatedNews {
  title: string;
  summary: string;
  src: string;
  tags: string[];
}

export interface Stock {
  id: string;
  name: string;
  ticker: string;
  price: number;
  cur: Currency;
  pct: number;
  risk: RiskLevel;
  issue: string;
  chartNote: string;
  news: RelatedNews[];
  ai: { pos: AiPoint[]; neg: AiPoint[]; caution: AiPoint[] };
  risk4: Risk4;
  riskNote: string;
  // 실데이터 연동 시 채워지는 실거래량/거래대금. 없으면 클라이언트가 목 값을 생성(genVol).
  vol?: number;
}

export type Stocks = Record<TabId, Stock[]>;

// 거래소/마스터에서 받아온 한 종목의 시세 행(전 종목 유니버스 구성용).
export interface UniverseRow {
  id: string;
  name: string;
  ticker: string;
  price: number;
  pct: number;
  vol: number;
}

// The full data payload the server assembles and hands to the client shell.
// Glossary stays bundled client-side (static reference data).
export interface DashboardData {
  macro: Macro;
  news: News;
  briefing: Briefing;
  stocks: Stocks;
}

export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
  t?: number; // 봉 시각(epoch ms) — 차트 X축 라벨용
}

export interface ChartMarker {
  xFrac: number;
  label: string;
  color: string;
}

export const TAB_LABELS: { id: TabId; label: string }[] = [
  { id: 'kr_stock', label: '국내주식' },
  { id: 'us_stock', label: '해외주식' },
  { id: 'kr_coin', label: '국내코인' },
  { id: 'global_coin', label: '해외코인' },
];

export const TAB_MAP: Record<TabId, string> = {
  kr_stock: '국내주식',
  us_stock: '해외주식',
  kr_coin: '국내코인',
  global_coin: '해외코인',
};
