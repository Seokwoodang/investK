import { NextResponse } from 'next/server';
import { getEtfProfile, resolveEtfSymbol } from '@/server/providers/yahoo';
import { getNaverEtfProfile } from '@/server/providers/naver';

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

  // 한국 6자리 코드는 Yahoo에서 .KS(코스피)/.KQ(코스닥) 접미가 필요 → 바 코드는 건너뛰고 바로 접미로 조회
  //  (바 코드 선조회는 실패하면서 crumb를 꼬이게 해 뒤 호출까지 연쇄 실패시킴).
  const isKrCode = /^\d{6}$/.test(validSym);
  let profile: Awaited<ReturnType<typeof getEtfProfile>> = null;
  if (isKrCode) {
    // 국내 ETF: 네이버가 구성종목·운용사·지수까지 줘서 우선. 실패 시 Yahoo .KS/.KQ(이름·가격·차트만).
    profile = (await getNaverEtfProfile(validSym)) ?? (await getEtfProfile(`${validSym}.KS`)) ?? (await getEtfProfile(`${validSym}.KQ`));
  } else if (validSym) {
    profile = await getEtfProfile(validSym);
  }
  // 그래도 없으면 이름(또는 티커)으로 Yahoo 심볼 검색 후 재조회.
  if (!profile) {
    const resolved = await resolveEtfSymbol(name || validSym);
    if (resolved && resolved.toUpperCase() !== validSym) profile = await getEtfProfile(resolved.toUpperCase());
  }
  if (!profile) return NextResponse.json({ error: 'not-found' }, { status: 404 });

  return NextResponse.json(profile, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
