import type { Metadata, Viewport } from 'next';
import { GoogleAnalytics } from '@next/third-parties/google';
import { SITE_URL } from '@/lib/site';
import './globals.css';

// GA4 측정 ID. env로 덮어쓸 수 있고(없으면 기본값), 측정 ID는 공개 정보라 노출돼도 무방.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || 'G-EB6L1EW9Q5';

const DESC = '코스피·코스닥 지수, VIX·미 국채금리, 김치프리미엄·공포탐욕지수, 환율과 업종 흐름을 한 화면에. 저평가 우량주 스크리너·주요 뉴스까지. 참고 정보이며 투자 자문이 아닙니다.';

// 검색엔진 소유권 확인 코드(콘솔에서 발급받아 채움). env 우선, 없으면 아래 상수.
//  · 구글 서치콘솔: HTML 태그 방식의 content 값
//  · 네이버 서치어드바이저: naver-site-verification content 값
const GOOGLE_VERIFY = process.env.NEXT_PUBLIC_GOOGLE_VERIFY || '';
const NAVER_VERIFY = process.env.NEXT_PUBLIC_NAVER_VERIFY || '';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'InvestK — 투자 대시보드',
    template: '%s · InvestK', // 하위 페이지가 title만 주면 '…· InvestK'으로 완성
  },
  description: DESC,
  applicationName: 'InvestK',
  // iOS Safari에서 '홈 화면에 추가' 시 standalone 앱으로 동작(주소창 없는 전체화면).
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'InvestK' },
  keywords: ['투자', '주식', '대시보드', '코스피', '코스닥', '업종', '저평가 우량주', '경제 캘린더'],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'InvestK',
    locale: 'ko_KR',
    url: SITE_URL,
    title: 'InvestK — 투자 대시보드',
    description: DESC,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'InvestK — 투자 대시보드',
    description: DESC,
  },
  // 검색엔진 소유권 확인(코드가 채워졌을 때만 meta 태그 렌더).
  verification: {
    ...(GOOGLE_VERIFY ? { google: GOOGLE_VERIFY } : {}),
    ...(NAVER_VERIFY ? { other: { 'naver-site-verification': NAVER_VERIFY } } : {}),
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a121d', // 모바일 브라우저 상단바 색(사이트 다크 톤)
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 저장된 테마/큰글씨를 페인트 전에 적용해 깜빡임 방지 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var d=document.documentElement;var t=localStorage.getItem('dash_theme');if(t==='light')d.classList.add('theme-light');else if(t==='dark')d.classList.add('theme-dark');if(localStorage.getItem('dash_large_font')==='true')d.classList.add('large-font');}catch(e){}})();",
          }}
        />
        {/* 구조화 데이터(JSON-LD) — 구글이 'InvestK' 엔티티/사이트를 인식하게(브랜드·제목·사이트링크 개선). */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, url: SITE_URL, name: 'InvestK', description: DESC, inLanguage: 'ko-KR' },
                { '@type': 'WebApplication', name: 'InvestK', url: SITE_URL, applicationCategory: 'FinanceApplication', operatingSystem: 'Web', browserRequirements: 'Requires JavaScript', description: DESC, inLanguage: 'ko-KR', isAccessibleForFree: true },
              ],
            }),
          }}
        />
      </head>
      <body>{children}</body>
      <GoogleAnalytics gaId={GA_ID} />
    </html>
  );
}
