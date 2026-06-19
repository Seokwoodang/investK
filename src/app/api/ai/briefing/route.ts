import { NextResponse } from 'next/server';
import { getBriefing } from '@/server/briefing';

// POST /api/ai/briefing { date }
// 그날의 '팩트 브리핑'을 반환한다. cron(/api/cron/briefing)이 하루 2~3회 미리 생성해 Supabase에 저장하므로
// 보통은 가장 최신 슬롯을 즉시 읽기만 한다(대기 없음). 아직 안 만들어진 콜드 상태면 1회 생성.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const { date } = (await req.json()) as { date: string };
  if (!date) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const result = await getBriefing(date);
  return NextResponse.json(result);
}
