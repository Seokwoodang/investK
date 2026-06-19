import 'server-only';
import { getSupabase } from './supabase';

// 범용 키-값 저장소 (Supabase `kv_store`). 서버리스에서 프로세스 간 공유가 필요한
// 토큰/캐시 보관용. Supabase 미설정 시 no-op(호출부에서 인메모리로 폴백).
export async function kvGet<T>(k: string): Promise<T | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from('kv_store').select('v').eq('k', k).maybeSingle();
  return (data?.v as T) ?? null;
}

export async function kvSet(k: string, v: unknown): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('kv_store').upsert({ k, v, updated_at: new Date().toISOString() });
}

export async function kvDel(k: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('kv_store').delete().eq('k', k);
}
