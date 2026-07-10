import pkg from '../../package.json';

export function Footer() {
  return (
    <div
      style={{
        marginTop: 28, paddingTop: 18, borderTop: '1px solid var(--c-w06)',
        fontSize: 12, lineHeight: 1.7, color: 'var(--c-txph)', textAlign: 'center',
      }}
    >
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginBottom: 8, color: 'var(--c-tx5)', fontWeight: 600 }}>
        <span>InvestKang</span>
        <span style={{ color: 'var(--c-tx6)', fontWeight: 500 }}>v{pkg.version}{process.env.NEXT_PUBLIC_COMMIT_SHA ? `·${process.env.NEXT_PUBLIC_COMMIT_SHA}` : ''}</span>
        <span style={{ color: 'var(--c-w12)' }}>·</span>
        <a href="https://github.com/Seokwoodang/investK" target="_blank" rel="noreferrer" style={{ color: 'var(--c-tx6)', textDecoration: 'none' }}>GitHub</a>
      </div>
      {/* 운영 주체(매체 소유관계 확인용 — 애드핏 계정과 동일 사업자) */}
      <div style={{ marginBottom: 8, color: 'var(--c-tx6)' }}>
        운영: 트루 · 문의 <a href="mailto:chazloofficial@gmail.com" style={{ color: 'var(--c-tx5)', textDecoration: 'none' }}>chazloofficial@gmail.com</a>
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 8 }}>
        <a href="/privacy" style={{ color: 'var(--c-tx5)', textDecoration: 'none' }}>개인정보처리방침</a>
        <a href="/terms" style={{ color: 'var(--c-tx5)', textDecoration: 'none' }}>이용약관</a>
      </div>
      <div>분석·점수·요약은 AI와 일부 예시 데이터로 생성된 참고 정보이며, 투자 권유나 자문이 아닙니다. 시세는 지연될 수 있습니다.</div>
    </div>
  );
}

// 인라인 회전 스피너 — 로딩 문구 옆에 붙인다.
export function InlineSpinner({ size = 14, stroke = 2, color = 'var(--c-accyan)' }: { size?: number; stroke?: number; color?: string }) {
  return (
    <span
      aria-label="로딩 중"
      style={{
        display: 'inline-block', width: size, height: size, borderRadius: '50%',
        border: `${stroke}px solid var(--c-w10)`, borderTopColor: color,
        animation: 'spin 800ms linear infinite', flexShrink: 0, verticalAlign: 'middle',
      }}
    />
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
