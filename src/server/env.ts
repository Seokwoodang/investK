// Central env access. Everything is optional — when a key is missing the
// corresponding provider falls back to mock data, so the app always runs.
import 'server-only';

export const env = {
  // 한국투자증권 KIS Open API
  KIS_APP_KEY: process.env.KIS_APP_KEY ?? '',
  KIS_APP_SECRET: process.env.KIS_APP_SECRET ?? '',
  KIS_BASE: process.env.KIS_BASE ?? 'https://openapi.koreainvestment.com:9443',

  // Overseas stocks (Finnhub / Twelve Data — pick one when wiring)
  FINNHUB_KEY: process.env.FINNHUB_KEY ?? '',
  TWELVEDATA_KEY: process.env.TWELVEDATA_KEY ?? '',

  // News (네이버 검색 API)
  NAVER_CLIENT_ID: process.env.NAVER_CLIENT_ID ?? '',
  NAVER_CLIENT_SECRET: process.env.NAVER_CLIENT_SECRET ?? '',

  // Supabase (AI cache + future watchlist sync)
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',

  // Anthropic (daily AI generation)
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  // 분석 5종(브리핑·관점·차트분석·포폴·보고서) 기본 모델. 최고 품질 Opus 4.8.
  // (뉴스 호재/악재 판별만 비용·빈도 때문에 Haiku 별도 — aiNews.ts)
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-opus-4-8',
} as const;

export const has = {
  kis: () => Boolean(env.KIS_APP_KEY && env.KIS_APP_SECRET),
  finnhub: () => Boolean(env.FINNHUB_KEY),
  twelvedata: () => Boolean(env.TWELVEDATA_KEY),
  naver: () => Boolean(env.NAVER_CLIENT_ID && env.NAVER_CLIENT_SECRET),
  supabase: () => Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY),
  anthropic: () => Boolean(env.ANTHROPIC_API_KEY),
};

// Per-domain revalidate windows (seconds). Tune freely per data type.
export const REVALIDATE = {
  quotes: 45, // 시세: 장중 약 45초
  fxIndex: 180, // 환율·지수: 3분
  news: 900, // 뉴스: 15분
  calendar: 3600, // 경제 캘린더: 1시간
  briefing: 86400, // 데일리 브리핑: 하루
} as const;
