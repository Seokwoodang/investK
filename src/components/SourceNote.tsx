// 섹션별 데이터 출처 캡션 — 사용자가 어떤 데이터가 어디서 왔는지 알 수 있게.
export function SourceNote({ text, style }: { text: string; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--c-tx6)', ...style }}>
      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: 'var(--c-w05)', color: 'var(--c-tx4)', flexShrink: 0 }}>출처</span>
      <span>{text}</span>
    </div>
  );
}

// 데이터 갱신 주기/시점 안내 — 페이지마다 "언제 업데이트되는지" 표시.
export function UpdateNote({ text, style }: { text: string; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--c-tx6)', ...style }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.8 }}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{text}</span>
    </div>
  );
}
