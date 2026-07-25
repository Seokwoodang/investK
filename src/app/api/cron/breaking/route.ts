import { NextResponse } from 'next/server';
import { getBreakingCardData } from '@/server/cardData';
import { publishImage, buildCaption, cardImageUrl } from '@/server/instagram';
import { kvGet, kvSet } from '@/server/kv';

// 급변동 속보 자동 게시. GitHub Actions가 ~30분마다 호출.
//  급변동(지수 ±3%·VIX 급등·BTC ±5%)이 감지되고 오늘 같은 유형을 아직 안 올렸으면(하루 2건 상한)
//  속보 카드를 즉시 게시한다. 없으면 no-op.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const kstYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const DAILY_CAP = 2;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const okAuth = (!!secret && req.headers.get('authorization') === `Bearer ${secret}`) ||
    (!!process.env.MOCK_FILL_TOKEN && url.searchParams.get('t') === process.env.MOCK_FILL_TOKEN);
  if (!okAuth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const shock = await getBreakingCardData();
    if (!shock) return NextResponse.json({ ok: true, fired: false, reason: 'no shock' });
    const day = kstYmd();
    const state = (await kvGet<{ keys: string[] }>(`breaking:${day}`)) ?? { keys: [] };
    if (state.keys.includes(shock.key)) return NextResponse.json({ ok: true, fired: false, reason: 'already fired', key: shock.key });
    if (state.keys.length >= DAILY_CAP) return NextResponse.json({ ok: true, fired: false, reason: 'daily cap', key: shock.key });

    if (url.searchParams.get('dry') === '1') return NextResponse.json({ ok: true, dry: true, shock });

    const caption = await buildCaption('breaking');
    const res = await publishImage(cardImageUrl('breaking'), caption);
    await kvSet(`breaking:${day}`, { keys: [...state.keys, shock.key] });
    return NextResponse.json({ ok: true, fired: true, id: res.id, key: shock.key });
  } catch (e) {
    console.error('[cron/breaking] failed:', (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
