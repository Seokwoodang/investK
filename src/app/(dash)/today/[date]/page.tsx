import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStockSnapshot, ymdLabel } from '@/server/archive';
import { StockDayView } from '@/components/archive/StockDayView';
import { SITE_URL } from '@/lib/site';
import { OG_IMAGE } from '@/lib/og';

export const dynamic = 'force-dynamic';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

async function load(date: string) {
  if (!YMD.test(date)) return null;
  const [kr, us] = await Promise.all([getStockSnapshot('kr', date), getStockSnapshot('us', date)]);
  const picks = [kr, us].filter((x): x is NonNullable<typeof x> => !!x);
  return picks.length ? picks : null;
}

export async function generateMetadata({ params }: { params: { date: string } }): Promise<Metadata> {
  const picks = await load(params.date);
  if (!picks) return { title: '기록을 찾을 수 없음' };
  const label = ymdLabel(params.date);
  const names = picks.map((p) => `${p.name} ${p.dir === 'up' ? '+' : ''}${p.pct.toFixed(2)}%`).join(' · ');
  return {
    title: `${label} 화제의 종목 — ${names}`,
    description: `${label} 크게 움직인 종목: ${names}. 왜 움직였는지 실제 뉴스·공시와 PER·PBR·ROE 등 주요 지표로 확인하세요.`,
    alternates: { canonical: `/today/${params.date}` },
    openGraph: { title: `${label} 화제의 종목 · InvestK`, url: `/today/${params.date}`, images: OG_IMAGE },
  };
}

export default async function Page({ params }: { params: { date: string } }) {
  const picks = await load(params.date);
  if (!picks) notFound();
  const label = ymdLabel(params.date);

  return (
    <div>
      <nav aria-label="현재 위치" style={{ marginBottom: 14, fontSize: 13, color: 'var(--c-tx6)' }}>
        <Link href="/today" style={{ color: 'var(--c-tx4)', textDecoration: 'none', fontWeight: 600 }}>화제의 종목</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <span>{label}</span>
      </nav>

      <h1 style={{ margin: '0 0 24px', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
        {label} 화제의 종목
      </h1>

      <div style={{ display: 'grid', gap: 36 }}>
        {picks.map((p) => <StockDayView key={p.market} d={p} />)}
      </div>

      <p style={{ margin: '28px 0 0', fontSize: 12, color: 'var(--c-tx6)' }}>
        선정은 등락률·거래대금 기준의 규칙이며, 매수·매도 의견이 아닙니다. 참고 정보이며 투자 자문이 아닙니다.
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: `${label} 화제의 종목`,
            datePublished: params.date,
            url: `${SITE_URL}/today/${params.date}`,
            publisher: { '@type': 'Organization', name: 'InvestK' },
          }),
        }}
      />
    </div>
  );
}
