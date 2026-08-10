import type { Metadata } from 'next';
import Link from 'next/link';
import { SubNav } from '@/components/SubNav';
import { ETFS } from '@/lib/etfs';
import { SITE_URL } from '@/lib/site';
import { OG_IMAGE } from '@/lib/og';

// ETF 허브 — /etf/{symbol} 상세 12개로 가는 크롤 가능한 <a href> 경로를 만든다.
// 서버 컴포넌트라 링크가 초기 HTML에 그대로 들어간다(크롤러가 JS 실행 없이 따라갈 수 있음).
export const metadata: Metadata = {
  title: 'ETF 목록 — 국내·미국 대표 ETF 구성종목·수익률·보수',
  description: 'KODEX 200·TIGER 미국S&P500·SPY·QQQ·VOO·SCHD 등 국내외 대표 ETF의 구성종목·섹터 비중·기간 수익률·연 보수를 한눈에 비교. 실데이터 기반(참고 정보, 투자 자문 아님).',
  alternates: { canonical: '/etf' },
  openGraph: { title: 'ETF 목록 · InvestK', url: '/etf', images: OG_IMAGE },
};

const SECTIONS: { key: 'kr' | 'us'; title: string; note: string }[] = [
  { key: 'kr', title: '국내 상장 ETF', note: '원화로 거래되는 국내 상장 ETF' },
  { key: 'us', title: '미국 상장 ETF', note: '달러로 거래되는 미국 상장 ETF' },
];

export default function Page() {
  return (
    <div>
      {/* 종목 찾기 섹션 탭 — 전체 종목 ↔ 저평가 스크리너 ↔ ETF */}
      <SubNav
        items={[
          { href: '/stocks', label: '전체 종목' },
          { href: '/stock', label: '종목 지표' },
          { href: '/value', label: '저평가 우량주' },
          { href: '/etf', label: 'ETF' },
        ]}
      />

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>ETF</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-tx5)' }}>
          국내·미국 대표 ETF의 구성종목·섹터 비중·기간 수익률·연 보수를 확인해 보세요.
        </p>
      </div>

      {SECTIONS.map((sec) => {
        const list = ETFS.filter((e) => e.market === sec.key);
        return (
          <section key={sec.key} style={{ marginBottom: 36 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700 }}>{sec.title}</h2>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--c-tx5)' }}>{sec.note}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {list.map((e) => (
                <Link
                  key={e.symbol}
                  href={`/etf/${e.symbol}`}
                  style={{
                    display: 'block', textDecoration: 'none', color: 'inherit', minWidth: 0,
                    padding: 18, borderRadius: 20,
                    background: 'var(--c-w04)', border: '1px solid var(--c-w08)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>{e.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-tx6)', flexShrink: 0 }}>{e.symbol}</span>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--c-tx5)' }}>{e.theme}</p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      <p style={{ margin: 0, fontSize: 12, color: 'var(--c-tx6)' }}>
        수치는 실데이터 기반 참고 정보이며 투자 자문이 아닙니다.
      </p>

      {/* 구조화 데이터 — 목록 페이지임을 명시해 상세 12개의 발견을 돕는다. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: '국내·미국 대표 ETF 목록',
            itemListElement: ETFS.map((e, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: e.name,
              url: `${SITE_URL}/etf/${e.symbol}`,
            })),
          }),
        }}
      />
    </div>
  );
}
