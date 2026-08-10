import { NextResponse } from 'next/server';
import { publishCarousel, publishImage, publishReel, buildCaption, cardImageUrl, newsCards, valueCards, calendarCards, termCards, weekCards, stockCards, DAILY_CARDS } from '@/server/instagram';
import { kvGet, kvSet, kvDel } from '@/server/kv';

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
//  ?type=week     : 주간 마켓 리뷰 (토)
//  ?type=stock&region=kr|us : 오늘 화제의 종목 — 왜 움직였나 (일간, 조건 미달이면 카드 0장 → 503 스킵)
//  단일 카드명(cover/kr/news-0/value-0…)도 허용.
//  ?dry=1         : 실제 게시 없이 캡션/이미지URL만 미리보기(테스트용)
//  인증: Bearer CRON_SECRET(액션) 또는 ?t=MOCK_FILL_TOKEN(수동).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CAPTION_TYPE: Record<string, string> = { daily: 'brief', news: 'news', value: 'value', calendar: 'calendar', term: 'term', week: 'week', breaking: 'breaking', stock: 'stock' };
// 마무리(마지막 장) 바로 앞에 '게시 일정' 카드 삽입 — 어느 글을 봐도 편성 시간을 알게.
function withSchedule(cards: string[]): string[] {
  if (cards.length < 2) return cards;
  return [...cards.slice(0, -1), 'sched', cards[cards.length - 1]];
}
async function cardsFor(type: string, slot?: 'am' | 'pm', region?: 'kr' | 'us' | 'all'): Promise<string[]> {
  if (type === 'daily') return withSchedule([...DAILY_CARDS]);
  if (type === 'news') return withSchedule(await newsCards(slot, region));
  if (type === 'value') return withSchedule(await valueCards());
  if (type === 'calendar') return withSchedule(await calendarCards());
  if (type === 'term') return withSchedule(termCards());
  if (type === 'week') return withSchedule(weekCards());
  if (type === 'stock') return withSchedule(await stockCards(region === 'us' ? 'us' : 'kr'));
  return [type];
}

// ── 게시 멱등 잠금 ────────────────────────────────────────────────────────────
// 왜 필요한가: 캐러셀 게시는 인스타 미디어 컨테이너를 카드 수만큼 만들고 합치느라
// 약 70초가 걸리는데, 이 함수의 상한(maxDuration)은 60초다. 그래서 게시는 실제로
// 성공하는데도 호출자(GitHub Actions curl)는 항상 실패로 받고 `--retry 1`로 한 번 더
// 호출했다 → 같은 글이 60~80초 간격으로 두 번 올라감(2026-07-30~08-09 사이 21건).
//
// 대책: 게시 '직전'에 (타입·지역·슬롯·KST 날짜) 키를 선점한다. 함수가 중간에
// 잘려도 잠금은 남으므로 재시도 요청은 게시하지 않고 스킵한다. 반대로 게시가
// 명시적으로 실패하면 잠금을 풀어 정상 재시도를 막지 않는다.
//  · breaking(급변동 속보)은 하루 최대 2회라 날짜 잠금 대상에서 제외
//    (자체 중복 차단 키를 check-breaking 워크플로가 이미 관리한다).
//  · force=1(수동 강제)·dry=1(미리보기)도 제외.
function kstDay(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function pubLockKey(type: string, region: 'kr' | 'us' | 'all', slot: 'am' | 'pm'): string {
  const suffix = type === 'news' ? `:${region}:${slot}` : type === 'stock' ? `:${region}` : '';
  return `ig:pub:${type}${suffix}:${kstDay()}`;
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
  // 같은 편성이 오늘 이미 나갔으면 즉시 스킵(재시도로 인한 중복 게시 차단).
  const lockKey = !dry && !force && type !== 'breaking' ? pubLockKey(type, region, slot) : '';
  if (lockKey) {
    const prev = await kvGet<{ at: string; id?: string }>(lockKey);
    if (prev) {
      return NextResponse.json({ ok: true, skipped: true, reason: '오늘 같은 편성이 이미 게시됨 — 중복 방지', at: prev.at, id: prev.id ?? null });
    }
  }
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
    // 게시 직전 선점 — 이 시점 이후로는 함수가 잘려도 재시도가 다시 게시하지 않는다.
    const claim = async () => { if (lockKey) await kvSet(lockKey, { at: new Date().toISOString() }); };
    const markPublished = async (id: string) => { if (lockKey) await kvSet(lockKey, { at: new Date().toISOString(), id }); };
    const caption = await buildCaption(CAPTION_TYPE[type] ?? 'brief', slot, region);
    if (video) {
      if (dry) return NextResponse.json({ ok: true, dry: true, mode: 'reel', video, caption });
      await claim();
      const res = await publishReel(video, caption);
      await markFresh();
      await markPublished(res.id);
      return NextResponse.json({ ok: true, id: res.id, mode: 'reel' });
    }
    const cards = await cardsFor(type, slot, region);
    if (!cards.length) return NextResponse.json({ ok: false, error: '게시할 카드 없음(데이터 캐시 비어있음)' }, { status: 503 });
    // 뉴스는 slot+region, 화제의 종목은 region(=시장)만 카드 URL에 실어야 같은 데이터가 렌더된다.
    const needsRegion = type === 'news' || type === 'stock';
    const imageUrls = cards.map((c) => cardImageUrl(c, type === 'news' ? slot : undefined, needsRegion ? region : undefined));
    if (dry) return NextResponse.json({ ok: true, dry: true, cards, imageUrls, caption });
    await claim();
    const res = imageUrls.length > 1 ? await publishCarousel(imageUrls, caption) : await publishImage(imageUrls[0], caption);
    await markFresh();
    await markPublished(res.id);
    return NextResponse.json({ ok: true, id: res.id, cards });
  } catch (e) {
    // 게시가 명시적으로 실패했으면 선점을 풀어 정상 재시도를 막지 않는다.
    // (함수가 시간 초과로 잘린 경우엔 여기 오지 않으므로 잠금이 남아 중복을 막는다.)
    if (lockKey) await kvDel(lockKey).catch(() => {});
    console.error('[ig/publish] failed:', (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
