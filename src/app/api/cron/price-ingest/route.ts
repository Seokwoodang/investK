import { NextResponse } from 'next/server';
import { priceCoverage } from '@/server/backtest/prices';
import { backfillKrx, krxDailyAppend } from '@/server/backtest/krx';
import { ingestExtBackfill, ingestExtDaily } from '@/server/backtest/ext';
import { buildBacktestCache } from '@/server/backtest/cache';

// 백테스트용 국내주식 일별 종가 수집 크론(KRX 공식 OpenAPI = 단일 소스, 상폐 포함).
//  · mode=daily(기본): 오늘 KOSPI 전종목 종가+주식수 증분 upsert(장 마감 후 매일). ~수초.
//  · mode=backfill: 과거 다년치(from~to) 백필. 매 거래일 1콜 → 로컬(타임아웃 없음)에서 실행.
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

  try {
    if (mode === 'build-cache') {
      // 백테스트 입력 매트릭스를 gzip 블롭으로 미리 빌드(느린 전종목 로드 1회).
      const res = await buildBacktestCache();
      return NextResponse.json({ ok: true, mode, ...res });
    }
    if (mode === 'ext-backfill') {
      // 미국 지수·환율(S&P500·나스닥100·USD/KRW) 1회성 백필. 소량이라 여기서 바로.
      const ext = await ingestExtBackfill(url.searchParams.get('from')?.replace(/-/g, '') || '20150101');
      return NextResponse.json({ ok: true, mode, ext });
    }
    if (mode === 'backfill') {
      const from = url.searchParams.get('from') || '20160101'; // YYYYMMDD
      const to = url.searchParams.get('to') || (() => { const t = new Date(); return `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}`; })();
      const res = await backfillKrx(from, to);
      const cov = await priceCoverage();
      return NextResponse.json({ ok: true, mode, from, to, ...res, coverage: cov });
    }
    // daily — 국내 종가 + 미국 지수·환율 증분만(빠름). 캐시 재빌드는 별도 호출(mode=build-cache)로
    // 분리 — Vercel Hobby 60초 상한 안에 각각 들어오게(수집+빌드 합치면 아슬아슬).
    const saved = await krxDailyAppend(url.searchParams.get('ymd') || undefined);
    const ext = await ingestExtDaily();
    const cov = await priceCoverage();
    return NextResponse.json({ ok: true, mode, saved, ext, coverage: cov });
  } catch (e) {
    console.error('[price-ingest]', (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
