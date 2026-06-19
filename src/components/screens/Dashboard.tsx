'use client';

import { buildCalendar } from '../../lib/calendar';
import { WEEKDAYS } from '../../lib/constants';
import { fmtPct, upColor } from '../../lib/format';
import { glossDef } from '../../lib/glossary';
import { SRC } from '../../lib/sources';
import { useDashboard } from '../../store/DashboardContext';
import { useViewportLayout } from '../DashboardChrome';
import { TAB_LABELS } from '../../types';
import { GlossaryTip, ImpactTag } from '../GlossaryTip';
import { SourceNote } from '../SourceNote';

const CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 20, backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
};

const calNavBtn: React.CSSProperties = {
  cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 8, width: 28, height: 28, color: '#C4CDDC', fontSize: 15, lineHeight: 1, fontFamily: 'inherit',
};

const segBtn = (active: boolean): React.CSSProperties => ({
  cursor: 'pointer', border: 'none', padding: '7px 16px', borderRadius: 9, fontSize: 13,
  fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 180ms',
  ...(active ? { background: 'rgba(0,199,217,0.18)', color: '#5fd9e6' } : { background: 'transparent', color: '#9AA6BC' }),
});

function MacroCard({ title, rows, source }: { title: string; rows: { label: string; val: string; chg: number }[]; source: string }) {
  return (
    <div style={{ ...CARD, padding: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: '#00C7D9', marginBottom: 18 }}>{title}</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ fontSize: 14, color: '#C4CDDC', whiteSpace: 'nowrap' }}>{r.label}</span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{r.val}</span>
            <span style={{ fontSize: 12, fontWeight: 600, width: 56, textAlign: 'right', color: upColor(r.chg) }}>{fmtPct(r.chg)}</span>
          </span>
        </div>
      ))}
      <SourceNote text={source} style={{ marginTop: 14 }} />
    </div>
  );
}

export function Dashboard() {
  const { vw, layout } = useViewportLayout();
  const { state, actions, data } = useDashboard();
  const { macro, stocks } = data;
  const weeks = buildCalendar(state.calEvents, vw, state.calYear, state.calMonth, state.today);
  const monthLabel = `${state.calYear}년 ${state.calMonth + 1}월`;

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>대시보드</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: '#7E8AA0' }}>시장 개장 전 핵심 지표와 자산군 현황을 한눈에 확인하세요.</p>
      </div>

      {/* Asset-class status — 최상단(가장 보고 싶은 내 자산 현황 + 종목 진입점) */}
      <div style={{ marginBottom: 36 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>자산군 현황</h2>
        <div style={{ display: 'grid', gridTemplateColumns: layout.assetCols, gap: 16 }}>
          {TAB_LABELS.map((t) => {
            const arr = stocks[t.id];
            const avg = arr.reduce((s, x) => s + x.pct, 0) / arr.length;
            const top = arr.reduce((m, x) => (x.pct > m.pct ? x : m), arr[0]);
            return (
              <button
                key={t.id}
                className="card-hover"
                onClick={() => actions.openTabbedStocks(t.id)}
                style={{ ...CARD, textAlign: 'left', cursor: 'pointer', display: 'block', width: '100%', padding: 22 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#EEF2F8' }}>{t.label}</span>
                  <span style={{ fontSize: 12, color: '#6E7A90' }}>{arr.length}종목</span>
                </div>
                <div style={{ fontSize: 12, color: '#7E8AA0', marginBottom: 4 }}>평균 등락</div>
                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em', color: upColor(avg) }}>{fmtPct(avg)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: 12, color: '#6E7A90' }}>상위</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#C4CDDC' }}>{top.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 'auto', color: upColor(top.pct) }}>{fmtPct(top.pct)}</span>
                </div>
              </button>
            );
          })}
        </div>
        <SourceNote text={SRC.assetStatus} style={{ marginTop: 14 }} />
      </div>

      {/* Macro briefing */}
      <div style={{ marginBottom: 36 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>오늘의 매크로 브리핑</h2>
        <div style={{ display: 'grid', gridTemplateColumns: layout.macroCols2, gap: 16 }}>
          <MacroCard title="환율 · FX" rows={macro.fx.map((r) => ({ label: r.pair, val: r.val, chg: r.chg }))} source={SRC.fx} />
          <MacroCard title="글로벌 지수 · INDEX" rows={macro.indices.map((r) => ({ label: r.name, val: r.val, chg: r.chg }))} source={SRC.index} />
        </div>
      </div>

      {/* Major schedule */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap' }}>주요 일정</h2>
          <div style={{ display: 'flex', gap: 4, padding: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 11 }}>
            <button onClick={() => actions.setEventView('list')} style={segBtn(state.eventView === 'list')}>목록</button>
            <button onClick={() => actions.setEventView('calendar')} style={segBtn(state.eventView === 'calendar')}>달력</button>
          </div>
        </div>

        {state.eventView === 'list' ? (
          <div style={{ ...CARD, padding: '6px 24px' }}>
            {macro.events.map((e, i) => {
              const yr = parseInt(e.date.slice(0, 4), 10);
              const da = parseInt(e.date.slice(8, 10), 10);
              const mo = parseInt(e.date.slice(5, 7), 10);
              const dow = WEEKDAYS[new Date(yr, mo - 1, da).getDay()];
              const today = !!state.today && state.today.y === yr && state.today.m === mo - 1 && state.today.d === da;
              const g = glossDef(e.name);
              return (
                <div
                  key={i}
                  className="event-row"
                  onClick={() => actions.openEventModal({ year: yr, month: mo - 1, day: da, events: macro.events })}
                  style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 8px', margin: '0 -8px', borderRadius: 10, borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                >
                  <div style={{ width: 60, flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: today ? '#00C7D9' : '#EAF2FF' }}>
                      {mo}/{da} <span style={{ fontSize: 11, fontWeight: 500, color: '#6E7A90' }}>({dow})</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#6E7A90', marginTop: 2 }}>{e.time}</div>
                  </div>
                  <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, color: '#C4CDDC' }}>{e.name}</span>
                    {g && <GlossaryTip hit={g} />}
                  </span>
                  <ImpactTag tag={e.tag} />
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ ...CARD, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => actions.gotoCalMonth(-1)} aria-label="이전 달" style={calNavBtn}>‹</button>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#EAF2FF', whiteSpace: 'nowrap', minWidth: 96, textAlign: 'center' }}>{monthLabel}</div>
                <button onClick={() => actions.gotoCalMonth(1)} aria-label="다음 달" style={calNavBtn}>›</button>
                {state.calLoading && <span style={{ fontSize: 11, color: '#6E7A90' }}>불러오는 중…</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9AA6BC' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f6685e' }} />고영향
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9AA6BC' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f5b544' }} />중간
                </span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 6 }}>
              {WEEKDAYS.map((w, i) => (
                <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, padding: '4px 0', color: i === 0 ? '#e88a82' : i === 6 ? '#73BFF9' : '#6E7A90' }}>{w}</div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {weeks.map((wk, wi) => (
                <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
                  {wk.days.map((c, ci) => {
                    const clickable = c.show && c.hasDot;
                    return (
                      <div
                        key={ci}
                        className={`cal-cell${clickable ? ' clickable' : ''}`}
                        onClick={clickable ? () => actions.openEventModal({ year: state.calYear, month: state.calMonth, day: c.day as number, events: state.calEvents }) : undefined}
                        style={{
                          minHeight: c.minHeight, borderRadius: 10, overflow: 'hidden',
                          padding: c.show ? 8 : 0,
                          border: c.show ? `1px solid ${c.cellBorder}` : 'none',
                          background: c.cellBg, cursor: clickable ? 'pointer' : 'default',
                        }}
                      >
                        {c.show && (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 13, fontWeight: c.today ? 800 : 600, color: c.dayColor }}>{c.day}</span>
                              {c.hasDot && <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: c.dotColor }} />}
                            </div>
                            {c.showLabels && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                                {c.chips.map((ch, idx) => (
                                  <div key={idx} style={{ fontSize: 10, lineHeight: 1.3, padding: '2px 5px', borderRadius: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: ch.bg, color: ch.color }}>
                                    {ch.name}
                                  </div>
                                ))}
                                {c.hasMore && <div style={{ fontSize: 9, color: '#6E7A90', paddingLeft: 5 }}>{c.moreText}</div>}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
        <SourceNote text={SRC.calendar} style={{ marginTop: 12 }} />
      </div>
    </div>
  );
}
