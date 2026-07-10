import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// 공개 색인 대상 페이지만 등재(개인/로그인 페이지 제외).
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '', priority: 1, freq: 'daily' },
    { path: '/daily', priority: 0.9, freq: 'daily' },
    { path: '/news', priority: 0.8, freq: 'hourly' },
    { path: '/stocks', priority: 0.7, freq: 'daily' },
    { path: '/value', priority: 0.7, freq: 'daily' },
  ];
  return routes.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.freq,
    priority: r.priority,
  }));
}
