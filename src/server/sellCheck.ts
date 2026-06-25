import 'server-only';
import { kvGet, kvSet } from './kv';
import { getKrFinance, getFundamentals } from './providers/naverFundamentals';
import { getUsFundamentals } from './providers/yahoo';
import type { Currency, TabId } from '@/types';

// 규칙 기반 "매도 점검" — 보유 종목별로 검증된 매도 신호를 점검한다(예측 아님, 점검·리스크관리).
//  · 손절/익절: 내 평단가 대비 수익률 (매입 시점 기반)
//  · 비중 과다: 현재 포트폴리오 비중
//  · 고평가/목표가: 현재가 vs 증권가 목표가
//  · 퀄리티 훼손: 회사 ROE·부채·마진의 (KR)전년比 악화 / (US)절대 수준  ← 버핏의 핵심 매도 이유
// 신호가 떠도 "팔아라"가 아니라 "점검하라"는 의미. 투자 자문 아님.

const STOP_LOSS = -20; // 평단 대비 손절 점검 라인 %
const BIG_GAIN = 50; // 큰 수익 익절 검토 라인 %
const MAX_WEIGHT = 25; // 단일 종목 비중 상한 %

export interface SellHolding {
  code: string;
  tab: TabId;
  name: string;
  plPct: number;
  weight: number; // 포트폴리오 내 비중 %
  price: number;
  cur: Currency;
}
export interface SellSignal {
  level: 'high' | 'mid' | 'info';
  text: string;
}
export interface SellResult {
  code: string;
  name: string;
  verdict: 'hold' | 'watch' | 'review';
  signals: SellSignal[];
  per: number | null;
  pbr: number | null;
  roe: number | null;
  debtRatio: number | null;
  target: number | null;
  upside: number | null;
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
  market: 'kr' | 'us';
}

const kstDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

// 종목 재무(매도 점검용) — 하루 단위로 kv 캐시. 코인·수동입력은 재무 없음(null).
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
        market: 'kr',
      };
    }
  } else {
    const f = await getUsFundamentals(code);
    if (f) {
      fund = {
        per: f.per, pbr: f.pbr, target: f.target, roe: f.roe, roePrev: null,
        netMargin: f.netMargin, netMarginPrev: null, debtRatio: f.debtToEquity, debtRatioPrev: null,
        market: 'us',
      };
    }
  }
  if (fund) await kvSet(key, fund);
  return fund;
}

function signalsFor(h: SellHolding, f: Fund | null): SellSignal[] {
  const out: SellSignal[] = [];
  const pl = Math.round(h.plPct);

  if (h.plPct <= STOP_LOSS) out.push({ level: 'high', text: `손절 라인(${STOP_LOSS}%) 도달 — 현재 ${pl}%. 손실 확대 점검` });
  if (h.weight > MAX_WEIGHT) out.push({ level: 'mid', text: `포트폴리오 비중 ${Math.round(h.weight)}% 과다 — 분할매도·리밸런싱 검토` });
  if (h.plPct >= BIG_GAIN) out.push({ level: 'info', text: `평단 대비 +${pl}% — 일부 익절 검토` });

  if (f) {
    if (f.target && h.price >= f.target) {
      const over = Math.round((h.price / f.target - 1) * 100);
      out.push({ level: 'mid', text: `증권가 목표가 도달/초과 (${over >= 0 ? '+' : ''}${over}%) — 고평가 영역` });
    }
    // 퀄리티 훼손 — 버핏의 핵심 매도 이유("산 이유가 사라지면 판다")
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
    if (q.length) out.push({ level: 'high', text: `퀄리티 훼손 — ${q.join(', ')}` });
  }
  return out;
}

export async function checkSell(holdings: SellHolding[]): Promise<SellResult[]> {
  const out: SellResult[] = [];
  // 보유 종목은 보통 적으므로 동시성 6으로 충분.
  let i = 0;
  async function worker() {
    while (i < holdings.length) {
      const h = holdings[i++];
      const f = await getFund(h.code, h.tab).catch(() => null);
      const signals = signalsFor(h, f);
      const verdict: SellResult['verdict'] = signals.some((s) => s.level === 'high')
        ? 'review'
        : signals.some((s) => s.level === 'mid' || s.level === 'info')
          ? 'watch'
          : 'hold';
      out.push({
        code: h.code, name: h.name, verdict, signals,
        per: f?.per ?? null, pbr: f?.pbr ?? null, roe: f?.roe ?? null, debtRatio: f?.debtRatio ?? null,
        target: f?.target ?? null, upside: f?.target && h.price > 0 ? (f.target / h.price - 1) * 100 : null,
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, holdings.length) }, worker));
  return out;
}
