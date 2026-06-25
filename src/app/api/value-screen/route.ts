import { NextResponse } from 'next/server';
import { getValueScreen } from '@/server/valueScreen';

// 저평가 우량주 스크린 결과. 캐시(오늘자)가 있으면 즉시, 없으면 콜드 1회 생성(수 초~십수 초).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    const screen = await getValueScreen();
    return NextResponse.json(screen);
  } catch (e) {
    console.error('[value-screen] failed:', e);
    return NextResponse.json({ error: 'value_screen_failed' }, { status: 500 });
  }
}
