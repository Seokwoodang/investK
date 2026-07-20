'use client';

import { useEffect, useState } from 'react';
import { upColor } from '../lib/format';
import { useDashboard } from '../store/DashboardContext';
import { CandleChart } from './CandleChart';
import { SourceNote } from './SourceNote';
import { InlineSpinner } from './Footer';
import type { Candle } from '../types';

// 대시보드 '글로벌 지수' 행 클릭 → 지수 상세 모달.
//  - 캔들 차트(야후, 기간 1M/3M/1Y)
//  - 코스피·코스닥: 투자자별 매매동향(개인/외국인/기관 순매수, 억원 — 네이버)
//  - 해외 지수는 투자자별 집계 제도가 없어 차트·등락만(가짜 데이터 금지)

interface InvestorDay { date: string; personal: number; foreign: number; institutional: number }
type Range = '1mo' | '3mo' | '1y';
const RANGE_LABEL: { r: Range; label: string }[] = [
  { r: '1mo', label: '1개월' },
  { r: '3mo', label: '3개월' },
  { r: '1y', label: '1년' },
];

const fmtEok = (v: number) => `${v > 0 ? '+' : ''}${v.toLocaleString('ko-KR')}억`;

export function IndexModal({ name, onClose }: { name: string; onClose: () => void }) {
  const { state } = useDashboard();
  const [range, setRange] = useState<Range>('3mo');
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [trend, setTrend] = useState<InvestorDay[] | null>(null);
  const [err, setErr] = useState(false);

  // 배경 스크롤 잠금(EventModal과 동일 패턴)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCandles(null);
    setErr(false);
    fetch(`/api/index-detail?name=${encodeURIComponent(name)}&range=${range}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => {
        if (cancelled) return;
        setCandles((j.candles as Candle[]) ?? []);
        setTrend((j.trend as InvestorDay[]) ?? []);
      })
      .catch(() => { if (!cancelled) { setErr(true); setCandles([]); } });
    return () => { cancelled = true; };
  }, [name, range]);

  const last = candles?.[candles.length - 1];
  const prev = candles?.[candles.length - 2];
  const chg = last && prev && prev.c !== 0 ? ((last.c - prev.c) / prev.c) * 100 : null;
  const today = trend?.[trend.length - 1];
  const maxAbs = trend?.length ? Math.max(...trend.flatMap((d) => [Math.abs(d.personal), Math.abs(d.foreign), Math.abs(d.institutional)]), 1) : 1;

  const INVESTORS: { key: keyof Pick<InvestorDay, 'personal' | 'foreign' | 'institutional'>; label: string }[] = [
    { key: 'foreign', label: '외국인' },
    { key: 'institutional', label: '기관' },
    { key: 'personal', label: '개인' },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, background: 'var(--c-overlay)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 4vw, 24px)',
        overflow: 'hidden', // 모달이 화면 높이에 갇히므로 바깥(오버레이) 스크롤 없음
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 720, maxHeight: 'min(92dvh, 860px)', background: 'var(--c-panel97)',
          border: '1px solid var(--c-w10)', borderRadius: 24,
          boxShadow: '0 24px 80px var(--c-shadow)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column', // 헤더 고정 + 본문 내부 스크롤
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px clamp(16px, 4vw, 26px)', borderBottom: '1px solid var(--c-w08)', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--c-tx1)', whiteSpace: 'nowrap' }}>{name}</h3>
          {last && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-tx1b)' }}>{last.c.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
              {chg != null && (
                <span style={{ fontSize: 13, fontWeight: 700, color: upColor(chg) }}>{chg > 0 ? '+' : ''}{chg.toFixed(2)}%</span>
              )}
            </div>
          )}
          <button
            onClick={onClose}
            style={{ marginLeft: 'auto', cursor: 'pointer', background: 'var(--c-w06)', border: 'none', borderRadius: 9, width: 32, height: 32, color: 'var(--c-tx3)', fontSize: 18, lineHeight: 1, fontFamily: 'inherit' }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '18px clamp(16px, 4vw, 26px) 22px', flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {/* 기간 토글 */}
          <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--c-w04)', border: '1px solid var(--c-w07)', borderRadius: 11, width: 'fit-content', marginBottom: 14 }}>
            {RANGE_LABEL.map(({ r, label }) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: '6px 14px',
                  borderRadius: 8, border: 'none', transition: 'all 140ms',
                  background: range === r ? 'var(--c-w08)' : 'transparent',
                  color: range === r ? 'var(--c-tx1c)' : 'var(--c-tx5)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 차트 */}
          {candles == null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '60px 0', justifyContent: 'center', color: 'var(--c-tx4)', fontSize: 14 }}>
              <InlineSpinner /> 차트를 불러오는 중…
            </div>
          ) : err || candles.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--c-tx5)', fontSize: 14 }}>차트 데이터를 불러오지 못했습니다.</div>
          ) : (
            <CandleChart candles={candles} theme={state.theme} fit />
          )}

          {/* 투자자별 매매동향 — 코스피·코스닥만(해외엔 제도 없음) */}
          {trend && trend.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--c-tx2)' }}>투자자별 매매동향</h4>
                <span style={{ fontSize: 11, color: 'var(--c-tx6)' }}>순매수 · 억원</span>
              </div>

              {/* 오늘(최근 거래일) 요약 */}
              {today && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                  {INVESTORS.map(({ key, label }) => (
                    <div key={key} style={{ background: 'var(--c-w04)', border: '1px solid var(--c-w08)', borderRadius: 14, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, color: 'var(--c-tx5)', marginBottom: 5 }}>{label} <span style={{ color: 'var(--c-tx6)' }}>{today.date.slice(5)}</span></div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: upColor(today[key]) }}>{fmtEok(today[key])}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* 최근 거래일별 미니 막대 표 */}
              <div style={{ background: 'var(--c-w03)', border: '1px solid var(--c-w07)', borderRadius: 14, padding: '6px 14px' }}>
                {[...trend].reverse().map((d, i, arr) => (
                  <div key={d.date} style={{ display: 'grid', gridTemplateColumns: '52px repeat(3, 1fr)', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--c-w05)' : 'none' }}>
                    <span style={{ fontSize: 11, color: 'var(--c-tx6)', whiteSpace: 'nowrap' }}>{d.date.slice(5)}</span>
                    {INVESTORS.map(({ key }) => {
                      const v = d[key];
                      const w = Math.max(3, Math.round((Math.abs(v) / maxAbs) * 100));
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--c-w05)', overflow: 'hidden' }}>
                            <div style={{ width: `${w}%`, height: '100%', borderRadius: 3, background: upColor(v), opacity: 0.85 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: upColor(v), whiteSpace: 'nowrap', minWidth: 52, textAlign: 'right' }}>{fmtEok(v)}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
                {/* 열 라벨(맨 위 대신 아래에 한 줄) */}
                <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(3, 1fr)', gap: 10, padding: '7px 0 5px' }}>
                  <span />
                  {INVESTORS.map(({ key, label }) => (
                    <span key={key} style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-tx6)', textAlign: 'right' }}>{label}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          <SourceNote
            text={trend && trend.length > 0 ? 'Yahoo Finance(차트) · 네이버 금융(투자자별 매매동향, 순매수 억원)' : 'Yahoo Finance(차트) · 해외 지수는 투자자별 매매동향 집계가 없습니다'}
            style={{ marginTop: 16 }}
          />
        </div>
      </div>
    </div>
  );
}
