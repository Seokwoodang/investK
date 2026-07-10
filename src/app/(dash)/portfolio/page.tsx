import type { Metadata } from 'next';
import { Portfolio } from '@/components/screens/Portfolio';

// 개인 페이지 — 검색 색인 제외.
export const metadata: Metadata = { title: '내 자산', robots: { index: false, follow: false } };

export default function Page() {
  return <Portfolio />;
}
