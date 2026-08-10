import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { EtfDetail } from '@/components/screens/EtfDetail';
import { getEtfProfile } from '@/server/providers/yahoo';
import { getNaverEtfProfile } from '@/server/providers/naver';
import { OG_IMAGE } from '@/lib/og';

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
  // 실명에 이미 'ETF'가 들어간 경우(Vanguard S&P 500 ETF · SPDR S&P 500 ETF Trust 등)
  // 'ETF ETF' 중복 방지. 없을 때만(KODEX 200 등) 붙인다.
  const head = /\bETF\b/i.test(label) ? label : `${label} ETF`;
  const title = `${head} — 구성종목·수익률·보수`;
  const description = `${label}(${symbol}) ETF의 운용사·추종지수·연 보수·구성종목·섹터 비중·기간 수익률을 한눈에. 실데이터 기반(참고 정보).`;
  return {
    title,
    description,
    alternates: { canonical: `/etf/${encodeURIComponent(symbol)}` },
    openGraph: { title: `${title} · InvestK`, description, url: `/etf/${encodeURIComponent(symbol)}`, images: OG_IMAGE },
  };
}

export default function Page({ params }: { params: { symbol: string } }) {
  return (
    <>
      {/* 서버 렌더 브레드크럼 — 상세를 고아로 두지 않기 위한 상방 링크(허브 ↔ 상세 양방향 연결). */}
      <nav aria-label="현재 위치" style={{ marginBottom: 14, fontSize: 13, color: 'var(--c-tx6)' }}>
        <Link href="/etf" style={{ color: 'var(--c-tx4)', textDecoration: 'none', fontWeight: 600 }}>ETF</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <span>{decodeURIComponent(params.symbol)}</span>
      </nav>
      <Suspense fallback={null}>
        <EtfDetail symbol={decodeURIComponent(params.symbol)} />
      </Suspense>
    </>
  );
}
