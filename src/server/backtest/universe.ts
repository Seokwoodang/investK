import 'server-only';
import { getSupabase } from '../supabase';
import { getTopKospi } from '../providers/naverFundamentals';

// 백테스트 유니버스 = 현재 KOSPI 시총 상위 N(≈KOSPI200). 현재 구성이라 과거 상폐 종목은 빠짐(생존편향, UI 고지).
// 매일 스냅샷을 남겨 두면(kr_universe_snapshots) 훗날 시점별 유니버스로 확장할 여지를 남긴다.

const TAG = 'kospi200';
const kstDate = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export interface UnivItem { code: string; name: string }

export async function getBacktestUniverse(n = 200): Promise<UnivItem[]> {
  const top = await getTopKospi(n);
  return top.map((c) => ({ code: c.code, name: c.name }));
}

export async function snapshotUniverse(items: UnivItem[]): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('kr_universe_snapshots').upsert(
    { d: kstDate(), tag: TAG, codes: items.map((i) => i.code) },
    { onConflict: 'd,tag' },
  );
}

// 종목명 매핑(최신 유니버스 기준) — 백테스트 결과 표시에 사용.
export async function universeNameMap(n = 200): Promise<Record<string, string>> {
  const items = await getBacktestUniverse(n);
  const m: Record<string, string> = {};
  for (const it of items) m[it.code] = it.name;
  return m;
}
