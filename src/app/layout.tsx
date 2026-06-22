import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'InvestKang — Investment Dashboard',
  description: '시장 개장 전 핵심 지표와 자산군 현황을 한눈에. 분석·점수·요약은 참고 정보이며 투자 자문이 아닙니다.',
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
    </html>
  );
}
