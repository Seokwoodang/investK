import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getKanalyst, buildKanalystData } from '@/server/kanalyst';
import { COOKIE, getSessionUser } from '@/lib/auth';
import { env } from '@/server/env';
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
    // 강제 재생성(force)은 비용을 새로 태우므로 관리자만 허용. 남이 요청을 직접 쏴도 무시된다.
    let force = false;
    if (b.force) {
      const user = await getSessionUser(cookies().get(COOKIE)?.value);
      force = !!user && user === env.ADMIN_USER;
    }
    const report = await getKanalyst(market as KMarket, b.code, b.name, b.ticker, b.price, force);
    if (!report) return NextResponse.json({ error: 'no data' }, { status: 404 });
    return NextResponse.json(report);
  } catch (e) {
    console.error('[api/ai/kanalyst]', (e as Error).message);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
