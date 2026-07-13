import type { Metadata } from 'next';
import { MockTrade } from '@/components/screens/MockTrade';

// 개인 페이지 — 검색 색인 제외.
export const metadata: Metadata = { title: '모의투자', robots: { index: false, follow: false } };

export default function Page() {
  return <MockTrade />;
}
