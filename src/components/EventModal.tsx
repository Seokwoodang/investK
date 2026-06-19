import { WEEKDAYS } from '../lib/constants';
import { glossDef } from '../lib/glossary';
import { useDashboard } from '../store/DashboardContext';
import { GlossaryTip, ImpactTag } from './GlossaryTip';

export function EventModal() {
  const { state, actions, data } = useDashboard();
  const day = state.eventModalDay;
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
              <a
                key={i}
                href={`https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(e.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'block', textDecoration: 'none', padding: '18px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#9AA6BC', whiteSpace: 'nowrap' }}>{e.time}</span>
                  <ImpactTag tag={e.tag} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#EEF2F8', lineHeight: 1.4 }}>{e.name}</span>
                  {g && <GlossaryTip hit={g} zIndex={55} />}
                </div>
                <div style={{ background: 'rgba(0,199,217,0.06)', border: '1px solid rgba(0,199,217,0.16)', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#5fd9e6', marginBottom: 6 }}>관련 뉴스</div>
                  <div style={{ fontSize: 13, color: '#D4DCE8', lineHeight: 1.55, marginBottom: 9 }}>{e.rel.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#6E7A90' }}>{e.rel.src}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#73BFF9', marginLeft: 'auto' }}>원문 보기 ↗</span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
