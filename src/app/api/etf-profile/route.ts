import { NextResponse } from 'next/server';
import { getEtfProfile, resolveEtfSymbol } from '@/server/providers/yahoo';

// 해외 ETF 프로필(운용사·추종·보수·구성종목 등) — 국내 유니버스에 없는 보유 종목을 ETF답게 소개.
// 데이터: Yahoo Finance. 티커로 먼저 조회하고, 실패하면 종목명으로 심볼 검색 후 재조회.
// 어느 것도 ETF로 안 잡히면 404(정직한 폴백 — 추측 데이터 금지).
export const runtime = 'nodejs';
export const revalidate = 3600;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const rawSymbol = q.get('symbol')?.trim() ?? '';
  const name = q.get('name')?.trim() ?? '';
  const validSym = /^[A-Za-z0-9.^-]{1,15}$/.test(rawSymbol) ? rawSymbol.toUpperCase() : '';
  if (!validSym && !name) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  // 1) 티커 그대로 조회 → 2) 실패 시 이름(또는 티커)으로 Yahoo 심볼 검색 후 재조회.
  let profile = validSym ? await getEtfProfile(validSym) : null;
  if (!profile) {
    const resolved = await resolveEtfSymbol(name || validSym);
    if (resolved && resolved.toUpperCase() !== validSym) profile = await getEtfProfile(resolved.toUpperCase());
  }
  if (!profile) return NextResponse.json({ error: 'not-found' }, { status: 404 });

  return NextResponse.json(profile, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
