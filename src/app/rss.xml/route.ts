import { SITE_URL } from '@/lib/site';
import { listStockDays, getStockSnapshot, listWeeks, getWeekSnapshot, ymdLabel, weekLabel } from '@/server/archive';

// RSS 2.0 피드 — 네이버 서치어드바이저는 사이트맵과 별개로 RSS를 수집 통로로 쓴다.
// 매일 쌓이는 아카이브(화제의 종목·주간 리뷰)를 최신순으로 실어 새 글을 빨리 알린다.
// 크롤러만 읽는 경로라 요청 시 생성한다(사이트맵과 같은 이유로 정적 생성이면 굳는다).
export const dynamic = 'force-dynamic';

const MAX_ITEMS = 40;

/** XML 텍스트 이스케이프 — 종목명·요약에 &, < 가 들어올 수 있다. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 'YYYY-MM-DD' → 그날 15:30 KST(장 마감 시각)의 RFC-822 문자열. savedAt이 있으면 그걸 쓴다. */
function pubDate(savedAt: string | undefined, ymd?: string): string {
  if (savedAt) return new Date(savedAt).toUTCString();
  if (ymd) return new Date(`${ymd}T15:30:00+09:00`).toUTCString();
  return new Date().toUTCString();
}

interface Item { title: string; link: string; desc: string; date: string }

export async function GET() {
  const [krDays, usDays, weeks] = await Promise.all([
    listStockDays('kr').catch(() => [] as string[]),
    listStockDays('us').catch(() => [] as string[]),
    listWeeks().catch(() => [] as string[]),
  ]);

  const days = [...new Set([...krDays, ...usDays])].sort().reverse().slice(0, 30);
  const items: Item[] = [];

  await Promise.all(
    days.map(async (ymd) => {
      const [kr, us] = await Promise.all([getStockSnapshot('kr', ymd), getStockSnapshot('us', ymd)]);
      const picks = [kr, us].filter((x): x is NonNullable<typeof x> => !!x);
      if (!picks.length) return;
      const names = picks.map((p) => `${p.name} ${p.dir === 'up' ? '+' : ''}${p.pct.toFixed(2)}%`).join(' · ');
      // 첫 종목의 대표 뉴스 한 줄을 요약에 붙여 피드만 봐도 맥락이 잡히게 한다.
      const lead = picks[0].news[0]?.title;
      items.push({
        title: `${ymdLabel(ymd)} 화제의 종목 — ${names}`,
        link: `${SITE_URL}/today/${ymd}`,
        desc: lead
          ? `${names}. ${lead}`
          : `${names}. 왜 움직였는지 실제 뉴스·공시와 주요 지표로 정리했습니다.`,
        date: pubDate(picks[0].savedAt, ymd),
      });
    }),
  );

  await Promise.all(
    weeks.slice(0, 10).map(async (key) => {
      const w = await getWeekSnapshot(key);
      if (!w) return;
      items.push({
        title: `${weekLabel(key)} 마켓 리뷰 (${w.range})`,
        link: `${SITE_URL}/review/${key}`,
        desc: w.summary,
        date: pubDate(w.savedAt),
      });
    }),
  );

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>InvestK — 투자 대시보드</title>
<link>${SITE_URL}</link>
<atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
<description>매일의 화제의 종목과 주간 마켓 리뷰. 코스피·나스닥 지수부터 종목이 움직인 이유까지.</description>
<language>ko</language>
<lastBuildDate>${items[0]?.date ?? new Date().toUTCString()}</lastBuildDate>
${items.slice(0, MAX_ITEMS).map((i) => `<item>
<title>${esc(i.title)}</title>
<link>${i.link}</link>
<guid isPermaLink="true">${i.link}</guid>
<description>${esc(i.desc)}</description>
<pubDate>${i.date}</pubDate>
</item>`).join('\n')}
</channel>
</rss>`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' },
  });
}
