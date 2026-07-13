import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE, getSessionUser } from '@/lib/auth';
import { leaderboard, type AcctKind } from '@/server/mock';

// GET /api/mock/leaderboard?kind=season|longterm — 총자산 순위(상위 50).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getSessionUser(cookies().get(COOKIE)?.value);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const kind: AcctKind = new URL(req.url).searchParams.get('kind') === 'longterm' ? 'longterm' : 'season';
  try {
    return NextResponse.json({ rows: await leaderboard(user, kind) });
  } catch (e) {
    console.error('[mock leaderboard]', (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
