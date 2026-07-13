import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE, getSessionUser } from '@/lib/auth';
import { trade, MOCK_TABS, type MockTab, type AcctKind } from '@/server/mock';

// POST /api/mock/trade { kind, tab, code, name, side, qty } — 서버 체결가로 매매.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const user = await getSessionUser(cookies().get(COOKIE)?.value);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { kind?: string; tab?: string; code?: string; name?: string; side?: string; qty?: number };
  const kind: AcctKind = body.kind === 'longterm' ? 'longterm' : 'season';
  const { tab, code, name, side, qty } = body;
  if (!tab || !MOCK_TABS.includes(tab as MockTab)) return NextResponse.json({ error: '지원하지 않는 종목' }, { status: 400 });
  if (!code || !name) return NextResponse.json({ error: '종목 정보 누락' }, { status: 400 });
  if (side !== 'buy' && side !== 'sell') return NextResponse.json({ error: '매수/매도 구분 오류' }, { status: 400 });
  if (!(Number(qty) > 0)) return NextResponse.json({ error: '수량을 확인하세요' }, { status: 400 });
  try {
    return NextResponse.json(await trade(user, kind, { tab: tab as MockTab, code, name, side, qty: Number(qty) }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
