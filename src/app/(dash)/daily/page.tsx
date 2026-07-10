import type { Metadata } from 'next';
import { Daily } from '@/components/screens/Daily';

export const metadata: Metadata = {
  title: '데일리 브리핑',
  description: '오늘의 시장 한 줄 요약과 자산군별 브리핑·체크포인트. 실시장 데이터 기반 참고 정보(투자 자문 아님).',
  alternates: { canonical: '/daily' },
  openGraph: { title: '데일리 브리핑 · InvestKang', url: '/daily' },
};

export default function Page() {
  return <Daily />;
}
