'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { upColor } from '../lib/format';
import { useDashboard } from '../store/DashboardContext';
import { CandleChart } from './CandleChart';
import { SourceNote } from './SourceNote';
import { InlineSpinner } from './Footer';
import type { Candle } from '../types';

// 대시보드 '업종 흐름' 행 클릭 → 섹터 상세 모달.
//  - 섹터 ETF 캔들(야후, 1M/3M/1Y)
//  - '왜 움직이나': 대표 종목들의 실제 기사(네이버 금융) — 지어내지 않고 출처 링크로
// 뉴스가 곧 '이유'다: AI 추론 원인 대신 실제 헤드라인 + 언론사 + 링크만 보여준다.

interface Article { title: string; summary: string; src: string; url: string; datetime: string }
interface Detail { name: string; proxy: string; candles: Candle[]; leaders: string[]; news: Article[] }

type Range = '1mo' | '3mo' | '1y';
const RANGE_LABEL: { r: Range; label: string }[] = [
  { r: '1mo', label: '1개월' },
  { r: '3mo', label: '3개월' },
  { r: '1y', label: '1년' },
];

function fmtDate(dt: string): string {
  // 네이버 datetime: 'YYYYMMDDHHmmss' 또는 ISO. 앞 8자리만 사용.
  const digits = dt.replace(/\D/g, '');
  if (digits.length >= 8) return `${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
  return '';
}

export function SectorModal({ market, name, onClose }: { market: 'kr' | 'us'; name: string; onClose: () => void }) {
  const { state } = useDashboard();
  const [range, setRange] = useState<Range>('3mo');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(false);
    fetch(`/api/sector-detail?market=${market}&name=${encodeURIComponent(name)}&range=${range}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: Detail) => { if (!cancelled) { setDetail(j); setLoading(false); } })
      .catch(() => { if (!cancelled) { setErr(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [market, name, range]);

  const candles = detail?.candles ?? null;
  const last = candles?.[candles.length - 1];
  const prev = candles?.[candles.length - 2];
  const chg = last && prev && prev.c !== 0 ? ((last.c - prev.c) / prev.c) * 100 : null;

  if (typeof document === 'undefined') return null;
  // body로 포털 렌더 — 콘텐츠 래퍼(zIndex:1)에 갇히면 헤더(z40)가 모달 상단을 덮음. 래퍼 밖(body)으로 빼야 z100이 실제 적용.
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100, background: 'var(--c-overlay)',
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
          <span style={{ fontSize: 12, color: 'var(--c-tx6)', whiteSpace: 'nowrap' }}>{detail?.proxy}</span>
          {chg != null && (
            <span style={{ fontSize: 13, fontWeight: 700, color: upColor(chg) }}>{chg > 0 ? '+' : ''}{chg.toFixed(2)}%</span>
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
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '60px 0', justifyContent: 'center', color: 'var(--c-tx4)', fontSize: 14 }}>
              <InlineSpinner /> 불러오는 중…
            </div>
          ) : err || !candles || candles.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--c-tx5)', fontSize: 14 }}>데이터를 불러오지 못했습니다.</div>
          ) : (
            <CandleChart candles={candles} theme={state.theme} fit />
          )}

          {/* 대표 종목 + '왜' 뉴스 */}
          {detail && !loading && !err && (
            <div style={{ marginTop: 22 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--c-tx2)' }}>왜 움직이나 · 관련 뉴스</h4>
                <span style={{ fontSize: 11, color: 'var(--c-tx6)' }}>대표 종목: {detail.leaders.join(' · ')}</span>
              </div>

              {detail.news.length === 0 ? (
                <div style={{ padding: '18px 0', fontSize: 13, color: 'var(--c-tx6)' }}>관련 뉴스를 찾지 못했습니다.</div>
              ) : (
                <div style={{ background: 'var(--c-w03)', border: '1px solid var(--c-w07)', borderRadius: 14, padding: '4px 16px' }}>
                  {detail.news.map((n, i) => (
                    <a
                      key={i}
                      href={n.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'block', padding: '13px 0', borderBottom: i < detail.news.length - 1 ? '1px solid var(--c-w05)' : 'none', textDecoration: 'none' }}
                    >
                      <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.5, color: 'var(--c-tx2)' }}>{n.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginTop: 4 }}>{n.src}{fmtDate(n.datetime) ? ` · ${fmtDate(n.datetime)}` : ''}</div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          <SourceNote
            text="차트 — Yahoo Finance(대표 ETF) · 뉴스 — 네이버 금융(대표 종목 기사). 원인은 추정이 아니라 실제 기사로만 제시합니다."
            style={{ marginTop: 16 }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
