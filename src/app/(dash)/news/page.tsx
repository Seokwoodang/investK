import type { Metadata } from 'next';
import { News } from '@/components/screens/News';

export const metadata: Metadata = {
  title: '투자 뉴스',
  description: '국내·해외 주식과 코인 주요 뉴스를 AI가 호재/악재·중요도로 정리. 하루 여러 번 갱신.',
  alternates: { canonical: '/news' },
  openGraph: { title: '투자 뉴스 · InvestKang', url: '/news' },
};

export default function Page() {
  return <News />;
}
