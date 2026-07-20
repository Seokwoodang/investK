'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SubNav } from '../SubNav';
import { SourceNote, UpdateNote } from '../SourceNote';
import { InlineSpinner } from '../Footer';

// KOSPI 시총 대장주 레이스 — 2016~현재 월별 시총 상위 보통주 top15의 순위 경주(bar chart race).
// 데이터: /api/race (pit_universe, 상폐 포함 시점별 유니버스). 배경: 백테스트와 같은 KRX 공식 데이터.
// 애니메이션은 백테스트 리플레이와 동일 철학 — ref로 DOM 직접 갱신(리렌더 0), rAF 트윈으로 부드럽게.

interface Frame { ym: string; rows: { c: string; v: number }[] }
interface RaceData { unit: string; topN: number; from: string; to: string; names: Record<string, string>; frames: Frame[] }

const ROW_H = 42;       // 한 종목 행 높이(px)
const BAR_H = 30;       // 막대 높이
const LABEL_W = 116;    // 왼쪽 순위+종목명 칸
const MONTHS_PER_SEC = 6; // 1배속에서 초당 진행 개월 수(≈10.5년 → 21초)
const MAX_BAR_PCT = 0.94;  // 1위 막대의 최대 폭(트랙 대비) — 값 라벨이 카드 밖으로 나가지 않게 여백 확보
const INSIDE_LABEL_PCT = 62; // 막대 폭이 이보다 크면 값 라벨을 막대 '안'에 넣어 오른쪽 넘침 방지

// 종목별 안정 색상 팔레트(사명 무관, 코드에 고정 매핑).
const PALETTE = [
  '#22d3ee', '#f472b6', '#a78bfa', '#34d399', '#fbbf24', '#60a5fa', '#fb7185', '#4ade80',
  '#e879f9', '#38bdf8', '#facc15', '#2dd4bf', '#f87171', '#818cf8', '#c084fc', '#f97316',
  '#10b981', '#eab308', '#06b6d4', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444', '#3b82f6',
];

const CARD: React.CSSProperties = {
  background: 'var(--c-w04)', border: '1px solid var(--c-w08)',
  borderRadius: 20, backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
};

// 억원 → 사람이 읽는 단위(조/억).
function fmtCap(vEok: number): string {
  if (vEok >= 10000) {
    const jo = vEok / 10000;
    return `${jo >= 100 ? Math.round(jo).toLocaleString('ko-KR') : jo.toFixed(1)}조`;
  }
  return `${Math.round(vEok).toLocaleString('ko-KR')}억`;
}
const fmtYm = (ym: string) => ym.replace('-', '.');

export function Race() {
  const [data, setData] = useState<RaceData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/race')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        return r.json() as Promise<RaceData>;
      })
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(e.message || '불러오기 실패'); });
    return () => { alive = false; };
  }, []);

  return (
    <div>
      <SubNav items={[{ href: '/backtest', label: '백테스트' }, { href: '/race', label: '시총 레이스' }]} />
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>KOSPI 대장주 레이스</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-tx5)', lineHeight: 1.6 }}>
          2016년부터 지금까지, 코스피 시가총액 상위 15개 종목의 순위가 어떻게 뒤바뀌어 왔는지 재생해 봅니다.
          한국전력·아모레퍼시픽이 지고 2차전지·바이오가 뜨는 흐름을 눈으로 따라가 보세요.
        </p>
        <UpdateNote text="월말 시점 기준 · 매월 갱신" style={{ marginTop: 8 }} />
      </div>

      {err ? (
        <div style={{ ...CARD, padding: 28, textAlign: 'center', color: 'var(--c-tx4)', fontSize: 14 }}>
          레이스 데이터를 불러오지 못했습니다: {err}
        </div>
      ) : !data ? (
        <div style={{ ...CARD, padding: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--c-tx5)' }}>
          <InlineSpinner /> 시총 데이터를 불러오는 중…
        </div>
      ) : (
        <RaceChart data={data} />
      )}

      <SourceNote
        text="KRX 공식 OpenAPI · 월말 시점별 시총 상위(상폐 포함) · 보통주 기준(우선주 제외) · 시총=종가×상장주식수(수정주가·배당 미반영, raw)"
        style={{ marginTop: 14 }}
      />
    </div>
  );
}

function RaceChart({ data }: { data: RaceData }) {
  const { frames, names } = data;
  const N = frames.length;
  const TOP_N = data.topN;

  // 프레임별 code→값 맵 · code→순위 맵 · 월별 1위 값 + 전체 등장 종목(union) + 색상 매핑 — 한 번만 계산.
  //  순위(rankMaps)는 API가 시총 내림차순으로 준 rows의 인덱스 = 그 달의 확정 순위. 이걸 프레임 사이에서
  //  보간해 세로 위치를 정하면(값 재정렬이 아니라), 값이 비슷한 두 종목이 프레임마다 순위가 뒤집혀 겹치는 현상이 사라진다.
  const { valueMaps, rankMaps, maxOf, union, colorOf } = useMemo(() => {
    const vm = frames.map((f) => {
      const m = new Map<string, number>();
      for (const r of f.rows) m.set(r.c, r.v);
      return m;
    });
    const rm = frames.map((f) => {
      const m = new Map<string, number>();
      f.rows.forEach((r, i) => m.set(r.c, i));
      return m;
    });
    const mo = frames.map((f) => f.rows[0]?.v ?? 1); // 매월 1위(삼성전자) 시총 = 막대 폭 스케일 기준
    const seen: string[] = [];
    const set = new Set<string>();
    for (const f of frames) for (const r of f.rows) if (!set.has(r.c)) { set.add(r.c); seen.push(r.c); }
    const col: Record<string, string> = {};
    seen.forEach((c, i) => { col[c] = PALETTE[i % PALETTE.length]; });
    return { valueMaps: vm, rankMaps: rm, maxOf: mo, union: seen, colorOf: col };
  }, [frames]);

  // DOM 참조(리렌더 없이 직접 갱신). code별 {row, fill, val}.
  const elsRef = useRef<Map<string, { row: HTMLDivElement; fill: HTMLDivElement; val: HTMLSpanElement }>>(new Map());
  const ymRef = useRef<HTMLDivElement | null>(null);
  const scrubRef = useRef<HTMLInputElement | null>(null);

  const tRef = useRef(0);           // 현재 위치(개월 인덱스, 실수)
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const speedRef = useRef(1);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // 특정 시각 t의 프레임을 화면에 그린다. React 상태를 건드리지 않고 ref로 직접 갱신.
  //  세로 위치 = 두 달의 '확정 순위'를 보간(매 프레임 값 재정렬 X → 겹침/떨림 없음).
  //  가로 폭 = 시총 값 보간. 진입/이탈 종목은 화면 아래(TOP_N)에서 미끄러져 들어오고/나감(opacity 페이드).
  const draw = useCallback((t: number) => {
    const a = Math.max(0, Math.min(Math.floor(t), N - 1));
    const b = Math.min(a + 1, N - 1);
    const frac = t - a;
    const rA = rankMaps[a], rB = rankMaps[b];
    const vA = valueMaps[a], vB = valueMaps[b];
    const maxV = (maxOf[a] + (maxOf[b] - maxOf[a]) * frac) || 1;
    for (const code of union) {
      const el = elsRef.current.get(code);
      if (!el) continue;
      const raIdx = rA.get(code);
      const rbIdx = rB.get(code);
      const inA = raIdx !== undefined;
      const inB = rbIdx !== undefined;
      if (!inA && !inB) { // 두 달 모두 top 밖 → 숨김
        if (el.row.style.opacity !== '0') { el.row.style.opacity = '0'; el.row.style.pointerEvents = 'none'; }
        continue;
      }
      const ra = inA ? raIdx! : TOP_N; // 이탈/진입은 화면 밖(맨 아래) 순위에서 슬라이드
      const rb = inB ? rbIdx! : TOP_N;
      const y = (ra + (rb - ra) * frac) * ROW_H;
      const va = inA ? vA.get(code)! : vB.get(code)!;
      const vb = inB ? vB.get(code)! : vA.get(code)!;
      const v = va + (vb - va) * frac;
      const op = (inA ? 1 : 0) + ((inB ? 1 : 0) - (inA ? 1 : 0)) * frac;
      el.row.style.opacity = String(op);
      el.row.style.transform = `translateY(${y}px)`;
      el.row.style.pointerEvents = op > 0.5 ? 'auto' : 'none';
      const wpct = Math.max(0, v / maxV) * MAX_BAR_PCT * 100;
      el.fill.style.width = `${wpct}%`;
      el.val.textContent = fmtCap(v);
      // 막대가 넓으면 값 라벨을 막대 '안'(오른쪽 끝, 어두운 글씨)으로 → 오른쪽 카드 밖 넘침 방지.
      if (wpct > INSIDE_LABEL_PCT) {
        el.val.style.left = 'auto'; el.val.style.right = '10px'; el.val.style.paddingLeft = '0'; el.val.style.color = '#06131c';
      } else {
        el.val.style.left = '100%'; el.val.style.right = 'auto'; el.val.style.paddingLeft = '8px'; el.val.style.color = 'var(--c-tx1b)';
      }
    }
    if (ymRef.current) ymRef.current.textContent = fmtYm(frames[Math.round(t)].ym);
    if (scrubRef.current && document.activeElement !== scrubRef.current) scrubRef.current.value = String(t);
  }, [N, TOP_N, union, valueMaps, rankMaps, maxOf, frames]);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTsRef.current = null;
  }, []);

  const loop = useCallback((ts: number) => {
    if (lastTsRef.current == null) lastTsRef.current = ts;
    const dt = (ts - lastTsRef.current) / 1000;
    lastTsRef.current = ts;
    tRef.current += dt * MONTHS_PER_SEC * speedRef.current;
    if (tRef.current >= N - 1) {
      tRef.current = N - 1;
      draw(tRef.current);
      stop();
      setPlaying(false);
      return;
    }
    draw(tRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }, [N, draw, stop]);

  const play = useCallback(() => {
    if (tRef.current >= N - 1) tRef.current = 0; // 끝에서 다시 누르면 처음부터
    setPlaying(true);
    lastTsRef.current = null;
    rafRef.current = requestAnimationFrame(loop);
  }, [N, loop]);

  const pause = useCallback(() => { stop(); setPlaying(false); }, [stop]);

  const restart = useCallback(() => {
    stop();
    tRef.current = 0;
    draw(0);
    setPlaying(true);
    lastTsRef.current = null;
    rafRef.current = requestAnimationFrame(loop);
  }, [stop, draw, loop]);

  // 최초 마운트: 첫 프레임 그리고 자동 재생.
  useEffect(() => {
    draw(0);
    const id = requestAnimationFrame((ts) => {
      setPlaying(true);
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(loop);
    });
    return () => { cancelAnimationFrame(id); stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    stop();
    setPlaying(false);
    tRef.current = Number(e.target.value);
    draw(tRef.current);
  };

  const chartH = TOP_N * ROW_H;
  const btn = (active: boolean): React.CSSProperties => ({
    cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap',
    padding: '8px 14px', borderRadius: 10, border: `1px solid ${active ? 'var(--c-cy45)' : 'var(--c-w10)'}`,
    background: active ? 'var(--c-cy16)' : 'var(--c-w05)', color: active ? 'var(--c-accyanbr)' : 'var(--c-tx3)',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  });

  return (
    <div style={{ ...CARD, padding: '20px 22px 22px' }}>
      {/* 컨트롤 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <button onClick={() => (playing ? pause() : play())} style={btn(true)}>
          {playing ? '⏸ 일시정지' : '▶ 재생'}
        </button>
        <button onClick={restart} style={btn(false)}>↺ 처음부터</button>
        <div style={{ display: 'inline-flex', gap: 4, marginLeft: 4 }}>
          {[0.5, 1, 2].map((s) => (
            <button key={s} onClick={() => setSpeed(s)} style={btn(speed === s)}>{s}×</button>
          ))}
        </div>
        <div ref={ymRef} style={{ marginLeft: 'auto', fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--c-tx2)', fontVariantNumeric: 'tabular-nums' }}>
          {fmtYm(frames[0].ym)}
        </div>
      </div>

      {/* 레이스 트랙 — overflow hidden으로 진입/이탈 행이 아래로 삐져나오는 것 클립(값 라벨은 항상 트랙 안) */}
      <div style={{ position: 'relative', height: chartH, marginBottom: 6, overflow: 'hidden' }}>
        {union.map((code) => (
          <div
            key={code}
            ref={(el) => {
              if (!el) { elsRef.current.delete(code); return; }
              const fill = el.querySelector<HTMLDivElement>('[data-fill]')!;
              const val = el.querySelector<HTMLSpanElement>('[data-val]')!;
              elsRef.current.set(code, { row: el, fill, val });
            }}
            style={{
              // 위치·불투명도·폭 모두 rAF가 매 프레임 보간 갱신 → CSS 트랜지션 없음(정렬 흔들림/겹침 방지).
              position: 'absolute', left: 0, right: 0, top: 0, height: ROW_H,
              display: 'flex', alignItems: 'center', gap: 8, opacity: 0,
              transform: 'translateY(0px)', willChange: 'transform, opacity',
            }}
          >
            <div style={{ width: LABEL_W, flexShrink: 0, textAlign: 'right', paddingRight: 10, fontSize: 13.5, fontWeight: 700, color: 'var(--c-tx2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {names[code] || code}
            </div>
            <div style={{ position: 'relative', flex: 1, height: BAR_H }}>
              {/* 값 라벨은 fill의 자식(left:100%)이라 막대가 자라면 tip에 자동으로 따라붙음 */}
              <div
                data-fill
                style={{
                  position: 'absolute', left: 0, top: 0, height: BAR_H, width: '0%',
                  background: colorOf[code], borderRadius: 7,
                  boxShadow: `0 2px 10px ${colorOf[code]}55`,
                  // width는 rAF가 매 프레임 보간 갱신 → CSS 트랜지션 없음(고무줄 방지). 순위 이동만 row transform이 트랜지션.
                }}
              >
                <span
                  data-val
                  style={{
                    position: 'absolute', left: '100%', top: 0, height: BAR_H, display: 'flex', alignItems: 'center',
                    paddingLeft: 8, fontSize: 12.5, fontWeight: 800, color: 'var(--c-tx1b)', whiteSpace: 'nowrap',
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 스크러버(타임라인) */}
      <input
        ref={scrubRef}
        type="range" min={0} max={N - 1} step={0.02} defaultValue={0}
        onChange={onScrub}
        aria-label="시점 이동"
        style={{ width: '100%', accentColor: 'var(--c-accyan)', cursor: 'pointer' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--c-tx6)', marginTop: 2 }}>
        <span>{fmtYm(frames[0].ym)}</span>
        <span>{fmtYm(frames[N - 1].ym)}</span>
      </div>
    </div>
  );
}
