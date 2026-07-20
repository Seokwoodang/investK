import { NextResponse } from 'next/server';
import { loadBacktestCache, sliceExt } from '@/server/backtest/cache';
import { runBacktest, type BacktestConfig, type StrategyId, type Rebalance } from '@/server/backtest/engine';

// 미국 지수를 '원화로 산' 가치로 환산해 백테스트 자산곡선에 겹칠 비교선 계산.
//  원화가치_t = 원금 × (지수_t/지수_0) × (환율_t/환율_0). 지수·환율은 직전 값 forward-fill.
function krwLine(eqDates: string[], idx: { d: string; c: number }[], fx: { d: string; c: number }[], startCapital: number): number[] | null {
  if (!idx.length || !fx.length) return null;
  const asOf = (arr: { d: string; c: number }[]) => {
    const m = new Map<string, number>();
    let last = NaN;
    let j = 0;
    for (const d of eqDates) {
      while (j < arr.length && arr[j].d <= d) { last = arr[j].c; j++; }
      m.set(d, last);
    }
    return m;
  };
  const im = asOf(idx), fm = asOf(fx);
  const i0 = im.get(eqDates[0]), f0 = fm.get(eqDates[0]);
  if (!i0 || !f0 || !Number.isFinite(i0) || !Number.isFinite(f0)) return null;
  return eqDates.map((d) => {
    const iv = im.get(d), fv = fm.get(d);
    return iv && fv && Number.isFinite(iv) && Number.isFinite(fv) ? Math.round(startCapital * (iv / i0) * (fv / f0)) : NaN;
  });
}
function cagrOf(series: number[], dates: string[]): number {
  const clean = series.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return 0;
  const years = (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86400000 / 365.25;
  return years > 0 ? Math.pow(clean[clean.length - 1] / clean[0], 1 / years) - 1 : 0;
}

// 가격 기반 백테스트 실행. 시점별 유니버스(pit_universe, 상폐 포함) + 분할보정 종가(kr_prices)만 사용.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STRATS: StrategyId[] = ['momentum', 'ma_trend', 'low_vol', 'buy_hold'];
const clamp = (v: number, lo: number, hi: number, dflt: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const strategy: StrategyId = STRATS.includes(b.strategy as StrategyId) ? (b.strategy as StrategyId) : 'momentum';
    const now = new Date();
    const tenYago = new Date(now); tenYago.setFullYear(now.getFullYear() - 10);

    const isDca = b.contribMode === 'dca';
    const cfg: BacktestConfig = {
      strategy,
      topN: clamp(Number(b.topN), 1, 50, 20),
      lookbackDays: clamp(Number(b.lookbackDays), 20, 500, 120),
      maWindow: clamp(Number(b.maWindow), 20, 300, 120),
      rebalance: (b.rebalance === 'M' ? 'M' : 'Q') as Rebalance,
      costBps: clamp(Number(b.costBps), 0, 100, 20),
      // 적립식은 초기 seed 0 허용(매월 납입만도 가능), 일시불은 최소 100만원.
      startCapital: clamp(Number(b.startCapital), isDca ? 0 : 1_000_000, 1_000_000_000, 10_000_000),
      from: typeof b.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.from) ? b.from : ymd(tenYago),
      to: typeof b.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.to) ? b.to : ymd(now),
      ...(isDca ? {
        contribMode: 'dca' as const,
        contribAmount: clamp(Number(b.contribAmount), 10_000, 100_000_000, 500_000),
        contribEvery: (b.contribEvery === 'Q' ? 'Q' : 'M') as Rebalance,
      } : {}),
    };

    // 미리 만든 캐시 블롭 1개 로드(분할보정 매트릭스 + 시점별 유니버스 + 미국지수). 콜드도 빠름.
    const cache = await loadBacktestCache();
    if (!cache || !cache.snapshots.length) {
      return NextResponse.json({ error: '백테스트 데이터 캐시가 아직 없습니다(빌드 필요).' }, { status: 409 });
    }
    const { priceMap, snapshots, names, ext: extAll } = cache;

    const result = runBacktest(cfg, priceMap, snapshots);
    const rebalances = result.rebalances.map((r) => ({ d: r.d, picks: r.picks.map((c) => ({ code: c, name: names[c] ?? c })) }));

    // 미국 지수(원화 환산) 비교선 — 자산곡선에 겹침. (일시불 기준이라 적립식에선 비교 무의미 → 생략)
    const eqDates = result.equity.map((e) => e.d);
    const ext = sliceExt(extAll, cfg.from, cfg.to);
    const spx = isDca ? null : krwLine(eqDates, ext.SPX ?? [], ext.USDKRW ?? [], cfg.startCapital);
    const ndx = isDca ? null : krwLine(eqDates, ext.NDX ?? [], ext.USDKRW ?? [], cfg.startCapital);
    const equity = result.equity.map((e, i) => ({ ...e, spx: spx ? spx[i] : null, ndx: ndx ? ndx[i] : null }));
    const benchExt = {
      spxCagr: spx ? cagrOf(spx, eqDates) : null,
      ndxCagr: ndx ? cagrOf(ndx, eqDates) : null,
    };

    return NextResponse.json({ ok: true, config: cfg, ...result, equity, rebalances, benchExt });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
