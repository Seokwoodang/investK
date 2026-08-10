import type { Metadata } from 'next';
import Link from 'next/link';
import { listStockDays, getStockSnapshot, ymdLabel } from '@/server/archive';
import { SITE_URL } from '@/lib/site';

// 화제의 종목 아카이브 허브 — 날짜별 상세로 가는 크롤 경로.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '오늘 화제의 종목 — 왜 움직였나 (기록)',
  description: '국내·미국 증시에서 크게 움직인 종목과 그 이유를 날짜별로 정리했습니다. 실제 뉴스·공시와 주요 재무 지표를 함께 확인하세요.',
  alternates: { canonical: '/today' },
  openGraph: { title: '화제의 종목 기록 · InvestK', url: '/today' },
};

export default async function Page() {
  const [krDays, usDays] = await Promise.all([listStockDays('kr'), listStockDays('us')]);
  const days = [...new Set([...krDays, ...usDays])].sort().reverse();
  const recent = await Promise.all(
    days.slice(0, 30).map(async (ymd) => ({
      ymd,
      kr: await getStockSnapshot('kr', ymd),
      us: await getStockSnapshot('us', ymd),
    })),
  );

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>화제의 종목</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-tx5)' }}>
          그날 크게 움직인 종목과 <strong style={{ color: 'var(--c-tx3)' }}>움직인 이유</strong>를 실제 뉴스·공시로만 정리합니다. 추천 종목이 아닙니다.
        </p>
      </div>

      {recent.length === 0 ? (
        <p style={{ padding: 20, borderRadius: 20, background: 'var(--c-w04)', border: '1px solid var(--c-w08)', fontSize: 14, color: 'var(--c-tx5)' }}>
          아직 쌓인 기록이 없습니다. 매 거래일 장 마감 후 그날의 종목이 추가됩니다.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {recent.map(({ ymd, kr, us }) => {
            const picks = [kr, us].filter(Boolean);
            if (!picks.length) return null;
            return (
              <Link
                key={ymd}
                href={`/today/${ymd}`}
                style={{
                  display: 'block', textDecoration: 'none', color: 'inherit',
                  padding: 18, borderRadius: 20, background: 'var(--c-w04)', border: '1px solid var(--c-w08)',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-tx6)' }}>{ymdLabel(ymd)}</div>
                <div style={{ marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {picks.map((p) => (
                    <span key={p!.market} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 12 }}>{p!.market === 'kr' ? '🇰🇷' : '🇺🇸'}</span>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{p!.name}</span>
                      <span style={{ fontSize: 15, fontWeight: 800, color: p!.dir === 'up' ? 'var(--c-up)' : 'var(--c-down)' }}>
                        {p!.dir === 'up' ? '+' : ''}{p!.pct.toFixed(2)}%
                      </span>
                    </span>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <p style={{ margin: '24px 0 0', fontSize: 12, color: 'var(--c-tx6)' }}>
        선정은 등락률·거래대금 기준의 규칙이며, 매수·매도 의견이 아닙니다. 참고 정보이며 투자 자문이 아닙니다.
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: '화제의 종목 기록',
            url: `${SITE_URL}/today`,
          }),
        }}
      />
    </div>
  );
}
