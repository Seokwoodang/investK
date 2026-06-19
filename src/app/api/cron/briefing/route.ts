import { NextResponse } from 'next/server';
import { refreshBriefing } from '@/server/briefing';

// GitHub Actions가 하루 2~3회(오전 6시·오후 5시·오후 10시 KST) 호출 → 현재 시각 슬롯의
// 데일리 브리핑을 Claude로 새로 생성해 Supabase에 저장. 기존 슬롯은 덮어쓰지 않고 따로 보관한다.
// 사용자 /api/ai/briefing은 이 결과(최신 슬롯)를 즉시 읽기만 한다.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const { date, slot } = await refreshBriefing();
    return NextResponse.json({ ok: true, date, slot });
  } catch (e) {
    console.error('[cron/briefing] failed:', (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
