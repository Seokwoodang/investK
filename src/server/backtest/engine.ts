// 가격 기반 백테스트 엔진 — 순수 함수(IO 없음). 종가 시계열만 입력받아 정직하게 시뮬레이션한다.
//  · look-ahead 없음: 각 리밸런싱일의 신호는 그 날까지의 가격만 사용.
//  · 거래비용: 회전(turnover)에 편도 bps 적용(수수료+세금+슬리피지 근사).
//  · 벤치마크: 유니버스 동일비중 매수 후 보유(추가 리밸런싱 없음).
//  · 한계(정직 고지): 유니버스가 '현재' KOSPI 상위라 과거 상폐 종목 제외 → 생존편향. 종가-종가 체결.

import type { PriceRow } from './prices';

export type StrategyId = 'momentum' | 'ma_trend' | 'low_vol' | 'buy_hold';
export type Rebalance = 'M' | 'Q';

export interface BacktestConfig {
  strategy: StrategyId;
  topN: number;          // 보유 종목 수
  lookbackDays: number;  // 모멘텀/로우볼 룩백(거래일)
  maWindow: number;      // 이동평균 창(ma_trend, 거래일)
  rebalance: Rebalance;
  costBps: number;       // 편도 거래비용(bps, 예: 20 = 0.2%)
  startCapital: number;
  from: string;          // 'YYYY-MM-DD'
  to: string;
}

export interface EquityPoint { d: string; v: number; bench: number }
export interface Metrics {
  totalReturn: number; cagr: number; mdd: number; vol: number; sharpe: number;
  winRateM: number; turnover: number; days: number;
}
export interface RebalanceRec { d: string; picks: string[] }
export interface BacktestResult {
  equity: EquityPoint[];
  metrics: Metrics;
  benchMetrics: Metrics;
  rebalances: RebalanceRec[];
  universeUsed: number;   // 데이터가 있어 실제 후보가 된 종목 수
  notes: string[];
}

// 캘린더 인덱스 기준 오른쪽 정렬(<=target) 값을 위해, 각 종목을 마스터 캘린더에 forward-fill 정렬.
function alignToCalendar(rows: PriceRow[], cal: string[]): Float64Array {
  const arr = new Float64Array(cal.length).fill(NaN);
  let ri = 0, last = NaN;
  const sorted = [...rows].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  for (let i = 0; i < cal.length; i++) {
    while (ri < sorted.length && sorted[ri].d <= cal[i]) { last = sorted[ri].c; ri++; }
    arr[i] = last;
  }
  return arr;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

// 자산곡선(절대값 배열) + 날짜 → 성과지표.
function metricsOf(equity: number[], dates: string[], turnover: number): Metrics {
  const n = equity.length;
  if (n < 2) return { totalReturn: 0, cagr: 0, mdd: 0, vol: 0, sharpe: 0, winRateM: 0, turnover, days: n };
  const first = equity[0], last = equity[n - 1];
  const totalReturn = last / first - 1;
  const calDays = (Date.parse(dates[n - 1]) - Date.parse(dates[0])) / 86400000;
  const years = calDays / 365.25;
  const cagr = years > 0 ? Math.pow(last / first, 1 / years) - 1 : 0;
  // 일별 수익률
  const rets: number[] = [];
  for (let i = 1; i < n; i++) if (equity[i - 1] > 0) rets.push(equity[i] / equity[i - 1] - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const sd = stdev(rets);
  const vol = sd * Math.sqrt(252);
  const sharpe = sd > 0 ? (mean / sd) * Math.sqrt(252) : 0;
  // 최대낙폭
  let peak = equity[0], mdd = 0;
  for (const v of equity) { if (v > peak) peak = v; const dd = v / peak - 1; if (dd < mdd) mdd = dd; }
  // 월간 승률
  const monthLast = new Map<string, number>();
  for (let i = 0; i < n; i++) monthLast.set(dates[i].slice(0, 7), equity[i]);
  const mv = [...monthLast.values()];
  let wins = 0, tot = 0;
  for (let i = 1; i < mv.length; i++) { tot++; if (mv[i] > mv[i - 1]) wins++; }
  const winRateM = tot > 0 ? wins / tot : 0;
  return { totalReturn, cagr, mdd, vol, sharpe, winRateM, turnover, days: n };
}

// 리밸런싱일 인덱스 목록: minIdx 이후, 월/분기 경계의 첫 거래일. 첫 유효일은 항상 포함(초기 매수).
function rebalanceIndices(cal: string[], minIdx: number, freq: Rebalance): number[] {
  const out: number[] = [];
  let prevKey = '';
  for (let i = minIdx; i < cal.length; i++) {
    const mo = cal[i].slice(5, 7);
    const key = freq === 'M' ? cal[i].slice(0, 7) : `${cal[i].slice(0, 4)}-Q${Math.floor((+mo - 1) / 3)}`;
    if (key !== prevKey) { out.push(i); prevKey = key; }
  }
  if (!out.length && minIdx < cal.length) out.push(minIdx);
  return out;
}

// 신호 계산: 리밸런싱일 인덱스 i에서 보유할 종목 코드 목록(동일비중).
function selectPicks(
  cfg: BacktestConfig, codes: string[], series: Map<string, Float64Array>, i: number,
): string[] {
  if (cfg.strategy === 'buy_hold') {
    return codes.filter((c) => Number.isFinite(series.get(c)![i]));
  }
  const scored: { code: string; s: number }[] = [];
  for (const code of codes) {
    const a = series.get(code)!;
    const px = a[i];
    if (!Number.isFinite(px)) continue;
    if (cfg.strategy === 'momentum') {
      const j = i - cfg.lookbackDays;
      if (j < 0 || !Number.isFinite(a[j]) || a[j] <= 0) continue;
      scored.push({ code, s: px / a[j] - 1 }); // 룩백 수익률(높을수록)
    } else if (cfg.strategy === 'low_vol') {
      const j = i - cfg.lookbackDays;
      if (j < 0) continue;
      const rets: number[] = [];
      for (let k = j + 1; k <= i; k++) if (Number.isFinite(a[k]) && Number.isFinite(a[k - 1]) && a[k - 1] > 0) rets.push(a[k] / a[k - 1] - 1);
      if (rets.length < cfg.lookbackDays * 0.6) continue;
      scored.push({ code, s: -stdev(rets) }); // 변동성 낮을수록(음수라 큰 값 우선)
    } else if (cfg.strategy === 'ma_trend') {
      const j = i - cfg.maWindow + 1;
      if (j < 0) continue;
      let sum = 0, cnt = 0;
      for (let k = j; k <= i; k++) if (Number.isFinite(a[k])) { sum += a[k]; cnt++; }
      if (cnt < cfg.maWindow * 0.6) continue;
      const sma = sum / cnt;
      if (!(px > sma)) continue; // 추세 위(SMA 상단)만 보유
      scored.push({ code, s: px / sma - 1 }); // 이격도 큰 순
    }
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, cfg.topN).map((x) => x.code);
}

export function runBacktest(cfg: BacktestConfig, priceMap: Map<string, PriceRow[]>): BacktestResult {
  const notes: string[] = [];
  const codes = [...priceMap.keys()].filter((c) => (priceMap.get(c)?.length ?? 0) > 0);
  if (!codes.length) throw new Error('가격 데이터가 없습니다.');

  // 마스터 거래일 캘린더 = 전 종목 날짜 합집합(범위 내).
  const dateSet = new Set<string>();
  for (const c of codes) for (const r of priceMap.get(c)!) if (r.d >= cfg.from && r.d <= cfg.to) dateSet.add(r.d);
  const cal = [...dateSet].sort();
  if (cal.length < 30) throw new Error('거래일이 너무 적습니다(데이터 부족).');

  const series = new Map<string, Float64Array>();
  for (const c of codes) series.set(c, alignToCalendar(priceMap.get(c)!, cal));

  const minIdx = Math.max(cfg.strategy === 'ma_trend' ? cfg.maWindow : cfg.lookbackDays, 1);
  if (minIdx >= cal.length - 5) throw new Error('룩백 기간이 데이터 범위보다 큽니다.');
  const rebIdx = cfg.strategy === 'buy_hold' ? [minIdx] : rebalanceIndices(cal, minIdx, cfg.rebalance);
  const rebSet = new Map<number, string[]>();
  const rebalances: RebalanceRec[] = [];
  for (const ri of rebIdx) {
    const picks = selectPicks(cfg, codes, series, ri);
    if (picks.length) { rebSet.set(ri, picks); rebalances.push({ d: cal[ri], picks }); }
  }
  if (!rebalances.length) throw new Error('선택된 종목이 없습니다(조건을 완화해 보세요).');

  // 시뮬레이션(전략).
  const cost = cfg.costBps / 10000;
  let shares = new Map<string, number>();
  let value = cfg.startCapital;
  const equity: number[] = [];
  const eqDates: string[] = [];
  let turnoverSum = 0, turnoverCnt = 0;
  const startIdx = rebIdx[0];
  for (let i = startIdx; i < cal.length; i++) {
    // 현재 평가액(리밸런싱 전)
    let mkt = 0;
    for (const [code, sh] of shares) { const px = series.get(code)![i]; if (Number.isFinite(px)) mkt += sh * px; }
    let curValue = shares.size ? mkt : value;

    const picks = rebSet.get(i);
    if (picks) {
      // 목표 = 동일비중. 회전 = Σ|목표금액 - 현재금액| / 평가액.
      const target = curValue / picks.length;
      const curVal = new Map<string, number>();
      for (const [code, sh] of shares) curVal.set(code, sh * (series.get(code)![i] || 0));
      const allCodes = new Set<string>([...curVal.keys(), ...picks]);
      let traded = 0;
      for (const code of allCodes) {
        const cv = curVal.get(code) ?? 0;
        const tv = picks.includes(code) ? target : 0;
        traded += Math.abs(tv - cv);
      }
      const c = traded * cost;
      curValue -= c;
      turnoverSum += curValue > 0 ? traded / curValue : 0; turnoverCnt++;
      // 새 보유 수량
      shares = new Map();
      const per = curValue / picks.length;
      for (const code of picks) { const px = series.get(code)![i]; if (px > 0) shares.set(code, per / px); }
    }
    // 리밸런싱 반영 후 평가액
    let v = 0;
    for (const [code, sh] of shares) { const px = series.get(code)![i]; if (Number.isFinite(px)) v += sh * px; }
    value = shares.size ? v : curValue;
    equity.push(value);
    eqDates.push(cal[i]);
  }

  // 벤치마크: 시작일 유니버스 동일비중 매수 후 보유.
  const benchCodes = codes.filter((c) => Number.isFinite(series.get(c)![startIdx]) && series.get(c)![startIdx] > 0);
  const benchShares = new Map<string, number>();
  const perB = cfg.startCapital / benchCodes.length;
  for (const c of benchCodes) benchShares.set(c, perB / series.get(c)![startIdx]);
  const bench: number[] = [];
  for (let i = startIdx; i < cal.length; i++) {
    let v = 0;
    for (const [code, sh] of benchShares) { const px = series.get(code)![i]; if (Number.isFinite(px)) v += sh * px; }
    bench.push(v);
  }

  const equityPts: EquityPoint[] = equity.map((v, k) => ({ d: eqDates[k], v: Math.round(v), bench: Math.round(bench[k]) }));
  const avgTurnover = turnoverCnt ? turnoverSum / turnoverCnt : 0;

  notes.push('종가-종가 체결 · 편도 거래비용 ' + (cfg.costBps / 100).toFixed(2) + '% 반영');
  notes.push('유니버스=현재 KOSPI 상위 종목 → 과거 상폐 종목 미포함(생존편향 존재)');
  notes.push('벤치마크=유니버스 동일비중 매수 후 보유');

  return {
    equity: equityPts,
    metrics: metricsOf(equity, eqDates, avgTurnover),
    benchMetrics: metricsOf(bench, eqDates, 0),
    rebalances,
    universeUsed: codes.length,
    notes,
  };
}
