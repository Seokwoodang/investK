import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { termFromSlug, definitionOf, relatedTerms, usedOn, termSlug, groupOf, TERMS } from '@/lib/glossaryPages';
import { SITE_URL } from '@/lib/site';

// 용어 상세 — "PER 뜻" 같은 롱테일 검색의 진입점.
// 정적 데이터라 빌드 시 전 용어를 프리렌더한다.
export function generateStaticParams() {
  return TERMS.map((t) => ({ slug: termSlug(t) }));
}

// 용어 집합이 고정이므로 목록에 없는 슬러그는 진짜 404로 응답한다.
// (notFound()만으로는 이 라우트에서 404 UI가 200 상태로 나가 소프트 404가 된다 —
//  구글이 "찾을 수 없음"으로 잡는 대신 색인 낭비로 처리하므로 상태코드를 확실히 맞춘다.)
export const dynamicParams = false;

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const term = termFromSlug(params.slug);
  if (!term) return { title: '용어를 찾을 수 없음' };
  const def = definitionOf(term);
  const path = `/glossary/${encodeURIComponent(termSlug(term))}`;
  return {
    title: `${term} 뜻 — 쉽게 정리한 투자 용어`,
    description: def.length > 155 ? `${def.slice(0, 152)}…` : def,
    alternates: { canonical: path },
    openGraph: { title: `${term} 뜻 · InvestK`, description: def, url: path },
  };
}

const CARD: React.CSSProperties = {
  padding: 20, borderRadius: 20, background: 'var(--c-w04)', border: '1px solid var(--c-w08)',
};

export default function Page({ params }: { params: { slug: string } }) {
  const term = termFromSlug(params.slug);
  if (!term) notFound();
  const def = definitionOf(term);
  const group = groupOf(term);
  const related = relatedTerms(term);
  const places = usedOn(term);

  return (
    <div>
      {/* 서버 렌더 브레드크럼 — 사전 허브와 양방향 연결 */}
      <nav aria-label="현재 위치" style={{ marginBottom: 14, fontSize: 13, color: 'var(--c-tx6)' }}>
        <Link href="/glossary" style={{ color: 'var(--c-tx4)', textDecoration: 'none', fontWeight: 600 }}>투자 용어 사전</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <span>{term}</span>
      </nav>

      <h1 style={{ margin: '0 0 6px', fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>{term}</h1>
      {group && <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--c-tx6)' }}>{group.title}</p>}

      <div style={{ ...CARD, marginBottom: 24 }}>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.75, color: 'var(--c-tx2)' }}>{def}</p>
      </div>

      {places.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700 }}>어디서 보나</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {places.map((p) => (
              <Link
                key={p.path}
                href={p.path}
                style={{
                  textDecoration: 'none', padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                  background: 'var(--c-cy18)', color: 'var(--c-accyanbr)',
                }}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700 }}>같이 보면 좋은 용어</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {related.map((t) => (
              <Link
                key={t}
                href={`/glossary/${encodeURIComponent(termSlug(t))}`}
                style={{
                  textDecoration: 'none', padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                  background: 'var(--c-w06)', color: 'var(--c-tx4)', border: '1px solid var(--c-w08)',
                }}
              >
                {t}
              </Link>
            ))}
          </div>
        </section>
      )}

      <p style={{ margin: 0, fontSize: 12, color: 'var(--c-tx6)' }}>
        설명은 이해를 돕기 위한 참고 정보이며 투자 자문이 아닙니다.
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'DefinedTerm',
            name: term,
            description: def,
            url: `${SITE_URL}/glossary/${encodeURIComponent(termSlug(term))}`,
            inDefinedTermSet: { '@type': 'DefinedTermSet', name: 'InvestK 투자 용어 사전', url: `${SITE_URL}/glossary` },
          }),
        }}
      />
    </div>
  );
}
