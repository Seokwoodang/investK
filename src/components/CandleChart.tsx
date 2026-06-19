import type { Candle, ChartMarker, Currency, Period } from '../types';

// 캔들차트 SVG(840×320 viewBox, 가로 100% 반응형). 캔들·격자는 SVG로, 축 라벨(가격·날짜)은
// HTML 오버레이로 그린다(SVG는 가로로 늘어나 텍스트가 왜곡되므로). 높이 320px 고정 → 세로 px 직접 매핑.
const W = 840, H = 320, padT = 14, padB = 24, padL = 6, padR = 58;
const innerH = H - padT - padB;
const innerW = W - padL - padR;

function fmtPrice(v: number): string {
  if (v >= 1000) return Math.round(v).toLocaleString('ko-KR');
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

// 봉 단위에 따라 X축 라벨 포맷.
function fmtTime(ms: number, period: Period): string {
  const d = new Date(ms);
  const mo = d.getMonth() + 1, da = d.getDate();
  if (period === '1시간') return `${mo}/${da} ${String(d.getHours()).padStart(2, '0')}시`;
  if (period === '월봉') return `${String(d.getFullYear()).slice(2)}.${String(mo).padStart(2, '0')}`;
  return `${mo}/${da}`;
}

export function CandleChart({ candles, markers, period = '일봉', cur }: { candles: Candle[]; markers: ChartMarker[]; period?: Period; cur?: Currency }) {
  if (!candles.length)
    return <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6E7A90', fontSize: 13 }}>차트 데이터 없음</div>;

  const min = Math.min(...candles.map((c) => c.l));
  const max = Math.max(...candles.map((c) => c.h));
  const range = max - min || 1;
  const step = innerW / candles.length;
  const y = (v: number) => padT + ((max - v) / range) * innerH;
  const cw = Math.max(2.5, step * 0.62);

  const gridded = [0, 1, 2, 3, 4];
  const hasTime = candles.some((c) => c.t);
  const xLabels = hasTime
    ? Array.from({ length: 6 }, (_, k) => Math.round((candles.length - 1) * (k / 5)))
        .filter((idx, k, arr) => arr.indexOf(idx) === k)
        .map((idx) => ({ idx, leftFrac: (padL + step * idx + step / 2) / W, label: fmtTime(candles[idx].t as number, period) }))
    : [];

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
        {gridded.map((i) => {
          const gy = padT + (innerH * i) / 4;
          return <line key={`g${i}`} x1={padL} x2={W - padR} y1={gy} y2={gy} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />;
        })}
        {candles.map((c, i) => {
          const cx = padL + step * i + step / 2;
          const up = c.c >= c.o;
          const col = up ? '#34d39a' : '#f6685e';
          const ry = y(Math.max(c.o, c.c));
          const rh = Math.max(1.5, Math.abs(y(c.o) - y(c.c)));
          return (
            <g key={i}>
              <line x1={cx} x2={cx} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth={1.2} opacity={0.85} />
              <rect x={cx - cw / 2} y={ry} width={cw} height={rh} fill={col} rx={1} opacity={0.95} />
            </g>
          );
        })}
        {markers.map((m, i) => {
          const mx = padL + innerW * m.xFrac;
          return <line key={`mk${i}`} x1={mx} x2={mx} y1={padT} y2={H - padB} stroke={m.color} strokeWidth={1} strokeDasharray="3 4" opacity={0.65} />;
        })}
      </svg>

      {/* Y축 가격 라벨 (우측) — 세로 px 직접 매핑(높이 320 고정) */}
      {gridded.map((i) => {
        const topPx = padT + (innerH * i) / 4;
        const price = max - (range * i) / 4;
        return (
          <div key={`pl${i}`} style={{ position: 'absolute', top: topPx - 7, right: 2, fontSize: 10, color: '#6E7A90', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            {fmtPrice(price)}
          </div>
        );
      })}

      {/* X축 날짜/시간 라벨 (하단) */}
      {xLabels.map((x) => (
        <div key={`xl${x.idx}`} style={{ position: 'absolute', bottom: 2, left: `${x.leftFrac * 100}%`, transform: 'translateX(-50%)', fontSize: 10, color: '#6E7A90', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {x.label}
        </div>
      ))}

      {markers.map((m, i) => (
        <div
          key={`mt${i}`}
          style={{
            position: 'absolute', top: 4, left: `${m.xFrac * 100}%`, transform: 'translateX(3px)',
            fontSize: 11, fontWeight: 700, color: m.color, whiteSpace: 'nowrap', pointerEvents: 'none',
          }}
        >
          {m.label}
        </div>
      ))}
    </div>
  );
}
