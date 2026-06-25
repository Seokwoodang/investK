import { NextResponse } from 'next/server';
import { getValueScreen, type Market } from '@/server/valueScreen';

// 저평가 우량주 스크린(국내/해외). 캐시(오늘자)면 즉시, 없으면 콜드 1회 생성.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const m = new URL(req.url).searchParams.get('market');
  const market: Market = m === 'us' ? 'us' : 'kr';
  try {
    const screen = await getValueScreen(market);
    return NextResponse.json(screen);
  } catch (e) {
    console.error('[value-screen] failed:', e);
    return NextResponse.json({ error: 'value_screen_failed' }, { status: 500 });
  }
}
