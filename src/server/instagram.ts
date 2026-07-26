import 'server-only';
import { getBriefing } from '@/server/briefing';
import { getNewsCardData, getValueCardData, getCalendarCardData, getTermCardData, getBreakingCardData, getWeekReviewData } from '@/server/cardData';
import { SITE_URL } from '@/lib/site';

// 인스타그램 자동 게시(Instagram 비즈니스 로그인 API, graph.instagram.com).
//  흐름: 미디어 컨테이너 생성 → 처리 완료 대기 → 게시.
//  토큰(INSTA_TOKEN)은 서버 전용 비밀. 60일짜리 장기 토큰이며 만료 전 갱신 필요(refreshToken).
const IG_API = 'https://graph.instagram.com/v21.0';

function token(): string {
  const t = process.env.INSTA_TOKEN;
  if (!t) throw new Error('INSTA_TOKEN 미설정(Vercel 환경변수에 추가 필요)');
  return t;
}

// 토큰이 가리키는 인스타 계정 ID(게시 대상). 요청마다 바뀌지 않으니 모듈 캐시.
let _igId: string | null = null;
async function igUserId(): Promise<string> {
  if (_igId) return _igId;
  const j = await fetch(`${IG_API}/me?fields=id&access_token=${token()}`).then((r) => r.json());
  if (!j?.id) throw new Error('IG 사용자 ID 조회 실패: ' + JSON.stringify(j));
  _igId = String(j.id);
  return _igId;
}

async function igPost(path: string, body: Record<string, string>): Promise<any> {
  const form = new URLSearchParams({ ...body, access_token: token() });
  const r = await fetch(`${IG_API}/${path}`, { method: 'POST', body: form });
  const j = await r.json();
  if (!r.ok || j?.error) throw new Error(`IG ${path} 실패: ${JSON.stringify(j?.error ?? j)}`);
  return j;
}

// 컨테이너 처리 완료 대기(이미지는 대개 즉시, 영상은 인코딩 시간 필요).
async function waitFinished(creationId: string, tries = 12): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const s = await fetch(`${IG_API}/${creationId}?fields=status_code&access_token=${token()}`).then((r) => r.json());
    if (s?.status_code === 'FINISHED') return;
    if (s?.status_code === 'ERROR') throw new Error('미디어 처리 실패(status ERROR)');
    await new Promise((res) => setTimeout(res, 2000));
  }
  throw new Error('미디어 처리 시간 초과');
}

// 단일 이미지 게시. 성공 시 게시물 id 반환.
export async function publishImage(imageUrl: string, caption: string): Promise<{ id: string }> {
  const ig = await igUserId();
  const container = await igPost(`${ig}/media`, { image_url: imageUrl, caption });
  await waitFinished(String(container.id));
  const pub = await igPost(`${ig}/media_publish`, { creation_id: String(container.id) });
  await postFirstComment(String(pub.id));
  return { id: String(pub.id) };
}

// 캐러셀(여러 장) 게시: 각 이미지 자식 컨테이너 → CAROUSEL 부모 → 게시.
export async function publishCarousel(imageUrls: string[], caption: string): Promise<{ id: string }> {
  if (imageUrls.length < 2) return publishImage(imageUrls[0], caption);
  const ig = await igUserId();
  const children: string[] = [];
  for (const url of imageUrls) {
    const c = await igPost(`${ig}/media`, { image_url: url, is_carousel_item: 'true' });
    await waitFinished(String(c.id));
    children.push(String(c.id));
  }
  const parent = await igPost(`${ig}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption });
  await waitFinished(String(parent.id));
  const pub = await igPost(`${ig}/media_publish`, { creation_id: String(parent.id) });
  await postFirstComment(String(pub.id));
  return { id: String(pub.id) };
}

// 게시 직후 안내 첫 댓글 자동 작성(키워드 유도). 계정 본인 댓글이라 웹훅 owner-skip에 걸려 루프 없음.
const FIRST_COMMENT = '💬 「지표」 라고 댓글 남기면 실시간 시장지표 링크를 DM으로 보내드려요 📩\n팔로우하면 매일 아침·저녁 시장 정리를 자동으로 받아볼 수 있어요 🙌';
async function postFirstComment(mediaId: string): Promise<void> {
  try { await igPost(`${mediaId}/comments`, { message: FIRST_COMMENT }); }
  catch (e) { console.error('[ig] 첫 댓글 실패:', (e as Error).message); }
}

// 릴스(세로 영상) 게시. video_url은 공개 접근 가능한 mp4여야 한다.
export async function publishReel(videoUrl: string, caption: string): Promise<{ id: string }> {
  const ig = await igUserId();
  const container = await igPost(`${ig}/media`, { media_type: 'REELS', video_url: videoUrl, caption, share_to_feed: 'true' });
  await waitFinished(String(container.id), 26); // 영상 인코딩 대기(최대 ~52초)
  const pub = await igPost(`${ig}/media_publish`, { creation_id: String(container.id) });
  await postFirstComment(String(pub.id));
  return { id: String(pub.id) };
}

// 하루 캐러셀 카드 순서.
export const DAILY_CARDS = ['cover', 'kr', 'global', 'crypto', 'outro'] as const;
// 릴스로 만들 캐러셀 카드 순서(타입별).
export const REEL_CARDS: Record<string, string[]> = {
  daily: ['cover', 'kr', 'global', 'crypto', 'outro'],
  news: ['news-cover', 'news-0', 'news-1', 'news-2', 'news-outro'],
  value: ['value-cover', 'value-0', 'value-1', 'value-2', 'value-3', 'value-4', 'value-outro'],
};

// 장기 토큰 갱신(24h~60일 사이에 호출). 갱신된 새 토큰 문자열을 반환한다.
// 주: Vercel 환경변수는 코드에서 못 바꾸므로, 반환값을 별도 저장소/수동 갱신에 사용.
export async function refreshToken(): Promise<{ access_token: string; expires_in: number }> {
  const j = await fetch(`${IG_API}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token()}`).then((r) => r.json());
  if (!j?.access_token) throw new Error('토큰 갱신 실패: ' + JSON.stringify(j));
  return { access_token: j.access_token, expires_in: j.expires_in };
}

// ── 캡션/이미지 ────────────────────────────────────────────────
const kstYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const kstDateLabel = () => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }).format(new Date());

// 해시태그: 대형(도달)~중형(타겟) 골고루. 인스타 최대 30개 → 28개로 구성.
const TAGS_BASE = ['#투자', '#주식', '#증시', '#경제', '#재테크', '#주식투자', '#투자정보', '#금융', '#투자공부', '#주식초보', '#주린이', '#자산관리', '#부자되기', '#직장인재테크', '#소액투자', '#경제상식', '#재테크공부', '#돈공부'];
const TAGS_BRAND = ['#investK', '#인베스트케이'];
const tags = (extra: string[]) => [...TAGS_BASE, ...extra, ...TAGS_BRAND].slice(0, 30).join(' ');

// 인스타가 이미지를 새로 가져가도록 매 호출 고유 쿼리를 붙여 캐시 무력화.
// slot: 뉴스 아침/저녁, region: 국내/미국 (카드 데이터가 슬롯·지역별로 달라짐).
export function cardImageUrl(type: string, slot?: string, region?: string): string {
  const s = slot ? `&slot=${slot}` : '';
  const r = region && region !== 'all' ? `&region=${region}` : '';
  return `${SITE_URL}/api/card/${type}?t=${Date.now()}${s}${r}`;
}

const IMP_EMOJI: Record<string, string> = { 호재: '📈', 악재: '📉', 중립: '➖' };

export async function buildCaption(type: string, slot?: 'am' | 'pm', region?: 'kr' | 'us' | 'all'): Promise<string> {
  if (type === 'news') {
    const rg = region ?? 'all';
    const nd = await getNewsCardData(slot ?? 'pm', rg);
    const items = nd.items.slice(0, 3).map((n, i) => `${i + 1}. ${IMP_EMOJI[n.impact] ?? ''} ${n.title}`).join('\n');
    const when = nd.slotLabel || (slot === 'am' ? '아침' : '저녁'); // 개장 전 / 마감
    const head =
      rg === 'kr' ? `🇰🇷 국내증시 ${when} 뉴스 · ${kstDateLabel()}`
      : rg === 'us' ? `🇺🇸 미국증시 ${when} 뉴스 · ${kstDateLabel()}`
      : slot === 'am' ? `🌅 밤사이 투자 뉴스 · ${kstDateLabel()}` : `📰 오늘의 투자 뉴스 · ${kstDateLabel()}`;
    const extraTags =
      rg === 'kr' ? ['#국내주식', '#코스피', '#코스닥', '#국내증시', '#한국주식', '#증시뉴스', '#경제뉴스', '#오늘의뉴스']
      : rg === 'us' ? ['#미국주식', '#나스닥', '#SP500', '#미국증시', '#해외주식', '#서학개미', '#증시뉴스', '#오늘의뉴스']
      : ['#경제뉴스', '#증시뉴스', '#투자뉴스', '#코스피', '#나스닥', '#미국주식', '#비트코인', '#오늘의뉴스'];
    return [
      head,
      '',
      items || '오늘의 주요 시장 뉴스',
      '',
      '💬 댓글에 「지표」 라고 남기면 실시간 링크를 DM으로 보내드려요!','','※ 참고용 정보이며 투자 권유가 아닙니다.',
      '👉 전체 뉴스·지표는 프로필 링크 investk.app',
      '',
      tags(extraTags),
    ].join('\n');
  }
  if (type === 'value') {
    const vd = await getValueCardData();
    const label = vd.market === 'kr' ? '국내' : '해외';
    const list = vd.items.map((s, i) => `${i + 1}. ${s.name}${s.upside !== '—' ? ` (상승여력 ${s.upside})` : ''}`).join('\n');
    return [
      `💎 이번 주 저평가 우량주 ${label} TOP5`,
      '',
      list || 'PER·PBR·ROE·배당 지표로 자동 선별',
      '',
      '※ 지표 기준 자동 선별이며 종목 추천이 아닙니다.',
      '👉 전체 순위·세부 지표 investk.app/value',
      '',
      tags(['#저평가주', '#가치투자', '#배당주', '#우량주', '#PER', '#PBR', '#ROE', '#가치주']),
    ].join('\n');
  }
  if (type === 'calendar') {
    const cd = await getCalendarCardData();
    const highs = [...cd.firstHalf, ...cd.secondHalf].filter((e) => e.high).slice(0, 4).map((e) => `• ${e.day} ${e.name}`).join('\n');
    return [
      `🗓 이번 주 시장 캘린더 (${cd.range})`,
      '',
      highs || '이번 주 주요 경제 일정',
      '',
      '💬 댓글에 「지표」 라고 남기면 실시간 링크를 DM으로 보내드려요!','','※ 참고용 정보이며 투자 권유가 아닙니다.',
      '👉 매일 아침 브리핑 investk.app',
      '',
      tags(['#경제캘린더', '#증시일정', '#FOMC', '#CPI', '#금리', '#경제지표', '#증시전망', '#주간전망']),
    ].join('\n');
  }
  if (type === 'breaking') {
    const b = await getBreakingCardData();
    return [
      `🚨 속보${b ? ` · ${b.time}` : ''}`,
      '',
      b ? b.headline : '시장 급변동',
      b ? b.sub : '',
      '',
      '💬 댓글에 「지표」 라고 남기면 실시간 링크를 DM으로 보내드려요!','','※ 참고용 지표이며 투자 권유가 아닙니다.',
      '👉 실시간 지표는 프로필 링크 investk.app',
      '',
      tags(['#속보', '#증시속보', '#급락', '#급등', '#코스피', '#나스닥', '#시장급변동', '#증시']),
    ].join('\n');
  }
  if (type === 'week') {
    const wd = await getWeekReviewData();
    const list = wd.indices.map((r) => `• ${r.name} ${r.chg > 0 ? '+' : r.chg < 0 ? '−' : ''}${Math.abs(r.chg).toFixed(2)}%`).join('\n');
    return [
      `📅 이번 주 마켓 리뷰 (${wd.range})`,
      '',
      wd.summary,
      '',
      list,
      '',
      '💬 댓글에 「지표」 라고 남기면 실시간 링크를 DM으로 보내드려요!','','※ 참고용 지표이며 투자 권유가 아닙니다.',
      '👉 다음 주 브리핑은 프로필 링크 investk.app',
      '',
      tags(['#주간증시', '#주간리뷰', '#코스피', '#코스닥', '#나스닥', '#미국주식', '#증시전망', '#주말']),
    ].join('\n');
  }
  if (type === 'term') {
    const td = await getTermCardData();
    return [
      `💡 1분 투자 상식 · ${td.term}`,
      '',
      `${td.fullName}`,
      '뉴스에 매일 나오는 그 용어, 오늘 확실히 정리해요.',
      '',
      '💬 댓글에 「지표」 라고 남기면 실시간 링크를 DM으로 보내드려요!','','※ 참고용 정보이며 투자 권유가 아닙니다.',
      '👉 전 종목 지표 investk.app',
      '',
      tags(['#주식용어', '#투자용어', '#경제용어', '#주식공부', '#재테크상식', '#금융상식', '#투자기초', '#주식입문']),
    ].join('\n');
  }
  // 기본: 시장 브리핑
  const b = await getBriefing(kstYmd());
  const facts = (b.facts ?? []).slice(0, 3).map((f) => `• ${f.t}`).join('\n');
  return [
    `📊 오늘의 시장 브리핑 · ${kstDateLabel()}`,
    '',
    b.headline || '오늘의 시장 요약',
    '',
    facts,
    '',
    '📌 카드를 넘겨 지수·코인·환율까지 한눈에 확인하세요.',
    '💬 댓글에 「지표」 라고 남기면 실시간 링크를 DM으로 보내드려요!','','※ 참고용 지표이며 투자 권유가 아닙니다.',
    '👉 실시간 전체 지표는 프로필 링크에서',
    '',
    tags(['#코스피', '#코스닥', '#나스닥', '#미국주식', '#환율', '#비트코인', '#코인', '#경제뉴스']),
  ].join('\n');
}

// 뉴스 캐러셀 카드 목록(커버 + 뉴스 N + 마무리). 뉴스 개수에 맞춰 동적 생성.
export async function newsCards(slot?: 'am' | 'pm', region?: 'kr' | 'us' | 'all'): Promise<string[]> {
  const nd = await getNewsCardData(slot ?? 'pm', region ?? 'all');
  const n = Math.min(nd.items.length, 3);
  if (n === 0) return [];
  return ['news-cover', ...Array.from({ length: n }, (_, i) => `news-${i}`), 'news-outro'];
}

// 주간 시리즈 카드 목록.
export async function valueCards(): Promise<string[]> {
  const vd = await getValueCardData();
  const n = Math.min(vd.items.length, 5);
  if (n === 0) return [];
  return ['value-cover', ...Array.from({ length: n }, (_, i) => `value-${i}`), 'value-outro'];
}
export async function calendarCards(): Promise<string[]> {
  const cd = await getCalendarCardData();
  if (!cd.firstHalf.length && !cd.secondHalf.length) return [];
  return ['cal-cover', 'cal-1', 'cal-2', 'cal-outro'];
}
export function termCards(): string[] {
  return ['term-cover', 'term-def', 'term-example', 'term-tips', 'term-outro'];
}
export function weekCards(): string[] {
  return ['week-cover', 'week-detail', 'week-outro'];
}
