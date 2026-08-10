import type { WeekSnapshot } from '@/server/archive';

// 주간 마켓 리뷰 스냅샷 렌더 — 인스타 캐러셀과 같은 데이터를 웹 문서로.

const CARD: React.CSSProperties = {
  padding: 20, borderRadius: 20, background: 'var(--c-w04)', border: '1px solid var(--c-w08)',
};

function pctColor(v: number) {
  return v > 0 ? 'var(--c-up)' : v < 0 ? 'var(--c-down)' : 'var(--c-tx4)';
}
const sign = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;

export function WeekReviewView({ d }: { d: WeekSnapshot }) {
  const rows = [...d.indices, { name: '비트코인', chg: d.btc }];
  return (
    <article>
      <p style={{ ...CARD, margin: '0 0 22px', fontSize: 16, lineHeight: 1.75, color: 'var(--c-tx2)' }}>{d.summary}</p>

      <section style={{ marginBottom: 22 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700 }}>주간 등락</h3>
        <div style={{ ...CARD, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 280, fontSize: 15 }}>
            <thead>
              <tr style={{ color: 'var(--c-tx6)', fontSize: 13 }}>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>지수</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>한 주 변동</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{r.name}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: pctColor(r.chg) }}>{sign(r.chg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div style={CARD}>
          {/* 라벨은 부호에 맞춘다 — 전 지수가 내린 주에 '가장 많이 오른'은 거짓말이 된다. */}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-tx6)' }}>
            {d.best.chg >= 0 ? '가장 많이 오른 지수' : '가장 덜 내린 지수'}
          </div>
          <div style={{ marginTop: 8, fontSize: 18, fontWeight: 800 }}>{d.best.name}</div>
          <div style={{ marginTop: 2, fontSize: 16, fontWeight: 800, color: pctColor(d.best.chg) }}>{sign(d.best.chg)}</div>
        </div>
        <div style={CARD}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-tx6)' }}>
            {d.worst.chg < 0 ? '가장 많이 내린 지수' : '가장 덜 오른 지수'}
          </div>
          <div style={{ marginTop: 8, fontSize: 18, fontWeight: 800 }}>{d.worst.name}</div>
          <div style={{ marginTop: 2, fontSize: 16, fontWeight: 800, color: pctColor(d.worst.chg) }}>{sign(d.worst.chg)}</div>
        </div>
      </section>
    </article>
  );
}
