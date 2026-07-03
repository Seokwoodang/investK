import type { MacroEvent } from '../types';

// 경제지표 '결과' 표시 — 발표 후(actual 존재) 실제값과 예상 대비 상회/하회, 호재/악재 판정을 보여준다.
// 지표 방향을 아는 경우만 호재/악재로 색칠하고, 애매하면(비농업 고용 등) 사실만 중립색으로.

const SURPRISE_LABEL: Record<NonNullable<MacroEvent['surprise']>, string> = {
  above: '예상 상회',
  inline: '예상 부합',
  below: '예상 하회',
};

function tone(impact?: MacroEvent['resultImpact']) {
  if (impact === '호재') return { color: 'var(--c-upbr)', bg: 'var(--c-gn06)', border: 'var(--c-gn20)' };
  if (impact === '악재') return { color: 'var(--c-downbr)', bg: 'var(--c-rd06)', border: 'var(--c-rd20)' };
  return { color: 'var(--c-tx3)', bg: 'var(--c-w06)', border: 'var(--c-w10)' };
}

export function EventResult({ e, compact = false }: { e: MacroEvent; compact?: boolean }) {
  if (!e.actual) return null;
  const t = tone(e.resultImpact);
  const surprise = e.surprise ? SURPRISE_LABEL[e.surprise] : null;

  if (compact) {
    // 목록 행: 한 줄로 결과 + 예상 대비
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: t.color }}>결과 {e.actual}</span>
        {e.consensus && <span style={{ fontSize: 11, color: 'var(--c-tx6)' }}>예상 {e.consensus}</span>}
        {surprise && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: t.bg, border: `1px solid ${t.border}`, color: t.color, whiteSpace: 'nowrap' }}>
            {surprise}{e.resultImpact && e.resultImpact !== '중립' ? ` · ${e.resultImpact}` : ''}
          </span>
        )}
      </span>
    );
  }

  // 모달: 결과 블록
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, padding: '10px 12px', borderRadius: 10, background: t.bg, border: `1px solid ${t.border}`, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: t.color }}>결과</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: t.color }}>{e.actual}</span>
      {e.consensus && <span style={{ fontSize: 12, color: 'var(--c-tx4)' }}>예상 {e.consensus}{e.previous ? ` · 직전 ${e.previous}` : ''}</span>}
      {surprise && (
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'var(--c-w06)', color: t.color, whiteSpace: 'nowrap' }}>
          {surprise}{e.resultImpact && e.resultImpact !== '중립' ? ` → ${e.resultImpact}` : ''}
        </span>
      )}
    </div>
  );
}
