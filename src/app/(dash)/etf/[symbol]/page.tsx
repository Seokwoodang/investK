import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EtfDetail } from '@/components/screens/EtfDetail';

export const metadata: Metadata = {
  title: 'ETF 정보',
  description: '해외 ETF의 운용사·추종 분류·보수·구성종목·섹터 비중을 한눈에. Yahoo Finance 실데이터.',
  robots: { index: false }, // 개인 보유에서 진입하는 참고용 → 색인 제외
};

export default function Page({ params }: { params: { symbol: string } }) {
  return (
    <Suspense fallback={null}>
      <EtfDetail symbol={decodeURIComponent(params.symbol)} />
    </Suspense>
  );
}
