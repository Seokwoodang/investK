import 'server-only';
import { kvGet, kvSet } from './kv';
import { getKrFinance, getFundamentals } from './providers/naverFundamentals';
import { getUsFundamentals } from './providers/yahoo';
import { getDomesticCandles, getOverseasCandles } from './providers/kis';
import type { Candle, Currency, TabId } from '@/types';

// "매도 점검"의 공식별 신호. 사용자가 어떤 공식(전략)을 켤지 고르면 그 공식들의 신호만 본다.
//  formula 키: graham(목표가) · quality(퀄리티 훼손) · trend(이동평균 이탈) · atr(변동성 손절)
//  (oneill 손절·익절, weight 비중, trail 트레일링은 사용자 조절값이라 클라에서 계산)
// 신호마다 who/principle/detail(클릭 설명) + formula 태그. 판정은 규칙, 매매 결정은 사용자.

export interface SellHolding { code: string; tab: TabId; name: string; price: number; cur: Currency }
export interface SellSignal { level: 'high' | 'mid' | 'info'; text: string; who: string; principle: string; detail: string; formula: string }
export interface SellFundamental {
  code: string;
  name: string;
  signals: SellSignal[]; // 서버 공식 신호(graham·quality·trend·atr)
  per: number | null;
  pbr: number | null;
  roe: number | null;
  debtRatio: number | null;
  target: number | null;
  upside: number | null;
  recentHigh: number | null; // 캔들 실제 고점(트레일링용)
}

interface Fund {
  per: number | null; pbr: number | null;
  roe: number | null; roePrev: number | null;
  netMargin: number | null; netMarginPrev: number | null;
  debtRatio: number | null; debtRatioPrev: number | null;
  target: number | null; market: 'kr' | 'us';
}
interface Tech { close: number | null; ma60: number | null; ma120: number | null; atr: number | null; recentHigh: number | null; hi22: number | null }

const kstDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

// ── 재무(목표가·퀄리티) ──
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
    if (fin || integ)
      fund = {
        per: integ?.per ?? null, pbr: integ?.pbr ?? null, target: integ?.targetPrice ?? null,
        roe: fin?.roe ?? null, roePrev: fin?.roePrev ?? null,
        netMargin: fin?.netMargin ?? null, netMarginPrev: fin?.netMarginPrev ?? null,
        debtRatio: fin?.debtRatio ?? null, debtRatioPrev: fin?.debtRatioPrev ?? null, market: 'kr',
      };
  } else {
    const f = await getUsFundamentals(code);
    if (f)
      fund = {
        per: f.per, pbr: f.pbr, target: f.target, roe: f.roe, roePrev: null,
        netMargin: f.netMargin, netMarginPrev: null, debtRatio: f.debtToEquity, debtRatioPrev: null, market: 'us',
      };
  }
  if (fund) await kvSet(key, fund);
  return fund;
}

// ── 기술적 지표(이동평균·ATR·고점) — 캔들 기반. 주식만(코인은 코드→마켓 매핑 필요해 v1 제외). ──
const sma = (v: number[], n: number) => (v.length >= n ? v.slice(-n).reduce((a, b) => a + b, 0) / n : null);
function atr14(c: Candle[]): number | null {
  if (c.length < 15) return null;
  const trs: number[] = [];
  for (let i = 1; i < c.length; i++) trs.push(Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)));
  return trs.slice(-14).reduce((a, b) => a + b, 0) / 14;
}
async function getTech(code: string, tab: TabId): Promise<Tech | null> {
  if (tab !== 'kr_stock' && tab !== 'us_stock') return null;
  const key = `tech:${code}:${kstDate()}`;
  const cached = await kvGet<Tech>(key);
  if (cached) return cached;
  let candles: Candle[] = [];
  try { candles = tab === 'kr_stock' ? await getDomesticCandles(code, '일봉') : await getOverseasCandles(code, '일봉'); } catch { return null; }
  if (candles.length < 20) return null;
  const closes = candles.map((c) => c.c);
  const highs = candles.map((c) => c.h);
  const tech: Tech = {
    close: closes[closes.length - 1] ?? null,
    ma60: sma(closes, 60), ma120: sma(closes, 120), atr: atr14(candles),
    recentHigh: Math.max(...highs), hi22: Math.max(...highs.slice(-22)),
  };
  await kvSet(key, tech);
  return tech;
}

function fundamentalSignals(h: SellHolding, f: Fund | null): SellSignal[] {
  if (!f) return [];
  const out: SellSignal[] = [];
  if (f.target && h.price >= f.target) {
    const over = Math.round((h.price / f.target - 1) * 100);
    out.push({ level: 'mid', formula: 'graham', text: `증권가 목표가 도달/초과 (${over >= 0 ? '+' : ''}${over}%)`, who: '벤저민 그레이엄', principle: '적정가치 도달 — 안전마진 소멸', detail: '현재가가 증권가 평균 목표가에 도달·초과했습니다. 저평가 여유(안전마진)가 사라진 구간으로, 그레이엄은 적정가치에 이르면 매도를 고려했습니다.' });
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
  if (q.length) out.push({ level: 'high', formula: 'quality', text: `퀄리티 훼손 — ${q.join(', ')}`, who: '필립 피셔 · 워런 버핏', principle: '보유 근거 소멸', detail: '필립 피셔가 꼽은 "팔아야 할 이유" 2번: 기업 자체가 나빠졌을 때. 버핏도 해자(경쟁우위)가 무너지면 판다고 했습니다. ROE·마진 하락이나 부채 급증은 "내가 산 이유"가 약해졌다는 신호로, 가장 신뢰도 높은 매도 근거입니다.' });
  return out;
}

function techSignals(t: Tech | null): SellSignal[] {
  if (!t || t.close == null) return [];
  const out: SellSignal[] = [];
  const longMa = t.ma120 ?? t.ma60;
  const label = t.ma120 != null ? '120일선' : '60일선';
  if (longMa != null && t.close < longMa) {
    out.push({ level: t.ma120 != null ? 'high' : 'mid', formula: 'trend', text: `추세 이탈 — 종가가 ${label}(${Math.round(longMa).toLocaleString()}) 아래`, who: '추세추종', principle: '이동평균선 이탈', detail: '상승추세의 핵심 지지선인 장기 이동평균선을 종가가 밑돌면 추세가 꺾였다고 봅니다. 종목 가격 자체에서 객관적으로 나오는 추세추종 매도 신호예요.' });
  }
  if (t.atr != null && t.hi22 != null) {
    const chand = t.hi22 - 3 * t.atr;
    if (t.close < chand) out.push({ level: 'high', formula: 'atr', text: `변동성 손절(샹들리에) — 22일 고점−3×ATR(${Math.round(chand).toLocaleString()}) 하회`, who: '샹들리에 이그짓', principle: 'ATR 변동성 손절', detail: '손절선을 고정 %가 아니라 종목 자체의 변동성(ATR)으로 정합니다. 최근 고점 − 3×ATR. 변동성 큰 종목은 손절선이 자동으로 넓어지고 안정적 종목은 좁아져, 노이즈에 안 털리면서 진짜 추세 이탈만 잡습니다.' });
  }
  return out;
}

export async function checkSell(holdings: SellHolding[], withTech = false): Promise<SellFundamental[]> {
  const out: SellFundamental[] = [];
  let i = 0;
  async function worker() {
    while (i < holdings.length) {
      const h = holdings[i++];
      const [f, t] = await Promise.all([
        getFund(h.code, h.tab).catch(() => null),
        withTech ? getTech(h.code, h.tab).catch(() => null) : Promise.resolve(null),
      ]);
      out.push({
        code: h.code, name: h.name,
        signals: [...fundamentalSignals(h, f), ...techSignals(t)],
        per: f?.per ?? null, pbr: f?.pbr ?? null, roe: f?.roe ?? null, debtRatio: f?.debtRatio ?? null,
        target: f?.target ?? null, upside: f?.target && h.price > 0 ? (f.target / h.price - 1) * 100 : null,
        recentHigh: t?.recentHigh ?? null,
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, holdings.length) }, worker));
  return out;
}
