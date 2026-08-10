import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { ETFS } from '@/lib/etfs';
import { TERMS, termSlug } from '@/lib/glossaryPages';
import { listStockDays, listWeeks } from '@/server/archive';
import { rankedStocks } from '@/server/publicStock';

// 공개 색인 대상 페이지만 등재(개인/로그인 페이지 제외).
// 아카이브(화제의 종목·주간 리뷰)는 저장된 날짜만 등재한다 — 빈 페이지를 크롤시키지 않기 위해.
//
// force-dynamic 필수: 기본값이면 빌드 시점에 한 번만 생성돼 그때 비어 있던 아카이브가
// 영영 사이트맵에 안 들어간다(매일 쌓이는 URL이 통째로 누락). 크롤러만 읽는 경로라
// 요청 시 생성해도 부담이 없다.
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const routes: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '', priority: 1, freq: 'daily' },
    { path: '/news', priority: 0.8, freq: 'hourly' },
    { path: '/stocks', priority: 0.7, freq: 'daily' },
    { path: '/value', priority: 0.7, freq: 'daily' },
    { path: '/etf', priority: 0.7, freq: 'daily' }, // ETF 허브 — 상세 12개로 가는 내부 링크 경로
    { path: '/glossary', priority: 0.7, freq: 'weekly' }, // 용어 사전 허브
    { path: '/today', priority: 0.8, freq: 'daily' }, // 화제의 종목 아카이브 허브
    { path: '/review', priority: 0.7, freq: 'weekly' }, // 주간 마켓 리뷰 아카이브 허브
    { path: '/stock', priority: 0.8, freq: 'daily' }, // 공개 종목 지표 허브
  ];
  // 공개 종목 상세 — 거래대금 상위만(전량 11,000개는 크롤 낭비). 허브가 상위 100개를,
  // 각 상세가 순위 이웃 12개를 링크해 등재분 전체가 링크로 닿는다(고아 방지).
  const [krTop, usTop] = await Promise.all([
    rankedStocks('kr').catch(() => []),
    rankedStocks('us').catch(() => []),
  ]);
  [...krTop, ...usTop].forEach((s) => routes.push({ path: `/stock/${encodeURIComponent(s.ticker || s.id)}`, priority: 0.5, freq: 'daily' }));
  // 아카이브 상세 — 저장된 것만. KV 조회가 실패해도 사이트맵 자체는 나가야 하므로 폴백은 빈 배열.
  const [krDays, usDays, weeks] = await Promise.all([
    listStockDays('kr').catch(() => [] as string[]),
    listStockDays('us').catch(() => [] as string[]),
    listWeeks().catch(() => [] as string[]),
  ]);
  [...new Set([...krDays, ...usDays])].forEach((ymd) => routes.push({ path: `/today/${ymd}`, priority: 0.6, freq: 'monthly' }));
  weeks.forEach((w) => routes.push({ path: `/review/${w}`, priority: 0.5, freq: 'monthly' }));
  // 투자 용어 상세 — "PER 뜻" 같은 롱테일 검색 진입점. 내용이 정적이라 변경 빈도는 낮게.
  TERMS.forEach((t) => routes.push({ path: `/glossary/${encodeURIComponent(termSlug(t))}`, priority: 0.5, freq: 'monthly' }));
  // 인기 ETF 상세(색인 대상). 목록은 @/lib/etfs 단일 기준점 — /etf 허브가 같은 목록을 링크로 렌더한다.
  ETFS.forEach((e) => routes.push({ path: `/etf/${e.symbol}`, priority: 0.6, freq: 'daily' }));
  return routes.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.freq,
    priority: r.priority,
  }));
}
