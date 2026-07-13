import { NextResponse } from 'next/server';
import { snapshotAll } from '@/server/mock';

// 모의투자 일별 스냅샷 + 분기 롤오버 크론(GitHub Actions에서 매일 18:10 KST 호출).
//  · 전 계좌(시즌·장기) 총자산을 오늘 날짜로 기록 → 자산 변화 선 그래프 데이터.
//  · 분기가 바뀐 시즌 계좌는 최종 순위·수익률을 mock_season_records에 보관 후 1,000만으로 리셋.
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const r = await snapshotAll();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error('[mock-snapshot]', (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
