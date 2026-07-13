import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE, getSessionUser } from '@/lib/auth';
import { placeOrder, cancelOrder, MOCK_TABS, type MockTab, type AcctKind } from '@/server/mock';

// POST /api/mock/order — 지정가 주문 등록 { kind, tab, code, name, side, limitPrice, qty }
// DELETE /api/mock/order { kind, orderId } — 미체결 주문 취소
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const user = await getSessionUser(cookies().get(COOKIE)?.value);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { kind?: string; tab?: string; code?: string; name?: string; side?: string; limitPrice?: number; qty?: number };
  const kind: AcctKind = b.kind === 'longterm' ? 'longterm' : 'season';
  if (!b.tab || !MOCK_TABS.includes(b.tab as MockTab)) return NextResponse.json({ error: '지원하지 않는 종목' }, { status: 400 });
  if (!b.code || !b.name) return NextResponse.json({ error: '종목 정보 누락' }, { status: 400 });
  if (b.side !== 'buy' && b.side !== 'sell') return NextResponse.json({ error: '매수/매도 구분 오류' }, { status: 400 });
  if (!(Number(b.limitPrice) > 0)) return NextResponse.json({ error: '지정가를 확인하세요' }, { status: 400 });
  if (!(Number(b.qty) > 0)) return NextResponse.json({ error: '수량을 확인하세요' }, { status: 400 });
  try {
    return NextResponse.json(await placeOrder(user, kind, { tab: b.tab as MockTab, code: b.code, name: b.name, side: b.side, limitPrice: Number(b.limitPrice), qty: Number(b.qty) }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const user = await getSessionUser(cookies().get(COOKIE)?.value);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { kind?: string; orderId?: number };
  const kind: AcctKind = b.kind === 'longterm' ? 'longterm' : 'season';
  if (!(Number(b.orderId) > 0)) return NextResponse.json({ error: '주문 ID 오류' }, { status: 400 });
  try {
    return NextResponse.json(await cancelOrder(user, kind, Number(b.orderId)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
