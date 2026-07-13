import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE, getSessionUser } from '@/lib/auth';
import { history, type AcctKind } from '@/server/mock';

// GET /api/mock/history?kind=season|longterm — 자산 변화 스냅샷 + 자산 비중 + 시즌 기록.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getSessionUser(cookies().get(COOKIE)?.value);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const kind: AcctKind = new URL(req.url).searchParams.get('kind') === 'longterm' ? 'longterm' : 'season';
  try {
    return NextResponse.json(await history(user, kind));
  } catch (e) {
    console.error('[mock history]', (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
