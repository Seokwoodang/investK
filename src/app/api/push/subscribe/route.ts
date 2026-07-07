import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE, getSessionUser } from '@/lib/auth';
import { getSupabase } from '@/server/supabase';

// 웹푸시 구독 저장/해지. 미들웨어(/api/push/*)가 로그인은 보장하지만 사용자명은 여기서 읽는다.
// POST { subscription: PushSubscriptionJSON } → upsert (같은 브라우저 재구독 시 갱신)
// DELETE { endpoint } → 해당 기기 구독 삭제
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SubJson { endpoint?: string; keys?: { p256dh?: string; auth?: string } }

export async function POST(req: Request) {
  const user = await getSessionUser(cookies().get(COOKIE)?.value);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'no supabase' }, { status: 503 });

  const { subscription } = (await req.json().catch(() => ({}))) as { subscription?: SubJson };
  const ep = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!ep || !p256dh || !auth) return NextResponse.json({ error: 'bad subscription' }, { status: 400 });

  const { error } = await sb.from('push_subs').upsert({ endpoint: ep, username: user, p256dh, auth });
  if (error) return NextResponse.json({ error: 'save failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser(cookies().get(COOKIE)?.value);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'no supabase' }, { status: 503 });

  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  await sb.from('push_subs').delete().eq('endpoint', endpoint).eq('username', user);
  return NextResponse.json({ ok: true });
}
