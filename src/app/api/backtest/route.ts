import { NextResponse } from 'next/server';
import { getBacktestUniverse } from '@/server/backtest/universe';
import { getPriceSeries } from '@/server/backtest/prices';
import { runBacktest, type BacktestConfig, type StrategyId, type Rebalance } from '@/server/backtest/engine';

// 가격 기반 백테스트 실행. 저장된 종가(kr_prices)만 사용 — 요청당 외부 API 호출 없음(빠름).
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

    const cfg: BacktestConfig = {
      strategy,
      topN: clamp(Number(b.topN), 1, 50, 20),
      lookbackDays: clamp(Number(b.lookbackDays), 20, 500, 120),
      maWindow: clamp(Number(b.maWindow), 20, 300, 120),
      rebalance: (b.rebalance === 'M' ? 'M' : 'Q') as Rebalance,
      costBps: clamp(Number(b.costBps), 0, 100, 20),
      startCapital: clamp(Number(b.startCapital), 1_000_000, 1_000_000_000, 10_000_000),
      from: typeof b.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.from) ? b.from : ymd(tenYago),
      to: typeof b.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.to) ? b.to : ymd(now),
    };
    const universeN = clamp(Number(b.universeN), 30, 300, 200);

    const universe = await getBacktestUniverse(universeN);
    const codes = universe.map((u) => u.code);
    const nameByCode: Record<string, string> = {};
    for (const u of universe) nameByCode[u.code] = u.name;

    const priceMap = await getPriceSeries(codes, cfg.from, cfg.to);
    if (![...priceMap.values()].some((r) => r.length > 0)) {
      return NextResponse.json({ error: '저장된 가격 데이터가 없습니다. 먼저 데이터 수집(백필)이 필요합니다.' }, { status: 409 });
    }

    const result = runBacktest(cfg, priceMap);
    // 리밸런싱 종목 코드 → 이름 부착(마지막 리밸런싱만 상세, 나머지는 코드).
    const rebalances = result.rebalances.map((r) => ({ d: r.d, picks: r.picks.map((c) => ({ code: c, name: nameByCode[c] ?? c })) }));

    return NextResponse.json({ ok: true, config: cfg, ...result, rebalances });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
