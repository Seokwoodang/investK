import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { getSupabase } from '@/server/supabase';

// 회원가입 = 자동승인(status='approved'). 가입 즉시 로그인 가능(승인 대기 없음).
//   app_users(username, pass_hash, status, note, is_admin, created_at)  — pass_hash: "scrypt$<saltHex>$<hashHex>"
// 회원가입 자체는 공개(미들웨어 비보호). AI 비용은 계정당 상한 + 전체 일일 상한으로 방어.
export const runtime = 'nodejs';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;

// 신청 남용 완화: IP별 슬라이딩 윈도(1시간에 5회).
const attempts = new Map<string, number[]>();
const WINDOW_MS = 60 * 60e3;
const MAX_TRIES = 5;
function rateLimited(key: string): boolean {
  const now = Date.now();
  const arr = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_TRIES) { attempts.set(key, arr); return true; }
  arr.push(now);
  attempts.set(key, arr);
  if (attempts.size > 1000) attempts.clear();
  return false;
}

async function makeHash(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scrypt(pw, salt, 32)).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export async function POST(req: Request) {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: '서버에 Supabase가 설정되지 않았습니다.' }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { id?: string; pw?: string; note?: string };
  const id = (body.id ?? '').trim();
  const pw = body.pw ?? '';
  const note = (body.note ?? '').trim().slice(0, 200) || null;

  // 형식 검증: 아이디 영문/숫자/._- 3~30자, 비번 4자 이상.
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(id)) {
    return NextResponse.json({ error: '아이디는 영문·숫자·.·_·- 조합 3~30자여야 합니다.' }, { status: 400 });
  }
  if (pw.length < 4) {
    return NextResponse.json({ error: '비밀번호는 4자 이상이어야 합니다.' }, { status: 400 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (rateLimited(ip)) {
    return NextResponse.json({ error: '신청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 });
  }

  // 중복 처리: approved/pending이면 거절, rejected였으면 재신청 허용(pending으로 갱신).
  const { data: existing } = await sb.from('app_users').select('status').eq('username', id).maybeSingle();
  if (existing) {
    const st = (existing.status as string | null) ?? 'approved';
    if (st === 'approved') return NextResponse.json({ error: '이미 사용 중인 아이디입니다.' }, { status: 409 });
    if (st === 'pending') return NextResponse.json({ error: '이미 승인 대기 중인 아이디입니다.' }, { status: 409 });
    // rejected → 재가입(자동승인)
    const pass_hash = await makeHash(pw);
    const { error } = await sb.from('app_users').update({ pass_hash, status: 'approved', note }).eq('username', id);
    if (error) return NextResponse.json({ error: '가입 처리 중 오류가 발생했습니다.' }, { status: 500 });
    return NextResponse.json({ ok: true, approved: true });
  }

  const pass_hash = await makeHash(pw);
  const { error } = await sb.from('app_users').insert({ username: id, pass_hash, status: 'approved', note });
  if (error) return NextResponse.json({ error: '가입 처리 중 오류가 발생했습니다.' }, { status: 500 });
  return NextResponse.json({ ok: true, approved: true });
}
