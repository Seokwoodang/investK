import { useEffect } from 'react';
import { WEEKDAYS } from '../lib/constants';
import { glossDef } from '../lib/glossary';
import { useDashboard } from '../store/DashboardContext';
import { GlossaryTip, ImpactTag } from './GlossaryTip';

export function EventModal() {
  const { state, actions, data } = useDashboard();
  const day = state.eventModalDay;

  // 모달 열리면 뒷배경 스크롤 잠금(닫으면 복원).
  useEffect(() => {
    if (day == null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [day]);

  if (day == null) return null;

  const dow = WEEKDAYS[new Date(2026, 5, day).getDay()];
  const title = `6월 ${day}일 (${dow})`;
  const events = data.macro.events.filter((e) => parseInt(e.date.slice(8, 10), 10) === day);

  return (
    <div
      onClick={actions.closeEventModal}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(5,8,15,0.72)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, background: 'rgba(18,24,38,0.97)',
          border: '1px solid rgba(255,255,255,0.10)', borderRadius: 24,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 26px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#F4F7FB', whiteSpace: 'nowrap' }}>{title} 일정</h3>
          <button
            onClick={actions.closeEventModal}
            style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 9, width: 32, height: 32, color: '#C4CDDC', fontSize: 18, lineHeight: 1, fontFamily: 'inherit' }}
          >
            ×
          </button>
        </div>
        <div style={{ maxHeight: '62vh', overflowY: 'auto', padding: '6px 26px 18px' }}>
          {events.map((e, i) => {
            const g = glossDef(e.name);
            return (
              <div key={i} style={{ padding: '18px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#9AA6BC', whiteSpace: 'nowrap' }}>{e.time}</span>
                  <ImpactTag tag={e.tag} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: g ? 11 : 0 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#EEF2F8', lineHeight: 1.4 }}>{e.name}</span>
                  {g && <GlossaryTip hit={g} zIndex={55} />}
                </div>
                {/* 경제 일정은 예정 지표라 기사 원문이 없음 → 이벤트 설명(무엇·왜 중요·직전/예상치). 없으면 용어 뜻풀이로 폴백 */}
                {(e.desc || g) && (
                  <div style={{ background: 'rgba(0,199,217,0.06)', border: '1px solid rgba(0,199,217,0.16)', borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#5fd9e6', marginBottom: 6 }}>이 일정이란?</div>
                    <div style={{ fontSize: 13, color: '#D4DCE8', lineHeight: 1.55 }}>{e.desc || g?.def}</div>
                    {e.interpret && (
                      <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#f5b544', flexShrink: 0, marginTop: 2 }}>해석</span>
                        <span style={{ fontSize: 13, color: '#D4DCE8', lineHeight: 1.55 }}>{e.interpret}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ fontSize: 11, color: '#6E7A90', paddingTop: 14 }}>출처 · Nasdaq 경제지표 캘린더 (예정 일정)</div>
        </div>
      </div>
    </div>
  );
}
