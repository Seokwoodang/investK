import { NextResponse } from 'next/server';
import { fillAllOrders } from '@/server/mock';

// 지정가 미체결 주문 자동 체결 크론(GitHub Actions에서 ~10분 간격 호출).
// 사용자가 사이트에 없어도 가격 도달 시 체결되게 하는 백그라운드 처리.
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  // 인증: GitHub Actions는 Bearer CRON_SECRET, Supabase pg_cron은 ?t=MOCK_FILL_TOKEN(쿼리).
  const secret = process.env.CRON_SECRET;
  const token = process.env.MOCK_FILL_TOKEN;
  const byBearer = !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
  const byToken = !!token && new URL(req.url).searchParams.get('t') === token;
  if (!byBearer && !byToken) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await fillAllOrders()) });
  } catch (e) {
    console.error('[mock-fill]', (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
