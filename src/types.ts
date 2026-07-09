// Domain types for the investment monitoring dashboard.

export type TabId = 'kr_stock' | 'us_stock' | 'kr_coin' | 'global_coin';
export type Page = 'dashboard' | 'daily' | 'stocks' | 'portfolio' | 'report' | 'news' | 'detail';
export type DetailTab = 'kanalyst' | 'chart' | 'news' | 'ai' | 'risk';
// 봉(캔들) 단위. 코인은 4종 전부, 주식(KIS)은 일/주/월 지원(1시간 선택 시 일봉으로 대체).
export type Period = '1분' | '5분' | '15분' | '1시간' | '일봉' | '주봉' | '월봉';
export type SortKey = 'vol' | 'shares' | 'price' | 'pct' | 'risk';
export type SortDir = 'desc' | 'asc';
export type EventView = 'list' | 'calendar';
export type RiskLevel = 'low' | 'mid' | 'high';
export type Currency = '₩' | '$';
export type Impact = '고영향' | '중간' | '실적';
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
  actual?: string; // 실제 발표치(발표 후에만 존재)
  surprise?: 'above' | 'inline' | 'below'; // 예상 대비 상회/부합/하회
  resultImpact?: '호재' | '악재' | '중립'; // 지표 방향까지 반영한 결과 판정(판단 가능할 때만)
  symbol?: string; // 실적 이벤트의 종목 심볼(보유·관심 매칭용)
  mine?: boolean; // 클라 주입: 내 보유·관심 종목의 실적인지(테두리 강조용)
  region?: 'kr' | 'overseas'; // 국내/해외 필터용(미지정 = 해외로 간주)
}

// 시장 심리·지표 게이지(VIX·美10년물·크립토 공포탐욕·김치프리미엄).
export interface MarketGauge {
  label: string;
  value: string; // 표시값
  sub?: string; // 보조 설명(분류 등)
  chg?: number; // 전일대비 %
  tone?: 'fear' | 'greed' | 'neutral' | 'up' | 'down'; // 색/뉘앙스
  hint?: string; // 툴팁 설명
}
export interface MarketIndicators {
  vix: MarketGauge | null;
  ust10y: MarketGauge | null;
  cryptoFng: MarketGauge | null;
  kimchi: MarketGauge | null;
}

export interface Macro {
  fx: FxRow[];
  indices: IndexRow[];
  events: MacroEvent[];
  market?: MarketIndicators;
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
  // 실데이터 연동 시 채워지는 실거래량/거래대금. 없으면 '—'로 표시(가짜 값 생성 금지).
  vol?: number;
  // 거래량(주식=주 수, 코인=수량). 거래대금(vol)과 별개 — 이슈 #3.
  shares?: number;
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
  shares?: number; // 거래량(주식=주 수, 코인=수량)
}

// The full data payload the server assembles and hands to the client shell.
// Glossary stays bundled client-side (static reference data).
// 대시보드 '자산군 현황' 카드용 서버 집계(전체 유니버스 기준). 전 종목 배열을 클라로 안 보내려고 미리 계산.
export interface AssetSummary {
  count: number;
  avgPct: number;
  top: { name: string; pct: number } | null;
}

// 업종(섹터) 흐름 — 대표 ETF 종가 기준(모두 실제 매매되는 펀드, 추측 아님).
export interface SectorRow {
  name: string; // 섹터명 (예: 반도체)
  proxy: string; // 대표 ETF 이름 (예: KODEX 반도체) — 근거 표시용
  changePct: number; // 전일 대비 등락률(%)
  streakDir: Direction; // 연속 방향(up/down/flat)
  streakDays: number; // 같은 방향 연속 거래일 수(1=오늘만)
}

export interface DashboardData {
  macro: Macro;
  news: News;
  briefing: Briefing;
  stocks: Stocks; // 초기엔 큐레이션 소수만, 클라이언트가 /api/universe로 전체를 채운다.
  assetSummary: Record<TabId, AssetSummary>;
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

// ── K-리서치(애널리스트 보고서) — 숫자·판정은 코드, 서술만 AI(하이브리드) ──
export type KMarket = 'kr' | 'us';

export interface KTrendYear {
  year: number;
  revenue: number | null; // 표시단위: US=USD, KR=억원
  netIncome: number | null;
  eps: number | null;
  fcf: number | null; // US(EDGAR)만
  netMargin: number | null; // %
}

export interface KanalystData {
  code: string;
  name: string;
  ticker: string;
  market: KMarket;
  cur: Currency;
  revUnit: 'USD' | '억원';
  sector: string | null;
  industry: string | null;
  price: number | null;
  hi52: number | null;
  lo52: number | null;
  marketCapText: string | null;
  // 밸류에이션
  per: number | null;
  fwdPer: number | null;
  pbr: number | null;
  pegRatio: number | null; // US
  evToEbitda: number | null; // US
  divYield: number | null; // %
  // 퀄리티·건전성
  roe: number | null; // %
  netMargin: number | null; // %
  debtRatio: number | null; // KR 부채비율 / US debtToEquity, %
  currentRatio: number | null;
  // 성장(%)
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  fwdEpsGrowth: number | null;
  // 컨센서스
  target: number | null;
  targetHigh: number | null;
  targetLow: number | null;
  upside: number | null; // (target/price-1)*100
  recommMean: number | null; // 1매수~5매도
  numAnalysts: number | null;
  dist: { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number } | null;
  trend: KTrendYear[]; // 오래된→최신
  // 로직 판정(투자의견) — AI 아님
  verdict: { label: string; tone: 'pos' | 'neu' | 'neg'; reasons: string[] };
  fingerprint: string;
  asOf: string; // 데이터 기준(KST 날짜)
  sources: string[];
}

export interface KanalystNarrative {
  thesis: string; // 핵심 요약
  business: string; // 사업·경쟁력
  bull: string[]; // 투자 포인트
  bear: string[]; // 리스크
  valuation: string; // 밸류에이션 코멘트
  catalyst: string[]; // 촉매·관전 포인트
}

export interface KanalystReport {
  data: KanalystData;
  narrative: KanalystNarrative | null; // 미생성/실패 시 null
  generated: boolean; // AI 서술이 실제 생성/캐시된 값인지
}
