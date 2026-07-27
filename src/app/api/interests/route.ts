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

const MAX_SECTORS = 12;
const MAX_STOCKS = 30;
const TABS = new Set(['kr_stock', 'us_stock', 'kr_coin', 'global_coin']);

interface StoredStock { id: string; name: string; ticker: string; tab?: string }

// 클라가 보낸 종목을 신뢰하지 않고 형태·길이만 통과시킨다(유니버스는 서버에 없음 — 실시간 조회).
function cleanStocks(v: unknown): StoredStock[] {
  if (!Array.isArray(v)) return [];
  const out: StoredStock[] = [];
  const seen = new Set<string>();
  for (const raw of v.slice(0, MAX_STOCKS * 2)) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.slice(0, 40) : '';
    const name = typeof o.name === 'string' ? o.name.slice(0, 40) : '';
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const tab = typeof o.tab === 'string' && TABS.has(o.tab) ? o.tab : undefined;
    out.push({ id, name, ticker: typeof o.ticker === 'string' ? o.ticker.slice(0, 20) : '', tab });
    if (out.length >= MAX_STOCKS) break;
  }
  return out;
}

export async function GET() {
  const user = await getSessionUser(cookies().get(COOKIE)?.value);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = getSupabase();
  // Supabase 미설정(로컬 개발)에서도 앱이 돌아가야 하므로 503이 아니라 빈 값.
  if (!sb) return NextResponse.json({ sectors: [], stocks: [] });
  const { data } = await sb.from('user_interests').select('sectors, stocks').eq('username', user).maybeSingle();
  return NextResponse.json({
    sectors: (data?.sectors as string[]) ?? [],
    stocks: (data?.stocks as StoredStock[]) ?? [],
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser(cookies().get(COOKIE)?.value);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'no supabase' }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { sectors?: unknown; stocks?: unknown };
  if (!Array.isArray(body.sectors) && !Array.isArray(body.stocks)) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  // 섹터는 화이트리스트(자유 문자열 저장 금지), 종목은 형태 검증. 각각 중복 제거 후 상한.
  const sectors = [...new Set((Array.isArray(body.sectors) ? body.sectors : []).filter(isSectorKey))].slice(0, MAX_SECTORS);
  const stocks = cleanStocks(body.stocks);

  const { error } = await sb
    .from('user_interests')
    .upsert({ username: user, sectors, stocks, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: 'save failed' }, { status: 500 });
  return NextResponse.json({ ok: true, sectors, stocks });
}
