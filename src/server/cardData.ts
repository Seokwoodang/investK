import 'server-only';
import { getDashboardData } from '@/server/data';
import { getBriefing } from '@/server/briefing';
import { getCachedRankedNews } from '@/server/aiNews';
import { NEWS_TABS } from '@/server/news';
import { getOrGenerateJSON } from '@/server/ai';
import { getValuePage, type Market, type ScoredStock } from '@/server/valueScreen';
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

const kstYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const kstDateLabel = () => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());

async function yq(symbol: string): Promise<{ price: number; chg: number } | null> {
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
    return { price, chg };
  } catch {
    return null;
  }
}

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
  const clean = (s: string) => s.replace(/[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{3400}-\u{9FFF}️‍]/gu, '').replace(/\s{2,}/g, ' ').trim();
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
export interface NewsCardData { dateLabel: string; items: NewsItem[]; wrap: { a: string; b: string } | null }

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
export async function getNewsCardData(): Promise<NewsCardData> {
  const lists = await Promise.all(NEWS_TABS.map((t) => getCachedRankedNews(`page:${t}`).catch(() => null)));
  const seen = new Set<string>();
  const raw = [] as { title: string; summary: string; why: string; impact: NewsImpact; tags: string[]; importance: string }[];
  for (const l of lists) {
    for (const n of l ?? []) {
      const key = n.title.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      raw.push({ title: n.title, summary: n.summary ?? '', why: n.why ?? '', impact: n.impact, tags: n.tags ?? [], importance: n.importance });
    }
  }
  raw.sort((a, z) => (IMP_ORDER[a.importance] ?? 9) - (IMP_ORDER[z.importance] ?? 9));
  const top = raw.slice(0, 6);
  const dateLabel = kstDateLabel();
  if (!top.length) return { dateLabel, items: [], wrap: null };

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
    cacheKey: `news-cards:${kstYmd()}`,
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

  return { dateLabel, items: items.length ? items : fallback.items, wrap };
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
  const clean = (s: string) => s.replace(/[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{3400}-\u{9FFF}️‍]/gu, '').replace(/\s{2,}/g, ' ').trim();
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
