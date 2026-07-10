import { NextResponse } from 'next/server';
import { getSupabase } from '@/server/supabase';
import { requireAdmin } from '@/server/admin';

// 관리자(app_users.is_admin) 전용 — AI 사용량(토큰·횟수) 집계. ai_usage 로그를 최근 30일치 읽어 JS로 합산.
// 개인용/소수 회원 규모라 행 수가 적어 애플리케이션단 집계로 충분.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function kstMidnightISO(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const mid = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600 * 1000;
  return new Date(mid).toISOString();
}

interface Agg { calls: number; inTok: number; outTok: number }
const zero = (): Agg => ({ calls: 0, inTok: 0, outTok: 0 });
const add = (a: Agg, inTok: number, outTok: number) => { a.calls += 1; a.inTok += inTok; a.outTok += outTok; };

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'no supabase' }, { status: 503 });

  const monthAgoISO = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await sb
    .from('ai_usage')
    .select('username, kind, in_tokens, out_tokens, created_at')
    .gte('created_at', monthAgoISO)
    .order('created_at', { ascending: false })
    .limit(10000);
  if (error) return NextResponse.json({ error: 'query failed' }, { status: 500 });

  const todayStart = kstMidnightISO();
  const rows = data ?? [];

  const totToday = zero();
  const totMonth = zero();
  const byUser = new Map<string, { today: Agg; month: Agg }>();
  const byKind = new Map<string, Agg>();

  for (const r of rows) {
    const inTok = r.in_tokens ?? 0;
    const outTok = r.out_tokens ?? 0;
    const isToday = (r.created_at as string) >= todayStart;
    const uname = (r.username as string) || '(서버/cron)';
    const kind = (r.kind as string) || '기타';

    add(totMonth, inTok, outTok);
    if (isToday) add(totToday, inTok, outTok);

    if (!byUser.has(uname)) byUser.set(uname, { today: zero(), month: zero() });
    const u = byUser.get(uname)!;
    add(u.month, inTok, outTok);
    if (isToday) add(u.today, inTok, outTok);

    if (!byKind.has(kind)) byKind.set(kind, zero());
    add(byKind.get(kind)!, inTok, outTok);
  }

  return NextResponse.json({
    totals: { today: totToday, month: totMonth },
    byUser: [...byUser.entries()]
      .map(([username, v]) => ({ username, ...v }))
      .sort((a, b) => b.month.calls - a.month.calls),
    byKind: [...byKind.entries()]
      .map(([kind, v]) => ({ kind, ...v }))
      .sort((a, b) => b.calls - a.calls),
    rowCount: rows.length,
    capped: rows.length >= 10000, // 10000행 상한에 걸렸으면 일부 누락 가능 표시
  });
}
