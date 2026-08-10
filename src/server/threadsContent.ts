import 'server-only';
import { SITE_URL } from '@/lib/site';
import { getStockSnapshot, listStockDays, listWeeks, getWeekSnapshot, ymdLabel } from '@/server/archive';
import { TERMS, termSlug, definitionOf } from '@/lib/glossaryPages';

// 스레드에 올릴 문구 조립.
//
// 원칙: 링크를 물리기 위한 미끼가 아니라 그 자체로 읽을 만한 한 편이어야 한다.
// 스레드는 해시태그를 인스타처럼 보상하지 않으므로 태그 도배는 하지 않는다.
// 링크는 본문에 넣지 않고 link_attachment로 붙인다(카드로 렌더되고 본문이 깔끔해진다).

export type ThreadType = 'today' | 'review' | 'term';
export interface ThreadPost { text: string; link: string; key: string }

const kstYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** 오늘(없으면 가장 최근) 화제의 종목. */
async function todayPost(): Promise<ThreadPost | null> {
  const days = await listStockDays('kr');
  const ymd = days.includes(kstYmd()) ? kstYmd() : days[0];
  if (!ymd) return null;
  const d = await getStockSnapshot('kr', ymd);
  if (!d) return null;

  const dir = d.dir === 'up' ? '올랐' : '내렸';
  const pct = `${d.dir === 'up' ? '+' : ''}${d.pct.toFixed(2)}%`;
  const lines = [`${ymdLabel(ymd)} 국내 증시에서 가장 크게 움직인 종목은 ${d.name}입니다. ${pct} ${dir}습니다.`];

  if (d.news.length) {
    lines.push('');
    lines.push('왜 움직였나');
    d.news.slice(0, 2).forEach((n) => lines.push(`· ${n.title}`));
  } else {
    lines.push('');
    lines.push('이 종목을 직접 다룬 최근 기사는 없었습니다. 뉴스보다 수급 영향일 가능성이 큽니다.');
  }

  const facts: string[] = [];
  if (d.per != null) facts.push(`PER ${d.per.toFixed(1)}배`);
  if (d.pbr != null) facts.push(`PBR ${d.pbr.toFixed(1)}배`);
  if (d.roe != null) facts.push(`ROE ${d.roe.toFixed(1)}%`);
  if (facts.length) {
    lines.push('');
    lines.push(facts.join(' · '));
  }
  // 지표만 나열하면 추천으로 읽힌다. 성격을 명시한다(사이트 각 페이지와 같은 기준).
  lines.push('');
  lines.push('※ 추천이 아니라 그날 크게 움직인 종목의 기록입니다.');

  return { text: lines.join('\n'), link: `${SITE_URL}/today/${ymd}`, key: `today:${ymd}` };
}

/** 가장 최근 주간 마켓 리뷰. */
async function reviewPost(): Promise<ThreadPost | null> {
  const keys = await listWeeks();
  const key = keys[0];
  if (!key) return null;
  const w = await getWeekSnapshot(key);
  if (!w) return null;

  const rows = [...w.indices, { name: '비트코인', chg: w.btc }];
  const lines = [
    `한 주 정리 (${w.range})`,
    '',
    w.summary,
    '',
    ...rows.map((r) => `· ${r.name} ${r.chg > 0 ? '+' : ''}${r.chg.toFixed(2)}%`),
  ];
  return { text: lines.join('\n'), link: `${SITE_URL}/review/${key}`, key: `review:${key}` };
}

/** 투자 용어 1개 — 날짜 기준으로 회전(같은 날 여러 번 호출해도 같은 용어). */
async function termPost(): Promise<ThreadPost | null> {
  if (!TERMS.length) return null;
  const ymd = kstYmd();
  const seed = Number(ymd.replace(/-/g, ''));
  const term = TERMS[seed % TERMS.length];
  const def = definitionOf(term);
  if (!def) return null;
  const lines = [`오늘의 투자 용어 — ${term}`, '', def];
  return { text: lines.join('\n'), link: `${SITE_URL}/glossary/${encodeURIComponent(termSlug(term))}`, key: `term:${ymd}` };
}

export async function buildThreadPost(type: ThreadType): Promise<ThreadPost | null> {
  if (type === 'today') return todayPost();
  if (type === 'review') return reviewPost();
  return termPost();
}
