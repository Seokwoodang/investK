'use client';

import { useMemo, useState } from 'react';
import { UpdateNote, SourceNote } from '../SourceNote';
import { InlineSpinner } from '../Footer';

// 가격 기반 백테스트 화면(1단계). 저장된 국내주식 종가(kr_prices)로 모멘텀·이평추세·로우볼 전략을
// 유니버스 동일비중 매수후보유(벤치마크)와 비교한다. look-ahead 없음 · 종가체결 · 거래비용 반영.

const CARD: React.CSSProperties = {
  background: 'var(--c-w04)', border: '1px solid var(--c-w08)',
  borderRadius: 20, backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
};

type StrategyId = 'momentum' | 'ma_trend' | 'low_vol' | 'buy_hold';

const STRATS: { id: StrategyId; label: string; desc: string; uses: ('lookback' | 'ma' | 'topN')[] }[] = [
  { id: 'momentum', label: '모멘텀', desc: '최근 룩백 수익률 상위 종목을 동일비중 보유(추세추종)', uses: ['lookback', 'topN'] },
  { id: 'ma_trend', label: '이동평균 추세', desc: '종가가 N일 이평선 위인 종목만 보유(추세 상단)', uses: ['ma', 'topN'] },
  { id: 'low_vol', label: '로우볼(저변동성)', desc: '최근 변동성이 가장 낮은 종목을 동일비중 보유', uses: ['lookback', 'topN'] },
  { id: 'buy_hold', label: '전체 매수 후 보유', desc: '유니버스 전체를 동일비중으로 한 번 사서 보유', uses: [] },
];

interface EquityPoint { d: string; v: number; bench: number }
interface Metrics { totalReturn: number; cagr: number; mdd: number; vol: number; sharpe: number; winRateM: number; turnover: number; days: number }
interface Result {
  config: { from: string; to: string; strategy: StrategyId };
  equity: EquityPoint[];
  metrics: Metrics;
  benchMetrics: Metrics;
  rebalances: { d: string; picks: { code: string; name: string }[] }[];
  universeUsed: number;
  notes: string[];
}

const pct = (v: number) => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
const won = (v: number) => '₩' + Math.round(v).toLocaleString('ko-KR');
const upc = (v: number) => (v > 0 ? 'var(--c-up)' : v < 0 ? 'var(--c-down)' : 'var(--c-tx4)');

// ── 전략 vs 벤치마크 2선 차트 (로그 스케일 — 배수 성장을 균형 있게 표시) ──
function EquityChart({ pts, startCapital }: { pts: EquityPoint[]; startCapital: number }) {
  const W = 720, H = 240, padL = 8, padR = 8, padT = 14, padB = 24;
  const g = useMemo(() => {
    if (pts.length < 2) return null;
    // 다운샘플: 점이 많으면(수천) SVG가 무거워 렌더가 버벅임 → ~400점으로 솎되 첫·끝은 유지.
    const MAX = 400;
    const step = Math.max(1, Math.ceil(pts.length / MAX));
    const ds = pts.filter((_, i) => i % step === 0);
    if (ds[ds.length - 1] !== pts[pts.length - 1]) ds.push(pts[pts.length - 1]);
    const all = ds.flatMap((p) => [p.v, p.bench]).filter((v) => v > 0);
    const lo = Math.max(1, Math.min(startCapital, ...all)), hi = Math.max(startCapital, ...all);
    const lLo = Math.log(lo), lSpan = Math.log(hi) - lLo || 1;
    const iw = W - padL - padR, ih = H - padT - padB, n = ds.length;
    const x = (i: number) => padL + (i / (n - 1)) * iw;
    const y = (v: number) => padT + (1 - (Math.log(Math.max(1, v)) - lLo) / lSpan) * ih;
    const path = (key: 'v' | 'bench') => 'M' + ds.map((p, i) => `${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' L');
    const area = 'M' + `${x(0).toFixed(1)},${y(ds[0].v).toFixed(1)} L` + ds.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' L') + ` L${x(n - 1).toFixed(1)},${(padT + ih).toFixed(1)} L${x(0).toFixed(1)},${(padT + ih).toFixed(1)} Z`;
    return { line: path('v'), bench: path('bench'), area, seedY: y(startCapital), ih };
  }, [pts, startCapital]);
  if (!g) return null;
  const stratUp = pts[pts.length - 1].v >= startCapital;
  const col = stratUp ? 'var(--c-up)' : 'var(--c-down)';
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="btArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={col} stopOpacity="0.22" />
            <stop offset="1" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={padL} y1={g.seedY} x2={W - padR} y2={g.seedY} stroke="var(--c-w12)" strokeWidth="1" strokeDasharray="4 4" />
        <path d={g.area} fill="url(#btArea)" />
        <path d={g.bench} fill="none" stroke="var(--c-tx6)" strokeWidth="1.6" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        <path d={g.line} fill="none" stroke={col} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--c-tx6)' }}>
        <span>{pts[0].d}</span>
        <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ color: col, fontWeight: 700 }}>— 전략</span>
          <span>--- 벤치마크</span>
          <span>로그 스케일</span>
        </span>
        <span>{pts[pts.length - 1].d}</span>
      </div>
    </div>
  );
}

// 지표 카드는 개수가 많아 backdrop-filter(블러)를 빼 스크롤 페인트를 가볍게 유지.
const FLAT_CARD: React.CSSProperties = { background: 'var(--c-w04)', border: '1px solid var(--c-w08)', borderRadius: 20 };

function MetricCell({ label, s, b, fmt, better = 'high', noBench = false }: { label: string; s: number; b: number; fmt: (v: number) => string; better?: 'high' | 'low' | 'none'; noBench?: boolean }) {
  const win = better === 'none' ? 0 : better === 'high' ? Math.sign(s - b) : Math.sign(b - s);
  return (
    <div style={{ ...FLAT_CARD, padding: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--c-tx5)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: better === 'none' ? 'var(--c-tx1)' : win > 0 ? 'var(--c-up)' : win < 0 ? 'var(--c-down)' : 'var(--c-tx1)' }}>{fmt(s)}</div>
      <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginTop: 4 }}>{noBench ? ' ' : `벤치 ${fmt(b)}`}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--c-w05)', border: '1px solid var(--c-w10)', borderRadius: 9, color: 'var(--c-tx2)',
  fontSize: 13, fontFamily: 'inherit', padding: '8px 10px', width: '100%',
};
const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--c-tx5)', marginBottom: 6, display: 'block', fontWeight: 600 };

export function Backtest() {
  const [strategy, setStrategy] = useState<StrategyId>('momentum');
  const [topN, setTopN] = useState(20);
  const [lookbackDays, setLookbackDays] = useState(120);
  const [maWindow, setMaWindow] = useState(120);
  const [rebalance, setRebalance] = useState<'M' | 'Q'>('Q');
  const [costBps, setCostBps] = useState(20);
  const [years, setYears] = useState(10);
  const startCapital = 10_000_000;

  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const meta = STRATS.find((s) => s.id === strategy)!;

  const run = async () => {
    setLoading(true); setErr(null);
    const now = new Date();
    const from = new Date(now); from.setFullYear(now.getFullYear() - years);
    const body = {
      strategy, topN, lookbackDays, maWindow, rebalance, costBps, startCapital, universeN: 200,
      from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10),
    };
    try {
      const r = await fetch('/api/backtest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { setErr(j?.error ?? '실행 실패'); setResult(null); }
      else setResult(j as Result);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };

  const lastReb = result?.rebalances?.[result.rebalances.length - 1];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>백테스트</h1>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '4px 10px', borderRadius: 6, background: 'var(--c-cy16)', color: 'var(--c-accyanbr)' }}>실험실 · 가격 기반</span>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-tx5)' }}>과거 종가로 규칙 기반 전략의 성과를 검증합니다. KOSPI 시총 상위 200 · 최근 10년.</p>
        <UpdateNote text="look-ahead 없음 · 종가-종가 체결 · 거래비용 반영 · 투자 권유 아님(교육용)" style={{ marginTop: 8 }} />
      </div>

      {/* 설정 */}
      <div style={{ ...CARD, padding: 22, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-accyan)', marginBottom: 14 }}>전략 설정</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {STRATS.map((s) => (
            <button key={s.id} onClick={() => setStrategy(s.id)} style={{
              cursor: 'pointer', border: `1px solid ${strategy === s.id ? 'var(--c-cy40)' : 'var(--c-w10)'}`, fontFamily: 'inherit',
              background: strategy === s.id ? 'var(--c-cy16)' : 'transparent', color: strategy === s.id ? 'var(--c-accyanbr)' : 'var(--c-tx4)',
              padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            }}>{s.label}</button>
          ))}
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--c-tx5)', lineHeight: 1.5 }}>{meta.desc}</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
          {meta.uses.includes('topN') && (
            <label><span style={labelStyle}>보유 종목 수</span>
              <input type="number" min={1} max={50} value={topN} onChange={(e) => setTopN(+e.target.value)} style={inputStyle} /></label>
          )}
          {meta.uses.includes('lookback') && (
            <label><span style={labelStyle}>룩백(거래일)</span>
              <input type="number" min={20} max={500} value={lookbackDays} onChange={(e) => setLookbackDays(+e.target.value)} style={inputStyle} /></label>
          )}
          {meta.uses.includes('ma') && (
            <label><span style={labelStyle}>이평 기간(거래일)</span>
              <input type="number" min={20} max={300} value={maWindow} onChange={(e) => setMaWindow(+e.target.value)} style={inputStyle} /></label>
          )}
          {strategy !== 'buy_hold' && (
            <label><span style={labelStyle}>리밸런싱</span>
              <select value={rebalance} onChange={(e) => setRebalance(e.target.value as 'M' | 'Q')} style={inputStyle}>
                <option value="M">매월</option><option value="Q">분기</option>
              </select></label>
          )}
          <label><span style={labelStyle}>거래비용(편도 bps)</span>
            <input type="number" min={0} max={100} value={costBps} onChange={(e) => setCostBps(+e.target.value)} style={inputStyle} /></label>
          <label><span style={labelStyle}>기간(년)</span>
            <select value={years} onChange={(e) => setYears(+e.target.value)} style={inputStyle}>
              {[3, 5, 7, 10].map((y) => <option key={y} value={y}>{y}년</option>)}
            </select></label>
        </div>

        <button onClick={run} disabled={loading} style={{
          marginTop: 18, width: '100%', cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit',
          background: loading ? 'var(--c-w08)' : 'var(--c-accyan)', color: loading ? 'var(--c-tx5)' : '#04121a',
          border: 'none', borderRadius: 12, padding: '13px 0', fontSize: 15, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {loading ? <><InlineSpinner size={14} />백테스트 실행 중…</> : '백테스트 실행'}
        </button>
        {err && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--c-down)', lineHeight: 1.5 }}>⚠ {err}</div>}
      </div>

      {/* 결과 */}
      {result && (
        <>
          {/* 생존편향 경고 — 절대수익률이 부풀려짐. 알파(벤치 대비)로 해석하도록 최상단에 크게. */}
          <div style={{ background: 'var(--c-am16)', border: '1px solid var(--c-warn)', borderRadius: 16, padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-warnchip)', marginBottom: 6 }}>⚠ 절대수익률은 생존편향으로 부풀려져 있습니다</div>
            <div style={{ fontSize: 12.5, color: 'var(--c-tx3)', lineHeight: 1.6 }}>
              유니버스가 <b>현재</b> KOSPI 상위 종목이라, 과거에 그걸 샀다는 건 이미 오늘의 승자를 미리 안 셈입니다(과거 상폐·부진 종목 제외).
              그래서 <b>총수익·CAGR 같은 절대 숫자는 실제보다 높게 나옵니다.</b> 전략과 벤치마크는 같은 유니버스를 쓰므로,
              의미 있는 신호는 <b>벤치마크 대비 초과성과(알파)</b>입니다 — 아래 지표에서 벤치와의 차이를 보세요.
            </div>
          </div>
          <div style={{ ...CARD, padding: 22, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-accyan)' }}>자산 곡선 (원금 {won(startCapital)})</div>
              <div style={{ fontSize: 12, color: 'var(--c-tx6)' }}>{result.config.from} ~ {result.config.to} · 후보 {result.universeUsed}종목</div>
            </div>
            <EquityChart pts={result.equity} startCapital={startCapital} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
            <MetricCell label="총수익률" s={result.metrics.totalReturn} b={result.benchMetrics.totalReturn} fmt={pct} />
            <MetricCell label="연복리(CAGR)" s={result.metrics.cagr} b={result.benchMetrics.cagr} fmt={pct} />
            <MetricCell label="최대낙폭(MDD)" s={result.metrics.mdd} b={result.benchMetrics.mdd} fmt={pct} better="high" />
            <MetricCell label="샤프비율" s={result.metrics.sharpe} b={result.benchMetrics.sharpe} fmt={(v) => v.toFixed(2)} />
            <MetricCell label="연변동성" s={result.metrics.vol} b={result.benchMetrics.vol} fmt={pct} better="low" />
            <MetricCell label="월간 승률" s={result.metrics.winRateM} b={result.benchMetrics.winRateM} fmt={(v) => (v * 100).toFixed(0) + '%'} />
            <MetricCell label="평균 회전율" s={result.metrics.turnover} b={0} fmt={(v) => (v * 100).toFixed(0) + '%'} better="none" noBench />
          </div>

          {lastReb && lastReb.picks.length > 0 && (
            <div style={{ ...CARD, padding: 22, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-accyan)', marginBottom: 4 }}>최근 리밸런싱 보유 종목</div>
              <div style={{ fontSize: 12, color: 'var(--c-tx6)', marginBottom: 14 }}>{lastReb.d} 기준 · {lastReb.picks.length}종목 · 총 {result.rebalances.length}회 리밸런싱</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {lastReb.picks.map((p) => (
                  <span key={p.code} style={{ fontSize: 12.5, fontWeight: 600, padding: '6px 11px', borderRadius: 9, background: 'var(--c-w05)', color: 'var(--c-tx3)', border: '1px solid var(--c-w08)' }}>{p.name}</span>
                ))}
              </div>
            </div>
          )}

          <div style={{ ...CARD, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-tx5)', marginBottom: 8 }}>정직성 고지</div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {result.notes.map((n, i) => <li key={i} style={{ fontSize: 12, color: 'var(--c-tx5)', lineHeight: 1.5 }}>{n}</li>)}
            </ul>
          </div>
        </>
      )}

      <SourceNote text="국내주식 일별 종가 — 한국투자증권(KIS) · 저장소(kr_prices)에서 조회 · 매일 장마감 후 갱신" style={{ marginTop: 20 }} />
    </div>
  );
}
