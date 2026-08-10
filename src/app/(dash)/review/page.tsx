import type { Metadata } from 'next';
import Link from 'next/link';
import { listWeeks, getWeekSnapshot, weekLabel } from '@/server/archive';
import { SITE_URL } from '@/lib/site';
import { OG_IMAGE } from '@/lib/og';

// 주간 마켓 리뷰 아카이브 허브.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '주간 마켓 리뷰 — 코스피·나스닥 한 주 정리',
  description: '코스피·코스닥·S&P500·나스닥·비트코인의 주간 등락을 한 주씩 기록으로 정리했습니다. 어떤 지수가 오르고 내렸는지 주차별로 확인하세요.',
  alternates: { canonical: '/review' },
  openGraph: { title: '주간 마켓 리뷰 · InvestK', url: '/review', images: OG_IMAGE },
};

export default async function Page() {
  const keys = await listWeeks();
  const weeks = (await Promise.all(keys.slice(0, 30).map((k) => getWeekSnapshot(k)))).filter(Boolean);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>주간 마켓 리뷰</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-tx5)' }}>
          한 주 동안 주요 지수가 어떻게 움직였는지 주차별로 남깁니다.
        </p>
      </div>

      {weeks.length === 0 ? (
        <p style={{ padding: 20, borderRadius: 20, background: 'var(--c-w04)', border: '1px solid var(--c-w08)', fontSize: 14, color: 'var(--c-tx5)' }}>
          아직 쌓인 기록이 없습니다. 매주 토요일 아침에 그 주의 리뷰가 추가됩니다.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {weeks.map((w) => (
            <Link
              key={w!.key}
              href={`/review/${w!.key}`}
              style={{
                display: 'block', textDecoration: 'none', color: 'inherit',
                padding: 18, borderRadius: 20, background: 'var(--c-w04)', border: '1px solid var(--c-w08)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-tx6)' }}>{weekLabel(w!.key)} · {w!.range}</div>
              <div style={{ marginTop: 8, fontSize: 15, lineHeight: 1.6, color: 'var(--c-tx3)' }}>{w!.summary}</div>
            </Link>
          ))}
        </div>
      )}

      <p style={{ margin: '24px 0 0', fontSize: 12, color: 'var(--c-tx6)' }}>
        참고 정보이며 투자 자문이 아닙니다.
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: '주간 마켓 리뷰',
            url: `${SITE_URL}/review`,
          }),
        }}
      />
    </div>
  );
}
