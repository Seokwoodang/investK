import type { StockSnapshot } from '@/server/archive';

// '오늘 화제의 종목' 스냅샷 렌더 — 인스타 카드와 같은 데이터를 웹 문서로 보여준다.
// 서버 컴포넌트라 본문·링크가 전부 초기 HTML에 들어간다(색인 대상).

const CARD: React.CSSProperties = {
  padding: 20, borderRadius: 20, background: 'var(--c-w04)', border: '1px solid var(--c-w08)',
};
const LABEL: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-tx6)' };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...CARD, padding: 14 }}>
      <div style={LABEL}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 16, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const num = (v: number | null, suffix = '', digits = 2) =>
  v == null ? null : `${v.toLocaleString('ko-KR', { maximumFractionDigits: digits })}${suffix}`;

export function StockDayView({ d }: { d: StockSnapshot }) {
  const up = d.dir === 'up';
  const color = up ? 'var(--c-up)' : 'var(--c-down)';
  const stats: { label: string; value: string }[] = [];
  const push = (label: string, v: string | null) => { if (v) stats.push({ label, value: v }); };
  push('거래대금', d.volText);
  push('시가총액', d.marketCapText);
  push('PER', num(d.per, '배'));
  push('PBR', num(d.pbr, '배'));
  push('ROE', num(d.roe, '%'));
  push('배당수익률', num(d.divYield, '%'));
  push('순이익률', num(d.netMargin, '%'));
  push('부채비율', num(d.debtRatio, '%'));
  push('52주 위치', num(d.pos52, '%', 0));
  push('상승여력', num(d.upside, '%', 1));

  return (
    <article>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>{d.name}</h2>
        <span style={{ fontSize: 13, color: 'var(--c-tx6)', fontWeight: 600 }}>{d.code}</span>
        <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: 'var(--c-w06)', color: 'var(--c-tx5)' }}>
          {d.market === 'kr' ? '🇰🇷 국내' : '🇺🇸 미국'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 26, fontWeight: 800 }}>{d.priceText}</span>
        <span style={{ fontSize: 20, fontWeight: 800, color }}>{up ? '+' : ''}{d.pct.toFixed(2)}%</span>
      </div>

      <section style={{ marginBottom: 22 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700 }}>왜 움직였나</h3>
        {d.news.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {d.news.map((n, i) => (
              <li key={i} style={{ ...CARD, padding: 14 }}>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--c-tx2)' }}>{n.title}</div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--c-tx6)' }}>{n.src}{n.date ? ` · ${n.date}` : ''}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ ...CARD, margin: 0, fontSize: 14, color: 'var(--c-tx5)' }}>
            이 종목을 직접 다룬 최근 기사는 없었습니다. 뉴스보다 수급·시장 전체 흐름의 영향으로 움직였을 가능성이 큽니다.
          </p>
        )}
      </section>

      {d.disc.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700 }}>최근 공시</h3>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {d.disc.map((x, i) => (
              <li key={i} style={{ ...CARD, padding: 14, fontSize: 14, color: 'var(--c-tx2)' }}>
                {x.title}
                <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--c-tx6)' }}>{x.kind} · {x.date}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700 }}>주요 지표</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {stats.map((s) => <Stat key={s.label} label={s.label} value={s.value} />)}
          </div>
        </section>
      )}

      {d.trend.filter((t) => t.revenue != null || t.profit != null).length >= 2 && (
        <section style={{ marginBottom: 22 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700 }}>실적 추이 ({d.revUnit})</h3>
          <div style={{ ...CARD, overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 320, fontSize: 14 }}>
              <thead>
                <tr style={{ color: 'var(--c-tx6)', textAlign: 'right' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>연도</th>
                  <th style={{ padding: '4px 8px', fontWeight: 600 }}>매출</th>
                  <th style={{ padding: '4px 8px', fontWeight: 600 }}>순이익</th>
                </tr>
              </thead>
              <tbody>
                {d.trend.map((t) => (
                  <tr key={t.year} style={{ textAlign: 'right' }}>
                    <td style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700 }}>{t.year}</td>
                    <td style={{ padding: '6px 8px' }}>{t.revenue?.toLocaleString('ko-KR') ?? '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{t.profit?.toLocaleString('ko-KR') ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </article>
  );
}
