'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { upColor } from '../../lib/format';
import { useDashboard } from '../../store/DashboardContext';
import { CandleChart } from '../CandleChart';
import { SourceNote } from '../SourceNote';
import { InlineSpinner } from '../Footer';
import type { Candle } from '../../types';

// 해외 ETF 소개 페이지 — 국내 유니버스에 없어 K-리서치 상세가 없는 ETF를 ETF답게 보여준다.
//  가격 차트·기간 수익률·52주 범위 + 운용사·보수·순자산·배당 + 실제 구성종목·섹터 비중·개요. 전부 Yahoo 실데이터.
interface EtfProfile {
  symbol: string; name: string | null; currency: string | null;
  price: number | null; changePct: number | null;
  family: string | null; category: string | null; legalType: string | null;
  expenseRatio: number | null; totalAssets: number | null; yield: number | null;
  summary: string | null;
  holdings: { symbol: string | null; name: string | null; weight: number }[];
  sectors: { key: string; weight: number }[];
  returns: { m1: number | null; m3: number | null; ytd: number | null; y1: number | null; y3: number | null; y5: number | null };
  week52High: number | null; week52Low: number | null; volume: number | null; website: string | null;
  candles: Candle[];
}

const RANGES: { key: '1mo' | '3mo' | '1y'; label: string; n: number }[] = [
  { key: '1mo', label: '1개월', n: 22 }, { key: '3mo', label: '3개월', n: 65 }, { key: '1y', label: '1년', n: 9999 },
];

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

const CARD: React.CSSProperties = {
  background: 'var(--c-w04)', border: '1px solid var(--c-w08)', borderRadius: 16,
  backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
};
const FLAT: React.CSSProperties = { background: 'var(--c-w04)', border: '1px solid var(--c-w08)', borderRadius: 12 };

export function EtfDetail({ symbol }: { symbol: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const name = sp.get('name') ?? '';
  const { state: dash } = useDashboard();
  const [profile, setProfile] = useState<EtfProfile | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'none'>('loading');
  const [range, setRange] = useState<'1mo' | '3mo' | '1y'>('3mo');
  // 1년 일봉을 뒤에서 잘라 기간 토글(서버 재요청 없이).
  const rangeCandles = useMemo(() => {
    const cs = profile?.candles ?? [];
    const rn = RANGES.find((r) => r.key === range)?.n ?? 9999;
    return cs.length > rn ? cs.slice(-rn) : cs;
  }, [profile, range]);

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

  const back = (
    <button onClick={() => router.back()} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--c-w05)', border: '1px solid var(--c-w10)', borderRadius: 999, padding: '8px 16px', color: 'var(--c-tx3)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', marginBottom: 18 }}>← 뒤로</button>
  );

  if (state === 'loading') {
    return (
      <div>
        {back}
        <div style={{ ...CARD, padding: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--c-tx5)' }}>
          <InlineSpinner /> ETF 정보 불러오는 중…
        </div>
      </div>
    );
  }
  if (state === 'none' || !profile) {
    return (
      <div>
        {back}
        <div style={{ ...CARD, padding: '56px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, color: 'var(--c-tx3)', marginBottom: 8 }}>{name || symbol}</div>
          <div style={{ fontSize: 14, color: 'var(--c-tx4)', marginBottom: 6 }}>이 종목의 ETF 정보를 찾지 못했어요.</div>
          <div style={{ fontSize: 12.5, color: 'var(--c-tx6)', lineHeight: 1.6 }}>해외 데이터 소스(Yahoo)에서 조회되지 않는 종목입니다.<br />보유·손익은 내자산 목록에서 그대로 확인하실 수 있어요.</div>
        </div>
      </div>
    );
  }

  const stat = (label: string, val: string | null) =>
    val == null ? null : (
      <div style={{ ...FLAT, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-tx1b)' }}>{val}</div>
      </div>
    );

  return (
    <div>
      {back}
      {/* 헤더 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 6, background: 'var(--c-cy16)', color: 'var(--c-accyanbr)' }}>ETF</span>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>{profile.name ?? name}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8, fontSize: 14, color: 'var(--c-tx5)', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: 'var(--c-tx3)' }}>{profile.symbol}</span>
          {profile.price != null && (
            <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-tx1b)' }}>{CUR[profile.currency ?? ''] ?? ''}{profile.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          )}
          {profile.changePct != null && (
            <span style={{ fontSize: 15, fontWeight: 700, color: upColor(profile.changePct) }}>{profile.changePct > 0 ? '+' : ''}{profile.changePct.toFixed(2)}%</span>
          )}
        </div>
      </div>

      {/* 가격 차트 */}
      {profile.candles.length > 1 && (
        <div style={{ ...CARD, padding: '16px 18px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, padding: 3, marginBottom: 10 }}>
            <div style={{ display: 'inline-flex', gap: 4, padding: 3, background: 'var(--c-w04)', border: '1px solid var(--c-w07)', borderRadius: 11 }}>
              {RANGES.map((rr) => (
                <button key={rr.key} onClick={() => setRange(rr.key)} style={{
                  cursor: 'pointer', fontFamily: 'inherit', border: 'none', padding: '6px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                  ...(range === rr.key ? { background: 'var(--c-w08)', color: 'var(--c-tx1c)' } : { background: 'transparent', color: 'var(--c-tx5)' }),
                }}>{rr.label}</button>
              ))}
            </div>
          </div>
          <CandleChart candles={rangeCandles} period="일봉" theme={dash.theme} fit />
        </div>
      )}

      {/* 기간 수익률 — 1개월~1년은 누적, 3·5년은 '연평균(CAGR)'이라 누적 총수익률을 함께 표기(오해 방지) */}
      {(() => {
        const fmtPctSign = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
        const rs: { k: string; v: number | null; yrs?: number }[] = [
          { k: '1개월', v: profile.returns.m1 }, { k: '3개월', v: profile.returns.m3 }, { k: 'YTD', v: profile.returns.ytd },
          { k: '1년', v: profile.returns.y1 }, { k: '3년', v: profile.returns.y3, yrs: 3 }, { k: '5년', v: profile.returns.y5, yrs: 5 },
        ].filter((x) => x.v != null);
        if (!rs.length) return null;
        return (
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>기간 수익률</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 10 }}>
              {rs.map(({ k, v, yrs }) => {
                const cumulative = yrs ? Math.pow(1 + v!, yrs) - 1 : null; // 연평균 → 그 기간 누적
                return (
                  <div key={k} style={{ ...FLAT, padding: '11px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginBottom: 5 }}>{yrs ? `${k} 연평균` : k}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: upColor(v!) }}>{fmtPctSign(v!)}{yrs && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-tx6)' }}>/년</span>}</div>
                    {cumulative != null && <div style={{ fontSize: 10.5, color: 'var(--c-tx6)', marginTop: 3 }}>누적 {fmtPctSign(cumulative)}</div>}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginTop: 7, lineHeight: 1.5 }}>
              1개월~1년은 해당 기간 누적 수익률. <b>3·5년은 연평균(CAGR)</b>이라 그 기간 누적을 아래 함께 표기 — 예: 연 13% × 5년이면 누적 약 +85%. 배당 재투자 포함(Yahoo).
            </div>
          </div>
        );
      })()}

      {/* 52주 범위 */}
      {profile.week52High != null && profile.week52Low != null && profile.price != null && profile.week52High > profile.week52Low && (() => {
        const lo = profile.week52Low!, hi = profile.week52High!, cur = profile.price!;
        const posPct = Math.min(100, Math.max(0, ((cur - lo) / (hi - lo)) * 100));
        const cs = CUR[profile.currency ?? ''] ?? '';
        const f = (v: number) => `${cs}${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
        return (
          <div style={{ ...FLAT, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginBottom: 10 }}>52주 범위</div>
            <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'var(--c-w06)', marginBottom: 8 }}>
              <div style={{ position: 'absolute', top: -3, left: `${posPct}%`, transform: 'translateX(-50%)', width: 12, height: 12, borderRadius: '50%', background: 'var(--c-accyan)', boxShadow: '0 0 8px var(--c-cy45)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--c-tx5)' }}>
              <span>최저 {f(lo)}</span>
              <span style={{ fontWeight: 800, color: 'var(--c-tx1b)' }}>현재 {f(cur)}</span>
              <span>최고 {f(hi)}</span>
            </div>
          </div>
        );
      })()}

      {/* 요약 스탯 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        {stat('운용사', profile.family)}
        {stat('분류', profile.category)}
        {stat('연 보수', pct2(profile.expenseRatio))}
        {stat('순자산(AUM)', fmtAum(profile.totalAssets, profile.currency))}
        {stat('배당수익률', profile.yield != null ? pct2(profile.yield) : null)}
        {stat('거래량', profile.volume != null ? profile.volume.toLocaleString('ko-KR') : null)}
      </div>

      {/* 구성종목 */}
      {profile.holdings.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>구성 종목 <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-tx6)' }}>상위 {Math.min(10, profile.holdings.length)}</span></h2>
          <div style={{ ...CARD, padding: '6px 18px' }}>
            {profile.holdings.slice(0, 10).map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < Math.min(10, profile.holdings.length) - 1 ? '1px solid var(--c-w05)' : 'none' }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--c-tx6)', width: 22, flexShrink: 0 }}>{i + 1}</span>
                <span style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  {h.symbol && <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-tx1b)', whiteSpace: 'nowrap' }}>{h.symbol}</span>}
                  <span style={{ fontSize: 12.5, color: 'var(--c-tx5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
                </span>
                <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 72, height: 6, borderRadius: 3, background: 'var(--c-w06)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.min(100, h.weight * 100 * 4)}%`, background: 'var(--c-accyan)' }} />
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-tx2)', width: 46, textAlign: 'right' }}>{pct1(h.weight)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 섹터 비중 */}
      {profile.sectors.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>섹터 비중</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {profile.sectors.map((s) => (
              <span key={s.key} style={{ fontSize: 13, fontWeight: 600, padding: '8px 13px', borderRadius: 9, background: 'var(--c-w05)', color: 'var(--c-tx3)' }}>
                {SECTOR_KO[s.key] ?? s.key} <b style={{ color: 'var(--c-tx1b)' }}>{pct1(s.weight)}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 개요 */}
      {profile.summary && (
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800 }}>개요</h2>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7, color: 'var(--c-tx4)' }}>{profile.summary}</p>
        </div>
      )}

      {profile.website && (
        <a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 13, fontWeight: 700, color: 'var(--c-accyanbr)', textDecoration: 'none' }}>
          운용사 공식 페이지 →
        </a>
      )}

      <SourceNote text="가격·수익률·구성종목 — Yahoo Finance · 종목명으로 매칭한 해외 상장분 기준(보유하신 상장·통화와 다를 수 있음). 참고용." style={{ marginTop: 16 }} />
    </div>
  );
}
