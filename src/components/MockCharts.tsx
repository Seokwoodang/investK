'use client';

import { useMemo } from 'react';

// 모의투자용 경량 SVG 차트 2종(의존성 없음, 모바일 안전). lightweight-charts는 캔들 전용이라
// 자산 추이 선그래프·자산 비중 도넛은 직접 그린다.

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');

// ── 자산 변화 선그래프(에어리어) ──
export function AssetLineChart({ points, seed }: { points: { date: string; total: number }[]; seed: number }) {
  const W = 640, H = 180, padL = 8, padR = 8, padT = 12, padB = 22;

  const geom = useMemo(() => {
    if (points.length === 0) return null;
    const vals = points.map((p) => p.total);
    const lo = Math.min(seed, ...vals);
    const hi = Math.max(seed, ...vals);
    const span = hi - lo || 1;
    const iw = W - padL - padR, ih = H - padT - padB;
    const n = points.length;
    const x = (i: number) => padL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v: number) => padT + (1 - (v - lo) / span) * ih;
    const linePts = points.map((p, i) => `${x(i)},${y(p.total)}`);
    const line = 'M' + linePts.join(' L');
    const area = `M${x(0)},${y(points[0].total)} L${linePts.join(' L')} L${x(n - 1)},${padT + ih} L${x(0)},${padT + ih} Z`;
    const last = points[n - 1].total;
    const up = last >= seed;
    return { line, area, seedY: y(seed), up, last, lo, hi, x, y, n, ih };
  }, [points, seed]);

  if (!geom) {
    return <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-tx6)', fontSize: 13 }}>거래를 시작하면 자산 추이가 여기 그려져요</div>;
  }
  const col = geom.up ? 'var(--c-up)' : 'var(--c-down)';
  const first = points[0], lastP = points[points.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="mockArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={col} stopOpacity="0.28" />
            <stop offset="1" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* 시드 기준선(원금) */}
        <line x1={padL} y1={geom.seedY} x2={W - padR} y2={geom.seedY} stroke="var(--c-w12)" strokeWidth="1" strokeDasharray="4 4" />
        <path d={geom.area} fill="url(#mockArea)" />
        <path d={geom.line} fill="none" stroke={col} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {geom.n <= 12 && points.map((p, i) => (
          <circle key={i} cx={geom.x(i)} cy={geom.y(p.total)} r="2.6" fill={col} />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--c-tx6)' }}>
        <span>{first.date.slice(5)}</span>
        <span style={{ color: 'var(--c-tx6)' }}>원금선 {won(seed)}</span>
        <span>{lastP.date.slice(5)}</span>
      </div>
    </div>
  );
}

// ── 자산 비중 도넛 ──
const DONUT_COLORS = ['#38e6cd', '#5b9dff', '#f6a44b', '#e5679a', '#9b8cff', '#5fd08a', '#e0d24a', '#8a94a6'];

export function AllocationDonut({ segments }: { segments: { name: string; value: number; pct: number; tab: string }[] }) {
  const R = 54, SW = 20, C = 70; // viewBox 140
  const circ = 2 * Math.PI * R;
  let acc = 0;
  const segs = segments.slice(0, 8);
  const arcs = segs.map((s, i) => {
    const frac = s.pct / 100;
    const dash = `${frac * circ} ${circ}`;
    const offset = -acc * circ;
    acc += frac;
    return { dash, offset, color: DONUT_COLORS[i % DONUT_COLORS.length], seg: s };
  });

  if (!segs.length) return <div style={{ color: 'var(--c-tx6)', fontSize: 13, padding: '16px 0' }}>보유 자산이 없어요</div>;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <svg viewBox="0 0 140 140" width={140} height={140} style={{ flexShrink: 0 }}>
        <circle cx={C} cy={C} r={R} fill="none" stroke="var(--c-w05)" strokeWidth={SW} />
        <g transform={`rotate(-90 ${C} ${C})`}>
          {arcs.map((a, i) => (
            <circle key={i} cx={C} cy={C} r={R} fill="none" stroke={a.color} strokeWidth={SW}
              strokeDasharray={a.dash} strokeDashoffset={a.offset} />
          ))}
        </g>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
        {arcs.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: a.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--c-tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{a.seg.name}</span>
            <span style={{ color: 'var(--c-tx5)', fontWeight: 700, flexShrink: 0 }}>{a.seg.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
