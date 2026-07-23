'use client';

import { createChart, CandlestickSeries, ColorType, CrosshairMode, TickMarkType } from 'lightweight-charts';
import type { BusinessDay, CandlestickData, IChartApi, ISeriesApi, Time, UTCTimestamp } from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import type { Candle, Currency, Period } from '../types';

// TradingView Lightweight Charts 기반 인터랙티브 캔들차트(드래그 이동·휠 확대축소·크로스헤어).
// 데이터는 우리 KIS·업비트·바이낸스 실데이터를 그대로 먹인다. 캔버스라 색은 CSS 토큰을 읽어 직접 적용.
// 무한 스크롤: loadOlder가 주어지면 왼쪽 끝까지 스크롤할 때 과거 봉을 더 불러와 앞에 이어붙인다.

// 화면 폭에 따라 높이 결정(모바일에선 차트가 화면을 잡아먹지 않게). SSR 기본 360(데스크톱).
function pickHeight(): number {
  if (typeof window === 'undefined') return 360;
  const w = window.innerWidth;
  return w < 480 ? 260 : w < 768 ? 300 : 360;
}

function tok(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

function fmtAxisPrice(p: number): string {
  if (p >= 1000) return Math.round(p).toLocaleString('en-US');
  if (p >= 1) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

// 캔들 배열 → LW 데이터(시각 오름차순·중복 제거). 일봉+는 business-day, 분/시간봉은 UTCTimestamp(초).
function buildRows(candles: Candle[], intraday: boolean): CandlestickData[] {
  const rows: { key: string; sec: number; time: Time; o: number; h: number; l: number; c: number }[] = [];
  for (const c of candles) {
    if (c.t == null) continue;
    const sec = Math.floor(c.t / 1000);
    const d = new Date(c.t);
    const time: Time = intraday ? (sec as UTCTimestamp) : { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    const key = intraday ? String(sec) : `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    rows.push({ key, sec, time, o: c.o, h: c.h, l: c.l, c: c.c });
  }
  const dedup = new Map<string, (typeof rows)[number]>();
  for (const r of rows) dedup.set(r.key, r);
  return [...dedup.values()].sort((a, b) => a.sec - b.sec).map((r) => ({ time: r.time, open: r.o, high: r.h, low: r.l, close: r.c }));
}

export function CandleChart({
  candles,
  period,
  theme,
  cur,
  fit = false,
  loadOlder,
  height,
}: {
  candles: Candle[];
  period?: Period;
  cur?: Currency;
  theme?: string; // 테마 변경 시 색 재적용 트리거
  fit?: boolean; // true면 리사이즈 때도 전체 구간을 fit(모달 등 갓 열린 컨테이너용)
  loadOlder?: (oldestMs: number) => Promise<Candle[]>; // 주어지면 왼쪽 끝 스크롤 시 과거 봉 추가 로드
  height?: number; // 지정 시 고정 높이, 없으면 화면 폭에 맞춰 자동(모바일 축소)
}) {
  // 마운트 시 1회 결정(클라이언트 전용 렌더라 하이드레이션 불일치 없음).
  const [H] = useState(() => height ?? pickHeight());
  const intraday = period === '1분' || period === '5분' || period === '15분' || period === '30분' || period === '1시간' || period === '4시간';
  const intradayRef = useRef(intraday);
  intradayRef.current = intraday;
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const fitRef = useRef(fit);
  fitRef.current = fit;

  // 무한 스크롤 상태(ref — 리렌더와 무관하게 유지).
  const dataRef = useRef<Candle[]>([]);
  const loadingRef = useRef(false);
  const exhaustedRef = useRef(false);
  const loadOlderRef = useRef<typeof loadOlder>(undefined);
  loadOlderRef.current = loadOlder;

  const applyTheme = () => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: tok('--c-tx5') },
      grid: { vertLines: { color: tok('--c-w05') }, horzLines: { color: tok('--c-w05') } },
      rightPriceScale: { borderColor: tok('--c-w08') },
      timeScale: { borderColor: tok('--c-w08') },
    });
    const up = tok('--c-up');
    const down = tok('--c-down');
    series.applyOptions({ upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down });
  };

  // 생성(1회).
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    // 분·시간봉 시각은 '시장 로컬 타임존'으로 표시 — 달러($)=미국(ET), 그 외=한국(KST).
    //  (캔들 t는 정확한 UTC instant라, UTC로 그대로 찍으면 미국주식이 ET가 아닌 UTC로 나와 헷갈림.)
    const tz = cur === '$' ? 'America/New_York' : 'Asia/Seoul';
    const tzParts = (d: Date): Record<string, string> => {
      const o: Record<string, string> = {};
      new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
        .formatToParts(d).forEach((p) => { o[p.type] = p.value; });
      return o;
    };
    const chart = createChart(el, {
      height: H,
      width: el.clientWidth,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: tok('--c-tx5'), attributionLogo: true },
      grid: { vertLines: { color: tok('--c-w05') }, horzLines: { color: tok('--c-w05') } },
      rightPriceScale: { borderColor: tok('--c-w08') },
      timeScale: {
        borderColor: tok('--c-w08'),
        timeVisible: true,
        secondsVisible: false,
        // 데이터 가장자리 밖으로 스크롤·줌되어 "빈 공간만" 보이는 것 방지.
        // 오른쪽은 항상 고정. 왼쪽은 과거 로딩이 없을 때만 고정(있으면 끝까지 스크롤해 트리거해야 하므로).
        fixLeftEdge: !loadOlder,
        fixRightEdge: true,
        tickMarkFormatter: (time: Time, tickMarkType: TickMarkType) => {
          if (typeof time === 'object' && time !== null && 'day' in time) {
            const bd = time as BusinessDay;
            // 연 눈금은 연도로(안 그러면 월봉에서 매년 눈금이 다 '2월'처럼 같은 달로 찍힘).
            if (tickMarkType === TickMarkType.Year) return `${bd.year}`;
            if (tickMarkType === TickMarkType.Month) return `${bd.month}월`;
            return `${bd.day}일`; // DayOfMonth
          }
          const p = tzParts(new Date((time as number) * 1000));
          if (tickMarkType === TickMarkType.Time || tickMarkType === TickMarkType.TimeWithSeconds) {
            return `${p.hour}:${p.minute}`;
          }
          return `${+p.month}/${+p.day}`; // 날짜 경계(장 넘어감)는 월/일
        },
      },
      crosshair: { mode: CrosshairMode.Normal },
      localization: {
        priceFormatter: fmtAxisPrice,
        timeFormatter: (time: Time) => {
          if (typeof time === 'object' && time !== null && 'day' in time) {
            const bd = time as BusinessDay;
            return `${bd.year}년 ${bd.month}월 ${bd.day}일`;
          }
          const p = tzParts(new Date((time as number) * 1000));
          return `${p.year}년 ${+p.month}월 ${+p.day}일 ${p.hour}:${p.minute}`;
        },
      },
    });
    const up = tok('--c-up');
    const down = tok('--c-down');
    const series = chart.addSeries(CandlestickSeries, {
      upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    // 왼쪽 끝 근처로 스크롤하면 과거 봉을 더 불러와 앞에 이어붙인다(뷰는 그대로 유지).
    const onRange = (range: { from: number; to: number } | null) => {
      if (!range || range.from > 8) return;
      if (loadingRef.current || exhaustedRef.current || !loadOlderRef.current) return;
      const oldest = dataRef.current[0]?.t;
      if (oldest == null) return;
      loadingRef.current = true;
      loadOlderRef.current(oldest).then((older) => {
        try {
          if (!older || !older.length) { exhaustedRef.current = true; chart.timeScale().applyOptions({ fixLeftEdge: true }); return; }
          const beforeLen = buildRows(dataRef.current, intradayRef.current).length;
          const merged = [...older, ...dataRef.current];
          const rows = buildRows(merged, intradayRef.current);
          const added = rows.length - beforeLen;
          if (added <= 0) { exhaustedRef.current = true; chart.timeScale().applyOptions({ fixLeftEdge: true }); return; }
          dataRef.current = merged;
          const r = chart.timeScale().getVisibleLogicalRange();
          series.setData(rows);
          if (r) chart.timeScale().setVisibleLogicalRange({ from: r.from + added, to: r.to + added });
        } finally { loadingRef.current = false; }
      }).catch(() => { loadingRef.current = false; });
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth });
      if (fitRef.current) chart.timeScale().fitContent();
    });
    ro.observe(el);
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 데이터 갱신(candles/봉종류 변경 시). 무한 스크롤 누적 상태도 리셋.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    dataRef.current = candles;
    exhaustedRef.current = false;
    loadingRef.current = false;
    series.setData(buildRows(candles, intradayRef.current));
    // 과거 로딩 가능 여부에 따라 왼쪽 고정 재설정(심볼/기간 바뀌어도 유지되게).
    chartRef.current?.timeScale().applyOptions({ fixLeftEdge: !loadOlderRef.current });
    chartRef.current?.timeScale().fitContent();
  }, [candles, intraday]);

  // 테마 변경 시 색 재적용.
  useEffect(() => {
    applyTheme();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = () => applyTheme();
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  if (!candles.length) {
    return <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-tx6)', fontSize: 13 }}>차트 데이터 없음</div>;
  }

  return <div ref={elRef} style={{ width: '100%', height: H }} />;
}
