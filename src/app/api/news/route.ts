import { NextResponse } from 'next/server';
import { getKrStockNews, type NewsArticle } from '@/server/providers/naverNews';
import { getFilteredNews } from '@/server/providers/rssNews';
import { rankNews } from '@/server/aiNews';
import { getTabNews, CRYPTO_FOCUS } from '@/server/news';
import type { TabId } from '@/types';

// POST /api/news { tab, items? }
// items 없음(뉴스 탭) → getTabNews: Supabase에 미리 생성된 결과를 즉시 읽음(AI 호출 없음).
//   1시간마다 /api/cron/news가 미리 생성·저장하므로 사용자는 대기 없이 DB만 읽는다. (콜드 1회만 생성)
// items 있음(종목 상세) → 해당 종목 뉴스 수집 + AI 판별(지연, 캐시).
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { tab, items } = (await req.json()) as { tab: TabId; items?: { code: string; name: string }[] };
  const list = items ?? [];

  // 뉴스 탭(시장 뉴스): 미리 만들어둔 캐시를 즉시 반환.
  if (!list.length) {
    const r = await getTabNews(tab);
    return NextResponse.json(r);
  }

  // 종목 상세: per-stock/per-coin 뉴스 (지연 캐시)
  let candidates: NewsArticle[];
  let scope: string;
  let focus: string | undefined;
  const it = list[0];
  if (tab === 'kr_coin' || tab === 'global_coin') {
    candidates = await getFilteredNews(tab, it.name, (it.code || '').split('/')[0]);
    scope = `coin:${tab}:${it.code}`;
    focus = CRYPTO_FOCUS;
  } else if (tab === 'us_stock') {
    // 해외주식 상세: 한경 국제·IT RSS를 종목명으로 필터(원문 링크가 실제 기사로 동작).
    candidates = await getFilteredNews(tab, it.name, it.code);
    scope = `us:${tab}:${it.code}`;
  } else {
    // 국내주식 상세: 네이버 종목뉴스(officeId 숫자 → n.news.naver.com 실제 기사)
    const all = (await Promise.all(list.slice(0, 8).map((x) => getKrStockNews(x.code, x.name, 6)))).flat();
    const seen = new Set<string>();
    candidates = all.filter((a) => a.title && !seen.has(a.title) && seen.add(a.title));
    candidates.sort((a, b) => (b.datetime || '').localeCompare(a.datetime || ''));
    scope = `stock:${tab}:${list.map((i) => i.code).join(',')}`;
  }

  if (!candidates.length) return NextResponse.json({ news: [] });
  const ranked = await rankNews(scope, candidates, focus);
  if (ranked && ranked.length) return NextResponse.json({ news: ranked, ranked: true });
  return NextResponse.json({ news: candidates.slice(0, 21), ranked: false });
}
