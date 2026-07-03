'use client';

import { useEffect, useState } from 'react';
import type { MacroEvent } from '../types';

// 경제지표 결과/예정 표시.
//  - 예정 시각(KST) 전: 예상(컨센서스)·직전치 '미리보기' (있을 때만)
//  - 예정 시각 후 + 실제값 존재: '결과' + 예상 대비 상회/하회, 호재/악재(방향 아는 경우만)
// 발언류처럼 예상·직전·실제가 다 없으면 아무것도 안 그린다.

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

// 이벤트 예정 시각(KST)의 UTC ms. KST=UTC+9라 시(hour)에서 9를 빼 UTC로 환산.
function releasedMs(e: MacroEvent): number {
  const [y, m, d] = e.date.split('-').map(Number);
  const tm = e.time?.match(/^(\d{1,2}):(\d{2})/);
  if (tm) return Date.UTC(y, m - 1, d, Number(tm[1]) - 9, Number(tm[2]));
  return Date.UTC(y, m - 1, d + 1, -9, 0); // 시간 미정: 그 날(KST)이 끝나야 발표된 것으로 간주
}

// 예상·직전 요약 문자열("예상 114K · 직전 129K", 없는 건 생략).
function previewText(e: MacroEvent): string {
  const parts: string[] = [];
  if (e.consensus) parts.push(`예상 ${e.consensus}`);
  if (e.previous) parts.push(`직전 ${e.previous}`);
  return parts.join(' · ');
}

export function EventResult({ e, compact = false }: { e: MacroEvent; compact?: boolean }) {
  // 시각 비교는 클라이언트에서만(SSR/CSR 시간차로 인한 hydration 불일치 방지).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  const released = now != null && now >= releasedMs(e);

  const showResult = released && !!e.actual;
  const preview = previewText(e);

  // 발표 전(또는 발표됐지만 실제값 아직): 예상·직전 미리보기
  if (!showResult) {
    if (!preview) return null;
    if (compact) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--c-tx6)' }}>{preview}</span>
          {released && <span style={{ fontSize: 10, color: 'var(--c-tx6)' }}>· 결과 대기</span>}
        </span>
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--c-w04)', border: '1px solid var(--c-w08)' }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--c-tx5)' }}>{released ? '결과 대기' : '예정'}</span>
        <span style={{ fontSize: 13, color: 'var(--c-tx3)' }}>{preview}</span>
      </div>
    );
  }

  // 발표 후: 결과
  const t = tone(e.resultImpact);
  const surprise = e.surprise ? SURPRISE_LABEL[e.surprise] : null;
  const badge = surprise ? `${surprise}${e.resultImpact && e.resultImpact !== '중립' ? ` · ${e.resultImpact}` : ''}` : null;

  if (compact) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: t.color }}>결과 {e.actual}</span>
        {preview && <span style={{ fontSize: 11, color: 'var(--c-tx6)' }}>{preview}</span>}
        {badge && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: t.bg, border: `1px solid ${t.border}`, color: t.color, whiteSpace: 'nowrap' }}>{badge}</span>
        )}
      </span>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, padding: '10px 12px', borderRadius: 10, background: t.bg, border: `1px solid ${t.border}`, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: t.color }}>결과</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: t.color }}>{e.actual}</span>
      {preview && <span style={{ fontSize: 12, color: 'var(--c-tx4)' }}>{preview}</span>}
      {badge && (
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'var(--c-w06)', color: t.color, whiteSpace: 'nowrap' }}>{badge}</span>
      )}
    </div>
  );
}
