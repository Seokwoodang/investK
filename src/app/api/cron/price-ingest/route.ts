import { NextResponse } from 'next/server';
import { getBacktestUniverse, snapshotUniverse } from '@/server/backtest/universe';
import { ingestMany, appendRecent, priceCoverage } from '@/server/backtest/prices';

// 백테스트용 국내주식 일별 종가 수집 크론.
//  · mode=daily(기본): 유니버스 최근 종가 증분 upsert(장 마감 후 매일). ~30초.
//  · mode=backfill: 과거 다년치 백필. KIS 150ms throttle이라 200종목×10년 ≈ 12분 →
//    Vercel 함수 타임아웃을 넘으므로 로컬 dev(타임아웃 없음)에서 실행하거나 offset/count로 청크 분할.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const token = process.env.MOCK_FILL_TOKEN;
  const byBearer = !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
  const byToken = !!token && new URL(req.url).searchParams.get('t') === token;
  return byBearer || byToken;
}

export async function GET(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') ?? 'daily';
  const n = Math.min(500, Math.max(10, Number(url.searchParams.get('n')) || 200));

  try {
    const universe = await getBacktestUniverse(n);
    await snapshotUniverse(universe);
    const codes = universe.map((u) => u.code);

    if (mode === 'backfill') {
      const yearsBack = Math.min(25, Math.max(1, Number(url.searchParams.get('years')) || 10));
      const start = new Date();
      start.setFullYear(start.getFullYear() - yearsBack);
      const startYmd = `${start.getFullYear()}${String(start.getMonth() + 1).padStart(2, '0')}${String(start.getDate()).padStart(2, '0')}`;
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      const count = Number(url.searchParams.get('count')) || codes.length;
      const slice = codes.slice(offset, offset + count);
      const res = await ingestMany(slice, startYmd);
      const cov = await priceCoverage();
      return NextResponse.json({
        ok: true, mode, from: startYmd, offset, processed: slice.length,
        saved: res.reduce((a, b) => a + Math.max(0, b.n), 0),
        failed: res.filter((r) => r.n < 0).map((r) => r.code),
        coverage: cov,
      });
    }

    // daily
    const saved = await appendRecent(codes);
    const cov = await priceCoverage();
    return NextResponse.json({ ok: true, mode, codes: codes.length, saved, coverage: cov });
  } catch (e) {
    console.error('[price-ingest]', (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
