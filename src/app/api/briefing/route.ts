import { NextResponse } from 'next/server';
import { readBriefing } from '@/server/briefing';

// GET /api/briefing?date=YYYY-MM-DD — 공개 읽기 전용.
// cron이 미리 생성해둔 브리핑(Supabase)을 읽기만 한다(AI 호출 절대 없음 → 익명에게 안전).
// 과거엔 /api/ai/briefing(로그인 게이트)만 있어서 비로그인 방문자는 공개 페이지(/daily·대시보드)에서
// 낡은 정적 샘플만 보게 되는 문제가 있었다 — 이 라우트가 그걸 해결한다.
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const brief = await readBriefing(date);
  if (!brief) return NextResponse.json({ brief: null }); // 아직 생성 전(콜드) — 화면이 안내 표시
  return NextResponse.json({ brief });
}
