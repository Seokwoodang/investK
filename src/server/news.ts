import 'server-only';
import { getCategoryNews } from './providers/rssNews';
import type { NewsArticle } from './providers/naverNews';
import { getCachedRankedNews, generateRankedNews, type RankedNews } from './aiNews';
import type { TabId } from '../types';

// 뉴스 탭(시장 뉴스)용 — 후보 수집 + AI 판별을 한곳에서. 사용자 경로는 캐시만 읽고(즉시),
// cron이 1시간마다 미리 생성해 Supabase에 저장한다. 종목 상세(per-stock)는 route에서 별도 처리.
// 모든 탭이 언론사 RSS(한경·연합·블록미디어) → 원문 링크가 실제 기사로 동작. AI가 잡뉴스 필터.

// 코인 뉴스는 국내/해외 동일(블록미디어) → global_coin 하나만 생성. 뉴스탭도 코인은 global_coin로 통일.
export const NEWS_TABS: TabId[] = ['kr_stock', 'us_stock', 'global_coin'];
const scopeOf = (tab: TabId) => `page:${tab}`;

// 코인 탭 도메인 힌트 — 블록미디어는 일반 주식 뉴스도 섞여 발행하므로 암호화폐만 추리게.
export const CRYPTO_FOCUS =
  '중요: 이 후보들은 코인 뉴스 피드라 일반 주식·증시 기사가 섞여 있다. 암호화폐·블록체인·디지털자산·스테이블코인·코인 ETF/파생 등 코인과 직접 관련된 뉴스만 선별하고, 일반 주식(삼성전자·SK하이닉스 등)·거시경제 기사는 제외하라.';
const focusOf = (tab: TabId) => (tab === 'kr_coin' || tab === 'global_coin' ? CRYPTO_FOCUS : undefined);

async function buildCandidates(tab: TabId): Promise<NewsArticle[]> {
  return getCategoryNews(tab, 30); // 전 탭 RSS (us_stock=CNBC)
}

// 사용자 경로: 캐시 우선(즉시, AI 호출 없음). 캐시 없으면(콜드) 1회만 생성.
export async function getTabNews(tab: TabId): Promise<{ news: (RankedNews | NewsArticle)[]; ranked: boolean }> {
  const cached = await getCachedRankedNews(scopeOf(tab));
  if (cached) return { news: cached, ranked: true };
  const candidates = await buildCandidates(tab);
  if (!candidates.length) return { news: [], ranked: false };
  const ranked = await generateRankedNews(scopeOf(tab), candidates, focusOf(tab));
  return ranked && ranked.length ? { news: ranked, ranked: true } : { news: candidates.slice(0, 21), ranked: false };
}

// cron 경로: 항상 새로 생성해 저장(덮어쓰기).
export async function refreshTabNews(tab: TabId): Promise<number> {
  const candidates = await buildCandidates(tab);
  if (!candidates.length) return 0;
  const ranked = await generateRankedNews(scopeOf(tab), candidates, focusOf(tab));
  return ranked?.length ?? 0;
}
