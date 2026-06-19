import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '파라메타 인베스트 — Investment Dashboard',
  description: '시장 개장 전 핵심 지표와 자산군 현황을 한눈에. 분석·점수·요약은 참고 정보이며 투자 자문이 아닙니다.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
