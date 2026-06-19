import 'server-only';
import { REVALIDATE } from '../env';
import type { NewsArticle } from './naverNews';
import type { TabId } from '../../types';

// 언론사가 경제/증권/코인으로 미리 분류해 발행하는 RSS 피드를 그대로 가져온다(AI 비용 0).
// 탭별 시장·경제 뉴스용. 종목별(상세 페이지) 뉴스는 naverNews(종목코드 기반)를 계속 쓴다.
// 매경(mk.co.kr)은 403으로 차단되어 제외. 코인데스크코리아는 RSS 구조가 달라 블록미디어 사용.

interface Feed {
  url: string;
  src: string;
  tag: string;
}

const FEEDS: Record<TabId, Feed[]> = {
  kr_stock: [
    { url: 'https://www.hankyung.com/feed/finance', src: '한국경제', tag: '증권' },
    { url: 'https://www.yna.co.kr/rss/market.xml', src: '연합뉴스', tag: '증시' },
  ],
  us_stock: [
    { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', src: 'CNBC', tag: '미국증시' },
    { url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html', src: 'CNBC', tag: '테크' },
  ],
  kr_coin: [
    { url: 'https://www.tokenpost.kr/rss', src: '토큰포스트', tag: '코인' },
    { url: 'https://www.blockmedia.co.kr/feed', src: '블록미디어', tag: '코인' },
  ],
  global_coin: [
    { url: 'https://www.tokenpost.kr/rss', src: '토큰포스트', tag: '코인' },
    { url: 'https://www.blockmedia.co.kr/feed', src: '블록미디어', tag: '코인' },
  ],
};

const UA = { 'User-Agent': 'Mozilla/5.0' };

// CDATA·HTML 엔티티·태그 제거.
function clean(s: string | undefined): string {
  return (s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '')
    // 숫자 엔티티(&#8220; 곡선따옴표 등) 디코드
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
    .trim();
}

function tagOf(item: string, re: RegExp): string {
  const m = item.match(re);
  return m ? clean(m[1]) : '';
}

function parseRss(xml: string, feed: Feed): NewsArticle[] {
  const items = xml.split('<item>').slice(1);
  const out: NewsArticle[] = [];
  for (const raw of items) {
    const item = raw.slice(0, raw.indexOf('</item>'));
    const title = tagOf(item, /<title>([\s\S]*?)<\/title>/);
    const link = tagOf(item, /<link>([\s\S]*?)<\/link>/);
    if (!title || !link) continue;
    const pub = tagOf(item, /<pubDate>([\s\S]*?)<\/pubDate>/);
    const desc = tagOf(item, /<description>([\s\S]*?)<\/description>/);
    // RFC822 → 정렬 가능한 ISO. 파싱 실패 시 원문 유지.
    const d = pub ? new Date(pub) : null;
    const datetime = d && !isNaN(d.getTime()) ? d.toISOString() : pub;
    out.push({
      title,
      summary: desc.slice(0, 160),
      src: feed.src,
      url: link,
      datetime,
      tags: [feed.tag],
    });
  }
  return out;
}

// 서버 메모리 캐시 — 탭별로 REVALIDATE.news(15분) 동안 1회만 실제 fetch.
// Next 데이터 캐시(force-dynamic 라우트에선 무시될 수 있음)와 무관하게 공유 캐시를 보장.
const CACHE_MS = REVALIDATE.news * 1000;
const cache = new Map<TabId, { at: number; data: NewsArticle[] }>();

// 탭의 모든 피드를 모아 제목 중복 제거 → 최신순 → 상위 limit.
export async function getCategoryNews(tab: TabId, limit = 21): Promise<NewsArticle[]> {
  const feeds = FEEDS[tab];
  if (!feeds || !feeds.length) return [];

  const hit = cache.get(tab);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data.slice(0, limit);

  const results = await Promise.all(
    feeds.map(async (f) => {
      try {
        const r = await fetch(f.url, { headers: UA, next: { revalidate: REVALIDATE.news } });
        if (!r.ok) return [];
        return parseRss(await r.text(), f);
      } catch {
        return [];
      }
    }),
  );
  const all = results.flat();
  const seen = new Set<string>();
  const deduped = all.filter((a) => a.title && !seen.has(a.title) && seen.add(a.title));
  deduped.sort((a, b) => (b.datetime || '').localeCompare(a.datetime || ''));
  // 결과가 있을 때만 캐시(전부 실패 시 다음 요청에 재시도).
  if (deduped.length) cache.set(tab, { at: Date.now(), data: deduped });
  return deduped.slice(0, limit);
}

// 종목 상세용: 탭 카테고리 RSS를 종목 이름/심볼로 필터. 매칭이 적으면 일반 피드로 폴백.
// (코인·해외주식 공용 — RSS라 원문 링크가 실제 기사로 동작)
export async function getFilteredNews(tab: TabId, name: string, symbol: string, limit = 12): Promise<NewsArticle[]> {
  const all = await getCategoryNews(tab, 40);
  const kw = [name, symbol].filter(Boolean).map((s) => s.toLowerCase());
  const matched = all.filter((a) => {
    const hay = (a.title + ' ' + a.summary).toLowerCase();
    return kw.some((k) => k.length >= 2 && hay.includes(k));
  });
  return (matched.length >= 2 ? matched : all).slice(0, limit);
}
