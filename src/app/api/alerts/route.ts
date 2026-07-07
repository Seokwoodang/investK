import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE, getSessionUser } from '@/lib/auth';
import { getSupabase } from '@/server/supabase';

// 종목별 알림 설정 동기화. 클라(localStorage)가 원본이고, 로그인 상태에서 토글할 때마다
// 전체 맵을 서버(user_alerts)에 저장 → 크론이 서버 사본으로 판정한다.
//   alerts 형태: { "<stockId>": ["swing","target","risk"] }
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_KEY = /^(target|swing|risk)$/;

export async function GET() {
  const user = await getSessionUser(cookies().get(COOKIE)?.value);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ alerts: {} });
  const { data } = await sb.from('user_alerts').select('alerts').eq('username', user).maybeSingle();
  return NextResponse.json({ alerts: (data?.alerts as Record<string, string[]>) ?? {} });
}

export async function POST(req: Request) {
  const user = await getSessionUser(cookies().get(COOKIE)?.value);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'no supabase' }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { alerts?: unknown };
  const raw = body.alerts;
  if (typeof raw !== 'object' || raw == null || Array.isArray(raw)) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  // 검증·정리: 키 100종목 제한, 값은 알려진 알림 키만.
  const alerts: Record<string, string[]> = {};
  for (const [id, keys] of Object.entries(raw as Record<string, unknown>).slice(0, 100)) {
    if (!Array.isArray(keys)) continue;
    const ks = keys.filter((k): k is string => typeof k === 'string' && VALID_KEY.test(k));
    if (ks.length) alerts[String(id).slice(0, 40)] = ks;
  }
  const { error } = await sb.from('user_alerts').upsert({ username: user, alerts, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: 'save failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
