import { NextResponse } from 'next/server';
import { refreshThreadsToken, threadsTokenStatus } from '@/server/threads';

// 스레드 장기 토큰(60일) 자동 갱신 → KV 저장. 인스타 토큰과 같은 이유로 필수다.
// 토큰 미설정 상태에선 503(스킵)을 돌려 워크플로가 실패로 잡지 않게 한다.
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const before = await threadsTokenStatus();
    const r = await refreshThreadsToken();
    return NextResponse.json({ ok: true, before, ...r });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('THREADS_TOKEN 미설정')) {
      return NextResponse.json({ ok: false, skipped: true, reason: 'THREADS_TOKEN 미설정' }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
