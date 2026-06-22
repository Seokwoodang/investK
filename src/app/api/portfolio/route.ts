import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE, getSessionUser } from '@/lib/auth';
import { getSupabase } from '@/server/supabase';

// 로그인한 사용자의 포트폴리오를 Supabase `portfolios`(username pk, holdings jsonb)에 저장/조회.
// 누가 로그인했는지는 세션 쿠키에서 읽는다(미들웨어가 이미 인증 보장).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function currentUser(): Promise<string | null> {
  return getSessionUser(cookies().get(COOKIE)?.value);
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ holdings: [] });
  const { data } = await sb.from('portfolios').select('holdings').eq('username', user).maybeSingle();
  return NextResponse.json({ holdings: Array.isArray(data?.holdings) ? data!.holdings : [] });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'supabase 미설정' }, { status: 503 });
  const { holdings } = (await req.json().catch(() => ({}))) as { holdings?: unknown };
  if (!Array.isArray(holdings)) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const { error } = await sb.from('portfolios').upsert({ username: user, holdings, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
