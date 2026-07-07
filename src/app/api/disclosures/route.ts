import { NextResponse } from 'next/server';
import { getDisclosures } from '@/server/providers/dart';

// POST /api/disclosures { codes: string[] } → 국내 종목 최근 주요 공시(수주·실적 등).
// 공개 정보 + DART/맵 캐시(코드당 1시간, corp맵 하루)라 공개 라우트. 코드는 프로바이더에서 30개로 상한.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const { codes, days } = (await req.json().catch(() => ({}))) as { codes?: unknown; days?: unknown };
  if (!Array.isArray(codes) || !codes.length) return NextResponse.json({ disclosures: [] });
  // days 미지정 = 대시보드 속보(7일). 상세 페이지는 이력용으로 길게(최대 365) 요청.
  const win = typeof days === 'number' && days > 0 ? Math.min(Math.floor(days), 365) : 7;
  const perStock = win > 30 ? 20 : 6; // 긴 창(상세)은 종목당 더 많이
  const disclosures = await getDisclosures(codes.map(String), win, perStock);
  return NextResponse.json({ disclosures });
}
