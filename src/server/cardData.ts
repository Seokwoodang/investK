import 'server-only';
import { getDashboardData } from '@/server/data';
import { getBriefing } from '@/server/briefing';
import { getCachedRankedNews } from '@/server/aiNews';
import { NEWS_TABS } from '@/server/news';
import { getOrGenerateJSON } from '@/server/ai';

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
