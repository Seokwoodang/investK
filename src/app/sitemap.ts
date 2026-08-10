import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { ETFS } from '@/lib/etfs';
import { TERMS, termSlug } from '@/lib/glossaryPages';

// 공개 색인 대상 페이지만 등재(개인/로그인 페이지 제외).
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '', priority: 1, freq: 'daily' },
    { path: '/news', priority: 0.8, freq: 'hourly' },
    { path: '/stocks', priority: 0.7, freq: 'daily' },
    { path: '/value', priority: 0.7, freq: 'daily' },
    { path: '/etf', priority: 0.7, freq: 'daily' }, // ETF 허브 — 상세 12개로 가는 내부 링크 경로
    { path: '/glossary', priority: 0.7, freq: 'weekly' }, // 용어 사전 허브
  ];
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
