import type { Metadata } from 'next';
import { ValueStocks } from '@/components/screens/ValueStocks';

export const metadata: Metadata = {
  title: '저평가 우량주',
  description: '밸류·퀄리티·안정성·주주환원을 종합한 저평가 우량주 스크리너. 분기 재무 기반 참고 정보(투자 자문 아님).',
  alternates: { canonical: '/value' },
  openGraph: { title: '저평가 우량주 · InvestK', url: '/value' },
};

export default function Page() {
  return <ValueStocks />;
}
