import type { Metadata } from 'next';
import { Detail } from '@/components/screens/Detail';

// 로그인 전용 상세(KIS 캔들·실시간) — 검색 색인 제외.
export const metadata: Metadata = { title: '종목 상세', robots: { index: false, follow: false } };

export default function Page({ params }: { params: { id: string } }) {
  return <Detail id={params.id} />;
}
