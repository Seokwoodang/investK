import 'server-only';
import { getDashboardData } from '@/server/data';
import { getBriefing } from '@/server/briefing';
import { getCachedRankedNews } from '@/server/aiNews';
import { NEWS_TABS } from '@/server/news';
import { getOrGenerateJSON } from '@/server/ai';
import { kvGet, kvSet } from '@/server/kv';
import { getValuePage, type Market, type ScoredStock } from '@/server/valueScreen';
import { getUniverse } from '@/server/data';
import { buildKanalystData } from '@/server/kanalyst';
import { getKrStockNews } from '@/server/providers/naverNews';
import { getDisclosures } from '@/server/providers/dart';
import { GLOSSARY } from '@/data';

// KST 기준 연-주차 키(주간 시리즈 캐시·로테이션용).
function kstWeek(): { year: number; week: number; key: string } {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.floor((d.getTime() - jan1) / (7 * 86400000));
  return { year: d.getUTCFullYear(), week, key: `${d.getUTCFullYear()}W${week}` };
}
const KO_DOW = ['일', '월', '화', '수', '목', '금', '토'];

// 인스타 카드뉴스 5장에 바인딩할 실데이터를 한 번에 조립한다.
//  지수·환율·시장지표·자산군요약 = 대시보드 데이터(KIS/실연동), 다우·BTC = Yahoo 보강,
//  한줄평/헤드라인/이벤트 = 데일리 브리핑(Claude 생성).

export type Move = { val: string; chg: number };
export interface CardData {
  dateLabel: string;
  kospi: Move; kosdaq: Move; usdkrw: Move;
  sp500: Move; nasdaq: Move; dow: Move; vix: Move;
  coinGlobalAvg: number; coinKrAvg: number; btcPrice: string | null;
  kimchi: string | null;
  fng: number | null;
  lineKr: string; lineGlobal: string; lineCrypto: string;
  headline: string;
  hero: { name: string; chg: number };
  heroOther: { name: string; chg: number } | null;
  event: { name: string; sub: string; month: string; day: string } | null;
}

// Satori(Pretendard)에 없는 글자 제거 — 이모지·국기·한자는 카드에서 두부(□)로 렌더된다.
const stripTofu = (s: string) => s.replace(/[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{3400}-\u{9FFF}️‍]/gu, '').replace(/\s{2,}/g, ' ').trim();

const kstYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const kstDateLabel = () => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());

async function yq(symbol: string): Promise<{ price: number; chg: number; time: number } | null> {
  try {
    const j = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 600 },
    }).then((r) => r.json());
    const m = j?.chart?.result?.[0]?.meta;
    if (!m?.regularMarketPrice) return null;
    const price = m.regularMarketPrice as number;
    const prev = (m.chartPreviousClose ?? m.previousClose) as number | undefined;
    const chg = prev ? ((price - prev) / prev) * 100 : 0;
    return { price, chg, time: Number(m.regularMarketTime ?? 0) }; // time=마지막 체결 unix초
  } catch {
    return null;
  }
}
// 최근 체결(라이브)인지 — 마지막 체결이 최근 3시간 내면 장중/실시간으로 간주(스테일 주말값 배제).
const isLive = (q: { time: number } | null): boolean => !!q && q.time > 0 && Date.now() / 1000 - q.time < 3 * 3600;

const findIdx = (rows: { name: string; val: string; chg: number }[], name: string): Move => {
  const r = rows.find((x) => x.name === name);
  return r ? { val: r.val, chg: r.chg } : { val: '—', chg: 0 };
};

export async function getCardData(): Promise<CardData> {
  const [data, b, dowY, btcY] = await Promise.all([
    getDashboardData({ withUniverse: true, withMacroExtras: true }),
    getBriefing(kstYmd()),
    yq('%5EDJI'),
    yq('BTC-USD'),
  ]);

  const idx = data.macro.indices;
  const kospi = findIdx(idx, '코스피');
  const kosdaq = findIdx(idx, '코스닥');
  const sp500 = findIdx(idx, 'S&P 500');
  const nasdaq = findIdx(idx, '나스닥');
  const dow: Move = dowY
    ? { val: dowY.price.toLocaleString('en-US', { maximumFractionDigits: 2 }), chg: +dowY.chg.toFixed(2) }
    : { val: '—', chg: 0 };

  const fxRow = data.macro.fx.find((r) => r.pair.includes('USD/KRW'));
  const usdkrw: Move = fxRow ? { val: fxRow.val, chg: fxRow.chg } : { val: '—', chg: 0 };

  const mk = data.macro.market;
  const vix: Move = mk?.vix ? { val: mk.vix.value, chg: mk.vix.chg ?? 0 } : { val: '—', chg: 0 };
  const kimchi = mk?.kimchi?.value ?? null;
  const fng = mk?.cryptoFng?.value ? parseInt(mk.cryptoFng.value, 10) : null;

  const s = data.assetSummary;
  const btcPrice = btcY ? `$${Math.round(btcY.price).toLocaleString('en-US')}` : null;

  const line = (label: string) => b.byAsset?.find((a) => a.label === label)?.line ?? '';

  // 커버 히어로: 4개 지수 중 절대 등락 최대. 서브: 반대 부호(없으면 2위) 종목.
  const movers = [
    { name: '코스피', chg: kospi.chg },
    { name: '코스닥', chg: kosdaq.chg },
    { name: 'S&P 500', chg: sp500.chg },
    { name: '나스닥', chg: nasdaq.chg },
  ];
  const sorted = [...movers].sort((a, z) => Math.abs(z.chg) - Math.abs(a.chg));
  const hero = sorted[0];
  const opposite = sorted.slice(1).find((m) => Math.sign(m.chg) !== Math.sign(hero.chg) && m.chg !== 0);
  const heroOther = opposite ?? sorted[1] ?? null;

  // 주목 이벤트: 오늘 이후 첫 일정(고영향 우선).
  const today = kstYmd();
  const upcoming = (data.macro.events ?? []).filter((e) => e.date >= today).sort((a, z) => a.date.localeCompare(z.date));
  const ev = upcoming.find((e) => e.tag === '고영향') ?? upcoming[0];
  // Pretendard에 없는 글리프(두부 방지) 제거: 이모지·국기·한자(CJK). 화살표(↑↓→)는 유지.
  const clean = stripTofu;
  const event = ev
    ? {
        name: clean(ev.name),
        sub: ((s) => (s.length > 48 ? s.slice(0, 47) + '…' : s))(clean(ev.desc || ev.rel?.title || '')),
        month: `${parseInt(ev.date.slice(5, 7), 10)}월`,
        day: ev.date.slice(8, 10),
      }
    : null;

  return {
    dateLabel: kstDateLabel(),
    kospi, kosdaq, usdkrw, sp500, nasdaq, dow, vix,
    coinGlobalAvg: s.global_coin?.avgPct ?? 0,
    coinKrAvg: s.kr_coin?.avgPct ?? 0,
    btcPrice, kimchi, fng,
    lineKr: line('국내주식'),
    lineGlobal: line('해외주식'),
    lineCrypto: line('해외코인') || line('국내코인'),
    headline: b.headline || '',
    hero, heroOther, event,
  };
}

// ── 뉴스 캐러셀 데이터 ──
export type NewsImpact = '호재' | '악재' | '중립';
export interface NewsItem { category: string; title: string; bullets: string[]; why: string; impact: NewsImpact }
export interface NewsCardData { dateLabel: string; items: NewsItem[]; wrap: { a: string; b: string } | null; regionLabel?: string; slotLabel?: string }
export type NewsRegionArg = 'kr' | 'us' | 'all';

const IMP_ORDER: Record<string, number> = { 상: 0, 중: 1, 하: 2 };

const NEWS_SYSTEM =
  '너는 한국어 투자 뉴스 에디터다. 주어진 뉴스 후보 중 투자자에게 가장 중요한 3건을 골라 인스타 카드용으로 정리한다. ' +
  'JSON만 출력(코드펜스·설명 금지). 형식: ' +
  '{"items":[{"category":"2~5자 주제(예: 반도체·금리·실적·코인·환율·정책)","title":"핵심을 담은 제목 28자 이내","bullets":["사실 요점 3개, 각 18~45자"],"why":"투자 관점에서 왜 중요한지 한 줄 45자 이내","impact":"호재|악재|중립"}],' +
  '"wrap":{"a":"오늘을 대비로 요약한 한 축","b":"다른 한 축"}}. ' +
  'wrap.a·wrap.b는 각각 공백 포함 8자 이내의 아주 짧은 대비 문구여야 한다(예: a="반도체는 축포", b="빅테크는 경고음"). 절대 길게 쓰지 말 것. ' +
  'items 정확히 3개, 각 bullets 정확히 3개. 반드시 제공된 후보에 근거해 작성하고 사실을 지어내지 말 것. 단정적 예측·투자 권유 금지.';

function newsPrompt(cands: { title: string; summary: string; why: string; impact: string; tags: string[] }[]) {
  return async () => {
    const list = cands
      .map((c, i) => `${i}. [${c.impact}/${c.tags.join(',')}] ${c.title}${c.summary ? ' — ' + c.summary : ''}${c.why ? ' (함의: ' + c.why + ')' : ''}`)
      .join('\n');
    return `뉴스 후보 목록:\n${list}\n\n투자 중요도가 높은 3건을 골라 위 JSON 형식으로 카드용 요약을 만들어줘.`;
  };
}

// 전체 뉴스 탭의 랭킹 뉴스를 취합 → 상위 후보를 Claude로 카드용 요약(카테고리·팩트3·왜중요·대비 한줄)으로 가공(하루 1회 캐시).
// slot: 'am'(아침) | 'pm'(저녁). region: 'kr'(국내)·'us'(미국)·'all'(혼합).
// 지역별로 하루 2회(아침·저녁) 게시 → 하루 국내2 + 미국2 = 4개. 같은 지역 아침에 나간 뉴스는
// 저녁에서 제외해 중복 방지(KV `news:{region}:am:{ymd}`에 아침 후보 제목 기록).
type NewsRegion = 'kr' | 'us' | 'coin';
const TAB_REGION: Record<string, NewsRegion> = { kr_stock: 'kr', us_stock: 'us', global_coin: 'coin' };
export async function getNewsCardData(slot: 'am' | 'pm' = 'pm', region: NewsRegionArg = 'all'): Promise<NewsCardData> {
  const lists = await Promise.all(NEWS_TABS.map((t) => getCachedRankedNews(`page:${t}`).catch(() => null)));
  const seen = new Set<string>();
  const raw = [] as { title: string; summary: string; why: string; impact: NewsImpact; tags: string[]; importance: string; region: NewsRegion }[];
  lists.forEach((l, ti) => {
    const rg = TAB_REGION[NEWS_TABS[ti]] ?? 'us';
    for (const n of l ?? []) {
      const key = n.title.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      raw.push({ title: n.title, summary: n.summary ?? '', why: n.why ?? '', impact: n.impact, tags: n.tags ?? [], importance: n.importance, region: rg });
    }
  });
  raw.sort((a, z) => (IMP_ORDER[a.importance] ?? 9) - (IMP_ORDER[z.importance] ?? 9));
  const ymd = kstYmd();
  // 지역 필터(국내/미국 전용 피드). 'all'은 전체.
  let pool = region === 'all' ? raw : raw.filter((n) => n.region === region);
  if (slot === 'pm') {
    // 같은 지역 아침에 쓴 제목 제외(중복 방지). 남는 게 3건 미만이면 원래 풀 유지(빈 게시 방지).
    const amUsed = new Set((await kvGet<string[]>(`news:${region}:am:${ymd}`).catch(() => null)) ?? []);
    if (amUsed.size) {
      const filtered = pool.filter((n) => !amUsed.has(n.title.trim()));
      if (filtered.length >= 3) pool = filtered;
    }
  }
  let top: typeof raw = [];
  if (region === 'all') {
    // 혼합 슬롯: 국내1 + 미국1 보장 + 3번째는 남은 것 중 중요도 최상.
    const take = (pred: (n: (typeof raw)[number]) => boolean) => { const x = pool.find((n) => pred(n) && !top.includes(n)); if (x) top.push(x); };
    take((n) => n.region === 'kr');
    take((n) => n.region === 'us');
    take(() => true);
    for (const n of pool) { if (top.length >= 3) break; if (!top.includes(n)) top.push(n); }
  } else {
    // 지역 전용: 해당 지역 중요도순 top3.
    top = pool.slice(0, 3);
  }
  top.sort((a, z) => (IMP_ORDER[a.importance] ?? 9) - (IMP_ORDER[z.importance] ?? 9)); // 카드 순서는 중요도순
  const dateLabel = kstDateLabel();
  const regionLabel = region === 'kr' ? '국내' : region === 'us' ? '미국' : '';
  // 슬롯 라벨은 시장 세션 기준: 국내 am=개장전/pm=마감, 미국 am=마감(밤사이)/pm=개장전.
  // 단, 장이 안 서는 주말(KST 토·일)엔 '개장 전/마감'이 어색하므로 중립 라벨로.
  const kstDow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })).getDay(); // 0=일,6=토
  const isWeekend = kstDow === 0 || kstDow === 6;
  const slotLabel = isWeekend
    ? '주말'
    : region === 'kr' ? (slot === 'am' ? '개장 전' : '마감')
    : region === 'us' ? (slot === 'am' ? '마감' : '개장 전')
    : (slot === 'am' ? '아침' : '저녁');
  if (!top.length) return { dateLabel, items: [], wrap: null, regionLabel, slotLabel };
  // 아침 슬롯: 이번에 쓴 후보 제목을 기록 → 저녁이 겹치지 않게. (idempotent, 여러 번 호출돼도 동일)
  if (slot === 'am') await kvSet(`news:${region}:am:${ymd}`, top.map((n) => n.title.trim())).catch(() => {});

  // AI 실패/무키 시 폴백: 원문 제목·요약을 그대로 카드화.
  const fallback: { items: NewsItem[]; wrap: { a: string; b: string } | null } = {
    items: top.slice(0, 3).map((n) => ({
      category: (n.tags[0] || (n.impact === '중립' ? '시장' : n.impact)).slice(0, 6),
      title: n.title,
      bullets: (n.summary ? n.summary.split(/(?<=[.。!?])\s+/) : [n.why]).map((s) => s.trim()).filter(Boolean).slice(0, 3),
      why: n.why,
      impact: n.impact,
    })),
    wrap: null,
  };

  const obj = await getOrGenerateJSON<{ items: NewsItem[]; wrap: { a: string; b: string } | null }>({
    cacheKey: `news-cards:${ymd}:${region}:${slot}`,
    kind: 'news-cards',
    system: NEWS_SYSTEM,
    prompt: newsPrompt(top),
    fallback,
  });

  const items = (obj.items ?? []).slice(0, 3).map((it) => ({
    category: (it.category || '시장').slice(0, 8),
    title: it.title || '',
    bullets: (it.bullets ?? []).map((b) => String(b)).filter(Boolean).slice(0, 3),
    why: it.why || '',
    impact: (['호재', '악재', '중립'].includes(it.impact as string) ? it.impact : '중립') as NewsImpact,
  })).filter((it) => it.title);

  // 대비 한 줄은 짧아야 카드에 안전하게 들어간다. 길거나 비면 폴백(generic).
  let wrap = obj.wrap ?? null;
  if (wrap && (!wrap.a || !wrap.b || [...wrap.a].length > 11 || [...wrap.b].length > 11)) wrap = null;

  return { dateLabel, items: items.length ? items : fallback.items, wrap, regionLabel, slotLabel };
}

// ══════════════ ① 저평가 우량주 TOP5 (주간) ══════════════
export interface ValueStock { rank: string; name: string; priceLine: string; per: string; pbr: string; roe: string; div: string; upside: string; score: number; badge: string; comment: string }
export interface ValueCardData { dateLabel: string; market: Market; items: ValueStock[] }

export async function getValueCardData(marketOverride?: Market): Promise<ValueCardData> {
  const wk = kstWeek();
  const market: Market = marketOverride ?? (wk.week % 2 === 0 ? 'kr' : 'us');
  const page = await getValuePage(market, 'score', 0, 5, 'all').catch(() => null);
  const top = page?.items ?? [];
  const dateLabel = kstDateLabel();
  if (!top.length) return { dateLabel, market, items: [] };

  const priceLine = (s: ScoredStock) =>
    market === 'kr'
      ? `현재가 ${Math.round(s.price).toLocaleString('en-US')}원 · 시총 ${s.marketCapText}`
      : `현재가 $${s.price.toLocaleString('en-US', { maximumFractionDigits: 2 })} · 시총 ${s.marketCapText}`;
  const base = top.map((s, i) => ({
    rank: String(i + 1).padStart(2, '0'),
    name: s.name,
    priceLine: priceLine(s),
    per: s.per == null ? '—' : `${s.per.toFixed(1)}배`,
    pbr: s.pbr == null ? '—' : `${s.pbr.toFixed(2)}배`,
    roe: s.roe == null ? '—' : `${s.roe.toFixed(1)}%`,
    div: s.divYield == null ? '—' : `${s.divYield.toFixed(1)}%`,
    upside: s.upside != null && s.upside > 0 ? `+${Math.round(s.upside)}%` : '—',
    score: Math.round(s.score),
    badge: s.graham ? '그레이엄 안전마진' : s.buffett ? '버핏형 우량' : '',
  }));

  const fallbackComments = top.map((s) => {
    if (s.graham) return '이익·자산 대비 싸고 안전마진까지 갖춘 밸류주.';
    if (s.buffett) return '높은 ROE로 꾸준히 돈 버는 우량주.';
    if ((s.divYield ?? 0) >= 4) return '배당 매력이 큰 방어형 종목.';
    if ((s.per ?? 99) < 8) return '이익 대비 확실히 저평가된 구간이에요.';
    return '지표 균형이 좋은 저평가 후보입니다.';
  });
  const obj = await getOrGenerateJSON<{ comments: string[] }>({
    cacheKey: `value-cards:${market}:${wk.key}`,
    kind: 'value-cards',
    system:
      '너는 한국어 투자 카피라이터다. 각 종목의 지표를 보고 인스타 카드용 한줄평을 만든다. ' +
      'JSON만 출력(코드펜스 금지): {"comments":["...", ...]}. 입력 종목 수와 정확히 같은 개수. ' +
      '각 35자 이내, 사실·지표 기반, 단정적 예측·매수 권유 금지.',
    prompt: async () =>
      `저평가 우량주 선별 결과(점수순):\n${top
        .map((s, i) => `${i + 1}. ${s.name} · PER ${s.per}배 PBR ${s.pbr}배 ROE ${s.roe}% 배당 ${s.divYield ?? 0}% 상승여력 ${s.upside ?? '?'}% 종합 ${Math.round(s.score)}점${s.graham ? ' [그레이엄]' : ''}${s.buffett ? ' [버핏형]' : ''}`)
        .join('\n')}\n\n각 종목 한줄평을 순서대로 배열로.`,
    fallback: { comments: fallbackComments },
  });
  const comments = obj.comments?.length === top.length ? obj.comments : fallbackComments;
  return { dateLabel, market, items: base.map((b, i) => ({ ...b, comment: comments[i] || fallbackComments[i] })) };
}

// ══════════════ ② 주간 경제 캘린더 ══════════════
export interface CalEvent { dow: string; day: string; name: string; desc: string; time: string; high: boolean }
export interface CalCardData { dateLabel: string; range: string; highCount: number; highlight: (CalEvent & { dowFull: string }) | null; firstHalf: CalEvent[]; secondHalf: CalEvent[]; tip: string }

export async function getCalendarCardData(): Promise<CalCardData> {
  const data = await getDashboardData({ withMacroExtras: true });
  const clean = stripTofu;
  const dateLabel = kstDateLabel();

  // 이번 주(월~일) 범위 계산(KST).
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const dow0 = now.getUTCDay(); // 0=일
  const mondayOffset = dow0 === 0 ? -6 : 1 - dow0;
  const mon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + mondayOffset));
  const ymd = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const sun = new Date(mon.getTime() + 6 * 86400000);
  const md = (iso: string) => `${parseInt(iso.slice(5, 7), 10)}.${parseInt(iso.slice(8, 10), 10)}`;

  const inWeek = (data.macro.events ?? []).filter((e) => e.date >= ymd(mon) && e.date <= ymd(sun)).sort((a, z) => a.date.localeCompare(z.date) || a.time.localeCompare(z.time));
  const toEv = (e: (typeof inWeek)[number]): CalEvent => {
    const dt = new Date(`${e.date}T00:00:00Z`);
    const rawDesc = clean(e.desc || e.interpret || e.rel?.title || '');
    const desc = rawDesc.length > 24 ? rawDesc.slice(0, 23) + '…' : rawDesc;
    return { dow: KO_DOW[dt.getUTCDay()], day: md(e.date), name: clean(e.name), desc, time: e.time || '장중', high: e.tag === '고영향' };
  };
  const evs = inWeek.map(toEv);
  const wdOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
  const firstHalf = inWeek.filter((e) => [1, 2, 3].includes(wdOf(e.date))).map(toEv).slice(0, 5);
  const secondHalf = inWeek.filter((e) => ![1, 2, 3].includes(wdOf(e.date))).map(toEv).slice(0, 5);
  const highEv = inWeek.find((e) => e.tag === '고영향');
  const highlight = highEv
    ? { ...toEv(highEv), dowFull: `${KO_DOW[wdOf(highEv.date)]}요일` }
    : evs[0]
    ? { ...evs[0], dowFull: `${evs[0].dow}요일` }
    : null;
  const highCount = evs.filter((e) => e.high).length;
  const tip = highlight ? `${highlight.name} 전후로 변동성이 커질 수 있어요. 결과를 꼭 확인하세요.` : '이번 주는 대형 이벤트가 적어 개별 종목 이슈에 주목해요.';
  return { dateLabel, range: `${md(ymd(mon))} – ${md(ymd(sun))}`, highCount, highlight, firstHalf, secondHalf, tip };
}

// ══════════════ ③ 투자 용어 1분 (주간) ══════════════
const TERM_ROTATION = ['PER', 'PBR', 'ROE', '배당수익률', 'VIX', '김치프리미엄', '공포탐욕지수', '시가총액', 'EPS', '부채비율'];
export interface TermCardData {
  term: string; fullName: string; coverSub: string[];
  defLines: { t: string; hl?: string; t2?: string }[]; formula: { a: string; b: string } | null;
  example: { ticker: string; a: string; b: string; result: string; note: string } | null;
  low: { title: string; sub: string }; high: { title: string; sub: string };
  tips: { title: string; sub: string }[]; misconception: string; nextTerm: string;
}

export async function getTermCardData(termOverride?: string): Promise<TermCardData> {
  const wk = kstWeek();
  const term = termOverride && TERM_ROTATION.includes(termOverride) ? termOverride : TERM_ROTATION[wk.week % TERM_ROTATION.length];
  const nextTerm = TERM_ROTATION[(TERM_ROTATION.indexOf(term) + 1) % TERM_ROTATION.length];
  const glossDef = GLOSSARY[term] || '';

  const fallback: Omit<TermCardData, 'term' | 'nextTerm'> = {
    fullName: term,
    coverSub: ['1분이면', '이해할 수 있어요'],
    defLines: [{ t: glossDef || `${term}는 투자에서 자주 쓰이는 지표예요.` }],
    formula: null,
    example: null,
    low: { title: '낮으면', sub: '상황에 따라 해석이 달라요' },
    high: { title: '높으면', sub: '업종·맥락과 함께 봐야 해요' },
    tips: [
      { title: '맥락과 함께 보세요', sub: '지표 하나만으로 판단하지 마세요' },
      { title: '비교가 기본이에요', sub: '같은 업종·과거 평균과 비교하세요' },
    ],
    misconception: `"${term} 하나로 좋은 주식/나쁜 주식"을 단정하면 안 돼요.`,
  };

  const obj = await getOrGenerateJSON<Omit<TermCardData, 'term' | 'nextTerm'>>({
    cacheKey: `term-cards:${term}:${wk.key}`,
    kind: 'term-cards',
    system:
      '너는 한국어 투자 교육 카피라이터다. 초보자용 인스타 카드 콘텐츠를 만든다. 존댓말, 쉽고 정확하게, 투자 권유 금지. ' +
      'JSON만 출력(코드펜스 금지). 형식: {' +
      '"fullName":"영문 풀네임 · 한글명",' +
      '"coverSub":["커버 서브 2줄"],' +
      '"defLines":[{"t":"문장","hl":"강조어(선택)","t2":"강조 뒤 문장(선택)"}],' +
      '"formula":{"a":"분자(예: 주가)","b":"분모(예: 주당순이익)"} 또는 null,' +
      '"example":{"ticker":"예시 대상","a":"값1","b":"값2","result":"결과","note":"보조설명"} 또는 null,' +
      '"low":{"title":"낮으면","sub":"의미 한 줄"},"high":{"title":"높으면","sub":"의미 한 줄"},' +
      '"tips":[{"title":"팁 제목","sub":"설명"}],"misconception":"흔한 오해 한 문장"}. ' +
      'defLines 2~4개, tips 정확히 2개. 숫자 예시는 그럴듯한 값으로. 지수형 용어(VIX·공포탐욕 등)는 formula를 null로.',
    prompt: async () => `투자 용어: "${term}"\n참고 정의: ${glossDef || '(없음)'}\n\n위 JSON 형식으로 초보자용 카드 콘텐츠를 만들어줘.`,
    fallback,
  });
  return { term, nextTerm, ...fallback, ...obj };
}

// ══════════════ 급변동 속보 ══════════════
export interface ShockTile { label: string; chg: number; txt?: string }
export interface BreakingData { key: string; time: string; headline: string; sub: string; dir: 'up' | 'down'; tiles: ShockTile[] }

const kstTimeLabel = () => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date());

// 야후 실시간으로 급변동 감지. 지수 ±3% / VIX 급등·30↑ / BTC ±5% 중 가장 강한 것 하나.
export async function getBreakingCardData(): Promise<BreakingData | null> {
  const [kospi, kosdaq, sp, nasdaq, vix, btc] = await Promise.all([
    yq('%5EKS11'), yq('%5EKQ11'), yq('%5EGSPC'), yq('%5EIXIC'), yq('%5EVIX'), yq('BTC-USD'),
  ]);
  // 장중 실시간(라이브)인 지수만 — 주말·휴장 스테일값으로 잘못된 속보 방지.
  const idx = [
    { name: '코스피', q: kospi }, { name: '코스닥', q: kosdaq }, { name: 'S&P 500', q: sp }, { name: '나스닥', q: nasdaq },
  ].filter((x) => x.q && isLive(x.q)) as { name: string; q: { price: number; chg: number; time: number } }[];

  type Cand = { key: string; sev: number; dir: 'up' | 'down'; headline: string; sub: string };
  const cands: Cand[] = [];
  for (const x of idx) {
    const c = x.q.chg;
    if (Math.abs(c) >= 3) {
      const dir = c > 0 ? 'up' : 'down';
      const word = Math.abs(c) >= 5 ? (dir === 'up' ? '폭등' : '폭락') : dir === 'up' ? '급등' : '급락';
      cands.push({ key: `index-${dir}`, sev: Math.abs(c) + (dir === 'down' ? 0.5 : 0), dir,
        headline: `${x.name} ${c > 0 ? '+' : ''}${c.toFixed(1)}% ${word}`,
        sub: dir === 'down' ? '위험 회피 심리가 커지고 있어요. 지금 무슨 일인지 확인하세요.' : '강한 매수세가 유입되고 있어요.' });
    }
  }
  if (vix && isLive(vix) && (vix.chg >= 12 || vix.price >= 30)) {
    cands.push({ key: 'vix-up', sev: 4 + vix.chg / 10, dir: 'up', headline: `공포지수(VIX) ${vix.price.toFixed(1)} 급등`, sub: 'VIX가 치솟으며 시장 불안이 커지고 있어요.' });
  }
  if (btc && isLive(btc) && Math.abs(btc.chg) >= 5) {
    const dir = btc.chg > 0 ? 'up' : 'down';
    cands.push({ key: `btc-${dir}`, sev: Math.abs(btc.chg) / 1.5, dir, headline: `비트코인 ${btc.chg > 0 ? '+' : ''}${btc.chg.toFixed(1)}% ${dir === 'up' ? '급등' : '급락'}`, sub: dir === 'down' ? '코인 시장에 매도세가 몰리고 있어요.' : '코인 시장에 강한 매수세가 붙었어요.' });
  }
  if (!cands.length) return null;
  cands.sort((a, z) => z.sev - a.sev);
  const top = cands[0];
  const tiles: ShockTile[] = [
    { label: '코스피', chg: kospi?.chg ?? 0 },
    { label: '나스닥', chg: nasdaq?.chg ?? 0 },
    { label: 'VIX', chg: vix?.chg ?? 0, txt: vix ? vix.price.toFixed(1) : '—' },
    { label: '비트코인', chg: btc?.chg ?? 0 },
  ];
  return { key: top.key, time: kstTimeLabel(), headline: top.headline, sub: top.sub, dir: top.dir, tiles };
}

// ══════════════ 주간 마켓 리뷰 (주말용) ══════════════
// 일일 시황과 달리 '한 주 총정리'라 주말에도 데이터가 겹치지 않음(스테일 아님).
export interface WeekIndexRow { name: string; chg: number }
export interface WeekReviewData {
  dateLabel: string; range: string;
  hero: WeekIndexRow;
  indices: WeekIndexRow[]; // 코스피·코스닥·S&P·나스닥 주간 등락
  btc: number;
  best: WeekIndexRow; worst: WeekIndexRow;
  summary: string;
}

// 주간 등락 = 최근 종가 vs 5거래일(약 1주) 전 종가. range=7d는 두 주에 걸쳐 캔들이
// 잡혀 첫 종가가 지난주 값이 되므로(수치 왜곡) 1개월 캔들에서 뒤에서 6번째를 기준으로 삼는다.
async function yWeekly(symbol: string): Promise<number | null> {
  try {
    const j = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 1800 },
    }).then((r) => r.json());
    const closes: number[] = (j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter((x: number | null) => x != null);
    if (closes.length < 2) return null;
    const last = closes[closes.length - 1];
    const base = closes[closes.length - 6] ?? closes[0]; // 약 5거래일(1주) 전
    return ((last - base) / base) * 100;
  } catch { return null; }
}

// 이번 주 월~금 날짜 라벨 (KST 기준).
function weekRangeLabel(): string {
  const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const dow = kst.getDay(); // 0=일
  const mon = new Date(kst); mon.setDate(kst.getDate() - ((dow + 6) % 7));
  const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
  const f = (d: Date) => `${d.getMonth() + 1}.${d.getDate()}`;
  return `${f(mon)} – ${f(fri)}`;
}

export async function getWeekReviewData(): Promise<WeekReviewData> {
  const [ks, kq, sp, na, bt] = await Promise.all([
    yWeekly('%5EKS11'), yWeekly('%5EKQ11'), yWeekly('%5EGSPC'), yWeekly('%5EIXIC'), yWeekly('BTC-USD'),
  ]);
  const indices: WeekIndexRow[] = [
    { name: '코스피', chg: ks ?? 0 }, { name: '코스닥', chg: kq ?? 0 },
    { name: 'S&P 500', chg: sp ?? 0 }, { name: '나스닥', chg: na ?? 0 },
  ];
  const hero = [...indices].sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg))[0];
  const ranked = [...indices].sort((a, b) => b.chg - a.chg);
  const best = ranked[0], worst = ranked[ranked.length - 1];
  const ups = indices.filter((x) => x.chg > 0).length;
  const avg = indices.reduce((s, x) => s + x.chg, 0) / indices.length;
  let summary: string;
  if (avg >= 1.5) summary = '위험자산 선호가 뚜렷했던 한 주. 주요 지수 대부분 상승 마감했어요.';
  else if (avg <= -1.5) summary = '조정이 나온 한 주. 지수 대부분 하락하며 경계 심리가 커졌어요.';
  else if (ups >= 3) summary = '완만한 상승 흐름 속 종목 장세가 이어진 한 주였어요.';
  else if (ups <= 1) summary = '지수가 눌린 채 방향을 탐색한 한 주였어요.';
  else summary = '지수별 온도차가 컸던 혼조세의 한 주였어요.';
  return { dateLabel: kstDateLabel(), range: weekRangeLabel(), hero, indices, btc: bt ?? 0, best, worst, summary };
}

// ══════════════ 화제의 종목 (일간) ══════════════
// "오늘의 추천주"가 아니라 "오늘 많이 움직인 종목 — 왜?"다. 선정은 규칙 기반이고
// 이유는 실제 뉴스·공시로만 설명한다(AI 서술·투자의견 미사용). 급등·급락 모두 대상.
export interface StockTrendYear { year: number; revenue: number | null; profit: number | null }
export interface StockNewsRef { title: string; src: string; date: string }
export interface StockPickData {
  dateLabel: string;
  code: string; name: string;
  priceText: string; pct: number; dir: 'up' | 'down';
  volText: string;                 // 거래대금
  marketCapText: string | null;
  hi52: number | null; lo52: number | null; pos52: number | null; // 52주 밴드 내 위치(%)
  per: number | null; pbr: number | null; roe: number | null; divYield: number | null;
  netMargin: number | null; debtRatio: number | null;
  target: number | null; upside: number | null; numAnalysts: number | null;
  revUnit: string;
  trend: StockTrendYear[];
  news: StockNewsRef[];
  disc: { title: string; date: string; kind: string }[];
}

// ETF·ETN·스팩·우선주 제외 — '종목 이야기'가 아니라 상품이거나 유동성이 얕다.
const NOT_A_STORY = /(KODEX|TIGER|RISE|PLUS|ARIRANG|HANARO|KOSEF|KBSTAR|ACE\s|SOL\s|TIMEFOLIO|히어로즈|마이티|파워|레버리지|인버스|선물|ETN|스팩)/i;
const IS_PREF = /\d?우B?$/; // 우선주(삼성전자우, 현대차2우B …)
// 보통주만 — 숫자 6자리. 신주인수권·ELW 등은 '0218L0'처럼 영문이 섞여 여기서 걸러진다.
const IS_COMMON = /^\d{6}$/;
const MIN_VALUE = 3_000_000_000; // 거래대금 하한 30억 — 잡주·품절주 배제
const RECENT_KEY = 'ig:stock:recent';
const RECENT_KEEP = 7; // 최근 N개 종목은 다시 고르지 않음

const won = (n: number): string => {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}조원`;
  if (n >= 1e8) return `${Math.round(n / 1e8).toLocaleString('ko-KR')}억원`;
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
};

// 오늘 화제의 종목 1개. 조건 맞는 종목이 없으면 null(게시 스킵).
// 주의: 카드 5장이 각각 이 함수를 호출하므로 **하루 안에서는 같은 종목이 나와야 한다**.
// 그래서 선정 결과를 당일 키에 고정하고, 이후 호출은 그 종목을 그대로 쓴다.
export async function getStockCardData(): Promise<StockPickData | null> {
  const uni = await getUniverse().catch(() => null);
  const kr = uni?.kr_stock ?? [];
  if (!kr.length) return null;

  const ymd = kstYmd();
  const fixed = await kvGet<string>(`ig:stock:pick:${ymd}`).catch(() => null);
  let pick = fixed ? kr.find((s) => (s.ticker || s.id) === fixed) ?? null : null;

  if (!pick) {
    const recent = (await kvGet<string[]>(RECENT_KEY).catch(() => null)) ?? [];
    // 거래대금 상위(=화제성) 안에서 고른다. 유동성을 먼저 걸러 잡주를 피한다.
    const pool = kr
      .filter((s) => (s.vol ?? 0) >= MIN_VALUE
        && IS_COMMON.test(s.ticker || s.id)
        && !NOT_A_STORY.test(s.name) && !IS_PREF.test(s.name))
      .sort((a, z) => (z.vol ?? 0) - (a.vol ?? 0))
      .slice(0, 60)
      .filter((s) => !recent.includes(s.id));
    if (!pool.length) return null;
    // 화제성 = 얼마나 움직였나 × 얼마나 거래됐나. |등락|만 보면 거래대금 수백억짜리 소형주
    // 상한가가 매번 뽑혀 '테마주 소개'가 된다. log를 씌워 거래대금은 완만하게만 반영.
    const buzz = (s: { pct: number; vol?: number }) => Math.abs(s.pct) * Math.log10(Math.max((s.vol ?? 0) / 1e8, 1.01));
    const best = pool.reduce((m, x) => (buzz(x) > buzz(m) ? x : m), pool[0]);
    if (Math.abs(best.pct) < 2) return null; // 이 정도도 안 움직였으면 '화제'가 아니다
    pick = best;
    // 당일 고정 + 최근 목록에 1회만 기록(카드마다 바뀌는 것 방지).
    await kvSet(`ig:stock:pick:${ymd}`, pick.ticker || pick.id).catch(() => {});
    await kvSet(RECENT_KEY, [pick.id, ...recent.filter((r) => r !== pick!.id)].slice(0, RECENT_KEEP)).catch(() => {});
  }

  const code = pick.ticker || pick.id;
  const [k, naverNews, ranked, disc] = await Promise.all([
    buildKanalystData('kr', code, pick.name, code, pick.price).catch(() => null),
    getKrStockNews(code, pick.name, 8).catch(() => []),
    // 네이버 종목뉴스는 전용 기사가 없으면 '마감시황'류를 섞어 준다. 우리 RSS 랭킹 풀에서도
    // 종목명이 실제로 박힌 기사를 찾아 합친다(여기에 '하한가 폭락한 OO' 같은 본편이 있다).
    getCachedRankedNews('page:kr_stock').then((r) => r ?? []).catch(() => []),
    getDisclosures([code], 7, 3).catch(() => []),
  ]);

  const hi52 = k?.hi52 ?? null;
  const lo52 = k?.lo52 ?? null;
  const pos52 = hi52 != null && lo52 != null && hi52 > lo52
    ? Math.max(0, Math.min(100, ((pick.price - lo52) / (hi52 - lo52)) * 100))
    : null;

  // '오늘 왜 움직였나'니까 (1) 최근 3일 (2) 종목명이 실제로 들어간 기사만 쓴다.
  // 이 두 조건을 안 걸면 3주 전 기사나 '마감시황'이 이유인 척 붙어 거짓 설명이 된다.
  // 남는 게 없으면 '뉴스 없이 수급으로 움직였다'고 솔직히 적는다(카드에서 처리).
  const FRESH_DAYS = 3;
  const cutoff = new Date(Date.now() - FRESH_DAYS * 86400000);
  const cutYmd = `${cutoff.getFullYear()}${String(cutoff.getMonth() + 1).padStart(2, '0')}${String(cutoff.getDate()).padStart(2, '0')}`;
  const isFresh = (dt?: string) => {
    const digits = String(dt ?? '').replace(/\D/g, '');
    return digits.length >= 8 && digits.slice(0, 8) >= cutYmd;
  };
  const nm = pick.name.replace(/\s/g, '');
  const mentions = (s: string) => s.replace(/\s/g, '').includes(nm);

  const merged = [
    ...naverNews.filter((n) => isFresh(n.datetime) && mentions(n.title)),
    // 랭킹 풀은 datetime 형식이 ISO라 isFresh가 같이 처리한다. target에도 종목명이 올 수 있다.
    ...ranked
      .filter((n) => isFresh(n.datetime) && (mentions(n.title) || mentions(n.target ?? '')))
      .map((n) => ({ title: n.title, src: n.src, datetime: n.datetime })),
  ];
  const seenT = new Set<string>();
  const freshNews = merged.filter((n) => {
    const key = stripTofu(n.title).replace(/\s/g, '').slice(0, 30);
    if (!key || seenT.has(key)) return false;
    seenT.add(key);
    return true;
  });

  return {
    dateLabel: kstDateLabel(),
    code, name: stripTofu(pick.name),
    priceText: `${Math.round(pick.price).toLocaleString('ko-KR')}원`,
    pct: pick.pct,
    dir: pick.pct >= 0 ? 'up' : 'down',
    volText: won(pick.vol ?? 0),
    marketCapText: k?.marketCapText ?? null,
    hi52, lo52, pos52,
    per: k?.per ?? null, pbr: k?.pbr ?? null, roe: k?.roe ?? null,
    divYield: k?.divYield ?? null, netMargin: k?.netMargin ?? null, debtRatio: k?.debtRatio ?? null,
    target: k?.target ?? null, upside: k?.upside ?? null, numAnalysts: k?.numAnalysts ?? null,
    revUnit: k?.revUnit ?? '억원',
    trend: (k?.trend ?? []).slice(-4).map((t) => ({ year: t.year, revenue: t.revenue, profit: t.netIncome })),
    news: freshNews.slice(0, 3).map((n) => ({
      title: stripTofu(n.title).slice(0, 60),
      src: stripTofu(n.src),
      // 네이버는 'YYYYMMDDHHmmss', RSS 랭킹 풀은 ISO — 숫자만 뽑아 앞 8자리로 통일.
      date: ((d) => (d.length >= 8 ? `${+d.slice(4, 6)}/${+d.slice(6, 8)}` : ''))(String(n.datetime ?? '').replace(/\D/g, '')),
    })).filter((n) => n.title),
    disc: disc.slice(0, 2).map((d) => ({ title: stripTofu(d.title).slice(0, 44), date: d.date.slice(5), kind: d.kind })),
  };
}
