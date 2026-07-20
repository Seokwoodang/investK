'use client';

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { UpdateNote, SourceNote } from '../SourceNote';
import { InlineSpinner } from '../Footer';
import { Popover } from '../GlossaryTip';
import { SubNav } from '../SubNav';

// 가격 기반 백테스트 화면(1단계). 저장된 국내주식 종가(kr_prices)로 모멘텀·이평추세·로우볼 전략을
// 유니버스 동일비중 매수후보유(벤치마크)와 비교한다. look-ahead 없음 · 종가체결 · 거래비용 반영.

const CARD: React.CSSProperties = {
  background: 'var(--c-w04)', border: '1px solid var(--c-w08)',
  borderRadius: 20, backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
};

// 보조 버튼(저장/공유/불러오기 등) 공통 스타일.
const subBtn: React.CSSProperties = {
  cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap',
  padding: '10px 14px', borderRadius: 10, border: '1px solid var(--c-w10)', background: 'var(--c-w05)',
  color: 'var(--c-tx3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1,
};

type StrategyId = 'momentum' | 'ma_trend' | 'low_vol' | 'buy_hold';

const STRATS: { id: StrategyId; label: string; desc: string; uses: ('lookback' | 'ma' | 'topN')[] }[] = [
  { id: 'momentum', label: '모멘텀', desc: '최근 많이 오른 종목 상위 N개를 사서 보유 — “오르는 말에 올라타기”(추세추종)', uses: ['lookback', 'topN'] },
  { id: 'ma_trend', label: '이동평균 추세', desc: '종가가 이동평균선 위(상승 흐름)인 종목만 보유 — 조건 만족 종목이 없으면 전량 현금', uses: ['ma', 'topN'] },
  { id: 'low_vol', label: '로우볼(저변동성)', desc: '최근 가장 덜 출렁인(안정적인) 종목을 보유 — 방어형', uses: ['lookback', 'topN'] },
  { id: 'buy_hold', label: '전체 매수 후 보유', desc: '후보 200종목을 똑같이 나눠 한 번 사서 끝까지 보유 — 벤치마크(비교 기준)와 같은 개념', uses: [] },
];

// 전략별 '어떻게 사서 어떻게 판다' 규칙 — 결과가 buy&hold가 아니라 규칙 매매임을 명확히.
const RULES: Record<StrategyId, { buy: string; sell: string }> = {
  momentum: { buy: '리밸런싱 때마다 최근(룩백기간) 많이 오른 상위 N종목을 동일비중으로 매수', sell: '순위에서 밀려난 보유 종목은 매도(오르는 종목으로 갈아타기)' },
  ma_trend: { buy: '종가가 이동평균선 위(상승 추세)인 종목만 동일비중 매수', sell: '이동평균 아래로 꺾이면 매도 · 조건 맞는 종목이 없으면 전량 현금 보유' },
  low_vol: { buy: '최근 가장 덜 출렁인(변동성 낮은) N종목을 동일비중 매수', sell: '변동성이 커져 하위로 밀려난 종목은 매도' },
  buy_hold: { buy: '시작 시점에 후보 전체를 동일비중으로 한 번 매수', sell: '팔지 않고 끝까지 보유(상장폐지 때만 청산)' },
};

// 지표·파라미터 설명(초심자용 ⓘ 툴팁). 숫자만 던지지 않고 읽는 법을 함께 제공.
const METRIC_HINTS: Record<string, string> = {
  '총수익률': '기간 전체 동안 원금이 몇 % 늘었는지. 예: +100%면 원금의 2배.',
  '연복리(CAGR)': '전체 수익을 “매년 평균 몇 %씩 복리로 불었나”로 환산한 값. 예: 연 35%면 10년에 약 20배. 참고로 시장 장기 평균은 연 7~10% 수준.',
  '연수익률(IRR)': '적립식은 돈을 나눠 넣어 시점마다 투자기간이 달라서, 그걸 반영한 “연 몇 %”가 IRR입니다(머니웨이티드). 늦게 넣은 돈은 시간이 짧게 반영돼요.',
  '단순수익률': '최종 평가액 ÷ 총 납입액 − 1. 내가 넣은 돈 대비 얼마나 불었는지(기간·시점 무시한 단순 비율).',
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

interface EquityPoint { d: string; v: number; bench: number; spx: number | null; ndx: number | null; contrib?: number }
interface Metrics { totalReturn: number; cagr: number; mdd: number; vol: number; sharpe: number; winRateM: number; turnover: number; days: number; contributed?: number; finalValue?: number; irr?: number }
interface Result {
  config: { from: string; to: string; strategy: StrategyId; contribMode?: 'lumpsum' | 'dca'; contribAmount?: number; contribEvery?: 'M' | 'Q' };
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
function EquityChart({ pts, startCapital, showContrib = false }: { pts: EquityPoint[]; startCapital: number; showContrib?: boolean }) {
  const W = 720, H = 240, padL = 8, padR = 8, padT = 14, padB = 24;
  const g = useMemo(() => {
    if (pts.length < 2) return null;
    // 다운샘플: 점이 많으면(수천) SVG가 무거워 렌더가 버벅임 → ~400점으로 솎되 첫·끝은 유지.
    const MAX = 400;
    const step = Math.max(1, Math.ceil(pts.length / MAX));
    const ds = pts.filter((_, i) => i % step === 0);
    if (ds[ds.length - 1] !== pts[pts.length - 1]) ds.push(pts[pts.length - 1]);
    const fin = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0;
    const all = ds.flatMap((p) => [p.v, p.bench, p.spx, p.ndx, showContrib ? p.contrib ?? null : null]).filter(fin);
    const lo = Math.max(1, Math.min(startCapital || Infinity, ...all)), hi = Math.max(startCapital, ...all);
    const lLo = Math.log(lo), lSpan = Math.log(hi) - lLo || 1;
    const iw = W - padL - padR, ih = H - padT - padB, n = ds.length;
    const x = (i: number) => padL + (i / (n - 1)) * iw;
    const y = (v: number) => padT + (1 - (Math.log(Math.max(1, v)) - lLo) / lSpan) * ih;
    // NaN(null) 구간은 선을 끊는다(M로 재시작).
    const path = (key: 'v' | 'bench' | 'spx' | 'ndx' | 'contrib') => {
      let d = '', pen = false;
      ds.forEach((p, i) => { const val = p[key]; if (fin(val)) { d += `${pen ? ' L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)}`; pen = true; } else pen = false; });
      return d;
    };
    const area = 'M' + `${x(0).toFixed(1)},${y(ds[0].v).toFixed(1)} L` + ds.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' L') + ` L${x(n - 1).toFixed(1)},${(padT + ih).toFixed(1)} L${x(0).toFixed(1)},${(padT + ih).toFixed(1)} Z`;
    const has = (key: 'spx' | 'ndx') => ds.some((p) => fin(p[key]));
    return { ds, line: path('v'), bench: path('bench'), spx: path('spx'), ndx: path('ndx'), contrib: showContrib ? path('contrib') : '', hasSpx: has('spx'), hasNdx: has('ndx'), area, seedY: y(startCapital), x, ih, n };
  }, [pts, startCapital, showContrib]);

  // ── 리플레이: '라이브 차트' 방식 — 폭은 고정, "지금까지의 데이터"가 항상 전체 폭을 꽉 채운다.
  // 선 끝이 항상 오른쪽 끝에 붙고, 시간이 갈수록 과거가 왼쪽으로 압축 + y축은 값이 커질수록 줌아웃.
  // (예전 clip-reveal(커튼 걷기)은 릴스 느낌이 안 나서 폐기.) 매 프레임 4선의 path d를 ref로 직접
  // 재계산·갱신(React 리렌더 0). 마지막 프레임 = 정적 전체 차트와 동일 수식이라 복원 불필요.
  const [playing, setPlaying] = useState(false);
  const labelRef = useRef<HTMLSpanElement>(null);
  const pathRefs = { v: useRef<SVGPathElement>(null), bench: useRef<SVGPathElement>(null), spx: useRef<SVGPathElement>(null), ndx: useRef<SVGPathElement>(null), contrib: useRef<SVGPathElement>(null) };
  const areaRef = useRef<SVGPathElement>(null);
  const seedRef = useRef<SVGLineElement>(null);
  const tipRef = useRef<SVGCircleElement>(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  // 정지/종료 시 정적 전체 차트로 복원.
  const restoreStatic = () => {
    if (!g) return;
    pathRefs.v.current?.setAttribute('d', g.line);
    pathRefs.bench.current?.setAttribute('d', g.bench);
    pathRefs.spx.current?.setAttribute('d', g.spx);
    pathRefs.ndx.current?.setAttribute('d', g.ndx);
    if (pathRefs.contrib.current) { pathRefs.contrib.current.setAttribute('d', g.contrib); pathRefs.contrib.current.style.opacity = '1'; }
    areaRef.current?.setAttribute('d', g.area);
    const sy = String(g.seedY);
    seedRef.current?.setAttribute('y1', sy); seedRef.current?.setAttribute('y2', sy);
    if (tipRef.current) tipRef.current.style.opacity = '0';
    if (labelRef.current) labelRef.current.textContent = '';
  };
  const stop = () => { cancelAnimationFrame(raf.current); setPlaying(false); restoreStatic(); };
  const play = () => {
    if (!g) return;
    cancelAnimationFrame(raf.current);
    setPlaying(true);
    if (pathRefs.contrib.current) pathRefs.contrib.current.style.opacity = '0'; // 리플레이 중엔 납입선 숨김(y축 재조정 미적용)
    const { ds, n, ih } = g;
    const iw = W - padL - padR;
    const fin = (v: number | null): v is number => v != null && Number.isFinite(v) && v > 0;
    // 기간에 비례한 재생 시간(10년 ≈ 15~16초, 3년 ≈ 8초) — 그려지는 과정이 보이게 충분히 느리게.
    const dur = Math.min(16000, Math.max(8000, n * 40));
    // y축 카메라: 목표 도메인을 프레임마다 lerp로 따라가 '줌아웃되는 카메라' 느낌(스냅 제거).
    let dispLo = 0, dispHi = 0, initialized = false;
    let t0 = 0;
    const frame = (t: number) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / dur);
      const m = Math.max(2, Math.floor(p * (n - 1)) + 1); // 지금까지의 포인트 수
      // 목표 y 도메인 = 지금까지 나온 값들(원금 포함)
      let lo = startCapital, hi = startCapital;
      for (let i = 0; i < m; i++) {
        const q = ds[i];
        for (const v of [q.v, q.bench, q.spx, q.ndx]) if (fin(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
      }
      lo = Math.max(1, lo);
      if (!initialized) { dispLo = lo; dispHi = hi; initialized = true; }
      if (p >= 1) { dispLo = lo; dispHi = hi; } // 마지막 프레임은 정확히 목표 도메인(정적 차트와 동일)
      else { const k = 0.10; dispLo += (lo - dispLo) * k; dispHi += (hi - dispHi) * k; }
      const lLo = Math.log(Math.max(1, dispLo)), lSpan = Math.log(dispHi) - lLo || 1;
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
      // 선 끝을 이끄는 점(tip) — '그려지고 있다'는 신호.
      if (tipRef.current) {
        tipRef.current.setAttribute('cx', x(m - 1).toFixed(1));
        tipRef.current.setAttribute('cy', y(fp.v).toFixed(1));
        tipRef.current.style.opacity = p < 1 ? '1' : '0';
      }
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
        <button onClick={playing ? stop : play} style={{
          cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
          padding: '5px 12px', borderRadius: 8, border: '1px solid var(--c-cy40)',
          background: playing ? 'var(--c-w06)' : 'var(--c-cy16)', color: 'var(--c-accyanbr)',
        }}>{playing ? '■ 정지' : '▶ 리플레이'}</button>
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
        {showContrib && g.contrib && <path ref={pathRefs.contrib} d={g.contrib} fill="none" stroke="var(--c-tx5)" strokeWidth="1.6" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />}
        <path ref={pathRefs.v} d={g.line} fill="none" stroke={col} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {/* 리플레이 중 선 끝을 이끄는 점 — '지금 그려지고 있다'는 신호 */}
        <circle ref={tipRef} r="4.5" fill={col} style={{ opacity: 0, filter: `drop-shadow(0 0 6px ${col})`, transition: 'opacity 200ms' }} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--c-tx6)', gap: 8 }}>
        <span style={{ whiteSpace: 'nowrap' }}>{pts[0].d}</span>
        <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          {chip(col, '전략')}
          {showContrib && chip('var(--c-tx5)', '납입액', true)}
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

// 저장/공유용 config 스냅샷 — /api/strategies 와 동일 형태.
interface StoredConfig {
  strategy: StrategyId; topN: number; lookbackDays: number; maWindow: number; rebalance: 'M' | 'Q'; costBps: number; years: number;
  contribMode?: 'lumpsum' | 'dca'; seed?: number; contribAmount?: number; contribEvery?: 'M' | 'Q';
}
interface Forward { days: number; ret: number | null; benchRet: number | null }
interface SavedStrategy { id: string; name: string; config: StoredConfig; savedAt: string; forward: Forward | null }

const clampNum = (v: string | null, lo: number, hi: number, dflt: number) => {
  if (v == null || v === '') return dflt; // 누락 파라미터는 기본값(Number(null)=0이 최솟값으로 잘리는 버그 방지)
  const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

export function Backtest() {
  const [strategy, setStrategy] = useState<StrategyId>('momentum');
  const [topN, setTopN] = useState(20);
  const [lookbackDays, setLookbackDays] = useState(120);
  const [maWindow, setMaWindow] = useState(120);
  const [rebalance, setRebalance] = useState<'M' | 'Q'>('Q');
  const [costBps, setCostBps] = useState(20);
  const [years, setYears] = useState(10);
  // 투자 방식: 일시불(seed 한 번) / 적립식(seed + 주기 납입)
  const [contribMode, setContribMode] = useState<'lumpsum' | 'dca'>('lumpsum');
  const [seed, setSeed] = useState(10_000_000);        // 초기 투자금(일시불 금액 / 적립식 시작 종잣돈, 0 가능)
  const [contribAmount, setContribAmount] = useState(500_000); // 적립식 회당 납입액
  const [contribEvery, setContribEvery] = useState<'M' | 'Q'>('M');
  const startCapital = seed;

  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 저장·공유
  const [saved, setSaved] = useState<SavedStrategy[] | null>(null); // null=로딩중
  const [savedAuthed, setSavedAuthed] = useState(true);             // false=비로그인
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);        // 방금 복사한 항목 키

  const meta = STRATS.find((s) => s.id === strategy)!;

  const currentConfig = useCallback((): StoredConfig => ({ strategy, topN, lookbackDays, maWindow, rebalance, costBps, years, contribMode, seed, contribAmount, contribEvery }), [strategy, topN, lookbackDays, maWindow, rebalance, costBps, years, contribMode, seed, contribAmount, contribEvery]);
  const applyConfig = useCallback((c: StoredConfig) => {
    setStrategy(c.strategy); setTopN(c.topN); setLookbackDays(c.lookbackDays);
    setMaWindow(c.maWindow); setRebalance(c.rebalance); setCostBps(c.costBps); setYears(c.years);
    setContribMode(c.contribMode ?? 'lumpsum'); setSeed(c.seed ?? 10_000_000);
    setContribAmount(c.contribAmount ?? 500_000); setContribEvery(c.contribEvery ?? 'M');
  }, []);

  // 공유 URL — config를 쿼리 파라미터로 인라인 인코딩(DB 의존 없이 링크가 영구히 동작).
  const shareUrl = useCallback((c: StoredConfig) => {
    const p = new URLSearchParams({
      strategy: c.strategy, topN: String(c.topN), lookback: String(c.lookbackDays),
      ma: String(c.maWindow), reb: c.rebalance, cost: String(c.costBps), years: String(c.years),
    });
    if (c.contribMode === 'dca') {
      p.set('mode', 'dca'); p.set('seed', String(c.seed ?? 0));
      p.set('camt', String(c.contribAmount ?? 500_000)); p.set('cevery', c.contribEvery ?? 'M');
    } else if ((c.seed ?? 10_000_000) !== 10_000_000) {
      p.set('seed', String(c.seed));
    }
    return `${window.location.origin}/backtest?${p.toString()}`;
  }, []);

  const run = useCallback(async (override?: StoredConfig) => {
    const c: StoredConfig = override ?? { strategy, topN, lookbackDays, maWindow, rebalance, costBps, years, contribMode, seed, contribAmount, contribEvery };
    setLoading(true); setErr(null);
    const now = new Date();
    const from = new Date(now); from.setFullYear(now.getFullYear() - c.years);
    const isDca = c.contribMode === 'dca';
    const body = {
      strategy: c.strategy, topN: c.topN, lookbackDays: c.lookbackDays, maWindow: c.maWindow,
      rebalance: c.rebalance, costBps: c.costBps, startCapital: c.seed ?? 10_000_000, universeN: 200,
      from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10),
      ...(isDca ? { contribMode: 'dca', contribAmount: c.contribAmount ?? 500_000, contribEvery: c.contribEvery ?? 'M' } : {}),
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
  }, [strategy, topN, lookbackDays, maWindow, rebalance, costBps, years, contribMode, seed, contribAmount, contribEvery]);

  const loadSaved = useCallback(async () => {
    try {
      const r = await fetch('/api/strategies');
      if (r.status === 401) { setSavedAuthed(false); setSaved([]); return; }
      const j = await r.json().catch(() => ({ strategies: [] }));
      setSavedAuthed(true); setSaved(Array.isArray(j.strategies) ? j.strategies : []);
    } catch { setSaved([]); }
  }, []);

  const saveCurrent = useCallback(async () => {
    const dflt = `${meta.label} · ${topN}종목 · ${rebalance === 'Q' ? '분기' : '월'}리밸 · ${years}년`;
    const name = window.prompt('전략 이름', dflt);
    if (name == null) return;
    setSaving(true); setSaveMsg(null);
    try {
      const r = await fetch('/api/strategies', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, config: currentConfig() }) });
      if (r.status === 401) { window.location.href = `/login?next=${encodeURIComponent('/backtest')}`; return; }
      const j = await r.json().catch(() => null);
      if (!r.ok) setSaveMsg(j?.error ?? '저장에 실패했어요.');
      else { setSaveMsg('저장했어요.'); loadSaved(); }
    } catch { setSaveMsg('네트워크 오류가 발생했어요.'); }
    finally { setSaving(false); }
  }, [meta.label, topN, rebalance, years, currentConfig, loadSaved]);

  const deleteSaved = useCallback(async (id: string) => {
    if (!window.confirm('이 전략을 삭제할까요?')) return;
    try { await fetch(`/api/strategies?id=${id}`, { method: 'DELETE' }); loadSaved(); } catch { /* noop */ }
  }, [loadSaved]);

  const copyShare = useCallback(async (c: StoredConfig, key: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(c));
      setCopied(key); setTimeout(() => setCopied((k) => (k === key ? null : k)), 1800);
    } catch { setSaveMsg('링크 복사에 실패했어요(브라우저 권한 확인).'); }
  }, [shareUrl]);

  // 최초: 공유 링크(?strategy=...)면 설정 반영 후 자동 실행 + 내 저장 목록 로드.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.has('strategy') || q.has('topN')) {
      const ids: StrategyId[] = ['momentum', 'ma_trend', 'low_vol', 'buy_hold'];
      const s = q.get('strategy') as StrategyId;
      const dca = q.get('mode') === 'dca';
      const c: StoredConfig = {
        strategy: ids.includes(s) ? s : 'momentum',
        topN: clampNum(q.get('topN'), 1, 50, 20),
        lookbackDays: clampNum(q.get('lookback'), 20, 500, 120),
        maWindow: clampNum(q.get('ma'), 20, 300, 120),
        rebalance: q.get('reb') === 'M' ? 'M' : 'Q',
        costBps: clampNum(q.get('cost'), 0, 100, 20),
        years: clampNum(q.get('years'), 1, 15, 10),
        contribMode: dca ? 'dca' : 'lumpsum',
        seed: clampNum(q.get('seed'), 0, 1_000_000_000, dca ? 0 : 10_000_000),
        contribAmount: clampNum(q.get('camt'), 10_000, 100_000_000, 500_000),
        contribEvery: q.get('cevery') === 'Q' ? 'Q' : 'M',
      };
      applyConfig(c);
      run(c);
    }
    loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastReb = result?.rebalances?.[result.rebalances.length - 1];

  return (
    <div>
      <SubNav items={[{ href: '/backtest', label: '백테스트' }, { href: '/race', label: '시총 레이스' }]} />
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
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--c-tx5)', lineHeight: 1.5 }}>{meta.desc}</p>

        {/* 어떻게 사서 어떻게 판다 — 규칙 매매임을 명확히(그냥 소유가 아님) */}
        <div style={{ ...FLAT_CARD, padding: '12px 16px', marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px 20px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5, color: 'var(--c-tx3)', lineHeight: 1.5 }}>
            <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: 'var(--c-gn22)', color: 'var(--c-upbr)' }}>매수</span>
            <span>{RULES[strategy].buy}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5, color: 'var(--c-tx3)', lineHeight: 1.5 }}>
            <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: 'var(--c-rd18, var(--c-w06))', color: 'var(--c-down)' }}>매도</span>
            <span>{RULES[strategy].sell}</span>
          </div>
          {(strategy !== 'buy_hold' || contribMode === 'dca') && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5, color: 'var(--c-tx4)', lineHeight: 1.5 }}>
              <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: 'var(--c-w06)', color: 'var(--c-tx4)' }}>주기</span>
              <span>
                {strategy !== 'buy_hold' ? `${rebalance === 'Q' ? '분기' : '매월'}마다 종목 재선정(리밸런싱)` : '리밸런싱 없음'}
                {contribMode === 'dca' ? ` · 적립금은 ${contribEvery === 'Q' ? '분기' : '매월'} 추가 매수` : ''}
              </span>
            </div>
          )}
        </div>

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

        {/* 투자 방식: 일시불 / 적립식(DCA) — 실제 매달 적립하는 방식으로도 검증 */}
        <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 12, background: 'var(--c-w04)', border: '1px solid var(--c-w08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-tx3)' }}>투자 방식</span>
            <div style={{ display: 'inline-flex', gap: 4, padding: 3, background: 'var(--c-w05)', borderRadius: 9 }}>
              {([['lumpsum', '일시불'], ['dca', '적립식']] as const).map(([m, l]) => (
                <button key={m} onClick={() => setContribMode(m)} style={{
                  cursor: 'pointer', fontFamily: 'inherit', border: 'none', padding: '6px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 700,
                  ...(contribMode === m ? { background: 'var(--c-cy18)', color: 'var(--c-accyanbr)' } : { background: 'transparent', color: 'var(--c-tx5)' }),
                }}>{l}</button>
              ))}
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--c-tx6)' }}>
              {contribMode === 'lumpsum' ? '시작에 목돈을 한 번에' : '매월/분기 일정액을 꾸준히 납입(실제 적립 투자)'}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <label>{paramLabel(contribMode === 'lumpsum' ? '투자금(원)' : '초기 투자금(원)')}
              <input type="number" min={0} max={1000000000} step={1000000} value={seed} onChange={(e) => setSeed(Math.max(0, +e.target.value))} style={inputStyle} /></label>
            {contribMode === 'dca' && (
              <>
                <label>{paramLabel('회당 납입액(원)')}
                  <input type="number" min={10000} max={100000000} step={100000} value={contribAmount} onChange={(e) => setContribAmount(Math.max(10000, +e.target.value))} style={inputStyle} /></label>
                <label>{paramLabel('납입 주기')}
                  <select value={contribEvery} onChange={(e) => setContribEvery(e.target.value as 'M' | 'Q')} style={inputStyle}>
                    <option value="M">매월</option><option value="Q">분기</option>
                  </select></label>
              </>
            )}
          </div>
        </div>

        <button onClick={() => run()} disabled={loading} style={{
          marginTop: 18, width: '100%', cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit',
          background: loading ? 'var(--c-w08)' : 'var(--c-accyan)', color: loading ? 'var(--c-tx5)' : '#04121a',
          border: 'none', borderRadius: 12, padding: '13px 0', fontSize: 15, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {loading ? <><InlineSpinner size={14} />백테스트 실행 중…</> : '백테스트 실행'}
        </button>

        {/* 현재 설정 저장 / 공유 */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button onClick={saveCurrent} disabled={saving} style={subBtn}>
            {saving ? <><InlineSpinner size={12} />저장 중…</> : '★ 현재 설정 저장'}
          </button>
          <button onClick={() => copyShare(currentConfig(), 'current')} style={subBtn}>
            {copied === 'current' ? '✓ 링크 복사됨' : '🔗 공유 링크 복사'}
          </button>
        </div>
        {saveMsg && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--c-tx4)' }}>{saveMsg}</div>}
        {err && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--c-down)', lineHeight: 1.5 }}>⚠ {err}</div>}
      </div>

      <SavedStrategies
        saved={saved}
        authed={savedAuthed}
        copied={copied}
        onLoad={(c) => { applyConfig(c); run(c); if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        onShare={(c, key) => copyShare(c, key)}
        onDelete={deleteSaved}
      />

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
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-accyan)' }}>
                자산 곡선 {result.config.contribMode === 'dca' ? '(평가액 · 납입액)' : `(원금 ${won(startCapital)})`}
              </div>
              <div style={{ fontSize: 12, color: 'var(--c-tx6)' }}>{result.config.from} ~ {result.config.to} · 후보 {result.universeUsed}종목</div>
            </div>
            <EquityChart pts={result.equity} startCapital={startCapital} showContrib={result.config.contribMode === 'dca'} />
          </div>

          {/* 적립식 요약 — 내가 넣은 돈 vs 불어난 돈 (실제 적립 투자자용) */}
          {result.config.contribMode === 'dca' && result.metrics.contributed != null && (() => {
            const m = result.metrics, bm = result.benchMetrics;
            const gain = (m.finalValue ?? 0) - (m.contributed ?? 0);
            const cell = (label: string, val: string, color?: string, sub?: string) => (
              <div style={{ ...FLAT_CARD, padding: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--c-tx5)', marginBottom: 8 }}>{label}</div>
                <div style={{ fontSize: 19, fontWeight: 800, color: color ?? 'var(--c-tx1b)' }}>{val}</div>
                {sub && <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginTop: 4 }}>{sub}</div>}
              </div>
            );
            return (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                  {cell('총 납입액', won(m.contributed ?? 0), undefined, '내 주머니에서 넣은 돈')}
                  {cell('최종 평가액', won(m.finalValue ?? 0), upc(gain), `${gain >= 0 ? '+' : ''}${won(gain)} (불어난 돈)`)}
                  {cell('단순 수익률', pct(m.totalReturn), upc(m.totalReturn), '평가액 ÷ 납입액')}
                  {cell('연수익률(IRR)', m.irr != null ? pct(m.irr) : '—', upc(m.irr ?? 0), '납입 시점 반영')}
                </div>
                <div style={{ ...FLAT_CARD, padding: '13px 18px', marginTop: 12, borderLeft: `3px solid ${upc((m.irr ?? 0) - (bm.irr ?? 0))}` }}>
                  <span style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--c-tx2)' }}>
                    같은 돈({won(m.contributed ?? 0)})을 <b>그냥 시장(동일비중)에 똑같이 적립</b>했다면 평가액 <b>{won(bm.finalValue ?? 0)}</b> · 연수익률(IRR) <b>{bm.irr != null ? pct(bm.irr) : '—'}</b>.{' '}
                    {result.config.strategy !== 'buy_hold' && (m.irr ?? 0) >= (bm.irr ?? 0)
                      ? '이 전략이 시장 적립보다 앞섰습니다.'
                      : result.config.strategy !== 'buy_hold' ? '이 전략은 그냥 시장에 적립하는 것만 못했습니다.' : ''}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* 한 줄 해석 — 초심자가 숫자 더미에서 길을 잃지 않게, 알파(벤치 대비)를 자동 요약. 적립식은 위 전용 요약이 대신함. */}
          {result.config.contribMode !== 'dca' && (() => {
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
            <MetricCell label={result.config.contribMode === 'dca' ? '단순수익률' : '총수익률'} s={result.metrics.totalReturn} b={result.benchMetrics.totalReturn} fmt={pct} />
            <MetricCell label={result.config.contribMode === 'dca' ? '연수익률(IRR)' : '연복리(CAGR)'} s={result.metrics.cagr} b={result.benchMetrics.cagr} fmt={pct} />
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

// 저장한 전략 목록 + "저장 후 포워드 성과". 공개 랭킹 없이 내 계정 안에서만.
// 포워드 성과 = 저장 시점 이후 성과(과최적화 방지) — 저장 후 잘 굴러갔는지가 진짜 검증.
function cfgChips(c: StoredConfig): string[] {
  const s = STRATS.find((x) => x.id === c.strategy);
  const chips = [s?.label ?? c.strategy];
  if (s?.uses.includes('topN')) chips.push(`${c.topN}종목`);
  chips.push(c.rebalance === 'Q' ? '분기리밸' : '월리밸');
  if (s?.uses.includes('lookback')) chips.push(`룩백 ${c.lookbackDays}d`);
  if (s?.uses.includes('ma')) chips.push(`이평 ${c.maWindow}d`);
  chips.push(`비용 ${c.costBps}bps`, `${c.years}년`);
  return chips;
}

function SavedStrategies({
  saved, authed, copied, onLoad, onShare, onDelete,
}: {
  saved: SavedStrategy[] | null; authed: boolean; copied: string | null;
  onLoad: (c: StoredConfig) => void; onShare: (c: StoredConfig, key: string) => void; onDelete: (id: string) => void;
}) {
  const heading = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>내 저장 전략</h2>
      {saved && saved.length > 0 && <span style={{ fontSize: 12, color: 'var(--c-tx6)' }}>{saved.length}개</span>}
    </div>
  );

  let body: React.ReactNode;
  if (!authed) {
    body = (
      <div style={{ fontSize: 13, color: 'var(--c-tx4)', lineHeight: 1.6 }}>
        로그인하면 백테스트 설정을 저장하고, 링크로 공유하고, <b>저장 후 성과</b>를 추적할 수 있어요.{' '}
        <a href="/login?next=/backtest" style={{ color: 'var(--c-accyanbr)', fontWeight: 700 }}>로그인 →</a>
      </div>
    );
  } else if (saved === null) {
    body = <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--c-tx5)', fontSize: 13 }}><InlineSpinner size={13} /> 불러오는 중…</div>;
  } else if (saved.length === 0) {
    body = <div style={{ fontSize: 13, color: 'var(--c-tx5)' }}>아직 저장한 전략이 없어요. 위에서 설정을 고른 뒤 <b>★ 현재 설정 저장</b>을 눌러보세요.</div>;
  } else {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {saved.map((s) => {
          const f = s.forward;
          const hasFwd = f && f.ret != null && f.benchRet != null;
          const alpha = hasFwd ? (f!.ret! - f!.benchRet!) : 0;
          return (
            <div key={s.id} style={{ ...FLAT_CARD, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--c-tx1b)' }}>{s.name}</div>
                <div style={{ fontSize: 11, color: 'var(--c-tx6)' }}>{s.savedAt} 저장</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {cfgChips(s.config).map((c, i) => (
                  <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'var(--c-w05)', color: 'var(--c-tx4)' }}>{c}</span>
                ))}
              </div>
              {/* 저장 후 포워드 성과 */}
              <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--c-tx4)' }}>
                {hasFwd ? (
                  <>
                    저장 후 <b style={{ color: 'var(--c-tx2)' }}>{f!.days}거래일</b> · 전략{' '}
                    <b style={{ color: upc(f!.ret!) }}>{pct(f!.ret!)}</b> vs 시장 <b style={{ color: upc(f!.benchRet!) }}>{pct(f!.benchRet!)}</b>{' '}
                    <span style={{ fontWeight: 700, color: upc(alpha) }}>({alpha >= 0 ? '+' : ''}{(alpha * 100).toFixed(1)}%p)</span>
                  </>
                ) : (
                  <span style={{ color: 'var(--c-tx6)' }}>저장 후 성과 — 집계 전(경과 기간이 짧습니다)</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => onLoad(s.config)} style={{ ...subBtn, flex: '0 0 auto' }}>불러오기 ↑</button>
                <button onClick={() => onShare(s.config, s.id)} style={{ ...subBtn, flex: '0 0 auto' }}>{copied === s.id ? '✓ 복사됨' : '🔗 공유'}</button>
                <button onClick={() => onDelete(s.id)} style={{ ...subBtn, flex: '0 0 auto', color: 'var(--c-tx6)' }}>삭제</button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ ...CARD, padding: 22, marginBottom: 16 }}>
      {heading}
      <p style={{ margin: '2px 0 14px', fontSize: 12.5, color: 'var(--c-tx6)', lineHeight: 1.5 }}>
        저장 시점 이후의 성과를 함께 보여줍니다 — 백테스트를 잘 맞추는 것보다 <b>저장 후에도 통하는지</b>가 진짜 검증(과최적화 방지).
      </p>
      {body}
    </div>
  );
}
