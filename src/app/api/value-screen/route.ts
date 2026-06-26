import { NextResponse } from 'next/server';
import { getValuePage, type Market } from '@/server/valueScreen';

// 저평가 우량주 — 정렬 + 페이지(offset/limit)로 잘라 반환. 스크롤 시 클라가 다음 페이지를 받아온다(무한스크롤).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const market: Market = sp.get('market') === 'us' ? 'us' : 'kr';
  const sort = sp.get('sort') ?? 'score';
  const offset = Math.max(0, parseInt(sp.get('offset') ?? '0', 10) || 0);
  const limit = Math.min(50, Math.max(1, parseInt(sp.get('limit') ?? '20', 10) || 20));
  try {
    const page = await getValuePage(market, sort, offset, limit);
    return NextResponse.json(page);
  } catch (e) {
    console.error('[value-screen] failed:', e);
    return NextResponse.json({ error: 'value_screen_failed' }, { status: 500 });
  }
}
