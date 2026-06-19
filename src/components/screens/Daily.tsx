'use client';

import { useEffect, useState } from 'react';
import { GEN_TIME, WEEKDAYS } from '../../lib/constants';
import { glossDef } from '../../lib/glossary';
import { SRC } from '../../lib/sources';
import { useDashboard } from '../../store/DashboardContext';
import { useViewportLayout } from '../DashboardChrome';
import type { BriefingDay, Direction } from '../../types';
import { GlossaryTip, ImpactTag } from '../GlossaryTip';
import { SourceNote } from '../SourceNote';

const CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 20, backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
};

const dirColor = (v: Direction) => (v === 'up' ? '#34d39a' : v === 'down' ? '#f6685e' : '#9AA6BC');
const dirArrow = (v: Direction) => (v === 'up' ? '▲' : v === 'down' ? '▼' : '—');

const navBtn = (disabled: boolean): React.CSSProperties => ({
  cursor: disabled ? 'default' : 'pointer', background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.10)', borderRadius: 9, width: 34, height: 34,
  color: disabled ? '#3A4458' : '#C4CDDC', fontSize: 15, lineHeight: 1, fontFamily: 'inherit',
});

export function Daily() {
  const { layout } = useViewportLayout();
  const { state, actions, data: dashData } = useDashboard();
  const BRIEFING = dashData.briefing;
  const dates = Object.keys(BRIEFING).sort();
  let bd = state.briefDate;
  if (!BRIEFING[bd]) bd = dates[dates.length - 1];
  const idx = dates.indexOf(bd);
  const mock = BRIEFING[bd];

  // 데일리 브리핑을 서버(/api/ai/briefing)에서 Claude 생성+캐시로 가져온다.
  // 로딩/실패/키 없음 시 정적 mock 폴백.
  const [aiBrief, setAiBrief] = useState<BriefingDay | null>(null);
  useEffect(() => {
    let cancelled = false;
    setAiBrief(null);
    fetch('/api/ai/briefing', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date: bd }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.headline) setAiBrief(j as BriefingDay);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bd]);
  const data = aiBrief ?? mock;

  const day = parseInt(bd.slice(8, 10), 10);
  const mo = parseInt(bd.slice(5, 7), 10);
  const dow = WEEKDAYS[new Date(2026, mo - 1, day).getDay()];
  const dateText = bd.replace(/-/g, '.') + ' (' + dow + ')';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>데일리 브리핑</h1>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap', background: 'rgba(0,199,217,0.16)', color: '#5fd9e6' }}>팩트 브리핑</span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: '#7E8AA0' }}>의견·전망 없이 사실·수치·인과만 정리한 하루 단위 시장 요약입니다. · AI {GEN_TIME}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => idx > 0 && actions.setBriefDate(dates[idx - 1])} style={navBtn(idx <= 0)}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#EAF2FF', whiteSpace: 'nowrap', minWidth: 148, textAlign: 'center' }}>{dateText}</span>
          <button onClick={() => idx < dates.length - 1 && actions.setBriefDate(dates[idx + 1])} style={navBtn(idx >= dates.length - 1)}>›</button>
        </div>
      </div>

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, rgba(0,199,217,0.10), rgba(64,120,255,0.06))', border: '1px solid rgba(0,199,217,0.22)', borderRadius: 24, padding: 32, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', color: '#5fd9e6', marginBottom: 14 }}>오늘의 한 줄</div>
        <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.4, letterSpacing: '-0.01em', color: '#F4F7FB' }}>{data.headline}</div>
      </div>

      {/* Facts + causes */}
      <div style={{ display: 'grid', gridTemplateColumns: layout.briefCols, gap: 16, marginBottom: 20, alignItems: 'start' }}>
        <div style={{ ...CARD, padding: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#00C7D9', marginBottom: 16 }}>3줄 팩트 요약</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {data.facts.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 7, whiteSpace: 'nowrap', background: 'rgba(255,255,255,0.06)', color: '#9AA6BC', flexShrink: 0, marginTop: 1 }}>{f.k}</span>
                <span style={{ fontSize: 14, lineHeight: 1.6, color: '#D4DCE8' }}>{f.t}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ ...CARD, padding: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#00C7D9', marginBottom: 16 }}>왜 움직였나</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {data.causes.map((steps, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {steps.map((t, si) => (
                  <span key={si} style={{ display: 'contents' }}>
                    {si > 0 && <span style={{ fontSize: 13, color: '#5fd9e6' }}>→</span>}
                    <span style={{ fontSize: 13, lineHeight: 1.4, color: si === steps.length - 1 ? '#EAF2FF' : '#9AA6BC', fontWeight: si === steps.length - 1 ? 600 : 400 }}>{t}</span>
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
                <span style={{ fontSize: 15, fontWeight: 700, color: '#EEF2F8', whiteSpace: 'nowrap' }}>{a.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 'auto', color: dirColor(a.dir) }}>{dirArrow(a.dir)}</span>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: '#9AA6BC' }}>{a.line}</div>
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
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#9AA6BC', width: 78, flexShrink: 0 }}>{c.when}</span>
                <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, color: '#C4CDDC' }}>{c.name}</span>
                  {g && <GlossaryTip hit={g} />}
                </span>
                <ImpactTag tag={c.tag} />
              </div>
            );
          })}
        </div>
        <SourceNote text={SRC.calendar} style={{ marginTop: 12 }} />
      </div>

      <SourceNote text={aiBrief ? SRC.ai : 'AI 생성 — Claude (Anthropic) · 현재 정적 샘플 표시 중'} style={{ marginTop: 24 }} />
    </div>
  );
}
