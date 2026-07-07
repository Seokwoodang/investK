import { NextResponse } from 'next/server';
import { getDisclosures } from '@/server/providers/dart';

// POST /api/disclosures { codes: string[] } → 국내 종목 최근 주요 공시(수주·실적 등).
// 공개 정보 + DART/맵 캐시(코드당 1시간, corp맵 하루)라 공개 라우트. 코드는 프로바이더에서 30개로 상한.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const { codes } = (await req.json().catch(() => ({}))) as { codes?: unknown };
  if (!Array.isArray(codes) || !codes.length) return NextResponse.json({ disclosures: [] });
  const disclosures = await getDisclosures(codes.map(String));
  return NextResponse.json({ disclosures });
}
