import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE, getSessionUser } from '@/lib/auth';
import { isSectorKey } from '@/lib/sectors';
import { getSupabase } from '@/server/supabase';

// 관심 분야(섹터) 동기화. 클라(localStorage)가 원본이고, 로그인 상태에서 바꿀 때마다
// 서버(user_interests)에 저장 → 기기 간 공유. 비로그인도 쓰는 기능이라 GET 401은 정상 흐름.
//   sectors 형태: ["kr:반도체", "us:반도체", ...] — market 접두사 필수(이름만으론 국내/해외 구분 불가).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX = 12;

export async function GET() {
  const user = await getSessionUser(cookies().get(COOKIE)?.value);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = getSupabase();
  // Supabase 미설정(로컬 개발)에서도 앱이 돌아가야 하므로 503이 아니라 빈 값.
  if (!sb) return NextResponse.json({ sectors: [] });
  const { data } = await sb.from('user_interests').select('sectors').eq('username', user).maybeSingle();
  return NextResponse.json({ sectors: (data?.sectors as string[]) ?? [] });
}

export async function POST(req: Request) {
  const user = await getSessionUser(cookies().get(COOKIE)?.value);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'no supabase' }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { sectors?: unknown };
  if (!Array.isArray(body.sectors)) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  // 화이트리스트 — 실제 섹터 키만 저장(자유 문자열 저장 금지). 중복 제거 후 상한.
  const sectors = [...new Set(body.sectors.filter(isSectorKey))].slice(0, MAX);

  const { error } = await sb
    .from('user_interests')
    .upsert({ username: user, sectors, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: 'save failed' }, { status: 500 });
  return NextResponse.json({ ok: true, sectors });
}
