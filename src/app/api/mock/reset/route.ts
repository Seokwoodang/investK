import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE, getSessionUser } from '@/lib/auth';
import { reset, type AcctKind } from '@/server/mock';

// POST /api/mock/reset { kind } — 재충전(리스타트).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const user = await getSessionUser(cookies().get(COOKIE)?.value);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { kind?: string };
  const kind: AcctKind = body.kind === 'longterm' ? 'longterm' : 'season';
  try {
    return NextResponse.json(await reset(user, kind));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
