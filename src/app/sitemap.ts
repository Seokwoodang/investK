import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// 공개 색인 대상 페이지만 등재(개인/로그인 페이지 제외).
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '', priority: 1, freq: 'daily' },
    { path: '/news', priority: 0.8, freq: 'hourly' },
    { path: '/stocks', priority: 0.7, freq: 'daily' },
    { path: '/value', priority: 0.7, freq: 'daily' },
  ];
  // 인기 ETF 상세(색인 대상) — 크롤러가 발견하도록 대표 종목만 등재. 페이지가 실명 메타데이터를 생성.
  const ETFS = ['069500', '102110', '133690', '360750', '379800', '305720', '091160', '122630', 'SPY', 'QQQ', 'VOO', 'SCHD'];
  ETFS.forEach((s) => routes.push({ path: `/etf/${s}`, priority: 0.6, freq: 'daily' }));
  return routes.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.freq,
    priority: r.priority,
  }));
}
