import type { Metadata } from 'next';
import { Report } from '@/components/screens/Report';

// 개인 페이지 — 검색 색인 제외.
export const metadata: Metadata = { title: '투자 보고서', robots: { index: false, follow: false } };

export default function Page() {
  return <Report />;
}
