import { NextResponse } from 'next/server';
import { publishImage, buildCaption, cardImageUrl } from '@/server/instagram';

// 인스타그램 자동 게시 엔드포인트(GitHub Actions cron이 호출).
//  ?type=brief   : 게시할 카드 종류(현재 brief만)
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
  const type = url.searchParams.get('type') || 'brief';
  const dry = url.searchParams.get('dry') === '1';
  try {
    const caption = await buildCaption(type);
    const imageUrl = cardImageUrl(type);
    if (dry) return NextResponse.json({ ok: true, dry: true, type, imageUrl, caption });
    const res = await publishImage(imageUrl, caption);
    return NextResponse.json({ ok: true, id: res.id, type });
  } catch (e) {
    console.error('[ig/publish] failed:', (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
