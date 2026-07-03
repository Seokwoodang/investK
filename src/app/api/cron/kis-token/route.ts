import { NextResponse } from 'next/server';
import { refreshKisToken } from '@/server/providers/kis';

// Vercel Cron이 매일 새벽 6시(KST)에 호출 → KIS 토큰을 장 시작 전 미리 발급해 Supabase에 저장.
// CRON_SECRET이 설정돼 있으면 Authorization 헤더로 보호(Vercel Cron이 자동으로 붙여줌).
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // fail-closed: CRON_SECRET 미설정 배포에서도 절대 공개되지 않게(설정 누락 = 전부 거부).
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const r = await refreshKisToken();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
