import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE, getSessionUser } from '@/lib/auth';
import { getSupabase } from '@/server/supabase';

// 알림 설정 동기화. 클라(localStorage)가 원본이고, 로그인 상태에서 토글할 때마다 서버(user_alerts)에 저장 → 크론이 서버 사본으로 판정.
//   alerts 형태: { "_cats": ["brief","news","swing","target","risk","disc"], "<stockId>": ["swing","target","risk"](레거시) }
//   _cats = 알림 '카테고리' 토글(신규 모델). 종목 기반(swing/target/risk/disc)은 보유종목 전체에 적용된다.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_KEY = /^(target|swing|risk)$/;
const VALID_CAT = /^(brief|news|swing|target|risk|disc)$/;

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

  // 두 writer가 서로 덮어쓰지 않게 필드 분리:
  //   body.cats(배열)   → 카테고리(_cats)만 갱신, 종목별 설정은 보존
  //   body.alerts(객체) → 종목별 설정만 교체, _cats는 보존
  const body = (await req.json().catch(() => ({}))) as { alerts?: unknown; cats?: unknown };
  const { data: cur } = await sb.from('user_alerts').select('alerts').eq('username', user).maybeSingle();
  const existing = ((cur?.alerts as Record<string, string[]>) ?? {});

  let next: Record<string, string[]>;
  if (Array.isArray(body.cats)) {
    next = { ...existing, _cats: body.cats.filter((k): k is string => typeof k === 'string' && VALID_CAT.test(k)) };
  } else if (typeof body.alerts === 'object' && body.alerts != null && !Array.isArray(body.alerts)) {
    next = {};
    for (const [id, keys] of Object.entries(body.alerts as Record<string, unknown>).slice(0, 100)) {
      if (id === '_cats' || !Array.isArray(keys)) continue;
      const ks = keys.filter((k): k is string => typeof k === 'string' && VALID_KEY.test(k));
      if (ks.length) next[String(id).slice(0, 40)] = ks;
    }
    if (Array.isArray(existing._cats)) next._cats = existing._cats; // 카테고리 보존
  } else {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const { error } = await sb.from('user_alerts').upsert({ username: user, alerts: next, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: 'save failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
