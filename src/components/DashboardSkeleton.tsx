// 대시보드 골격 스켈레톤. loading.tsx(라우트 전환 폴백)와 로그인 화면(전환 중)에서 공용으로 쓴다.
const SURF = 'var(--c-w06)';
const CARD: React.CSSProperties = { background: 'var(--c-w04)', border: '1px solid var(--c-w08)', borderRadius: 20, padding: 22 };

function Bar({ w, h, r = 8, mt = 0 }: { w: number | string; h: number; r?: number; mt?: number }) {
  return <div className="skeleton-pulse" style={{ width: w, height: h, borderRadius: r, background: SURF, marginTop: mt }} />;
}

function CardSkeleton() {
  return (
    <div style={CARD}>
      <Bar w="55%" h={14} />
      <Bar w="40%" h={26} mt={16} />
      <div style={{ height: 1, background: 'var(--c-w06)', margin: '16px 0' }} />
      <Bar w="70%" h={13} />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div>
      {/* 헤더 골격 */}
      <div style={{ height: 64, borderBottom: '1px solid var(--c-w07)', background: 'var(--c-headerbg)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', height: '100%', display: 'flex', alignItems: 'center', gap: 24, padding: '0 24px' }}>
          <div className="skeleton-pulse" style={{ width: 34, height: 34, borderRadius: 10, background: SURF }} />
          <Bar w={110} h={16} />
          <div style={{ display: 'flex', gap: 18, marginLeft: 8 }}>
            {[44, 44, 44, 52, 52, 44].map((w, i) => <Bar key={i} w={w} h={14} />)}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Bar w={70} h={30} r={10} />
            <Bar w={64} h={30} r={10} />
          </div>
        </div>
      </div>

      {/* 본문 골격 */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 24px' }}>
        <Bar w={180} h={28} />
        <Bar w={320} h={14} mt={12} />

        <Bar w={120} h={16} mt={32} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 16 }}>
          {[0, 1, 2, 3].map((i) => <CardSkeleton key={i} />)}
        </div>

        <Bar w={160} h={16} mt={36} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 16 }}>
          <div style={{ ...CARD, height: 180 }}><Bar w="45%" h={13} /><Bar w="80%" h={16} mt={18} /><Bar w="70%" h={16} mt={12} /><Bar w="75%" h={16} mt={12} /></div>
          <div style={{ ...CARD, height: 180 }}><Bar w="45%" h={13} /><Bar w="80%" h={16} mt={18} /><Bar w="70%" h={16} mt={12} /><Bar w="75%" h={16} mt={12} /></div>
        </div>
      </div>
    </div>
  );
}
