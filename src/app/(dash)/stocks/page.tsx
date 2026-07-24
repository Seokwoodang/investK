import type { Metadata } from 'next';
import { Stocks } from '@/components/screens/Stocks';

export const metadata: Metadata = {
  title: '종목 시세 — 거래대금·급등락·거래량 순위',
  description: '국내·해외 주식과 코인 시세를 거래대금·거래량·변동률·위험도로 정렬. 급등락 종목·거래대금 상위를 한 화면에서 빠르게 확인.',
  alternates: { canonical: '/stocks' },
  openGraph: { title: '종목 · InvestK', url: '/stocks' },
};

export default function Page() {
  return <Stocks />;
}
