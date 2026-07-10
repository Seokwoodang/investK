'use client';

import { useEffect, useRef, useState } from 'react';
import { fmtPct, upColor } from '../../lib/format';
import { useAdmin } from '../DashboardChrome';
import { track } from '../../lib/ga';
import { TermTip } from '../GlossaryTip';
import { InlineSpinner } from '../Footer';
import { SourceNote, UpdateNote } from '../SourceNote';
import type { KanalystData, KanalystNarrative, KMarket } from '../../types';

const CARD: React.CSSProperties = {
  background: 'var(--c-w04)', border: '1px solid var(--c-w08)',
  backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
};

const API = '/api/ai/kanalyst';

// ── 숫자 포맷 ──
const fmtMoney = (v: number | null, market: KMarket): string => {
  if (v == null) return '-';
  if (market === 'us') {
    const a = Math.abs(v);
    if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
    return `$${Math.round(v).toLocaleString()}`;
  }
  // KR: 억원 단위 입력
  const a = Math.abs(v);
  if (a >= 10000) return `${(v / 10000).toFixed(1)}조`;
  return `${Math.round(v).toLocaleString()}억`;
};
const mult = (v: number | null) => (v == null ? '-' : `${v.toFixed(1)}배`);
const pctv = (v: number | null, digits = 1) => (v == null ? '-' : `${v.toFixed(digits)}%`);
const fmtEps = (v: number | null, market: KMarket) => (v == null ? '-' : market === 'us' ? `$${v.toFixed(2)}` : `${Math.round(v).toLocaleString()}원`);
const fmtPx = (v: number | null, cur: string) => (v == null ? '-' : cur === '$' ? `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : `${Math.round(v).toLocaleString()}원`);

const TONE: Record<'pos' | 'neu' | 'neg', { color: string; bg: string; border: string }> = {
  pos: { color: 'var(--c-upbr)', bg: 'var(--c-gn06)', border: 'var(--c-gn20)' },
  neu: { color: 'var(--c-warn)', bg: 'var(--c-am06)', border: 'var(--c-am20)' },
  neg: { color: 'var(--c-downbr)', bg: 'var(--c-rd06)', border: 'var(--c-rd20)' },
};

function SectionHead({ children, tip }: { children: React.ReactNode; tip?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 14px' }}>
      <span style={{ width: 3, height: 15, borderRadius: 2, background: 'var(--c-accyan)' }} />
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--c-tx1)' }}>{children}</h3>
      {tip && <span style={{ fontSize: 12, color: 'var(--c-tx6)' }}>{tip}</span>}
    </div>
  );
}

function Metric({ label, value, term, accent, tipAlign }: { label: string; value: string; term?: string; accent?: string; tipAlign?: 'left' | 'right' }) {
  return (
    <div style={{ background: 'var(--c-w03)', border: '1px solid var(--c-w07)', borderRadius: 14, padding: '14px 16px' }}>
      {/* 툴팁은 위로 열어 다음 섹션 카드에 덮이지 않게 하고, 우측 셀은 오른쪽 정렬로 화면 밖 넘침 방지 */}
      <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 6 }}>{term ? <TermTip term={term} up align={tipAlign}>{label}</TermTip> : label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', color: accent ?? 'var(--c-tx1)' }}>{value}</div>
    </div>
  );
}

// ── 실적 추세 막대(매출·순이익, 0 기준선) ──
function TrendBars({ data, market }: { data: KanalystData['trend']; market: KMarket }) {
  const years = data.filter((y) => y.revenue != null || y.netIncome != null);
  if (years.length < 2) return null;
  const maxAbs = Math.max(1, ...years.flatMap((y) => [Math.abs(y.revenue ?? 0), Math.abs(y.netIncome ?? 0)]));
  const bar = (v: number | null, color: string) => {
    if (v == null) return <div style={{ flex: 1 }} />;
    const h = (Math.abs(v) / maxAbs) * 100;
    const neg = v < 0;
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', height: '100%' }}>
        <div style={{ width: '78%', maxWidth: 26, height: `${Math.max(2, h)}%`, borderRadius: '4px 4px 0 0', background: neg ? 'var(--c-down)' : color }} />
      </div>
    );
  };
  return (
    <div>
      {/* 순이익은 앰버 — 매출(시안)과 같은 한색 계열(파랑)이라 구분이 어려웠던 문제를 난색/한색 대비로 해결 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12, color: 'var(--c-tx5)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--c-accyan)' }} />매출</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--c-warn)' }} />순이익 <span style={{ color: 'var(--c-tx6)' }}>(적자는 빨강)</span></span>
        <span style={{ marginLeft: 'auto', color: 'var(--c-tx6)' }}>단위: {market === 'us' ? 'USD' : '원'}</span>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
        {years.map((y) => (
          <div key={y.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 3, height: 130, alignItems: 'flex-end' }}>
              {bar(y.revenue, 'var(--c-accyan)')}
              {bar(y.netIncome, 'var(--c-warn)')}
            </div>
            <div style={{ borderTop: '1px solid var(--c-w08)', marginTop: 6, paddingTop: 6, textAlign: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-tx3)' }}>{y.year}</div>
              <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginTop: 2, lineHeight: 1.4 }}>
                {fmtMoney(y.revenue, market)}
                <br />
                <span style={{ color: (y.netIncome ?? 0) < 0 ? 'var(--c-down)' : 'var(--c-tx5)' }}>{fmtMoney(y.netIncome, market)}</span>
                {y.netMargin != null && <><br /><span style={{ color: 'var(--c-tx6)' }}>이익률 {y.netMargin.toFixed(0)}%</span></>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 목표가 게이지(현재가·컨센서스 목표가, 있으면 최저~최고 범위) ──
function TargetGauge({ price, target, low, high, cur }: { price: number | null; target: number | null; low: number | null; high: number | null; cur: string }) {
  if (price == null || target == null) return null;
  const lo = Math.min(low ?? target, price) * 0.97;
  const hi = Math.max(high ?? target, price) * 1.03;
  const span = hi - lo || 1;
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / span) * 100))}%`;
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ position: 'relative', height: 8, borderRadius: 999, background: 'linear-gradient(90deg, var(--c-rd22), var(--c-w10), var(--c-gn22))', marginBottom: 34, marginTop: 26 }}>
        {low != null && high != null && (
          <div style={{ position: 'absolute', left: pos(low), right: `calc(100% - ${pos(high)})`, top: -3, height: 14, background: 'var(--c-cy10)', borderRadius: 4 }} />
        )}
        {/* 현재가 */}
        <div style={{ position: 'absolute', left: pos(price), top: -26, transform: 'translateX(-50%)', textAlign: 'center', whiteSpace: 'nowrap' }}>
          <div style={{ fontSize: 10, color: 'var(--c-tx5)' }}>현재가</div>
          <div style={{ width: 2, height: 16, background: 'var(--c-tx3)', margin: '2px auto 0' }} />
        </div>
        {/* 목표가 */}
        <div style={{ position: 'absolute', left: pos(target), top: 10, transform: 'translateX(-50%)', textAlign: 'center', whiteSpace: 'nowrap' }}>
          <div style={{ width: 2, height: 16, background: 'var(--c-accyan)', margin: '0 auto 2px' }} />
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-accyanbr)' }}>목표 {fmtPx(target, cur)}</div>
        </div>
      </div>
    </div>
  );
}

// ── 애널리스트 추천 분포 도넛 ──
const DIST_SEG = [
  { key: 'strongBuy', label: '적극매수', color: 'var(--c-up)' },
  { key: 'buy', label: '매수', color: 'var(--c-upbr)' },
  { key: 'hold', label: '중립', color: 'var(--c-warn)' },
  { key: 'sell', label: '매도', color: 'var(--c-downbr)' },
  { key: 'strongSell', label: '적극매도', color: 'var(--c-down)' },
] as const;

// recommMean(1 적극매수 ~ 5 적극매도) 구간 라벨.
function recommLabel(m: number): string {
  if (m <= 1.5) return '적극 매수';
  if (m <= 2.5) return '매수';
  if (m <= 3.5) return '중립';
  if (m <= 4.5) return '매도';
  return '적극 매도';
}

function DistDonut({ dist, recommMean }: { dist: NonNullable<KanalystData['dist']>; recommMean: number | null }) {
  const total = DIST_SEG.reduce((s, seg) => s + dist[seg.key], 0);
  if (total === 0) return null;
  const R = 42, C = 2 * Math.PI * R;
  let acc = 0;
  const buyCnt = dist.strongBuy + dist.buy;
  const buyPct = Math.round((buyCnt / total) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
      <svg width="110" height="110" viewBox="0 0 110 110" style={{ flexShrink: 0 }}>
        <g transform="rotate(-90 55 55)">
          {DIST_SEG.map((seg) => {
            const v = dist[seg.key];
            const len = (v / total) * C;
            const el = (
              <circle key={seg.key} cx="55" cy="55" r={R} fill="none" stroke={seg.color} strokeWidth="14"
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} />
            );
            acc += len;
            return el;
          })}
        </g>
        <text x="55" y="51" textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--c-tx1)">{total}</text>
        <text x="55" y="66" textAnchor="middle" fontSize="10" fill="var(--c-tx6)">애널리스트</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 130 }}>
        {DIST_SEG.filter((s) => dist[s.key] > 0).map((seg) => (
          <div key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: seg.color }} />
            <span style={{ color: 'var(--c-tx4)' }}>{seg.label}</span>
            <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--c-tx2)' }}>{dist[seg.key]}</span>
          </div>
        ))}
      </div>
      {/* 우측: 같은 데이터를 한눈에 요약(매수 우위 비율 바 + 컨센서스 등급 위치) — 추가 데이터 아님 */}
      <div style={{ flex: '1 1 260px', minWidth: 240, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--c-tx5)' }}>매수 의견 비중</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: buyPct >= 50 ? 'var(--c-upbr)' : 'var(--c-tx1)' }}>{buyPct}%</span>
            <span style={{ fontSize: 11, color: 'var(--c-tx6)' }}>({buyCnt}/{total}명이 매수 이상)</span>
          </div>
          {/* 분포 스택 바 — 도넛과 동일 데이터의 가로 표현 */}
          <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--c-w06)' }}>
            {DIST_SEG.filter((s) => dist[s.key] > 0).map((seg) => (
              <div key={seg.key} style={{ width: `${(dist[seg.key] / total) * 100}%`, background: seg.color }} />
            ))}
          </div>
        </div>
        {recommMean != null && (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--c-tx5)' }}>컨센서스 등급</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-tx1)' }}>{recommMean.toFixed(2)}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: recommMean <= 2.5 ? 'var(--c-upbr)' : recommMean >= 3.5 ? 'var(--c-downbr)' : 'var(--c-warn)' }}>{recommLabel(recommMean)}</span>
            </div>
            {/* 1(적극매수) ~ 5(적극매도) 스케일에 현재 평균 위치 표시 */}
            <div style={{ position: 'relative', height: 8, borderRadius: 999, background: 'linear-gradient(90deg, var(--c-gn50), var(--c-w10), var(--c-rd50))' }}>
              <div style={{ position: 'absolute', left: `${((Math.min(5, Math.max(1, recommMean)) - 1) / 4) * 100}%`, top: -3, transform: 'translateX(-50%)', width: 3, height: 14, borderRadius: 2, background: 'var(--c-tx1)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--c-tx6)', marginTop: 5 }}>
              <span>1 적극매수</span><span>3 중립</span><span>5 적극매도</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface Props { code: string; market: KMarket; name: string; ticker: string; cur: string; price?: number }

export function Kanalyst({ code, market, name, ticker, cur, price }: Props) {
  const isAdmin = useAdmin(); // '다시 분석'(강제 재생성=비용)은 관리자만
  const [data, setData] = useState<KanalystData | null>(null);
  const [narrative, setNarrative] = useState<KanalystNarrative | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [genLoading, setGenLoading] = useState(false);

  // 실시간 시세 틱마다 price prop이 바뀌므로, 요청에는 ref로 고정한 최신값만 쓰고
  // 의존성에서는 뺀다(틱마다 리포트 전체를 다시 불러오는 것 방지). 화면 표시는 prop으로 실시간.
  const priceRef = useRef(price);
  priceRef.current = price;

  useEffect(() => {
    let cancelled = false;
    setData(null); setNarrative(null); setPhase('loading'); setGenLoading(true);
    const body = { code, market, name, ticker, price: priceRef.current };
    // 1차: 숫자·차트만 즉시
    fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, narrative: false }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => { if (!cancelled) { setData(j.data); setPhase('ready'); } })
      .catch(() => { if (!cancelled) setPhase((p) => (p === 'loading' ? 'error' : p)); });
    // 2차: AI 서술(지문 캐시 히트면 즉시, 아니면 생성)
    fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.data) return;
        setData(j.data);
        setPhase('ready'); // 1차가 실패했어도 2차가 성공하면 리포트 표시
        if (j.narrative) setNarrative(j.narrative);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setGenLoading(false); });
    return () => { cancelled = true; };
  }, [code, market, name, ticker]);

  const regenerate = () => {
    track('ai_kanalyst_regen', { market, ticker });
    setGenLoading(true); setNarrative(null);
    fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, market, name, ticker, price, force: true }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.narrative) setNarrative(j.narrative); })
      .catch(() => {})
      .finally(() => setGenLoading(false));
  };

  if (phase === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '48px 24px', borderRadius: 20, border: '1px solid var(--c-w08)', background: 'var(--c-w03)', color: 'var(--c-tx4)', fontSize: 14 }}>
        <InlineSpinner /> 리서치 자료를 불러오는 중입니다…
      </div>
    );
  }
  if (phase === 'error' || !data) {
    return (
      <div style={{ padding: '40px 24px', borderRadius: 20, border: '1px solid var(--c-w08)', background: 'var(--c-w03)', color: 'var(--c-tx5)', fontSize: 14, lineHeight: 1.7 }}>
        이 종목은 리서치 데이터를 제공하지 않습니다.<br />
        <span style={{ fontSize: 13, color: 'var(--c-tx6)' }}>재무·컨센서스 데이터가 있는 국내·미국 상장 종목에서 제공됩니다.</span>
      </div>
    );
  }

  const tone = TONE[data.verdict.tone];
  const livePrice = price ?? data.price;
  const liveUpside = data.target != null && livePrice != null && livePrice > 0 ? (data.target / livePrice - 1) * 100 : data.upside;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* 1) 투자의견 헤드라인 */}
      <div style={{ ...CARD, borderRadius: 22, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '4px 10px', borderRadius: 7, background: 'var(--c-cy18)', color: 'var(--c-accyanbr)' }}>K-리서치</span>
          {data.sector && <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'var(--c-w06)', color: 'var(--c-tx4)' }}>{data.sector}</span>}
          {data.industry && <span style={{ fontSize: 12, color: 'var(--c-tx6)' }}>{data.industry}</span>}
          {data.marketCapText && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--c-tx6)' }}>시총 {data.marketCapText}</span>}
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'stretch' }}>
          {/* 판정 */}
          <div style={{ flex: '1 1 200px', minWidth: 200, background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 18, padding: '18px 20px' }}>
            <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 6 }}>종합 <TermTip term="투자의견">투자의견</TermTip> <span style={{ color: 'var(--c-tx6)' }}>(규칙 판정)</span></div>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', color: tone.color, marginBottom: 10 }}>{data.verdict.label}</div>
            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {data.verdict.reasons.map((r, i) => (
                <li key={i} style={{ fontSize: 12.5, color: 'var(--c-tx4)', lineHeight: 1.5 }}>{r}</li>
              ))}
            </ul>
          </div>
          {/* 목표가/상승여력 */}
          <div style={{ flex: '1 1 220px', minWidth: 200, display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 4 }}><TermTip term="목표주가">컨센서스 목표가</TermTip></div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-tx1)' }}>{fmtPx(data.target, cur)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 4 }}><TermTip term="상승여력">상승여력</TermTip></div>
                <div style={{ fontSize: 22, fontWeight: 800, color: upColor(liveUpside ?? 0) }}>{liveUpside == null ? '-' : fmtPct(liveUpside)}</div>
              </div>
              {data.recommMean != null && (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 4 }}><TermTip term="투자의견">애널리스트 의견</TermTip></div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    {/* 단어(매수/매도)를 앞세워 방향을 즉시 알게 — 숫자만 '1.64/5'면 낮은 점수처럼 오독됨. 1=적극매수라 낮을수록 매수. */}
                    <span style={{ fontSize: 22, fontWeight: 800, color: data.recommMean <= 2.5 ? 'var(--c-upbr)' : data.recommMean >= 3.5 ? 'var(--c-downbr)' : 'var(--c-warn)' }}>{recommLabel(data.recommMean)}</span>
                    <span style={{ fontSize: 12, color: 'var(--c-tx6)', fontWeight: 600 }}>{data.recommMean.toFixed(2)}/5{data.numAnalysts ? ` · ${data.numAnalysts}명` : ''}</span>
                  </div>
                </div>
              )}
            </div>
            <TargetGauge price={livePrice} target={data.target} low={data.targetLow} high={data.targetHigh} cur={cur} />
          </div>
        </div>
      </div>

      {/* 2) 밸류에이션 */}
      <div style={{ ...CARD, borderRadius: 20, padding: 22 }}>
        <SectionHead tip="주가가 이익·자산 대비 싼지">밸류에이션</SectionHead>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          <Metric label="PER" term="PER" value={mult(data.per)} />
          <Metric label="선행 PER" term="추정PER" value={mult(data.fwdPer)} />
          <Metric label="PBR" term="PBR" value={mult(data.pbr)} />
          {data.pegRatio != null && <Metric label="PEG" term="PEG" value={data.pegRatio.toFixed(2)} />}
          {data.evToEbitda != null && <Metric label="EV/EBITDA" term="EV/EBITDA" value={mult(data.evToEbitda)} />}
          <Metric label="배당수익률" term="배당수익률" value={pctv(data.divYield, 2)} tipAlign="right" />
        </div>
      </div>

      {/* 3) 실적 추세 */}
      {data.trend.length >= 2 && (
        <div style={{ ...CARD, borderRadius: 20, padding: 22 }}>
          <SectionHead tip={`최근 ${data.trend.length}개 회계연도`}>실적 추세</SectionHead>
          <TrendBars data={data.trend} market={market} />
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 16, fontSize: 13, color: 'var(--c-tx4)' }}>
            {data.revenueGrowth != null && <span>매출성장 <b style={{ color: upColor(data.revenueGrowth) }}>{fmtPct(data.revenueGrowth)}</b></span>}
            {data.earningsGrowth != null && <span>이익성장 <b style={{ color: upColor(data.earningsGrowth) }}>{fmtPct(data.earningsGrowth)}</b></span>}
            {data.fwdEpsGrowth != null && <span>내년 EPS 추정성장 <b style={{ color: upColor(data.fwdEpsGrowth) }}>{fmtPct(data.fwdEpsGrowth)}</b></span>}
          </div>
        </div>
      )}

      {/* 4) 수익성·건전성 */}
      <div style={{ ...CARD, borderRadius: 20, padding: 22 }}>
        <SectionHead tip="얼마나 잘 벌고 튼튼한지">수익성 · 재무 건전성</SectionHead>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          <Metric label="ROE" term="ROE" value={pctv(data.roe)} accent={data.roe != null && data.roe >= 15 ? 'var(--c-upbr)' : undefined} />
          <Metric label="순이익률" term="순이익률" value={pctv(data.netMargin)} />
          <Metric label={market === 'us' ? '부채/자본' : '부채비율'} term="부채비율" value={pctv(data.debtRatio, 0)} accent={data.debtRatio != null && data.debtRatio > 200 ? 'var(--c-downbr)' : undefined} />
          {data.currentRatio != null && <Metric label="유동비율" term="유동비율" value={data.currentRatio.toFixed(2)} />}
          <Metric label="EPS(최근 연도)" term="EPS" value={fmtEps(data.trend[data.trend.length - 1]?.eps ?? null, market)} tipAlign={market === 'us' ? undefined : 'right'} />
          {market === 'us' && <Metric label="자유현금흐름" term="자유현금흐름" value={fmtMoney(data.trend[data.trend.length - 1]?.fcf ?? null, market)} tipAlign="right" />}
        </div>
      </div>

      {/* 5) 컨센서스 분포(미국) */}
      {data.dist && (data.dist.strongBuy + data.dist.buy + data.dist.hold + data.dist.sell + data.dist.strongSell) > 0 && (
        <div style={{ ...CARD, borderRadius: 20, padding: 22 }}>
          {/* numAnalysts(목표가 제시 인원)와 추천분포 합계는 모집단이 달라 다를 수 있음 — 도넛 중앙 합계만 표시해 혼동 방지 */}
          <SectionHead tip="최근 투자의견 제출 기준">애널리스트 추천 분포</SectionHead>
          <DistDonut dist={data.dist} recommMean={data.recommMean} />
        </div>
      )}

      {/* 6) AI 애널리스트 의견 */}
      <div style={{ background: 'linear-gradient(135deg, var(--c-cy07), var(--c-bl05))', border: '1px solid var(--c-cy18)', borderRadius: 22, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 6, background: 'var(--c-cy18)', color: 'var(--c-accyanbr)' }}>AI 애널리스트 의견</span>
          <span style={{ fontSize: 12, color: 'var(--c-tx6)' }}>위 실제 수치를 Claude가 해석·서술</span>
          {isAdmin && (
            <button onClick={regenerate} disabled={genLoading} style={{ marginLeft: 'auto', cursor: genLoading ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--c-w10)', background: 'var(--c-w05)', color: 'var(--c-tx4)', opacity: genLoading ? 0.5 : 1 }}>다시 분석</button>
          )}
        </div>

        {genLoading && !narrative ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 4px', color: 'var(--c-tx4)', fontSize: 14 }}>
            <InlineSpinner /> AI가 이 종목을 분석하는 중입니다… (처음엔 몇 초, 이후엔 저장된 결과를 바로 보여줍니다)
          </div>
        ) : narrative ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.75, color: 'var(--c-tx1b)', fontWeight: 500 }}>{narrative.thesis}</p>
            {narrative.business && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: 'var(--c-tx3)' }}>{narrative.business}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              {[
                { title: '투자 포인트', color: 'var(--c-up)', items: narrative.bull },
                { title: '리스크', color: 'var(--c-down)', items: narrative.bear },
              ].map((col) => col.items?.length ? (
                <div key={col.title} style={{ background: 'var(--c-w04)', border: '1px solid var(--c-w08)', borderRadius: 16, padding: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: col.color, marginBottom: 12 }}>{col.title}</div>
                  <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {col.items.map((it, i) => <li key={i} style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--c-tx3)' }}>{it}</li>)}
                  </ul>
                </div>
              ) : null)}
            </div>
            {narrative.valuation && (
              <div style={{ background: 'var(--c-w04)', border: '1px solid var(--c-w08)', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-accyanbr)', marginBottom: 8 }}>밸류에이션 코멘트</div>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: 'var(--c-tx3)' }}>{narrative.valuation}</p>
              </div>
            )}
            {narrative.catalyst?.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-tx4)', marginBottom: 8 }}>관전 포인트 · 촉매</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {narrative.catalyst.map((c, i) => (
                    <span key={i} style={{ fontSize: 13, padding: '7px 12px', borderRadius: 10, background: 'var(--c-cy08)', border: '1px solid var(--c-cy16)', color: 'var(--c-tx3)' }}>{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: 'var(--c-tx4)' }}>
            AI 서술은 아직 준비되지 않았습니다. 위의 숫자·차트는 모두 실제 데이터입니다.{isAdmin ? ' ‘다시 분석’으로 서술을 생성할 수 있습니다.' : ''}
          </p>
        )}
      </div>

      <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--c-tx6)', padding: '4px 2px' }}>
        ⚠ 본 리포트는 공개 데이터를 자동 정리하고 AI가 해석한 참고자료로, 실제 증권사 리서치나 투자 자문이 아닙니다. 투자 판단과 책임은 본인에게 있습니다.
      </div>
      <UpdateNote text="컨센서스·재무 지표 약 1시간 캐시(미국 공시 재무는 하루) · 목표가/상승여력은 현재가로 실시간 계산 · AI 서술은 실적·투자의견이 바뀔 때만 재생성(지문 캐시)" />
      <SourceNote text={`출처 — ${data.sources.join(' · ')} · AI 서술: Claude (Anthropic)`} />
    </div>
  );
}
