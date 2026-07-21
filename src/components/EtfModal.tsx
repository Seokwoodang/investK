'use client';

import { useEffect, useState } from 'react';
import { upColor } from '../lib/format';
import { SourceNote } from './SourceNote';
import { InlineSpinner } from './Footer';

// 국내 유니버스에 없는 해외 ETF 보유 종목 → 상세페이지 대신 'ETF 소개' 모달.
//  운용사·추종 분류·보수·순자산·배당 + 실제 구성종목·섹터 비중·개요. 전부 Yahoo 실데이터(추측 없음).
interface EtfProfile {
  symbol: string; name: string | null; currency: string | null;
  price: number | null; changePct: number | null;
  family: string | null; category: string | null; legalType: string | null;
  expenseRatio: number | null; totalAssets: number | null; yield: number | null;
  summary: string | null;
  holdings: { symbol: string | null; name: string | null; weight: number }[];
  sectors: { key: string; weight: number }[];
}

const SECTOR_KO: Record<string, string> = {
  realestate: '부동산', consumer_cyclical: '경기소비재', basic_materials: '소재',
  consumer_defensive: '필수소비재', technology: '기술', communication_services: '커뮤니케이션',
  financial_services: '금융', healthcare: '헬스케어', industrials: '산업재',
  energy: '에너지', utilities: '유틸리티',
};

const CUR: Record<string, string> = { USD: '$', GBP: '£', EUR: '€', JPY: '¥', HKD: 'HK$', KRW: '₩' };

function fmtAum(v: number | null, cur: string | null): string | null {
  if (v == null) return null;
  const s = cur ? CUR[cur] ?? '' : '';
  if (v >= 1e12) return `${s}${(v / 1e12).toFixed(1)}조`;
  if (v >= 1e8) return `${s}${(v / 1e8).toFixed(1)}억`;
  if (v >= 1e4) return `${s}${(v / 1e4).toFixed(0)}만`;
  return `${s}${Math.round(v).toLocaleString()}`;
}
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;
const pct2 = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(2)}%`);

const CARD: React.CSSProperties = { background: 'var(--c-w04)', border: '1px solid var(--c-w08)', borderRadius: 12 };

export function EtfModal({ symbol, name, onClose }: { symbol: string; name: string; onClose: () => void }) {
  const [profile, setProfile] = useState<EtfProfile | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'none'>('loading');

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    const p = new URLSearchParams();
    if (symbol) p.set('symbol', symbol);
    if (name) p.set('name', name);
    fetch(`/api/etf-profile?${p.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: EtfProfile) => { if (!cancelled) { setProfile(j); setState('ok'); } })
      .catch(() => { if (!cancelled) setState('none'); });
    return () => { cancelled = true; };
  }, [symbol, name]);

  const stat = (label: string, val: string | null) =>
    val == null ? null : (
      <div style={{ ...CARD, padding: '12px 14px' }}>
        <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginBottom: 5 }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-tx1b)' }}>{val}</div>
      </div>
    );

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, background: 'var(--c-overlay)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 4vw, 24px)',
        overflow: 'hidden',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 620, maxHeight: 'min(92dvh, 860px)', background: 'var(--c-panel97)',
          border: '1px solid var(--c-w10)', borderRadius: 24, boxShadow: '0 24px 80px var(--c-shadow)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px clamp(16px, 4vw, 26px)', borderBottom: '1px solid var(--c-w08)', flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--c-tx1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.name ?? name}
            </h3>
            <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: 'var(--c-accyanbr)' }}>ETF</span>
              {profile?.symbol && <span>{profile.symbol}</span>}
              {profile?.price != null && (
                <span>{CUR[profile.currency ?? ''] ?? ''}{profile.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  {profile.changePct != null && <span style={{ color: upColor(profile.changePct), marginLeft: 5 }}>{profile.changePct > 0 ? '+' : ''}{profile.changePct.toFixed(2)}%</span>}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', flexShrink: 0, cursor: 'pointer', background: 'var(--c-w06)', border: 'none', borderRadius: 9, width: 32, height: 32, color: 'var(--c-tx3)', fontSize: 18, lineHeight: 1, fontFamily: 'inherit' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '18px clamp(16px, 4vw, 26px) 22px' }}>
          {state === 'loading' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '40px 0', justifyContent: 'center', color: 'var(--c-tx5)', fontSize: 14 }}>
              <InlineSpinner /> ETF 정보 불러오는 중…
            </div>
          ) : state === 'none' || !profile ? (
            <div style={{ padding: '36px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: 'var(--c-tx4)', marginBottom: 6 }}>이 종목의 ETF 정보를 찾지 못했어요.</div>
              <div style={{ fontSize: 12.5, color: 'var(--c-tx6)', lineHeight: 1.6 }}>해외 데이터 소스(Yahoo)에서 조회되지 않는 종목입니다.<br />보유·손익은 위 목록에서 그대로 확인하실 수 있어요.</div>
            </div>
          ) : (
            <>
              {/* 요약 스탯 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
                {stat('운용사', profile.family)}
                {stat('분류', profile.category)}
                {stat('연 보수', pct2(profile.expenseRatio))}
                {stat('순자산(AUM)', fmtAum(profile.totalAssets, profile.currency))}
                {stat('배당수익률', profile.yield != null ? pct2(profile.yield) : null)}
              </div>

              {/* 구성종목 */}
              {profile.holdings.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-tx2)', marginBottom: 10 }}>구성 종목 (상위 {Math.min(10, profile.holdings.length)})</div>
                  <div style={{ ...CARD, padding: '4px 14px' }}>
                    {profile.holdings.slice(0, 10).map((h, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < Math.min(10, profile.holdings.length) - 1 ? '1px solid var(--c-w05)' : 'none' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--c-tx6)', width: 20, flexShrink: 0 }}>{i + 1}</span>
                        <span style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'baseline', gap: 7 }}>
                          {h.symbol && <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-tx1b)', whiteSpace: 'nowrap' }}>{h.symbol}</span>}
                          <span style={{ fontSize: 12, color: 'var(--c-tx5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
                        </span>
                        {/* 비중 막대 */}
                        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 60, height: 6, borderRadius: 3, background: 'var(--c-w06)', overflow: 'hidden' }}>
                            <span style={{ display: 'block', height: '100%', width: `${Math.min(100, h.weight * 100 * 4)}%`, background: 'var(--c-accyan)' }} />
                          </span>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-tx2)', width: 44, textAlign: 'right' }}>{pct1(h.weight)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 섹터 비중 */}
              {profile.sectors.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-tx2)', marginBottom: 10 }}>섹터 비중</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {profile.sectors.map((s) => (
                      <span key={s.key} style={{ fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 8, background: 'var(--c-w05)', color: 'var(--c-tx3)' }}>
                        {SECTOR_KO[s.key] ?? s.key} <b style={{ color: 'var(--c-tx1b)' }}>{pct1(s.weight)}</b>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 개요 */}
              {profile.summary && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-tx2)', marginBottom: 8 }}>개요</div>
                  <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.65, color: 'var(--c-tx4)' }}>{profile.summary}</p>
                </div>
              )}
            </>
          )}

          <SourceNote text="ETF 프로필·구성종목 — Yahoo Finance · 종목명으로 매칭한 해외 상장분 기준(보유하신 상장·통화와 다를 수 있음). 참고용." style={{ marginTop: 14 }} />
        </div>
      </div>
    </div>
  );
}
