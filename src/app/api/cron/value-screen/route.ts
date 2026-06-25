import { NextResponse } from 'next/server';
import { refreshValueScreen } from '@/server/valueScreen';

// 하루 1회(장 마감 후) 시총 상위 유니버스의 재무지표를 받아 점수·랭킹을 미리 만들어 Supabase에 저장.
// 사용자 /api/value-screen은 이 결과만 즉시 읽는다.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const count = await refreshValueScreen();
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    console.error('[cron/value-screen] failed:', e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
