import 'server-only';
import { kvGet, kvSet } from './kv';
import { getKrFinance, getFundamentals } from './providers/naverFundamentals';
import { getUsFundamentals } from './providers/yahoo';
import type { Currency, TabId } from '@/types';

// "매도 점검"의 펀더멘털(회사 상태) 신호만 서버가 담당한다 — 목표가 도달(그레이엄)·퀄리티 훼손(피셔·버핏).
// 손절·익절·비중·트레일링 같은 임계값 기반 신호는 사용자가 즉시 조절하도록 클라이언트에서 계산.
// 모든 신호는 "어느 대가의 어떤 원칙인지" 메타데이터(who/principle/detail)를 달아 클릭 시 설명을 보여준다.

export interface SellHolding {
  code: string;
  tab: TabId;
  name: string;
  price: number;
  cur: Currency;
}
export interface SellSignal {
  level: 'high' | 'mid' | 'info';
  text: string; // 짧은 신호 문구
  who: string; // 출처/투자자
  principle: string; // 원칙 한 줄
  detail: string; // 클릭 시 설명
}
export interface SellFundamental {
  code: string;
  name: string;
  signals: SellSignal[];
  per: number | null;
  pbr: number | null;
  roe: number | null;
  debtRatio: number | null;
  target: number | null;
  upside: number | null;
  peak: number | null; // 트레일링용 고점(서버 저장 = max(52주 고점, 관측가))
}

interface Fund {
  per: number | null;
  pbr: number | null;
  roe: number | null;
  roePrev: number | null;
  netMargin: number | null;
  netMarginPrev: number | null;
  debtRatio: number | null;
  debtRatioPrev: number | null;
  target: number | null;
  hi52: number | null;
  market: 'kr' | 'us';
}

const kstDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

async function getFund(code: string, tab: TabId): Promise<Fund | null> {
  const isKr = tab === 'kr_stock';
  const isUs = tab === 'us_stock';
  if ((!isKr && !isUs) || code.startsWith('manual:')) return null;
  const key = `sf:${isKr ? 'kr' : 'us'}:${code}:${kstDate()}`;
  const cached = await kvGet<Fund>(key);
  if (cached) return cached;

  let fund: Fund | null = null;
  if (isKr) {
    const [fin, integ] = await Promise.all([getKrFinance(code), getFundamentals(code)]);
    if (fin || integ) {
      fund = {
        per: integ?.per ?? null, pbr: integ?.pbr ?? null, target: integ?.targetPrice ?? null,
        roe: fin?.roe ?? null, roePrev: fin?.roePrev ?? null,
        netMargin: fin?.netMargin ?? null, netMarginPrev: fin?.netMarginPrev ?? null,
        debtRatio: fin?.debtRatio ?? null, debtRatioPrev: fin?.debtRatioPrev ?? null,
        hi52: integ?.hi52 ?? null, market: 'kr',
      };
    }
  } else {
    const f = await getUsFundamentals(code);
    if (f) {
      fund = {
        per: f.per, pbr: f.pbr, target: f.target, roe: f.roe, roePrev: null,
        netMargin: f.netMargin, netMarginPrev: null, debtRatio: f.debtToEquity, debtRatioPrev: null,
        hi52: f.hi52, market: 'us',
      };
    }
  }
  if (fund) await kvSet(key, fund);
  return fund;
}

function fundamentalSignals(h: SellHolding, f: Fund | null): SellSignal[] {
  if (!f) return [];
  const out: SellSignal[] = [];

  if (f.target && h.price >= f.target) {
    const over = Math.round((h.price / f.target - 1) * 100);
    out.push({
      level: 'mid',
      text: `증권가 목표가 도달/초과 (${over >= 0 ? '+' : ''}${over}%)`,
      who: '벤저민 그레이엄',
      principle: '적정가치 도달 — 안전마진 소멸',
      detail:
        '현재가가 증권가 평균 목표가에 도달·초과했습니다. 저평가 여유(안전마진)가 사라진 구간이라는 뜻이에요. 그레이엄은 주가가 적정가치에 이르면 매도를 고려하라고 했습니다. 단, 목표가 자체가 보수적일 수 있으니 절대 기준은 아닙니다.',
    });
  }

  const q: string[] = [];
  if (f.market === 'kr') {
    if (f.roe != null && f.roePrev != null && f.roePrev > 0 && f.roe < f.roePrev * 0.8) q.push(`ROE 악화 ${f.roePrev.toFixed(0)}%→${f.roe.toFixed(0)}%`);
    if (f.debtRatio != null && f.debtRatioPrev != null && f.debtRatio > f.debtRatioPrev * 1.3 && f.debtRatio > 100) q.push(`부채비율 급증 ${f.debtRatioPrev.toFixed(0)}%→${f.debtRatio.toFixed(0)}%`);
    if (f.netMargin != null && f.netMargin < 0) q.push(`적자 전환(순이익률 ${f.netMargin.toFixed(0)}%)`);
  } else {
    if (f.roe != null && f.roe < 5) q.push(`낮은 ROE ${f.roe.toFixed(0)}%`);
    if (f.debtRatio != null && f.debtRatio > 300) q.push(`고부채(D/E ${f.debtRatio.toFixed(0)})`);
    if (f.netMargin != null && f.netMargin < 0) q.push(`적자(순이익률 ${f.netMargin.toFixed(0)}%)`);
  }
  if (q.length) {
    out.push({
      level: 'high',
      text: `퀄리티 훼손 — ${q.join(', ')}`,
      who: '필립 피셔 · 워런 버핏',
      principle: '보유 근거 소멸',
      detail:
        '필립 피셔가 꼽은 "팔아야 할 이유" 2번: 기업 자체가 나빠졌을 때. 버핏도 해자(경쟁우위)가 무너지면 판다고 했습니다. ROE·마진 하락이나 부채 급증은 "내가 이 주식을 산 이유"가 약해졌다는 신호예요. 가장 신뢰도 높은 매도 근거로 봅니다.',
    });
  }
  return out;
}

// 트레일링용 고점: 종목별로 max(이전 저장값, 52주 고점, 현재가)를 kv에 누적 저장.
// 52주 고점을 시드로 써서 추적 시작부터 의미 있는 기준이 된다.
async function trackPeak(code: string, price: number, hi52: number): Promise<number> {
  const key = `peak:${code}`;
  const prev = (await kvGet<number>(key)) ?? 0;
  const peak = Math.max(prev, hi52 || 0, price || 0);
  if (peak > prev) await kvSet(key, peak);
  return peak;
}

export async function checkSell(holdings: SellHolding[]): Promise<SellFundamental[]> {
  const out: SellFundamental[] = [];
  let i = 0;
  async function worker() {
    while (i < holdings.length) {
      const h = holdings[i++];
      const f = await getFund(h.code, h.tab).catch(() => null);
      const peak = await trackPeak(h.code, h.price, f?.hi52 ?? 0).catch(() => null);
      out.push({
        code: h.code, name: h.name, signals: fundamentalSignals(h, f),
        per: f?.per ?? null, pbr: f?.pbr ?? null, roe: f?.roe ?? null, debtRatio: f?.debtRatio ?? null,
        target: f?.target ?? null, upside: f?.target && h.price > 0 ? (f.target / h.price - 1) * 100 : null,
        peak,
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, holdings.length) }, worker));
  return out;
}
