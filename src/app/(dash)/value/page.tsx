import type { Metadata } from 'next';
import { ValueStocks } from '@/components/screens/ValueStocks';

export const metadata: Metadata = {
  title: '저평가 우량주 스크리너 — 저PER·저PBR·고ROE',
  description: '밸류·퀄리티·안정성·주주환원을 종합해 저평가 우량주를 점수화·랭킹. 그레이엄·버핏·그린블라트 기준의 저PER·저PBR·고ROE 종목을 분기 재무로 선별(참고 정보, 투자 자문 아님).',
  alternates: { canonical: '/value' },
  openGraph: { title: '저평가 우량주 · InvestK', url: '/value' },
};

export default function Page() {
  return <ValueStocks />;
}
