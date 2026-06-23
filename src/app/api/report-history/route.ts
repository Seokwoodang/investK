import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE, getSessionUser } from '@/lib/auth';
import { getSupabase } from '@/server/supabase';

// 로그인 유저의 투자 보고서 기록(생성할 때마다 보관). Supabase report_history.
// GET  → 내 기록 목록(최신순)   POST { totalValueKrw, totalPlPct, lines, report } → 1건 저장
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function currentUser(): Promise<string | null> {
  return getSessionUser(cookies().get(COOKIE)?.value);
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ items: [] });
  const { data } = await sb
    .from('report_history')
    .select('id, created_at, total_value_krw, total_pl_pct, lines, report')
    .eq('username', user)
    .order('created_at', { ascending: false })
    .limit(100);
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'supabase 미설정' }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as {
    totalValueKrw?: number; totalPlPct?: number; lines?: unknown; report?: unknown;
  };
  if (!b.report || !Array.isArray(b.lines)) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const { data, error } = await sb
    .from('report_history')
    .insert({
      username: user,
      total_value_krw: b.totalValueKrw ?? null,
      total_pl_pct: b.totalPlPct ?? null,
      lines: b.lines,
      report: b.report,
    })
    .select('id, created_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...data });
}
