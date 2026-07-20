import { NextResponse } from 'next/server';
import { getSupabase } from '@/server/supabase';

// KOSPI 시총 '대장주 레이스' 데이터. pit_universe(월별 시점별 유니버스, 상폐 포함)에서
// 매월 시총 상위 보통주 top N을 뽑아 바 차트 레이스 프레임으로 반환한다.
//  · 보통주만: 우선주(삼성전자우 등, 코드 끝자리≠0)는 제외해 레이스가 중복 없이 깔끔하게.
//  · pit_universe.rank는 시총 내림차순이라, 우선주 제외 후 남은 순서 그대로 재랭킹.
//  · 데이터는 월 1회만 갱신 → CDN 캐시(하루)로 콜드 부담 최소화.

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TOP_N = 15;      // 화면에 보여줄 막대 수
const FETCH_RANK = 25; // 우선주 제외 여유분까지 넉넉히 가져올 원본 순위 범위

interface Frame { ym: string; rows: { c: string; v: number }[] }

export async function GET() {
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'no-db' }, { status: 503 });

  // supabase-js 기본 1000행 제한 → range로 페이지네이션. rank<=25 × 127개월 ≈ 3175행.
  type Row = { d: string; code: string; name: string; rank: number; mktcap: number };
  const all: Row[] = [];
  const PAGE = 1000;
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await sb
      .from('pit_universe')
      .select('d, code, name, rank, mktcap')
      .lte('rank', FETCH_RANK)
      .order('d', { ascending: true })
      .order('rank', { ascending: true })
      .range(off, off + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    all.push(...(data as Row[]));
    if (data.length < PAGE) break;
  }
  if (all.length === 0) return NextResponse.json({ error: 'empty' }, { status: 404 });

  // 월별 그룹핑 → 보통주만(끝자리 0) → 시총순 top N → 억원 단위(숫자 축소).
  const byMonth = new Map<string, Row[]>();
  for (const r of all) {
    const ym = String(r.d).slice(0, 7); // 'YYYY-MM'
    let arr = byMonth.get(ym);
    if (!arr) byMonth.set(ym, (arr = []));
    arr.push(r);
  }

  const names: Record<string, string> = {};
  const frames: Frame[] = [];
  for (const ym of [...byMonth.keys()].sort()) {
    const common = byMonth
      .get(ym)!
      .filter((r) => r.code.slice(-1) === '0') // 보통주만(우선주 제외)
      .sort((a, b) => Number(b.mktcap) - Number(a.mktcap))
      .slice(0, TOP_N);
    const rows = common.map((r) => {
      names[r.code] = r.name; // 최신 스냅샷 이름이 뒤에 덮어써짐(사명 변경 반영)
      return { c: r.code, v: Math.round(Number(r.mktcap) / 1e8) }; // 원 → 억원
    });
    if (rows.length) frames.push({ ym, rows });
  }

  return NextResponse.json(
    { unit: '억원', topN: TOP_N, from: frames[0]?.ym, to: frames.at(-1)?.ym, names, frames },
    { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
  );
}
