import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getWeekSnapshot, weekLabel } from '@/server/archive';
import { WeekReviewView } from '@/components/archive/WeekReviewView';
import { SITE_URL } from '@/lib/site';
import { OG_IMAGE } from '@/lib/og';

export const dynamic = 'force-dynamic';

const WEEK = /^\d{4}W\d{1,2}$/;

export async function generateMetadata({ params }: { params: { week: string } }): Promise<Metadata> {
  if (!WEEK.test(params.week)) return { title: '기록을 찾을 수 없음' };
  const d = await getWeekSnapshot(params.week);
  if (!d) return { title: '기록을 찾을 수 없음' };
  const label = weekLabel(params.week);
  return {
    title: `${label} 마켓 리뷰 (${d.range}) — 코스피·나스닥 주간 등락`,
    description: `${d.range} 한 주 정리: ${d.summary} 코스피·코스닥·S&P500·나스닥·비트코인의 주간 등락을 확인하세요.`,
    alternates: { canonical: `/review/${params.week}` },
    openGraph: { title: `${label} 마켓 리뷰 · InvestK`, url: `/review/${params.week}`, images: OG_IMAGE },
  };
}

export default async function Page({ params }: { params: { week: string } }) {
  if (!WEEK.test(params.week)) notFound();
  const d = await getWeekSnapshot(params.week);
  if (!d) notFound();
  const label = weekLabel(params.week);

  return (
    <div>
      <nav aria-label="현재 위치" style={{ marginBottom: 14, fontSize: 13, color: 'var(--c-tx6)' }}>
        <Link href="/review" style={{ color: 'var(--c-tx4)', textDecoration: 'none', fontWeight: 600 }}>주간 마켓 리뷰</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <span>{label}</span>
      </nav>

      <h1 style={{ margin: '0 0 4px', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>{label} 마켓 리뷰</h1>
      <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--c-tx5)' }}>{d.range}</p>

      <WeekReviewView d={d} />

      <p style={{ margin: '28px 0 0', fontSize: 12, color: 'var(--c-tx6)' }}>
        참고 정보이며 투자 자문이 아닙니다.
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: `${label} 마켓 리뷰`,
            url: `${SITE_URL}/review/${params.week}`,
            publisher: { '@type': 'Organization', name: 'InvestK' },
          }),
        }}
      />
    </div>
  );
}
