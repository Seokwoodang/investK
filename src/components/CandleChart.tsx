'use client';

import { createChart, CandlestickSeries, ColorType, CrosshairMode } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import type { Candle, Currency, Period } from '../types';

// TradingView Lightweight Charts 기반 인터랙티브 캔들차트(드래그 이동·휠 확대축소·크로스헤어).
// 데이터는 우리 KIS·업비트·바이낸스 실데이터를 그대로 먹인다. 캔버스라 색은 CSS 토큰을 읽어 직접 적용.
// 차트는 완전 독립: 기간 수익률 컨트롤과 서로 영향 주지 않는다.

const H = 360;

function tok(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

export function CandleChart({
  candles,
  theme,
}: {
  candles: Candle[];
  period?: Period;
  cur?: Currency;
  theme?: string; // 테마 변경 시 색 재적용 트리거
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

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
    });
    const up = tok('--c-up');
    const down = tok('--c-down');
    series.applyOptions({ upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down });
  };

  // 생성(1회).
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const chart = createChart(el, {
      height: H,
      width: el.clientWidth,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: tok('--c-tx5'), attributionLogo: true },
      grid: { vertLines: { color: tok('--c-w05') }, horzLines: { color: tok('--c-w05') } },
      rightPriceScale: { borderColor: tok('--c-w08') },
      timeScale: { borderColor: tok('--c-w08'), timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
    });
    const up = tok('--c-up');
    const down = tok('--c-down');
    const series = chart.addSeries(CandlestickSeries, {
      upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down,
    });
    chartRef.current = chart;
    seriesRef.current = series;

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

  // 데이터 갱신. (candles 참조가 바뀔 때만 — 부모에서 useMemo로 안정화해 패닝/줌이 리셋되지 않음)
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
