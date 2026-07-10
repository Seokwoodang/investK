import { NextResponse } from 'next/server';
import { getSupabase } from '@/server/supabase';
import { requireAdmin } from '@/server/admin';

// 관리자(app_users.is_admin) 전용. 회원가입 신청 목록 조회 + 승인/거절/삭제.
// 미들웨어가 로그인은 보장하지만, "관리자 신원"은 여기서 DB is_admin으로 직접 검증한다.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'no supabase' }, { status: 503 });

  const { data, error } = await sb
    .from('app_users')
    .select('username, status, note, created_at')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'query failed' }, { status: 500 });
  return NextResponse.json({ users: data ?? [] });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'no supabase' }, { status: 503 });

  const { username, action } = (await req.json().catch(() => ({}))) as { username?: string; action?: string };
  if (!username || !['approve', 'reject', 'delete'].includes(action ?? '')) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  // 관리자 자신 계정은 강등/삭제 금지(스스로 잠그는 사고 방지).
  if (username === admin) return NextResponse.json({ error: '관리자 계정은 변경할 수 없습니다.' }, { status: 400 });

  if (action === 'delete') {
    const { error } = await sb.from('app_users').delete().eq('username', username);
    if (error) return NextResponse.json({ error: 'delete failed' }, { status: 500 });
  } else {
    const status = action === 'approve' ? 'approved' : 'rejected';
    const { error } = await sb.from('app_users').update({ status }).eq('username', username);
    if (error) return NextResponse.json({ error: 'update failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
