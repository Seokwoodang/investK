import 'server-only';
import { getDashboardData } from '@/server/data';
import { getBriefing } from '@/server/briefing';

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
  const event = ev
    ? {
        name: ev.name,
        sub: ((s) => (s.length > 48 ? s.slice(0, 47) + '…' : s))(ev.desc || ev.rel?.title || ''),
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
