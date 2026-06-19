import { NextResponse } from 'next/server';
import { getMonthCalendar } from '@/server/providers/nasdaqCalendar';

// GET /api/calendar?year=2026&month=6  (month는 0-indexed)
// 달력 월 이동 시 해당 월의 Nasdaq 경제지표 일정을 가져온다. 결과는 서버에서 1시간 캐시.
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const year = parseInt(url.searchParams.get('year') || '', 10);
  const month = parseInt(url.searchParams.get('month') || '', 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11) {
    return NextResponse.json({ events: [] }, { status: 400 });
  }
  try {
    const events = await getMonthCalendar(year, month);
    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ events: [] });
  }
}
