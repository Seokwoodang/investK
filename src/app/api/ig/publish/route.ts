import { NextResponse } from 'next/server';
import { publishCarousel, publishImage, publishReel, buildCaption, cardImageUrl, newsCards, valueCards, calendarCards, termCards, weekCards, DAILY_CARDS } from '@/server/instagram';
import { kvGet, kvSet } from '@/server/kv';

// 시장 데이터 신선도 키: 지수의 마지막 체결시각(regularMarketTime) 조합. 장이 안 열린 날
// (주말·휴장)은 값이 그대로라 키가 안 바뀜 → 어제와 같은 데이터면 게시 스킵.
async function marketFreshKey(): Promise<string> {
  const q = async (s: string) => {
    try {
      const j = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${s}?interval=1d&range=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' }).then((r) => r.json());
      return String(j?.chart?.result?.[0]?.meta?.regularMarketTime ?? '');
    } catch { return ''; }
  };
  const [k, s, n] = await Promise.all([q('%5EKS11'), q('%5EGSPC'), q('%5EIXIC')]);
  return `${k}_${s}_${n}`;
}

// 인스타그램 자동 게시 엔드포인트(GitHub Actions cron이 호출).
//  ?type=daily    : 시장 브리핑 캐러셀 5장(기본)
//  ?type=news     : 오늘의 투자 뉴스 캐러셀
//  ?type=value    : 저평가 우량주 TOP5 (주간)
//  ?type=calendar : 주간 경제 캘린더
//  ?type=term     : 투자 용어 1분 (주간)
//  단일 카드명(cover/kr/news-0/value-0…)도 허용.
//  ?dry=1         : 실제 게시 없이 캡션/이미지URL만 미리보기(테스트용)
//  인증: Bearer CRON_SECRET(액션) 또는 ?t=MOCK_FILL_TOKEN(수동).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CAPTION_TYPE: Record<string, string> = { daily: 'brief', news: 'news', value: 'value', calendar: 'calendar', term: 'term', week: 'week' };
async function cardsFor(type: string, slot?: 'am' | 'pm', region?: 'kr' | 'us' | 'all'): Promise<string[]> {
  if (type === 'daily') return [...DAILY_CARDS];
  if (type === 'news') return newsCards(slot, region);
  if (type === 'value') return valueCards();
  if (type === 'calendar') return calendarCards();
  if (type === 'term') return termCards();
  if (type === 'week') return weekCards();
  return [type];
}

function authed(req: Request, url: URL): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  const mt = process.env.MOCK_FILL_TOKEN;
  if (mt && url.searchParams.get('t') === mt) return true;
  return false;
}

async function run(req: Request) {
  const url = new URL(req.url);
  if (!authed(req, url)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const type = url.searchParams.get('type') || 'daily';
  const dry = url.searchParams.get('dry') === '1';
  const video = url.searchParams.get('video'); // 있으면 릴스(세로 영상) 게시
  const force = url.searchParams.get('force') === '1'; // 신선도 게이트 무시(수동 강제)
  const slot: 'am' | 'pm' = url.searchParams.get('slot') === 'am' ? 'am' : 'pm'; // 뉴스 아침/저녁
  const rg = url.searchParams.get('region'); // 뉴스 지역: kr|us (없으면 all)
  const region: 'kr' | 'us' | 'all' = rg === 'kr' || rg === 'us' ? rg : 'all';
  try {
    // 시장 브리핑(daily)은 새 시장 데이터가 있을 때만 — 주말·휴장일 중복 게시 방지.
    let freshKvKey = '';
    let freshKeyVal = '';
    if (type === 'daily' && !dry && !force) {
      freshKeyVal = await marketFreshKey();
      freshKvKey = `ig:daily:${video ? 'reel' : 'carousel'}:key`;
      if (freshKeyVal && (await kvGet<string>(freshKvKey)) === freshKeyVal) {
        return NextResponse.json({ ok: true, skipped: true, reason: '새 시장 데이터 없음(주말·휴장) — 중복 게시 방지', key: freshKeyVal });
      }
    }
    const markFresh = async () => { if (freshKvKey && freshKeyVal) await kvSet(freshKvKey, freshKeyVal); };
    const caption = await buildCaption(CAPTION_TYPE[type] ?? 'brief', slot, region);
    if (video) {
      if (dry) return NextResponse.json({ ok: true, dry: true, mode: 'reel', video, caption });
      const res = await publishReel(video, caption);
      await markFresh();
      return NextResponse.json({ ok: true, id: res.id, mode: 'reel' });
    }
    const cards = await cardsFor(type, slot, region);
    if (!cards.length) return NextResponse.json({ ok: false, error: '게시할 카드 없음(데이터 캐시 비어있음)' }, { status: 503 });
    const imageUrls = cards.map((c) => cardImageUrl(c, type === 'news' ? slot : undefined, type === 'news' ? region : undefined));
    if (dry) return NextResponse.json({ ok: true, dry: true, cards, imageUrls, caption });
    const res = imageUrls.length > 1 ? await publishCarousel(imageUrls, caption) : await publishImage(imageUrls[0], caption);
    await markFresh();
    return NextResponse.json({ ok: true, id: res.id, cards });
  } catch (e) {
    console.error('[ig/publish] failed:', (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
