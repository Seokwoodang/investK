import { NextResponse } from 'next/server';
import { getUniverse } from '@/server/data';

// 전 종목 유니버스(수천 행). 대시보드 첫 페인트를 막지 않도록 페이지 HTML에서 분리해
// 클라이언트가 마운트 후 한 번 받아 컨텍스트에 채운다. 미들웨어가 인증을 보증한다.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  try {
    const stocks = await getUniverse();
    return NextResponse.json(stocks, {
      // 같은 종목 목록을 짧게 브라우저 캐시(자주 페이지 이동 시 재요청 방지). 시세는 실시간 채널이 따로 갱신.
      headers: { 'Cache-Control': 'private, max-age=120' },
    });
  } catch (e) {
    console.error('[universe] failed:', e);
    return NextResponse.json({ error: 'universe_failed' }, { status: 500 });
  }
}
