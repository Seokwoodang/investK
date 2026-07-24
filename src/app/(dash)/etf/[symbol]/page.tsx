import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EtfDetail } from '@/components/screens/EtfDetail';
import { getEtfProfile } from '@/server/providers/yahoo';
import { getNaverEtfProfile } from '@/server/providers/naver';

// ETF별 실명 기반 메타데이터 + 색인 허용(SEO — 'KODEX 200 구성종목' 같은 검색 유입).
export async function generateMetadata(
  { params, searchParams }: { params: { symbol: string }; searchParams?: { name?: string } },
): Promise<Metadata> {
  const symbol = decodeURIComponent(params.symbol);
  let name = searchParams?.name?.trim() || '';
  if (!name) {
    try {
      const isKr = /^\d{6}$/.test(symbol);
      const p = isKr
        ? (await getNaverEtfProfile(symbol)) ?? (await getEtfProfile(`${symbol}.KS`)) ?? (await getEtfProfile(`${symbol}.KQ`))
        : await getEtfProfile(symbol);
      name = p?.name || '';
    } catch { /* 실패 시 심볼만 */ }
  }
  const label = name || symbol;
  const title = `${label} ETF — 구성종목·수익률·보수`;
  const description = `${label}(${symbol}) ETF의 운용사·추종지수·연 보수·구성종목·섹터 비중·기간 수익률을 한눈에. 실데이터 기반(참고 정보).`;
  return {
    title,
    description,
    alternates: { canonical: `/etf/${encodeURIComponent(symbol)}` },
    openGraph: { title: `${title} · InvestK`, description, url: `/etf/${encodeURIComponent(symbol)}` },
  };
}

export default function Page({ params }: { params: { symbol: string } }) {
  return (
    <Suspense fallback={null}>
      <EtfDetail symbol={decodeURIComponent(params.symbol)} />
    </Suspense>
  );
}
