import { NextResponse } from 'next/server';
import { getMacroExtras } from '@/server/data';

// GET /api/macro — 지수·일정·시장지표(라이브). 첫 페인트를 막지 않도록 페이지 HTML에서 분리해
// 클라가 마운트 후 받아 채운다. 공개 데이터 + revalidate 캐시로 완충.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  try {
    const extras = await getMacroExtras();
    return NextResponse.json(extras, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (e) {
    console.error('[macro] failed:', e);
    return NextResponse.json({ indices: [], events: [], market: undefined }, { status: 200 });
  }
}
