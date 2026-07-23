import type { MetadataRoute } from 'next';

// PWA manifest — Next App Router가 /manifest.webmanifest 로 자동 노출 + <link rel="manifest"> 주입.
// 홈 화면에 추가 시 standalone 앱으로 동작. 설치 조건: HTTPS + display:standalone + start_url + icons(192·512)
// + fetch 핸들러 있는 SW(/sw.js). 색은 사이트 다크 톤(--c-bg #05080f).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'InvestK — 투자 대시보드',
    short_name: 'InvestK',
    description: '시장 지표·업종 흐름·저평가 우량주·모의투자를 한 화면에서.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#05080f',
    theme_color: '#0a121d',
    lang: 'ko',
    categories: ['finance'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
