import { NextResponse } from 'next/server';
import { getStockCardData, getWeekReviewData } from '@/server/cardData';

// 아카이브 적재 — /today/{날짜}·/review/{주차} 페이지가 쌓이게 하는 유일한 트리거.
//
// 배경: 원래 이 스냅샷은 인스타 카드 렌더·게시 과정에서 부수적으로 적재됐다.
// 2026-10 인스타 자동 게시를 전부 제거하면서 호출하는 곳이 사라졌고, 그대로 두면
// 색인 대상으로 만들어 둔 아카이브 페이지가 그날부터 멈춘다. 그래서 적재만 하는
// 전용 크론으로 분리했다(게시·외부 전송 없음, 내부 데이터 갱신만).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const okAuth = (!!secret && req.headers.get('authorization') === `Bearer ${secret}`)
    || (!!process.env.MOCK_FILL_TOKEN && url.searchParams.get('t') === process.env.MOCK_FILL_TOKEN);
  if (!okAuth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 한쪽이 실패해도 다른 쪽은 적재되도록 개별 처리한다.
  const [stock, week] = await Promise.allSettled([
    getStockCardData('kr'),
    getWeekReviewData(),
  ]);
  return NextResponse.json({
    ok: true,
    stock: stock.status === 'fulfilled' ? (stock.value ? stock.value.name : '조건 미달(적재 없음)') : `실패: ${stock.reason}`,
    week: week.status === 'fulfilled' ? week.value.range : `실패: ${week.reason}`,
  });
}
