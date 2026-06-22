'use client';

import { useEffect, useState } from 'react';
import { WEEKDAYS } from '../../lib/constants';
import { glossDef } from '../../lib/glossary';
import { SRC } from '../../lib/sources';
import { useDashboard } from '../../store/DashboardContext';
import { useViewportLayout } from '../DashboardChrome';
import type { BriefingDay, Direction } from '../../types';
import { GlossaryTip, ImpactTag } from '../GlossaryTip';
import { SourceNote } from '../SourceNote';

const CARD: React.CSSProperties = {
  background: 'var(--c-w04)', border: '1px solid var(--c-w08)',
  borderRadius: 20, backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
};

const dirColor = (v: Direction) => (v === 'up' ? 'var(--c-up)' : v === 'down' ? 'var(--c-down)' : 'var(--c-tx4)');
const dirArrow = (v: Direction) => (v === 'up' ? '▲' : v === 'down' ? '▼' : '—');

const navBtn = (disabled: boolean): React.CSSProperties => ({
  cursor: disabled ? 'default' : 'pointer', background: 'var(--c-w05)',
  border: '1px solid var(--c-w10)', borderRadius: 9, width: 34, height: 34,
  color: disabled ? 'var(--c-txdis)' : 'var(--c-tx3)', fontSize: 15, lineHeight: 1, fontFamily: 'inherit',
});

export function Daily() {
  const { layout } = useViewportLayout();
  const { state, actions, data: dashData } = useDashboard();
  const BRIEFING = dashData.briefing;
  const mockDates = Object.keys(BRIEFING).sort();
  // 기본 날짜 = 오늘(KST, 마운트 후). 그 전엔 가장 최근 샘플 날짜로 표시.
  const todayStr = state.today
    ? `${state.today.y}-${String(state.today.m + 1).padStart(2, '0')}-${String(state.today.d).padStart(2, '0')}`
    : null;
  const bd = state.briefDate || todayStr || mockDates[mockDates.length - 1];

  const addDays = (iso: string, n: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    const t = new Date(y, m - 1, d + n);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  };
  const canNext = !todayStr || bd < todayStr; // 미래로는 못 감

  // 데일리 브리핑을 서버(/api/ai/briefing)에서 가져온다. cron이 하루 2~3회 미리 생성·저장하므로
  // 보통은 최신 슬롯을 즉시 읽는다. 로딩 동안은 스켈레톤을 보여 정적 샘플이 잠깐 비치지 않게 한다.
  const SLOT_TEXT: Record<string, string> = { am: '오전 6시 생성분', pm: '오후 5시 생성분', ny: '오후 10시 생성분' };
  const [aiBrief, setAiBrief] = useState<(BriefingDay & { _slot?: string }) | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setAiBrief(null);
    setLoaded(false);
    fetch('/api/ai/briefing', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date: bd }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.headline) setAiBrief(j as BriefingDay & { _slot?: string });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [bd]);
  const fallback = BRIEFING[bd] ?? BRIEFING[mockDates[mockDates.length - 1]];
  const data = aiBrief ?? fallback;
  const loading = !loaded;
  const slotText = aiBrief?._slot ? SLOT_TEXT[aiBrief._slot] : '';

  const [yy, mm, dd] = bd.split('-').map(Number);
  const dow = WEEKDAYS[new Date(yy, mm - 1, dd).getDay()];
  const dateText = bd.replace(/-/g, '.') + ' (' + dow + ')';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>데일리 브리핑</h1>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap', background: 'var(--c-cy16)', color: 'var(--c-accyanbr)' }}>팩트 브리핑</span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-tx5)' }}>의견·전망 없이 사실·수치·인과만 정리한 하루 단위 시장 요약입니다.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => actions.setBriefDate(addDays(bd, -1))} style={navBtn(false)}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-tx1c)', whiteSpace: 'nowrap', minWidth: 148, textAlign: 'center' }}>{dateText}</span>
          <button onClick={() => canNext && actions.setBriefDate(addDays(bd, 1))} style={navBtn(!canNext)}>›</button>
        </div>
      </div>

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, var(--c-cy10), var(--c-bl06))', border: '1px solid var(--c-cy22)', borderRadius: 24, padding: 32, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', color: 'var(--c-accyanbr)' }}>오늘의 한 줄</span>
          {!loading && slotText && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'var(--c-w06)', color: 'var(--c-tx4)', whiteSpace: 'nowrap' }}>{slotText}</span>
          )}
        </div>
        {loading ? (
          <div style={{ height: 34, borderRadius: 8, background: 'var(--c-w06)', maxWidth: 480 }} className="skeleton-pulse" />
        ) : (
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.4, letterSpacing: '-0.01em', color: 'var(--c-tx1)' }}>{data.headline}</div>
        )}
      </div>

      {/* Facts + causes */}
      <div style={{ display: 'grid', gridTemplateColumns: layout.briefCols, gap: 16, marginBottom: 20, alignItems: 'start' }}>
        <div style={{ ...CARD, padding: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-accyan)', marginBottom: 16 }}>3줄 팩트 요약</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {data.facts.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 7, whiteSpace: 'nowrap', background: 'var(--c-w06)', color: 'var(--c-tx4)', flexShrink: 0, marginTop: 1 }}>{f.k}</span>
                <span style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--c-tx2)' }}>{f.t}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ ...CARD, padding: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-accyan)', marginBottom: 16 }}>왜 움직였나</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {data.causes.map((steps, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '11px 0', borderBottom: '1px solid var(--c-w05)' }}>
                {steps.map((t, si) => (
                  <span key={si} style={{ display: 'contents' }}>
                    {si > 0 && <span style={{ fontSize: 13, color: 'var(--c-accyanbr)' }}>→</span>}
                    <span style={{ fontSize: 13, lineHeight: 1.4, color: si === steps.length - 1 ? 'var(--c-tx1c)' : 'var(--c-tx4)', fontWeight: si === steps.length - 1 ? 600 : 400 }}>{t}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* By asset */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>자산군별 한 줄</h2>
        <div style={{ display: 'grid', gridTemplateColumns: layout.assetCols, gap: 16 }}>
          {data.byAsset.map((a, i) => (
            <div key={i} style={{ ...CARD, padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-tx1b)', whiteSpace: 'nowrap' }}>{a.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 'auto', color: dirColor(a.dir) }}>{dirArrow(a.dir)}</span>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--c-tx4)' }}>{a.line}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Checkpoints */}
      <div>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>체크포인트</h2>
        <div style={{ ...CARD, padding: '6px 24px' }}>
          {data.checkpoints.map((c, i) => {
            const g = glossDef(c.name);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--c-w05)' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-tx4)', width: 78, flexShrink: 0 }}>{c.when}</span>
                <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, color: 'var(--c-tx3)' }}>{c.name}</span>
                  {g && <GlossaryTip hit={g} />}
                </span>
                <ImpactTag tag={c.tag} />
              </div>
            );
          })}
        </div>
        <SourceNote text={SRC.calendar} style={{ marginTop: 12 }} />
      </div>

      <SourceNote
        text={
          aiBrief
            ? 'AI 생성 — Claude (Anthropic) · 실시장 데이터로 하루 3회(오전 6시·오후 5시·뉴욕장 개장 전) 자동 생성해 서버에 저장'
            : 'AI 생성 — Claude (Anthropic) · 현재 정적 샘플 표시 중'
        }
        style={{ marginTop: 24 }}
      />
    </div>
  );
}
