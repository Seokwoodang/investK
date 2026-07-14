import 'server-only';
import { getSupabase } from '../supabase';
import { getValueScreen, type Market } from '../valueScreen';

// 2단계(B) — 팩터 점수 시계열 축적. 매일 저평가우량주 스크리너 결과(상위 200)를 factor_snapshots에 적재.
// 오늘부터 쌓으면 look-ahead 없는 '그 시점에 알 수 있던' 팩터가 자동으로 모여, 향후 정직한 팩터 백테스트의
// 재료가 된다(과거 DART 수집 없이도). 현재 스크리너는 최신 스냅샷만 덮어쓰므로, 여기서 날짜별로 보존한다.

const kstDate = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export async function persistFactorSnapshot(market: Market = 'kr'): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;
  const screen = await getValueScreen(market);
  if (!screen.items?.length) return 0;
  const d = kstDate();
  const rows = screen.items.map((s) => ({
    d, market, code: s.code, name: s.name,
    score: s.score, value_s: s.valueScore, quality_s: s.qualityScore, safety_s: s.safetyScore, yield_s: s.yieldScore,
    per: s.per, pbr: s.pbr, roe: s.roe, net_margin: s.netMargin, debt_ratio: s.debtRatio, div_yield: s.divYield,
    price: Number.isFinite(s.price) ? Math.round(s.price) : null,
  }));
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await sb.from('factor_snapshots').upsert(rows.slice(i, i + 1000), { onConflict: 'd,market,code' });
    if (error) throw new Error(`factor_snapshots upsert: ${error.message}`);
  }
  return rows.length;
}
