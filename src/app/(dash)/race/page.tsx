import type { Metadata } from 'next';
import { Race } from '@/components/screens/Race';

export const metadata: Metadata = {
  title: 'KOSPI 대장주 레이스',
  description: '2016년부터 지금까지 코스피 시가총액 상위 종목의 순위 변천을 애니메이션으로 재생. KRX 공식 데이터 기반 시총 바 차트 레이스.',
  alternates: { canonical: '/race' },
  openGraph: { title: 'KOSPI 대장주 레이스 · InvestKang', url: '/race' },
};

export default function Page() {
  return <Race />;
}
