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

// 우측 가격축·크로스헤어 가격 포맷: 천 단위 콤마. 큰 값은 정수, 작은 값(코인 등)은 소수 유지.
function fmtAxisPrice(p: number): string {
  if (p >= 1000) return Math.round(p).toLocaleString('en-US');
  if (p >= 1) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function CandleChart({
  candles,
  theme,
  fit = false,
}: {
  candles: Candle[];
  period?: Period;
  cur?: Currency;
  theme?: string; // 테마 변경 시 색 재적용 트리거
  fit?: boolean; // true면 리사이즈 때도 전체 구간을 fit(모달 등 갓 열린 컨테이너용 — 팬/줌 보존 안 함)
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const fitRef = useRef(fit);
  fitRef.current = fit;

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
      localization: { priceFormatter: fmtAxisPrice },
    });
    const up = tok('--c-up');
    const down = tok('--c-down');
    const series = chart.addSeries(CandlestickSeries, {
      upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth });
      // 모달처럼 마운트 직후 폭이 커지는 컨테이너: 좁은 폭 기준 fitContent가 이미 실행돼
      // 데이터가 오른쪽에 뭉침 → fit 모드에선 리사이즈마다 전체 구간을 다시 맞춘다.
      if (fitRef.current) chart.timeScale().fitContent();
    });
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
