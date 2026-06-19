export function Footer() {
  return (
    <div
      style={{
        marginTop: 48, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.06)',
        fontSize: 12, lineHeight: 1.6, color: '#5E6B82', textAlign: 'center',
      }}
    >
      분석·점수·요약은 AI와 데모 데이터로 생성된 참고 정보이며, 투자 권유나 자문이 아닙니다. 시세는 지연·예시 데이터입니다.
    </div>
  );
}

export function Spinner() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '160px 0', gap: 18 }}>
      <div
        style={{
          width: 34, height: 34, borderRadius: '50%',
          border: '3px solid rgba(255,255,255,0.10)', borderTopColor: '#00C7D9',
          animation: 'spin 800ms linear infinite',
        }}
      />
      <div style={{ fontSize: 13, color: '#6E7A90' }}>시장 데이터 불러오는 중…</div>
    </div>
  );
}
