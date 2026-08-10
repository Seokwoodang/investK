import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { resolvePublicStock, getPublicFundamentals, neighborStocks } from '@/server/publicStock';
import { fmtPrice, fmtPct, fmtTradeValue } from '@/lib/format';
import { SITE_URL } from '@/lib/site';
import { OG_IMAGE } from '@/lib/og';

// 공개 종목 페이지 — "삼성전자 PER" 같은 롱테일 검색의 진입점.
// 캔들·실시간 없음(KIS 미사용). 차트가 필요하면 로그인 후 /instrument로.
export const dynamic = 'force-dynamic';

const CARD: React.CSSProperties = {
  padding: 18, borderRadius: 18, background: 'var(--c-w04)', border: '1px solid var(--c-w08)',
};

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const s = await resolvePublicStock(params.code);
  if (!s) return { title: '종목을 찾을 수 없음' };
  const code = s.row.ticker || s.row.id;
  const path = `/stock/${encodeURIComponent(code)}`;
  const title = `${s.row.name}(${code}) 주가·PER·배당 — 실적과 지표 한눈에`;
  return {
    title,
    description: `${s.row.name} 주가와 등락률, PER·PBR·ROE·배당수익률·부채비율, 최근 실적 추이와 관련 뉴스를 정리했습니다. 참고 정보이며 투자 자문이 아닙니다.`,
    alternates: { canonical: path },
    openGraph: { title: `${s.row.name} · InvestK`, url: path, images: OG_IMAGE },
  };
}

const n1 = (v: number | null | undefined, suffix = '', digits = 2) =>
  v == null ? null : `${v.toLocaleString('ko-KR', { maximumFractionDigits: digits })}${suffix}`;

export default async function Page({ params }: { params: { code: string } }) {
  const s = await resolvePublicStock(params.code);
  if (!s) notFound();
  const { market, row } = s;
  const code = row.ticker || row.id;
  const [k, peers] = await Promise.all([
    getPublicFundamentals(market, row),
    neighborStocks(market, code, 12),
  ]);

  const stats: { label: string; value: string }[] = [];
  const push = (label: string, v: string | null) => { if (v) stats.push({ label, value: v }); };
  push('시가총액', k?.marketCapText ?? null);
  push('거래대금', row.vol != null ? fmtTradeValue(row.vol, row.cur) : null);
  push('PER', n1(k?.per, '배'));
  push('추정PER', n1(k?.fwdPer, '배'));
  push('PBR', n1(k?.pbr, '배'));
  push('ROE', n1(k?.roe, '%'));
  push('배당수익률', n1(k?.divYield, '%'));
  push('순이익률', n1(k?.netMargin, '%'));
  push('부채비율', n1(k?.debtRatio, '%'));
  push('유동비율', n1(k?.currentRatio, '', 2));
  push('52주 최고', k?.hi52 != null ? fmtPrice(k.hi52, row.cur) : null);
  push('52주 최저', k?.lo52 != null ? fmtPrice(k.lo52, row.cur) : null);
  push('목표주가', k?.target != null ? fmtPrice(k.target, row.cur) : null);

  const up = row.pct >= 0;

  return (
    <div>
      <nav aria-label="현재 위치" style={{ marginBottom: 14, fontSize: 13, color: 'var(--c-tx6)' }}>
        <Link href="/stock" style={{ color: 'var(--c-tx4)', textDecoration: 'none', fontWeight: 600 }}>종목</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <span>{row.name}</span>
      </nav>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>{row.name}</h1>
        <span style={{ fontSize: 14, color: 'var(--c-tx6)', fontWeight: 600 }}>{code}</span>
        <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: 'var(--c-w06)', color: 'var(--c-tx5)' }}>
          {market === 'kr' ? '🇰🇷 국내' : '🇺🇸 미국'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 26, fontWeight: 800 }}>{fmtPrice(row.price, row.cur)}</span>
        <span style={{ fontSize: 19, fontWeight: 800, color: up ? 'var(--c-up)' : 'var(--c-down)' }}>{fmtPct(row.pct)}</span>
      </div>

      {stats.length > 0 ? (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700 }}>주요 지표</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {stats.map((x) => (
              <div key={x.label} style={{ ...CARD, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-tx6)' }}>{x.label}</div>
                <div style={{ marginTop: 6, fontSize: 16, fontWeight: 700 }}>{x.value}</div>
              </div>
            ))}
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--c-tx6)' }}>
            지표 뜻이 헷갈리면 <Link href="/glossary" style={{ color: 'var(--c-accyanbr)' }}>투자 용어 사전</Link>에서 확인하세요.
          </p>
        </section>
      ) : (
        <p style={{ ...CARD, fontSize: 14, color: 'var(--c-tx5)', marginBottom: 24 }}>
          이 종목의 재무 지표는 아직 수집되지 않았습니다. 시세는 위에서 확인할 수 있습니다.
        </p>
      )}

      {row.news?.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700 }}>관련 뉴스</h2>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {row.news.slice(0, 5).map((nw, i) => (
              <li key={i} style={{ ...CARD, padding: 14, fontSize: 14, lineHeight: 1.6, color: 'var(--c-tx2)' }}>{nw.title}</li>
            ))}
          </ul>
        </section>
      )}

      {/* 차트·실시간은 로그인 영역(KIS 쿼터). 여기서 자연스럽게 유도한다. */}
      <div style={{ ...CARD, marginBottom: 24, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, color: 'var(--c-tx4)' }}>가격 차트와 실시간 시세는 로그인 후 볼 수 있어요.</span>
        <Link
          href={`/instrument/${encodeURIComponent(row.id)}`}
          style={{ textDecoration: 'none', padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: 'var(--c-cy18)', color: 'var(--c-accyanbr)' }}
        >
          차트 보기
        </Link>
      </div>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700 }}>
          거래대금이 비슷한 {market === 'kr' ? '국내' : '미국'} 종목
        </h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {peers.map((p) => (
            <Link
              key={p.id}
              href={`/stock/${encodeURIComponent(p.ticker || p.id)}`}
              style={{
                textDecoration: 'none', padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: 'var(--c-w06)', color: 'var(--c-tx4)', border: '1px solid var(--c-w08)',
              }}
            >
              {p.name}
            </Link>
          ))}
        </div>
      </section>

      <p style={{ margin: 0, fontSize: 12, color: 'var(--c-tx6)' }}>
        시세는 지연될 수 있으며, 수치는 참고 정보입니다. 투자 권유나 자문이 아닙니다.
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: `${row.name}(${code}) 주가·지표`,
            url: `${SITE_URL}/stock/${encodeURIComponent(code)}`,
            inLanguage: 'ko-KR',
          }),
        }}
      />
    </div>
  );
}
