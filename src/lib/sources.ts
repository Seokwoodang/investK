// 데이터 출처 문구를 한곳에서 관리 — 모든 화면에서 동일한 표기를 쓰기 위함.
import type { TabId } from '../types';

// 자산군별 시세 출처 (목록·현재가)
export const SRC_QUOTE: Record<TabId, string> = {
  kr_stock: '네이버 금융 · 실시간 체결가 한국투자증권 KIS',
  us_stock: '네이버 금융 (약 15분 지연시세)',
  kr_coin: '업비트(Upbit) 실시간 시세',
  global_coin: '바이낸스(Binance) 실시간 시세',
};

// 자산군별 차트(과거 OHLC) 출처
export const SRC_CANDLE: Record<TabId, string> = {
  kr_stock: '한국투자증권 KIS Open API',
  us_stock: '한국투자증권 KIS Open API (약 15분 지연)',
  kr_coin: '업비트(Upbit) REST',
  global_coin: '바이낸스(Binance) REST',
};

// 자산군별 뉴스 출처 (탭=언론사 카테고리 RSS). 상세 페이지는 네이버 종목뉴스.
export const SRC_NEWS: Record<TabId, string> = {
  kr_stock: '한국경제·연합뉴스 증권/증시 RSS',
  us_stock: '네이버 금융 해외종목 뉴스 (상위 종목 집계)',
  kr_coin: '블록미디어 코인 RSS',
  global_coin: '블록미디어 코인 RSS',
};

// 공통 출처 문구
export const SRC = {
  fx: '환율 — Frankfurter(ECB) · DXY Yahoo Finance',
  index: '글로벌 지수 — 한국투자증권 KIS Open API',
  calendar: '주요 경제 일정 — Nasdaq 경제지표 캘린더 (글로벌)',
  ai: 'AI 생성 — Claude (Anthropic) · 캐시 Supabase',
  risk: '위험도 — 시세 기반 정량 산출 + AI(Claude) 뉴스 감성',
  assetStatus: '시세 — 네이버 금융 · 업비트 · 바이낸스 종합',
};
