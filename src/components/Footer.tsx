import pkg from '../../package.json';

export function Footer() {
  return (
    <div
      style={{
        marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--c-w06)',
        fontSize: 12, lineHeight: 1.7, color: 'var(--c-txph)', textAlign: 'center',
      }}
    >
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginBottom: 8, color: 'var(--c-tx5)', fontWeight: 600 }}>
        <span>InvestKang</span>
        <span style={{ color: 'var(--c-tx6)', fontWeight: 500 }}>v{pkg.version}</span>
        <span style={{ color: 'var(--c-w12)' }}>·</span>
        <a href="https://github.com/Seokwoodang/investK" target="_blank" rel="noreferrer" style={{ color: 'var(--c-tx6)', textDecoration: 'none' }}>GitHub</a>
      </div>
      <div>분석·점수·요약은 AI와 일부 예시 데이터로 생성된 참고 정보이며, 투자 권유나 자문이 아닙니다. 시세는 지연될 수 있습니다.</div>
    </div>
  );
}

export function Spinner() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '160px 0', gap: 18 }}>
      <div
        style={{
          width: 34, height: 34, borderRadius: '50%',
          border: '3px solid var(--c-w10)', borderTopColor: 'var(--c-accyan)',
          animation: 'spin 800ms linear infinite',
        }}
      />
      <div style={{ fontSize: 13, color: 'var(--c-tx6)' }}>시장 데이터 불러오는 중…</div>
    </div>
  );
}
