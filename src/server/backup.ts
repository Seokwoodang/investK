import 'server-only';
import { getSupabase } from './supabase';

// 핵심(재생성 불가) 데이터 자동 백업 → Supabase Storage 비공개 버킷(backups).
// 가격·유니버스·지수(kr_prices·pit_universe·ext_series)나 캐시(ai_cache·kv_store)는 KRX/Yahoo로
// 다시 만들 수 있어 제외. 계정·포트폴리오·모의투자·보고서·알림 + 팩터 스냅샷(누적분)만 보존한다.
// 한계(정직 고지): 같은 Supabase 프로젝트 내 저장이라 '테이블 실수 삭제/손상'은 막지만
// '프로젝트 자체 삭제'까진 못 막음(그건 가끔 파일 내려받아 오프사이트 보관으로 보완).

const BUCKET = 'backups';
const TABLES = [
  'app_users', 'portfolios',
  'mock_accounts', 'mock_holdings', 'mock_orders', 'mock_trades', 'mock_season_records', 'mock_snapshots',
  'report_history', 'user_alerts', 'push_subs',
  'factor_snapshots',
];
const KEEP_DAYS = 30;

async function readAll(sb: NonNullable<ReturnType<typeof getSupabase>>, table: string): Promise<unknown[] | null> {
  const rows: unknown[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb.from(table).select('*').range(offset, offset + 999);
    if (error) return null; // 테이블 없음/권한 등 → 스킵
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return rows;
}

export async function runBackup(): Promise<{ date: string; tables: Record<string, number>; skipped: string[]; bytes: number }> {
  const sb = getSupabase();
  if (!sb) throw new Error('supabase not configured');
  // 버킷 보장(비공개). 이미 있으면 무시.
  await sb.storage.createBucket(BUCKET, { public: false }).catch(() => {});

  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const tables: Record<string, number> = {};
  const skipped: string[] = [];
  const dump: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const rows = await readAll(sb, t);
    if (rows == null) { skipped.push(t); continue; }
    dump[t] = rows;
    tables[t] = rows.length;
  }

  const payload = Buffer.from(JSON.stringify({ backedUpAt: new Date().toISOString(), date, tables, data: dump }));
  const { error: upErr } = await sb.storage.from(BUCKET).upload(`backup-${date}.json`, payload, {
    contentType: 'application/json', upsert: true,
  });
  if (upErr) throw new Error(`backup upload: ${upErr.message}`);

  // 30일 지난 백업 정리.
  const { data: files } = await sb.storage.from(BUCKET).list('', { limit: 1000 });
  if (files?.length) {
    const cutoff = Date.now() - KEEP_DAYS * 86400000;
    const old = files
      .filter((f) => /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(f.name))
      .filter((f) => { const d = Date.parse(f.name.slice(7, 17)); return Number.isFinite(d) && d < cutoff; })
      .map((f) => f.name);
    if (old.length) await sb.storage.from(BUCKET).remove(old);
  }

  return { date, tables, skipped, bytes: payload.length };
}
