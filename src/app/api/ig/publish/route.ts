import { NextResponse } from 'next/server';
import { publishCarousel, publishImage, buildCaption, cardImageUrl, newsCards, DAILY_CARDS } from '@/server/instagram';

// 인스타그램 자동 게시 엔드포인트(GitHub Actions cron이 호출).
//  ?type=daily   : 시장 브리핑 캐러셀 5장(기본)
//  ?type=news    : 오늘의 투자 뉴스 캐러셀(커버+뉴스N+마무리)
//  단일 카드명(cover/kr/news-0/…)도 허용.
//  ?dry=1        : 실제 게시 없이 캡션/이미지URL만 미리보기(테스트용)
//  인증: Bearer CRON_SECRET(액션) 또는 ?t=MOCK_FILL_TOKEN(수동).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
  try {
    const caption = await buildCaption(type === 'news' ? 'news' : 'brief');
    const cards = type === 'daily' ? [...DAILY_CARDS] : type === 'news' ? await newsCards() : [type];
    if (!cards.length) return NextResponse.json({ ok: false, error: '게시할 카드 없음(뉴스 캐시 비어있음)' }, { status: 503 });
    const imageUrls = cards.map(cardImageUrl);
    if (dry) return NextResponse.json({ ok: true, dry: true, cards, imageUrls, caption });
    const res = imageUrls.length > 1 ? await publishCarousel(imageUrls, caption) : await publishImage(imageUrls[0], caption);
    return NextResponse.json({ ok: true, id: res.id, cards });
  } catch (e) {
    console.error('[ig/publish] failed:', (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
