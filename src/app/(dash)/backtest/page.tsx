import type { Metadata } from 'next';
import { Backtest } from '@/components/screens/Backtest';

export const metadata: Metadata = {
  title: '백테스트',
  description: '과거 종가로 규칙 기반(모멘텀·이동평균·로우볼) 전략의 성과를 검증하는 백테스트 실험실. 교육용(투자 자문 아님).',
  alternates: { canonical: '/backtest' },
  openGraph: { title: '백테스트 · InvestKang', url: '/backtest' },
};

export default function Page() {
  return <Backtest />;
}
