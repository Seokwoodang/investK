import type { Metadata } from 'next';
import Link from 'next/link';
import { GROUPS, TERMS, termSlug, definitionOf } from '@/lib/glossaryPages';
import { SITE_URL } from '@/lib/site';
import { OG_IMAGE } from '@/lib/og';

// 투자 용어 사전 허브 — 용어 상세 40여 개로 가는 크롤 가능한 <a href> 경로.
export const metadata: Metadata = {
  title: '투자 용어 사전 — PER·PBR·ROE부터 VIX·김치프리미엄까지',
  description: '주식·경제 용어를 초보자 눈높이로 한 줄에 정리. PER·PBR·ROE·EPS 같은 재무 지표부터 CPI·FOMC·VIX·김치프리미엄 같은 시장 지표까지 뜻과 보는 법을 확인하세요.',
  alternates: { canonical: '/glossary' },
  openGraph: { title: '투자 용어 사전 · InvestK', url: '/glossary', images: OG_IMAGE },
};

export default function Page() {
  return (
    <div>
      <div style={{ marginBottom: 26 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>투자 용어 사전</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-tx5)' }}>
          숫자를 볼 때 걸리는 용어 {TERMS.length}개를 초보자 눈높이로 정리했습니다. 사이트 곳곳의 ⓘ에서도 같은 설명을 볼 수 있어요.
        </p>
      </div>

      {GROUPS.map((g) => (
        <section key={g.key} style={{ marginBottom: 34 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700 }}>{g.title}</h2>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--c-tx5)' }}>{g.note}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {g.terms.map((t) => (
              <Link
                key={t}
                href={`/glossary/${encodeURIComponent(termSlug(t))}`}
                style={{
                  display: 'block', textDecoration: 'none', color: 'inherit', minWidth: 0,
                  padding: 16, borderRadius: 18,
                  background: 'var(--c-w04)', border: '1px solid var(--c-w08)',
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>{t}</div>
                <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--c-tx5)' }}>
                  {/* 잘렸을 때만 말줄임 — 짧은 설명에 '…'를 붙이면 마침표와 겹쳐 '....'로 보인다. */}
                  {definitionOf(t).length > 70 ? `${definitionOf(t).slice(0, 70)}…` : definitionOf(t)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <p style={{ margin: 0, fontSize: 12, color: 'var(--c-tx6)' }}>
        설명은 이해를 돕기 위한 참고 정보이며 투자 자문이 아닙니다.
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'DefinedTermSet',
            name: 'InvestK 투자 용어 사전',
            url: `${SITE_URL}/glossary`,
            hasDefinedTerm: TERMS.map((t) => ({
              '@type': 'DefinedTerm',
              name: t,
              description: definitionOf(t),
              url: `${SITE_URL}/glossary/${encodeURIComponent(termSlug(t))}`,
            })),
          }),
        }}
      />
    </div>
  );
}
