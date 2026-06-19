import { NextResponse } from 'next/server';
import { NEWS_TABS, refreshTabNews } from '@/server/news';

// Vercel Cron이 1시간마다 호출 → 모든 뉴스 탭을 미리 AI 판별·생성해 Supabase에 저장.
// 사용자 /api/news(뉴스 탭)는 이 결과를 즉시 읽기만 한다(대기 없음).
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // AI 4탭 생성 여유

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const out: Record<string, number> = {};
  for (const tab of NEWS_TABS) {
    try {
      out[tab] = await refreshTabNews(tab);
    } catch (e) {
      out[tab] = -1;
      console.error(`[cron/news] ${tab} failed:`, (e as Error).message);
    }
  }
  return NextResponse.json({ ok: true, counts: out });
}
