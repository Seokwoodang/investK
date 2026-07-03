import { NextResponse } from 'next/server';
import { getKanalyst, buildKanalystData } from '@/server/kanalyst';
import type { KMarket } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST /api/ai/kanalyst { code, market:'kr'|'us', name, ticker, price?, force?, narrative? }
// K-리서치 보고서: 숫자·판정은 코드(EDGAR/야후/네이버), 서술만 Claude(지문 캐시).
// narrative=false면 숫자·차트 데이터만 즉시 반환(1차 로드) → 클라가 이어서 서술을 요청(2차).
// /api/ai/* 는 미들웨어에서 로그인 필요 → 아무나 토큰을 태우지 못함.
export async function POST(req: Request) {
  let b: { code?: string; market?: string; name?: string; ticker?: string; price?: number; force?: boolean; narrative?: boolean };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const market = b.market === 'us' ? 'us' : b.market === 'kr' ? 'kr' : null;
  if (!market || !b.code || !b.name || !b.ticker) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  try {
    if (b.narrative === false) {
      const data = await buildKanalystData(market as KMarket, b.code, b.name, b.ticker, b.price);
      if (!data) return NextResponse.json({ error: 'no data' }, { status: 404 });
      return NextResponse.json({ data, narrative: null, generated: false });
    }
    const report = await getKanalyst(market as KMarket, b.code, b.name, b.ticker, b.price, !!b.force);
    if (!report) return NextResponse.json({ error: 'no data' }, { status: 404 });
    return NextResponse.json(report);
  } catch (e) {
    console.error('[api/ai/kanalyst]', (e as Error).message);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
