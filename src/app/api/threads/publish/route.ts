import { NextResponse } from 'next/server';
import { publishThread } from '@/server/threads';
import { buildThreadPost, type ThreadType } from '@/server/threadsContent';
import { kvGet, kvSet, kvDel } from '@/server/kv';

// 스레드 자동 게시 엔드포인트(GitHub Actions cron이 호출).
//  ?type=today  : 오늘 화제의 종목 → /today/{날짜} 링크
//  ?type=review : 주간 마켓 리뷰   → /review/{주차} 링크
//  ?type=term   : 오늘의 투자 용어 → /glossary/{용어} 링크
//  ?dry=1       : 실제 게시 없이 문구/링크만 미리보기
//  인증: Bearer CRON_SECRET 또는 ?t=MOCK_FILL_TOKEN.
//
// 인스타에서 겪은 문제를 처음부터 막아둔다:
//  · 게시 직전 멱등 잠금 → 호출자 재시도가 같은 글을 두 번 올리지 않는다
//  · 컨테이너 생성+게시 왕복이 2회뿐이라 함수 상한(60초)에 여유가 크다
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TYPES: ThreadType[] = ['today', 'review', 'term'];

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

  const t = url.searchParams.get('type') || 'today';
  if (!TYPES.includes(t as ThreadType)) {
    return NextResponse.json({ error: `알 수 없는 type: ${t}` }, { status: 400 });
  }
  const type = t as ThreadType;
  const dry = url.searchParams.get('dry') === '1';
  const force = url.searchParams.get('force') === '1';

  try {
    const postData = await buildThreadPost(type);
    if (!postData) {
      return NextResponse.json({ ok: false, error: '게시할 내용 없음(아카이브 비어있음)' }, { status: 503 });
    }
    if (dry) return NextResponse.json({ ok: true, dry: true, type, ...postData });

    // 같은 내용(날짜·주차 단위)은 하루 한 번만.
    const lockKey = force ? '' : `threads:pub:${postData.key}`;
    if (lockKey) {
      const prev = await kvGet<{ at: string; id?: string }>(lockKey);
      if (prev) {
        return NextResponse.json({ ok: true, skipped: true, reason: '이미 게시됨 — 중복 방지', at: prev.at, id: prev.id ?? null });
      }
      await kvSet(lockKey, { at: new Date().toISOString() });
    }

    try {
      const res = await publishThread(postData.text, postData.link);
      if (lockKey) await kvSet(lockKey, { at: new Date().toISOString(), id: res.id });
      return NextResponse.json({ ok: true, id: res.id, type, link: postData.link });
    } catch (e) {
      // 게시가 명시적으로 실패하면 잠금을 풀어 정상 재시도를 막지 않는다.
      if (lockKey) await kvDel(lockKey).catch(() => {});
      throw e;
    }
  } catch (e) {
    const msg = (e as Error).message;
    // 토큰을 아직 발급하지 않은 상태 → 실패가 아니라 '미설정'으로 알린다.
    // (503은 워크플로가 스킵으로 처리하므로 설정 전까지 매일 실패 알림이 오지 않는다.)
    if (msg.includes('THREADS_TOKEN 미설정')) {
      return NextResponse.json({ ok: false, skipped: true, reason: 'THREADS_TOKEN 미설정 — 발급 후 자동 시작' }, { status: 503 });
    }
    console.error('[threads/publish] failed:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
