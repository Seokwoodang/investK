import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// 크롤링 규칙 — 공개 시장 페이지는 허용, 개인/로그인/내부 API는 차단.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin', '/portfolio', '/mock', '/instrument/', '/login'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
