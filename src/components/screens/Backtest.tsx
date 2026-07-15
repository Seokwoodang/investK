'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { UpdateNote, SourceNote } from '../SourceNote';
import { InlineSpinner } from '../Footer';
import { Popover } from '../GlossaryTip';

// 가격 기반 백테스트 화면(1단계). 저장된 국내주식 종가(kr_prices)로 모멘텀·이평추세·로우볼 전략을
// 유니버스 동일비중 매수후보유(벤치마크)와 비교한다. look-ahead 없음 · 종가체결 · 거래비용 반영.

const CARD: React.CSSProperties = {
  background: 'var(--c-w04)', border: '1px solid var(--c-w08)',
  borderRadius: 20, backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
};

type StrategyId = 'momentum' | 'ma_trend' | 'low_vol' | 'buy_hold';

const STRATS: { id: StrategyId; label: string; desc: string; uses: ('lookback' | 'ma' | 'topN')[] }[] = [
  { id: 'momentum', label: '모멘텀', desc: '최근 많이 오른 종목 상위 N개를 사서 보유 — “오르는 말에 올라타기”(추세추종)', uses: ['lookback', 'topN'] },
  { id: 'ma_trend', label: '이동평균 추세', desc: '종가가 이동평균선 위(상승 흐름)인 종목만 보유 — 조건 만족 종목이 없으면 전량 현금', uses: ['ma', 'topN'] },
  { id: 'low_vol', label: '로우볼(저변동성)', desc: '최근 가장 덜 출렁인(안정적인) 종목을 보유 — 방어형', uses: ['lookback', 'topN'] },
  { id: 'buy_hold', label: '전체 매수 후 보유', desc: '후보 200종목을 똑같이 나눠 한 번 사서 끝까지 보유 — 벤치마크(비교 기준)와 같은 개념', uses: [] },
];

// 지표·파라미터 설명(초심자용 ⓘ 툴팁). 숫자만 던지지 않고 읽는 법을 함께 제공.
const METRIC_HINTS: Record<string, string> = {
  '총수익률': '기간 전체 동안 원금이 몇 % 늘었는지. 예: +100%면 원금의 2배.',
  '연복리(CAGR)': '전체 수익을 “매년 평균 몇 %씩 복리로 불었나”로 환산한 값. 예: 연 35%면 10년에 약 20배. 참고로 시장 장기 평균은 연 7~10% 수준.',
  '최대낙폭(MDD)': '기간 중 최악의 순간, 고점 대비 몇 %까지 떨어졌었는지. -45%면 자산이 반토막 근처까지 갔다는 뜻 — 실제로 버틸 수 있는 낙폭인지 보세요.',
  '샤프비율': '감수한 출렁임(위험) 1단위당 얻은 수익. 높을수록 효율적인 전략. 대략 1 이상이면 준수.',
  '연변동성': '1년 기준 자산이 얼마나 출렁이는지. 낮을수록 안정적(마음 편함).',
  '월간 승률': '플러스로 마감한 달의 비율. 100번 중 몇 번 웃었는지.',
  '평균 회전율': '리밸런싱 때마다 포트폴리오의 몇 %를 갈아탔는지(매수+매도 합산). 높을수록 거래비용 부담이 큼.',
};
const PARAM_HINTS: Record<string, string> = {
  '보유 종목 수': '고른 종목 중 몇 개를 살지. 적을수록 집중(수익도 손실도 커짐), 많을수록 분산(완만해짐).',
  '룩백(거래일)': '과거 며칠을 보고 종목을 고를지. 주식시장은 1년 ≈ 252거래일이라 120일 ≈ 6개월.',
  '이평 기간(거래일)': '이동평균선을 몇 거래일 평균으로 그릴지. 길수록 장기 추세를 봄.',
  '리밸런싱': '종목을 다시 골라 갈아타는 주기. 잦을수록 신호 반영이 빠르지만 거래비용이 늘어남.',
  '거래비용(편도 bps)': '사고팔 때마다 내는 비용. 20bps = 0.2%(수수료+세금+체결오차 근사). 0으로 두면 비현실적으로 유리해짐.',
  '기간(년)': '과거 몇 년치를 재생해볼지.',
};

// 라벨 + ⓘ 팝오버(모바일 탭·데스크톱 호버 겸용, 기존 Popover 재사용).
function HintLabel({ text, hint, style }: { text: string; hint?: string; style: React.CSSProperties }) {
  if (!hint) return <span style={style}>{text}</span>;
  return (
    <Popover width={270} content={<><span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--c-accyanbr)', marginBottom: 5 }}>{text}</span><span style={{ display: 'block', fontSize: 12, lineHeight: 1.6, color: 'var(--c-tx3)', fontWeight: 400 }}>{hint}</span></>}>
      <span style={style}>{text}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13, marginLeft: 5, borderRadius: '50%', border: '1px solid var(--c-w22)', color: 'var(--c-tx5)', fontSize: 8, fontWeight: 700, flexShrink: 0, verticalAlign: 'middle' }}>i</span>
    </Popover>
  );
}

interface EquityPoint { d: string; v: number; bench: number; spx: number | null; ndx: number | null }
interface Metrics { totalReturn: number; cagr: number; mdd: number; vol: number; sharpe: number; winRateM: number; turnover: number; days: number }
interface Result {
  config: { from: string; to: string; strategy: StrategyId };
  equity: EquityPoint[];
  metrics: Metrics;
  benchMetrics: Metrics;
  rebalances: { d: string; picks: { code: string; name: string }[] }[];
  universeUsed: number;
  delistings: number;
  benchExt: { spxCagr: number | null; ndxCagr: number | null };
  notes: string[];
}

// 자산곡선 4개 선 색상. S&P·나스닥은 라이트/다크 모두 보이는 중간 톤 고정.
const LINE = { spx: '#f0a53e', ndx: '#a98bff' };

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
    const fin = (v: number | null): v is number => v != null && Number.isFinite(v) && v > 0;
    const all = ds.flatMap((p) => [p.v, p.bench, p.spx, p.ndx]).filter(fin);
    const lo = Math.max(1, Math.min(startCapital, ...all)), hi = Math.max(startCapital, ...all);
    const lLo = Math.log(lo), lSpan = Math.log(hi) - lLo || 1;
    const iw = W - padL - padR, ih = H - padT - padB, n = ds.length;
    const x = (i: number) => padL + (i / (n - 1)) * iw;
    const y = (v: number) => padT + (1 - (Math.log(Math.max(1, v)) - lLo) / lSpan) * ih;
    // NaN(null) 구간은 선을 끊는다(M로 재시작).
    const path = (key: 'v' | 'bench' | 'spx' | 'ndx') => {
      let d = '', pen = false;
      ds.forEach((p, i) => { const val = p[key]; if (fin(val)) { d += `${pen ? ' L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)}`; pen = true; } else pen = false; });
      return d;
    };
    const area = 'M' + `${x(0).toFixed(1)},${y(ds[0].v).toFixed(1)} L` + ds.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' L') + ` L${x(n - 1).toFixed(1)},${(padT + ih).toFixed(1)} L${x(0).toFixed(1)},${(padT + ih).toFixed(1)} Z`;
    const has = (key: 'spx' | 'ndx') => ds.some((p) => fin(p[key]));
    return { ds, line: path('v'), bench: path('bench'), spx: path('spx'), ndx: path('ndx'), hasSpx: has('spx'), hasNdx: has('ndx'), area, seedY: y(startCapital), x, ih, n };
  }, [pts, startCapital]);

  // ── 리플레이: '라이브 차트' 방식 — 폭은 고정, "지금까지의 데이터"가 항상 전체 폭을 꽉 채운다.
  // 선 끝이 항상 오른쪽 끝에 붙고, 시간이 갈수록 과거가 왼쪽으로 압축 + y축은 값이 커질수록 줌아웃.
  // (예전 clip-reveal(커튼 걷기)은 릴스 느낌이 안 나서 폐기.) 매 프레임 4선의 path d를 ref로 직접
  // 재계산·갱신(React 리렌더 0). 마지막 프레임 = 정적 전체 차트와 동일 수식이라 복원 불필요.
  const [playing, setPlaying] = useState(false);
  const labelRef = useRef<HTMLSpanElement>(null);
  const pathRefs = { v: useRef<SVGPathElement>(null), bench: useRef<SVGPathElement>(null), spx: useRef<SVGPathElement>(null), ndx: useRef<SVGPathElement>(null) };
  const areaRef = useRef<SVGPathElement>(null);
  const seedRef = useRef<SVGLineElement>(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const play = () => {
    if (!g) return;
    cancelAnimationFrame(raf.current);
    setPlaying(true);
    const { ds, n, ih } = g;
    const iw = W - padL - padR;
    const fin = (v: number | null): v is number => v != null && Number.isFinite(v) && v > 0;
    const dur = 6500;
    let t0 = 0;
    const frame = (t: number) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / dur);
      const m = Math.max(2, Math.floor(p * (n - 1)) + 1); // 지금까지의 포인트 수
      // y 도메인 = 지금까지 나온 값들(원금 포함) → 값이 커질수록 줌아웃
      let lo = startCapital, hi = startCapital;
      for (let i = 0; i < m; i++) {
        const q = ds[i];
        for (const v of [q.v, q.bench, q.spx, q.ndx]) if (fin(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
      }
      lo = Math.max(1, lo);
      const lLo = Math.log(lo), lSpan = Math.log(hi) - lLo || 1;
      // x = 지금까지의 구간을 전체 폭에 펼침 → 시간이 갈수록 과거가 압축
      const x = (i: number) => padL + (i / (m - 1)) * iw;
      const y = (v: number) => padT + (1 - (Math.log(Math.max(1, v)) - lLo) / lSpan) * ih;
      const build = (key: 'v' | 'bench' | 'spx' | 'ndx') => {
        let d = '', pen = false;
        for (let i = 0; i < m; i++) { const val = ds[i][key]; if (fin(val)) { d += `${pen ? ' L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)}`; pen = true; } else pen = false; }
        return d;
      };
      pathRefs.v.current?.setAttribute('d', build('v'));
      pathRefs.bench.current?.setAttribute('d', build('bench'));
      pathRefs.spx.current?.setAttribute('d', build('spx'));
      pathRefs.ndx.current?.setAttribute('d', build('ndx'));
      areaRef.current?.setAttribute('d', build('v') + ` L${x(m - 1).toFixed(1)},${(padT + ih).toFixed(1)} L${x(0).toFixed(1)},${(padT + ih).toFixed(1)} Z`);
      const sy = y(startCapital).toFixed(1);
      seedRef.current?.setAttribute('y1', sy); seedRef.current?.setAttribute('y2', sy);
      const fp = ds[m - 1];
      if (labelRef.current) {
        const sr = fp.v / startCapital - 1, nr = fp.ndx != null ? fp.ndx / startCapital - 1 : null;
        labelRef.current.textContent = `${fp.d}  전략 ${pct(sr)}${nr != null ? ` · 나스닥 ${pct(nr)}` : ''}`;
      }
      if (p < 1) raf.current = requestAnimationFrame(frame);
      else { setPlaying(false); if (labelRef.current) labelRef.current.textContent = ''; }
    };
    raf.current = requestAnimationFrame(frame);
  };

  if (!g) return null;
  const stratUp = pts[pts.length - 1].v >= startCapital;
  const col = stratUp ? 'var(--c-up)' : 'var(--c-down)';
  const chip = (c: string, label: string, dash = false) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 16, height: 0, borderTop: `2px ${dash ? 'dashed' : 'solid'} ${c}` }} />{label}
    </span>
  );

  return (
    <div>
      {/* 재생 컨트롤 + 라이브 카운터(ref로 갱신) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <button onClick={play} disabled={playing} style={{
          cursor: playing ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
          padding: '5px 12px', borderRadius: 8, border: '1px solid var(--c-cy40)',
          background: playing ? 'var(--c-w06)' : 'var(--c-cy16)', color: 'var(--c-accyanbr)',
        }}>{playing ? '▶ 재생 중…' : '▶ 리플레이'}</button>
        <span ref={labelRef} style={{ fontSize: 12, color: 'var(--c-tx3)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="btArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={col} stopOpacity="0.20" />
            <stop offset="1" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line ref={seedRef} x1={padL} y1={g.seedY} x2={W - padR} y2={g.seedY} stroke="var(--c-w12)" strokeWidth="1" strokeDasharray="4 4" />
        <path ref={areaRef} d={g.area} fill="url(#btArea)" />
        <path ref={pathRefs.bench} d={g.bench} fill="none" stroke="var(--c-tx6)" strokeWidth="1.6" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        {g.hasSpx && <path ref={pathRefs.spx} d={g.spx} fill="none" stroke={LINE.spx} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />}
        {g.hasNdx && <path ref={pathRefs.ndx} d={g.ndx} fill="none" stroke={LINE.ndx} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />}
        <path ref={pathRefs.v} d={g.line} fill="none" stroke={col} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--c-tx6)', gap: 8 }}>
        <span style={{ whiteSpace: 'nowrap' }}>{pts[0].d}</span>
        <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          {chip(col, '전략')}
          {chip('var(--c-tx6)', '국내벤치', true)}
          {g.hasSpx && chip(LINE.spx, 'S&P500(원화)')}
          {g.hasNdx && chip(LINE.ndx, '나스닥100(원화)')}
          <span>로그</span>
        </span>
        <span style={{ whiteSpace: 'nowrap' }}>{pts[pts.length - 1].d}</span>
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
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center' }}>
        <HintLabel text={label} hint={METRIC_HINTS[label]} style={{ fontSize: 11, color: 'var(--c-tx5)' }} />
      </div>
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
// 파라미터 라벨(블록 배치 유지 + ⓘ 툴팁).
const paramLabel = (text: string) => (
  <span style={labelStyle}><HintLabel text={text} hint={PARAM_HINTS[text]} style={{ fontSize: 11, color: 'var(--c-tx5)', fontWeight: 600 }} /></span>
);

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
      // 게이트웨이 타임아웃 등은 JSON이 아닌 텍스트 에러 페이지가 옴 → 그대로 파싱하면 암호 같은
      // "Unexpected token ..." 에러가 노출됨. 안전 파싱 + 사람이 읽을 메시지로.
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) { setErr(j?.error ?? '서버 응답이 지연되고 있어요. 잠시 후 다시 실행해 주세요.'); setResult(null); }
      else setResult(j as Result);
    } catch { setErr('네트워크 오류가 발생했어요. 연결 확인 후 다시 시도해 주세요.'); }
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
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-tx5)' }}>과거 종가로 규칙 기반 전략의 성과를 검증합니다. 시점별 KOSPI 시총 상위(상폐 종목 포함) · 최근 10년.</p>
        <UpdateNote text="look-ahead 없음 · 생존편향 제거(시점별 유니버스·상폐 포함) · 종가체결 · 거래비용·분할 보정 · 투자 권유 아님(교육용)" style={{ marginTop: 8 }} />
      </div>

      {/* 초심자 안내 — 접이식(처음 오는 사람이 결과를 읽을 수 있게) */}
      <details style={{ ...CARD, padding: '14px 20px', marginBottom: 20 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--c-accyanbr)', listStylePosition: 'inside' }}>백테스트가 처음이라면 — 30초 요약</summary>
        <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--c-tx4)', lineHeight: 1.8 }}>
          ① “이 규칙대로 과거에 투자했다면 지금 얼마가 됐을까?”를 실제 과거 종가로 재생합니다. 가상 원금 1,000만원으로 시작해요.<br />
          ② 아래에서 전략을 고르고 <b>백테스트 실행</b>을 누르면, 결과 차트에 <b style={{ color: 'var(--c-up)' }}>전략(실선)</b>과 <b>벤치마크(점선 — 후보 200종목을 그냥 다 사서 보유)</b>가 함께 그려집니다.<br />
          ③ 유니버스는 <b>그 시점의</b> KOSPI 시총 상위(상폐 종목 포함)라 생존편향이 없습니다 — 절대 수익률도, <b>벤치마크 대비 초과성과</b>도 함께 보세요. 각 지표 옆 <b>ⓘ</b>를 누르면 뜻을 볼 수 있어요.
        </div>
      </details>

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
            <label>{paramLabel('보유 종목 수')}
              <input type="number" min={1} max={50} value={topN} onChange={(e) => setTopN(+e.target.value)} style={inputStyle} /></label>
          )}
          {meta.uses.includes('lookback') && (
            <label>{paramLabel('룩백(거래일)')}
              <input type="number" min={20} max={500} value={lookbackDays} onChange={(e) => setLookbackDays(+e.target.value)} style={inputStyle} /></label>
          )}
          {meta.uses.includes('ma') && (
            <label>{paramLabel('이평 기간(거래일)')}
              <input type="number" min={20} max={300} value={maWindow} onChange={(e) => setMaWindow(+e.target.value)} style={inputStyle} /></label>
          )}
          {strategy !== 'buy_hold' && (
            <label>{paramLabel('리밸런싱')}
              <select value={rebalance} onChange={(e) => setRebalance(e.target.value as 'M' | 'Q')} style={inputStyle}>
                <option value="M">매월</option><option value="Q">분기</option>
              </select></label>
          )}
          <label>{paramLabel('거래비용(편도 bps)')}
            <input type="number" min={0} max={100} value={costBps} onChange={(e) => setCostBps(+e.target.value)} style={inputStyle} /></label>
          <label>{paramLabel('기간(년)')}
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
          {/* 생존편향 제거됨 — 시점별 유니버스(상폐 포함). 남은 한계(근사·배당)는 정직하게 함께 고지. */}
          <div style={{ background: 'var(--c-gn22)', border: '1px solid var(--c-up)', borderRadius: 16, padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-upbr)', marginBottom: 6 }}>✓ 생존편향 제거됨 — 시점별 유니버스(상폐 종목 포함)</div>
            <div style={{ fontSize: 12.5, color: 'var(--c-tx3)', lineHeight: 1.6 }}>
              각 리밸런싱 시점의 <b>그때 KOSPI 시총 상위</b>에서 고르고, 그 시점엔 살아있던 <b>나중에 상폐된 종목도 후보에 포함</b>합니다
              (기간 중 <b>{result.delistings}건</b> 보유 종목 상폐 처분됨). 즉 "오늘의 승자를 미리 아는" 왜곡이 없어 <b>절대 수익률도 신뢰할 수 있습니다.</b>
              <br />남은 한계(정직 고지): 시총 상위 = 실제 KOSPI200 지수와 완전히 같진 않은 근사 · 종가-종가 체결 · 배당 재투자 미반영(price return).
            </div>
          </div>
          <div style={{ ...CARD, padding: 22, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-accyan)' }}>자산 곡선 (원금 {won(startCapital)})</div>
              <div style={{ fontSize: 12, color: 'var(--c-tx6)' }}>{result.config.from} ~ {result.config.to} · 후보 {result.universeUsed}종목</div>
            </div>
            <EquityChart pts={result.equity} startCapital={startCapital} />
          </div>

          {/* 한 줄 해석 — 초심자가 숫자 더미에서 길을 잃지 않게, 알파(벤치 대비)를 자동 요약 */}
          {(() => {
            const aCagr = result.metrics.cagr - result.benchMetrics.cagr;
            const aSharpe = result.metrics.sharpe - result.benchMetrics.sharpe;
            const isBH = result.config.strategy === 'buy_hold';
            return (
              <div style={{ ...FLAT_CARD, padding: '14px 20px', marginBottom: 16, borderLeft: `3px solid ${upc(aCagr)}` }}>
                <span style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--c-tx2)' }}>
                  {isBH ? (
                    <>전체 매수 후 보유는 벤치마크와 같은 개념이라 두 곡선이 거의 겹칩니다 — 다른 전략과 비교하는 기준선으로 보세요.</>
                  ) : (
                    <>
                      <b>한 줄 해석:</b> 이 전략은 같은 기간 벤치마크보다 연복리 기준{' '}
                      <b style={{ color: upc(aCagr) }}>{aCagr >= 0 ? '+' : ''}{(aCagr * 100).toFixed(1)}%p {aCagr >= 0 ? '앞섰습니다' : '뒤졌습니다'}</b>
                      {' '}({pct(result.metrics.cagr)} vs {pct(result.benchMetrics.cagr)}).
                      위험 대비 효율(샤프)은 {result.metrics.sharpe.toFixed(2)} vs {result.benchMetrics.sharpe.toFixed(2)}로{' '}
                      {aSharpe >= 0 ? '더 효율적이었습니다' : '더 비효율적이었습니다'}.
                    </>
                  )}
                  {/* 미국 지수(원화) 대비 — "그냥 S&P/나스닥 사는 것보다 나았나" */}
                  {(result.benchExt?.spxCagr != null || result.benchExt?.ndxCagr != null) && (
                    <span style={{ display: 'block', marginTop: 8, fontSize: 12.5, color: 'var(--c-tx4)' }}>
                      같은 기간 <b style={{ color: LINE.spx }}>S&P500(원화)</b> {result.benchExt.spxCagr != null ? pct(result.benchExt.spxCagr) : '—'}
                      {' · '}<b style={{ color: LINE.ndx }}>나스닥100(원화)</b> {result.benchExt.ndxCagr != null ? pct(result.benchExt.ndxCagr) : '—'}
                      {' '}(연복리). {result.benchExt.spxCagr != null && (
                        result.metrics.cagr >= result.benchExt.spxCagr
                          ? '이 전략이 S&P도 이겼습니다.'
                          : '이 전략도 그냥 S&P500 사는 것엔 못 미쳤습니다.'
                      )}
                    </span>
                  )}
                </span>
              </div>
            );
          })()}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
            <MetricCell label="총수익률" s={result.metrics.totalReturn} b={result.benchMetrics.totalReturn} fmt={pct} />
            <MetricCell label="연복리(CAGR)" s={result.metrics.cagr} b={result.benchMetrics.cagr} fmt={pct} />
            <MetricCell label="최대낙폭(MDD)" s={result.metrics.mdd} b={result.benchMetrics.mdd} fmt={pct} better="high" />
            <MetricCell label="샤프비율" s={result.metrics.sharpe} b={result.benchMetrics.sharpe} fmt={(v) => v.toFixed(2)} />
            <MetricCell label="연변동성" s={result.metrics.vol} b={result.benchMetrics.vol} fmt={pct} better="low" />
            <MetricCell label="월간 승률" s={result.metrics.winRateM} b={result.benchMetrics.winRateM} fmt={(v) => (v * 100).toFixed(0) + '%'} />
            <MetricCell label="평균 회전율" s={result.metrics.turnover} b={0} fmt={(v) => (v * 100).toFixed(0) + '%'} better="none" noBench />
          </div>

          {lastReb && lastReb.picks.length === 0 && (
            <div style={{ ...FLAT_CARD, padding: '14px 20px', marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: 'var(--c-tx4)' }}>최근 리밸런싱({lastReb.d})에서는 조건을 만족한 종목이 없어 <b>전량 현금 보유</b>로 끝났습니다.</span>
            </div>
          )}
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

      <SourceNote text="국내주식 일별 종가·시가총액·상장주식수 — 한국거래소(KRX) 공식 OpenAPI · 저장소(kr_prices·pit_universe)에서 조회 · 매일 장마감 후 갱신" style={{ marginTop: 20 }} />
    </div>
  );
}
