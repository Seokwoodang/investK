'use client';

import { createChart, CandlestickSeries, ColorType, CrosshairMode } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import type { Candle, Currency, Period } from '../types';

// TradingView Lightweight Charts 기반 인터랙티브 캔들차트(드래그 이동·휠 확대축소·크로스헤어).
// 데이터는 우리 KIS·업비트·바이낸스 실데이터를 그대로 먹인다. 캔버스라 색은 CSS 토큰을 읽어 직접 적용.

const H = 360;

// 보이는 구간의 수익률·기간을 부모에 알린다(기간 수익률 readout이 화면에 보이는 구간을 따름).
export interface VisibleRange {
  ret: number; // (구간 첫 시가 → 마지막 종가) %
  fromMs: number;
  toMs: number;
}

function tok(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

export function CandleChart({
  candles,
  cur,
  theme,
  onVisible,
}: {
  candles: Candle[];
  period?: Period;
  cur?: Currency;
  theme?: string; // 테마 변경 시 색 재적용 트리거
  onVisible?: (v: VisibleRange) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const candlesRef = useRef<Candle[]>(candles);
  const onVisibleRef = useRef(onVisible);
  candlesRef.current = candles;
  onVisibleRef.current = onVisible;

  // 캔버스 색을 현재 테마 토큰으로 적용.
  const applyTheme = () => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: tok('--c-tx5') },
      grid: { vertLines: { color: tok('--c-w05') }, horzLines: { color: tok('--c-w05') } },
      rightPriceScale: { borderColor: tok('--c-w08') },
      timeScale: { borderColor: tok('--c-w08') },
      crosshair: { mode: CrosshairMode.Normal },
    });
    const up = tok('--c-up');
    const down = tok('--c-down');
    series.applyOptions({
      upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down,
    });
  };

  // 생성(1회).
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const chart = createChart(el, {
      height: H,
      width: el.clientWidth,
      autoSize: false,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: tok('--c-tx5'), attributionLogo: true },
      grid: { vertLines: { color: tok('--c-w05') }, horzLines: { color: tok('--c-w05') } },
      rightPriceScale: { borderColor: tok('--c-w08') },
      timeScale: { borderColor: tok('--c-w08'), timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: true,
      handleScale: true,
    });
    const up = tok('--c-up');
    const down = tok('--c-down');
    const series = chart.addSeries(CandlestickSeries, {
      upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    // 보이는 구간이 바뀔 때마다(드래그·줌·초기 표시) 그 구간 수익률을 계산해 부모에 전달.
    const report = () => {
      const cb = onVisibleRef.current;
      if (!cb) return;
      const vr = chart.timeScale().getVisibleRange();
      const cs = candlesRef.current.filter((c) => c.t != null);
      if (!cs.length) return;
      let inView = cs;
      if (vr) {
        const from = (vr.from as number) * 1000;
        const to = (vr.to as number) * 1000;
        const f = cs.filter((c) => (c.t as number) >= from && (c.t as number) <= to);
        if (f.length) inView = f;
      }
      const first = inView[0];
      const last = inView[inView.length - 1];
      cb({ ret: ((last.c - first.o) / first.o) * 100, fromMs: first.t as number, toMs: last.t as number });
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(report);

    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 데이터 갱신.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    // LW는 time 오름차순·중복 없음을 요구 → 초 단위로 변환 후 dedupe.
    const byTime = new Map<number, Candle>();
    for (const c of candles) if (c.t != null) byTime.set(Math.floor((c.t as number) / 1000), c);
    const data = [...byTime.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, c]) => ({ time: t as UTCTimestamp, open: c.o, high: c.h, low: c.l, close: c.c }));
    series.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // 테마 변경 시 색 재적용(클래스 토글) + OS 설정 변경 구독.
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
