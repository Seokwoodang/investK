import 'server-only';
import { REVALIDATE } from '../env';

// 네이버 금융 뉴스 — 키 불필요(서버에서 접근). 국내=종목별 `/news/stock/{code}`,
// 해외=`/news/worldStock/{symbol}`. 시장 전체 뉴스 엔드포인트가 없어 종목별로 집계한다.
// 코인은 네이버 금융이 다루지 않음 → 빈 배열(추후 별도 소스).
export interface NewsArticle {
  title: string;
  summary: string;
  src: string;
  url: string;
  datetime: string;
  tags: string[];
}

const HEADERS = { 'User-Agent': 'Mozilla/5.0', Referer: 'https://m.stock.naver.com/' };
const clean = (s: string | undefined) =>
  (s ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
    .trim();

export async function getKrStockNews(code: string, name: string, limit = 4): Promise<NewsArticle[]> {
  try {
    const r = await fetch(`https://api.stock.naver.com/news/stock/${code}?page=1&pageSize=${limit}`, {
      headers: HEADERS,
      next: { revalidate: REVALIDATE.news },
    });
    if (!r.ok) return [];
    const groups = (await r.json()) as Array<{ items?: Array<{ title: string; body: string; officeName: string; officeId: string; articleId: string; datetime: string }> }>;
    return groups
      .flatMap((g) => g.items ?? [])
      .slice(0, limit)
      .map((it) => ({
        title: clean(it.title),
        summary: clean(it.body).slice(0, 160),
        src: it.officeName,
        datetime: it.datetime,
        url: `https://n.news.naver.com/article/${it.officeId}/${it.articleId}`,
        tags: [name],
      }));
  } catch {
    return [];
  }
}

export async function getWorldStockNews(symbol: string, name: string, limit = 4): Promise<NewsArticle[]> {
  try {
    // 거래소 접미사(.O 나스닥 등)가 있어야 최신 뉴스가 옴. 없으면 .O(나스닥) 기본 추정.
    const sym = symbol.includes('.') ? symbol : `${symbol}.O`;
    const r = await fetch(`https://api.stock.naver.com/news/worldStock/${sym}?page=1&pageSize=${limit}`, {
      headers: HEADERS,
      next: { revalidate: REVALIDATE.news },
    });
    if (!r.ok) return [];
    const arr = (await r.json()) as Array<{ tit: string; subcontent: string; ohnm: string; dt: string; oid: string; aid: string }>;
    return arr.slice(0, limit).map((it) => ({
      title: clean(it.tit),
      summary: clean(it.subcontent).slice(0, 160),
      src: it.ohnm || '해외',
      datetime: it.dt,
      // worldStock 기사 실제 페이지(oid가 fnGuide 등 비숫자여도 동작). 검색 폴백 제거.
      url: it.oid && it.aid ? `https://m.stock.naver.com/worldstock/news/${it.oid}/${it.aid}` : `https://m.stock.naver.com/worldstock/stock/${sym}/news`,
      tags: [name],
    }));
  } catch {
    return [];
  }
}
