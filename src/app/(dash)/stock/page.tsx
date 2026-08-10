import type { Metadata } from 'next';
import Link from 'next/link';
import { SubNav } from '@/components/SubNav';
import { topStocks } from '@/server/publicStock';
import { fmtPrice, fmtPct } from '@/lib/format';
import { SITE_URL } from '@/lib/site';
import { OG_IMAGE } from '@/lib/og';

// 공개 종목 허브 — /stock/[code] 상세로 가는 크롤 가능한 <a href> 경로.
// ETF에서 겪은 '고아 페이지' 문제를 반복하지 않기 위해 상세를 반드시 여기서 링크한다.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '종목 시세·지표 — 국내·미국 거래대금 상위',
  description: '국내·미국 주요 종목의 주가와 등락률, PER·PBR·ROE·배당수익률을 종목별로 정리했습니다. 거래대금 상위 종목부터 확인하세요.',
  alternates: { canonical: '/stock' },
  openGraph: { title: '종목 · InvestK', url: '/stock', images: OG_IMAGE },
};

const SECTIONS: { key: 'kr' | 'us'; title: string; note: string; take: number }[] = [
  { key: 'kr', title: '국내 거래대금 상위', note: '코스피·코스닥 종목', take: 60 },
  { key: 'us', title: '미국 거래대금 상위', note: '뉴욕·나스닥 종목', take: 40 },
];

export default async function Page() {
  const lists = await Promise.all(SECTIONS.map((s) => topStocks(s.key, s.take)));

  return (
    <div>
      <SubNav
        items={[
          { href: '/stocks', label: '전체 종목' },
          { href: '/stock', label: '종목 지표' },
          { href: '/value', label: '저평가 우량주' },
          { href: '/etf', label: 'ETF' },
        ]}
      />

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>종목 지표</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-tx5)' }}>
          종목별 주가와 PER·PBR·ROE·배당수익률을 정리했습니다. 거래대금이 많은 순으로 보여드려요.
        </p>
      </div>

      {SECTIONS.map((sec, i) => (
        <section key={sec.key} style={{ marginBottom: 34 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700 }}>{sec.title}</h2>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--c-tx5)' }}>{sec.note}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
            {lists[i].map((s) => (
              <Link
                key={s.id}
                href={`/stock/${encodeURIComponent(s.ticker || s.id)}`}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, minWidth: 0,
                  textDecoration: 'none', color: 'inherit',
                  padding: '14px 16px', borderRadius: 14,
                  background: 'var(--c-w04)', border: '1px solid var(--c-w08)',
                }}
              >
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, fontWeight: 700 }}>{s.name}</span>
                <span style={{ flexShrink: 0, textAlign: 'right' }}>
                  <span style={{ display: 'block', fontSize: 13 }}>{fmtPrice(s.price, s.cur)}</span>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: s.pct >= 0 ? 'var(--c-up)' : 'var(--c-down)' }}>{fmtPct(s.pct)}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <p style={{ margin: 0, fontSize: 12, color: 'var(--c-tx6)' }}>
        시세는 지연될 수 있으며, 수치는 참고 정보입니다. 투자 권유나 자문이 아닙니다.
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: '종목 지표',
            url: `${SITE_URL}/stock`,
          }),
        }}
      />
    </div>
  );
}
