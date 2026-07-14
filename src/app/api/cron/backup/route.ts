import { NextResponse } from 'next/server';
import { runBackup } from '@/server/backup';

// 핵심 사용자 데이터 자동 백업 크론(매일). Supabase Storage 비공개 버킷에 JSON 스냅샷 저장.
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const token = process.env.MOCK_FILL_TOKEN;
  const byBearer = !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
  const byToken = !!token && new URL(req.url).searchParams.get('t') === token;
  if (!byBearer && !byToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await runBackup()) });
  } catch (e) {
    console.error('[backup]', (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
