// 가격 기반 백테스트 엔진 — 순수 함수(IO 없음). 분할 보정된 종가 시계열만 입력받아 정직하게 시뮬레이션.
//  · look-ahead 없음: 각 리밸런싱일의 신호·후보는 그 날까지의 정보만 사용.
//  · 시점별 유니버스: 각 리밸런싱일에 '그 시점' 시총 상위(상폐 포함)만 후보 → 생존편향 제거.
//  · 상폐 처분: 보유 종목이 상장폐지되면(시계열 종료) 마지막 종가로 청산해 현금 보유.
//  · 거래비용: 회전(turnover)에 편도 bps 적용. 벤치마크: 시작 시점 유니버스 동일비중 매수 후 보유.

import type { PriceRow, PitSnapshot } from './prices';

export type StrategyId = 'momentum' | 'ma_trend' | 'low_vol' | 'buy_hold';
export type Rebalance = 'M' | 'Q';

export interface BacktestConfig {
  strategy: StrategyId;
  topN: number;
  lookbackDays: number;
  maWindow: number;
  rebalance: Rebalance;
  costBps: number;
  startCapital: number;
  from: string;
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
  universeUsed: number;
  delistings: number; // 백테스트 기간 중 보유 종목 상폐 처분 횟수(생존편향 제거 증거)
  notes: string[];
}

// 종목을 마스터 캘린더에 정렬 + forward-fill. 단, 마지막 데이터 이후(상폐)는 NaN으로 둬 청산 트리거.
function alignToCalendar(rows: PriceRow[], cal: string[]): Float64Array {
  const arr = new Float64Array(cal.length).fill(NaN);
  const sorted = [...rows].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const lastD = sorted[sorted.length - 1].d;
  let ri = 0, last = NaN;
  for (let i = 0; i < cal.length; i++) {
    while (ri < sorted.length && sorted[ri].d <= cal[i]) { last = sorted[ri].c; ri++; }
    arr[i] = cal[i] <= lastD ? last : NaN; // 상폐 후 = NaN
  }
  return arr;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function metricsOf(equity: number[], dates: string[], turnover: number): Metrics {
  const n = equity.length;
  if (n < 2) return { totalReturn: 0, cagr: 0, mdd: 0, vol: 0, sharpe: 0, winRateM: 0, turnover, days: n };
  const first = equity[0], last = equity[n - 1];
  const totalReturn = last / first - 1;
  const years = (Date.parse(dates[n - 1]) - Date.parse(dates[0])) / 86400000 / 365.25;
  const cagr = years > 0 ? Math.pow(last / first, 1 / years) - 1 : 0;
  const rets: number[] = [];
  for (let i = 1; i < n; i++) if (equity[i - 1] > 0) rets.push(equity[i] / equity[i - 1] - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const sd = stdev(rets);
  const vol = sd * Math.sqrt(252);
  const sharpe = sd > 0 ? (mean / sd) * Math.sqrt(252) : 0;
  let peak = equity[0], mdd = 0;
  for (const v of equity) { if (v > peak) peak = v; const dd = v / peak - 1; if (dd < mdd) mdd = dd; }
  const monthLast = new Map<string, number>();
  for (let i = 0; i < n; i++) monthLast.set(dates[i].slice(0, 7), equity[i]);
  const mv = [...monthLast.values()];
  let wins = 0, tot = 0;
  for (let i = 1; i < mv.length; i++) { tot++; if (mv[i] > mv[i - 1]) wins++; }
  return { totalReturn, cagr, mdd, vol, sharpe, winRateM: tot > 0 ? wins / tot : 0, turnover, days: n };
}

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

// 리밸런싱일 i에서 후보(candidateCodes) 중 신호 상위 topN(동일비중).
function selectPicks(cfg: BacktestConfig, candidateCodes: string[], series: Map<string, Float64Array>, i: number): string[] {
  if (cfg.strategy === 'buy_hold') return candidateCodes.filter((c) => Number.isFinite(series.get(c)?.[i]));
  const scored: { code: string; s: number }[] = [];
  for (const code of candidateCodes) {
    const a = series.get(code);
    if (!a) continue;
    const px = a[i];
    if (!Number.isFinite(px)) continue;
    if (cfg.strategy === 'momentum') {
      const j = i - cfg.lookbackDays;
      if (j < 0 || !Number.isFinite(a[j]) || a[j] <= 0) continue;
      scored.push({ code, s: px / a[j] - 1 });
    } else if (cfg.strategy === 'low_vol') {
      const j = i - cfg.lookbackDays;
      if (j < 0) continue;
      const rets: number[] = [];
      for (let k = j + 1; k <= i; k++) if (Number.isFinite(a[k]) && Number.isFinite(a[k - 1]) && a[k - 1] > 0) rets.push(a[k] / a[k - 1] - 1);
      if (rets.length < cfg.lookbackDays * 0.6) continue;
      scored.push({ code, s: -stdev(rets) });
    } else if (cfg.strategy === 'ma_trend') {
      const j = i - cfg.maWindow + 1;
      if (j < 0) continue;
      let sum = 0, cnt = 0;
      for (let k = j; k <= i; k++) if (Number.isFinite(a[k])) { sum += a[k]; cnt++; }
      if (cnt < cfg.maWindow * 0.6) continue;
      const sma = sum / cnt;
      if (!(px > sma)) continue;
      scored.push({ code, s: px / sma - 1 });
    }
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, cfg.topN).map((x) => x.code);
}

export function runBacktest(cfg: BacktestConfig, priceMap: Map<string, PriceRow[]>, pitSnapshots: PitSnapshot[] = []): BacktestResult {
  const notes: string[] = [];
  const codes = [...priceMap.keys()].filter((c) => (priceMap.get(c)?.length ?? 0) > 0);
  if (!codes.length) throw new Error('가격 데이터가 없습니다.');

  const dateSet = new Set<string>();
  for (const c of codes) for (const r of priceMap.get(c)!) if (r.d >= cfg.from && r.d <= cfg.to) dateSet.add(r.d);
  const cal = [...dateSet].sort();
  if (cal.length < 30) throw new Error('거래일이 너무 적습니다(데이터 부족).');

  const series = new Map<string, Float64Array>();
  for (const c of codes) series.set(c, alignToCalendar(priceMap.get(c)!, cal));

  // 각 캘린더 인덱스에서 유효한 시점별 유니버스(가장 최근 스냅샷 d<=오늘). 없으면 전 종목.
  const snaps = pitSnapshots.filter((s) => s.d <= cfg.to).sort((a, b) => (a.d < b.d ? -1 : 1));
  const universeAt = (i: number): string[] => {
    if (!snaps.length) return codes;
    let pick = snaps[0].codes;
    for (const s of snaps) { if (s.d <= cal[i]) pick = s.codes; else break; }
    return pick;
  };

  const minIdx = cfg.strategy === 'buy_hold' ? 1 : Math.max(cfg.strategy === 'ma_trend' ? cfg.maWindow : cfg.lookbackDays, 1);
  if (minIdx >= cal.length - 5) throw new Error('룩백 기간이 데이터 범위보다 큽니다.');
  const rebIdx = cfg.strategy === 'buy_hold' ? [minIdx] : rebalanceIndices(cal, minIdx, cfg.rebalance);
  const allowEmpty = cfg.strategy === 'ma_trend';
  const rebSet = new Map<number, string[]>();
  const rebalances: RebalanceRec[] = [];
  for (const ri of rebIdx) {
    const picks = selectPicks(cfg, universeAt(ri), series, ri);
    if (picks.length || allowEmpty) { rebSet.set(ri, picks); rebalances.push({ d: cal[ri], picks }); }
  }
  if (!rebalances.some((r) => r.picks.length)) throw new Error('선택된 종목이 없습니다(조건을 완화해 보세요).');

  // ── 전략 시뮬레이션(현금 + 상폐 청산) ──
  const cost = cfg.costBps / 10000;
  const startIdx = rebIdx[0];
  let shares = new Map<string, number>();
  const lastPx = new Map<string, number>();
  let cash = cfg.startCapital;
  let turnoverSum = 0, turnoverCnt = 0, delistings = 0;
  const equity: number[] = [], eqDates: string[] = [];

  for (let i = startIdx; i < cal.length; i++) {
    // 상폐 처분: 보유 중인데 오늘 가격이 NaN(상폐 후)이면 마지막가로 청산 → 현금.
    for (const [code, sh] of [...shares]) {
      const px = series.get(code)![i];
      if (Number.isFinite(px)) { lastPx.set(code, px); }
      else { cash += sh * (lastPx.get(code) ?? 0); shares.delete(code); delistings++; }
    }
    let mkt = 0;
    for (const [code, sh] of shares) mkt += sh * series.get(code)![i];
    let curValue = cash + mkt;

    const picks = rebSet.get(i);
    if (picks) {
      const target = picks.length ? curValue / picks.length : 0;
      const curVal = new Map<string, number>();
      for (const [code, sh] of shares) curVal.set(code, sh * series.get(code)![i]);
      const allCodes = new Set<string>([...curVal.keys(), ...picks]);
      let traded = 0;
      for (const code of allCodes) traded += Math.abs((picks.includes(code) ? target : 0) - (curVal.get(code) ?? 0));
      curValue -= traded * cost;
      turnoverSum += curValue > 0 ? traded / curValue : 0; turnoverCnt++;
      shares = new Map();
      if (picks.length) {
        const per = curValue / picks.length;
        for (const code of picks) { const px = series.get(code)![i]; if (px > 0) { shares.set(code, per / px); lastPx.set(code, px); } }
        cash = 0;
      } else { cash = curValue; }
    }
    let v = cash;
    for (const [code, sh] of shares) v += sh * series.get(code)![i];
    equity.push(v); eqDates.push(cal[i]);
  }

  // ── 벤치마크: 시작 시점 유니버스 동일비중 매수 후 보유(상폐는 마지막가 청산) ──
  const benchUniverse = universeAt(startIdx).filter((c) => { const a = series.get(c); return a && Number.isFinite(a[startIdx]) && a[startIdx] > 0; });
  const benchShares = new Map<string, number>();
  const benchLast = new Map<string, number>();
  let benchCash = 0;
  const perB = cfg.startCapital / (benchUniverse.length || 1);
  for (const c of benchUniverse) { const px = series.get(c)![startIdx]; benchShares.set(c, perB / px); benchLast.set(c, px); }
  const bench: number[] = [];
  for (let i = startIdx; i < cal.length; i++) {
    for (const [code, sh] of [...benchShares]) {
      const px = series.get(code)![i];
      if (Number.isFinite(px)) benchLast.set(code, px);
      else { benchCash += sh * (benchLast.get(code) ?? 0); benchShares.delete(code); }
    }
    let v = benchCash;
    for (const [code, sh] of benchShares) v += sh * series.get(code)![i];
    bench.push(v);
  }

  const equityPts: EquityPoint[] = equity.map((v, k) => ({ d: eqDates[k], v: Math.round(v), bench: Math.round(bench[k]) }));

  notes.push('종가-종가 체결 · 편도 거래비용 ' + (cfg.costBps / 100).toFixed(2) + '% · 액면분할 보정(배당 재투자 미반영)');
  notes.push(snaps.length
    ? `시점별 유니버스(그 시점 KOSPI 시총 상위, 상폐 종목 포함) → 생존편향 제거 · 기간 중 ${delistings}건 상폐 처분`
    : '유니버스=현재 KOSPI 상위(생존편향 존재)');
  notes.push('벤치마크=시작 시점 유니버스 동일비중 매수 후 보유');

  return {
    equity: equityPts,
    metrics: metricsOf(equity, eqDates, turnoverCnt ? turnoverSum / turnoverCnt : 0),
    benchMetrics: metricsOf(bench, eqDates, 0),
    rebalances, universeUsed: codes.length, delistings, notes,
  };
}
