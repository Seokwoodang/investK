import 'server-only';
import { cookies } from 'next/headers';
import { COOKIE, getSessionUser } from '@/lib/auth';
import { getSupabase } from './supabase';

// 관리자 판정 — app_users.is_admin(DB 컬럼) 기준. 하드코딩 아이디 없음.
export async function isAdminUsername(username: string | null): Promise<boolean> {
  if (!username) return false;
  const sb = getSupabase();
  if (!sb) return false;
  const { data } = await sb.from('app_users').select('is_admin').eq('username', username).maybeSingle();
  return data?.is_admin === true;
}

// 현재 세션 사용자가 관리자면 그 username, 아니면 null.
export async function requireAdmin(): Promise<string | null> {
  const user = await getSessionUser(cookies().get(COOKIE)?.value);
  return (await isAdminUsername(user)) ? user : null;
}
