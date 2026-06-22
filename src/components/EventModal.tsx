import { useEffect } from 'react';
import { WEEKDAYS } from '../lib/constants';
import { glossDef } from '../lib/glossary';
import { useDashboard } from '../store/DashboardContext';
import { GlossaryTip, ImpactTag } from './GlossaryTip';

export function EventModal() {
  const { state, actions } = useDashboard();
  const modal = state.eventModal;

  // 모달 열리면 뒷배경 스크롤 잠금(닫으면 복원).
  useEffect(() => {
    if (modal == null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modal]);

  if (modal == null) return null;

  const { year, month, day } = modal;
  const dow = WEEKDAYS[new Date(year, month, day).getDay()];
  const title = `${month + 1}월 ${day}일 (${dow})`;
  const events = modal.events.filter((e) => parseInt(e.date.slice(8, 10), 10) === day);

  return (
    <div
      onClick={actions.closeEventModal}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, background: 'var(--c-overlay)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, background: 'var(--c-panel97)',
          border: '1px solid var(--c-w10)', borderRadius: 24,
          boxShadow: '0 24px 80px var(--c-shadow)', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 26px', borderBottom: '1px solid var(--c-w08)' }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--c-tx1)', whiteSpace: 'nowrap' }}>{title} 일정</h3>
          <button
            onClick={actions.closeEventModal}
            style={{ cursor: 'pointer', background: 'var(--c-w06)', border: 'none', borderRadius: 9, width: 32, height: 32, color: 'var(--c-tx3)', fontSize: 18, lineHeight: 1, fontFamily: 'inherit' }}
          >
            ×
          </button>
        </div>
        <div style={{ maxHeight: '62vh', overflowY: 'auto', padding: '6px 26px 18px' }}>
          {events.map((e, i) => {
            const g = glossDef(e.name);
            return (
              <div key={i} style={{ padding: '18px 0', borderBottom: '1px solid var(--c-w05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-tx4)', whiteSpace: 'nowrap' }}>{e.time}</span>
                  <ImpactTag tag={e.tag} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: g ? 11 : 0 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-tx1b)', lineHeight: 1.4 }}>{e.name}</span>
                  {g && <GlossaryTip hit={g} zIndex={55} />}
                </div>
                {/* 경제 일정은 예정 지표라 기사 원문이 없음 → 이벤트 설명(무엇·왜 중요·직전/예상치). 없으면 용어 뜻풀이로 폴백 */}
                {(e.desc || g) && (
                  <div style={{ background: 'var(--c-cy06)', border: '1px solid var(--c-cy16)', borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-accyanbr)', marginBottom: 6 }}>이 일정이란?</div>
                    <div style={{ fontSize: 13, color: 'var(--c-tx2)', lineHeight: 1.55 }}>{e.desc || g?.def}</div>
                    {e.interpret && (
                      <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--c-w07)' }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--c-warn)', flexShrink: 0, marginTop: 2 }}>해석</span>
                        <span style={{ fontSize: 13, color: 'var(--c-tx2)', lineHeight: 1.55 }}>{e.interpret}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ fontSize: 11, color: 'var(--c-tx6)', paddingTop: 14 }}>출처 · Nasdaq 경제지표 캘린더 (예정 일정)</div>
        </div>
      </div>
    </div>
  );
}
