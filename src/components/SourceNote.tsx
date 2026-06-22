// 섹션별 데이터 출처 캡션 — 사용자가 어떤 데이터가 어디서 왔는지 알 수 있게.
export function SourceNote({ text, style }: { text: string; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--c-tx6)', ...style }}>
      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: 'var(--c-w05)', color: 'var(--c-tx4)', flexShrink: 0 }}>출처</span>
      <span>{text}</span>
    </div>
  );
}
