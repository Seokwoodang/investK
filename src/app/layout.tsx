import type { Metadata, Viewport } from 'next';
import { GoogleAnalytics } from '@next/third-parties/google';
import { SITE_URL } from '@/lib/site';
import './globals.css';

// GA4 측정 ID. env로 덮어쓸 수 있고(없으면 기본값), 측정 ID는 공개 정보라 노출돼도 무방.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || 'G-EB6L1EW9Q5';

const DESC = '시장 개장 전 핵심 지표·업종 흐름·자산군 현황을 한눈에. 분석·점수·요약은 참고 정보이며 투자 자문이 아닙니다.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'InvestKang — 투자 대시보드',
    template: '%s · InvestKang', // 하위 페이지가 title만 주면 '…· InvestKang'으로 완성
  },
  description: DESC,
  applicationName: 'InvestKang',
  keywords: ['투자', '주식', '대시보드', '코스피', '코스닥', '업종', '저평가 우량주', '경제 캘린더'],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'InvestKang',
    locale: 'ko_KR',
    url: SITE_URL,
    title: 'InvestKang — 투자 대시보드',
    description: DESC,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'InvestKang — 투자 대시보드',
    description: DESC,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
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
      </head>
      <body>{children}</body>
      <GoogleAnalytics gaId={GA_ID} />
    </html>
  );
}
