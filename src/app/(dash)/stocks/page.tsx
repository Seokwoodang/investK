import type { Metadata } from 'next';
import { Stocks } from '@/components/screens/Stocks';

export const metadata: Metadata = {
  title: '종목',
  description: '국내·해외 주식과 코인 시세를 한 화면에서. 관심 종목 등록·정렬·검색으로 빠르게 확인.',
  alternates: { canonical: '/stocks' },
  openGraph: { title: '종목 · InvestK', url: '/stocks' },
};

export default function Page() {
  return <Stocks />;
}
