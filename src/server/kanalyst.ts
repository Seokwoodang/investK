import 'server-only';
import { has } from './env';
import { getOrGenerateJSON } from './ai';
import { getEdgarFinance } from './providers/edgar';
import { getUsResearch } from './providers/yahoo';
import { getKrResearch, getFundamentals } from './providers/naverFundamentals';
import type { KMarket, KanalystData, KanalystNarrative, KanalystReport, KTrendYear } from '@/types';

// K-리서치(애널리스트 보고서) 조립기.
//  - 재무 시계열: 미국=EDGAR(원천 공시), 국내=네이버 재무제표
//  - 밸류에이션·컨센서스·목표가·투자의견·성장률: 미국=야후, 국내=네이버
//  - 투자의견(verdict)은 규칙 로직으로 판정, 서술(narrative)만 Claude가 작성(하이브리드)
//  - AI 서술은 "데이터 지문"으로 캐시 → 실적·투자의견이 바뀔 때만 재생성(요일 무관, 종목별 공용)

const kstDate = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// (target/price-1)*100
function upsideOf(target: number | null, price: number | null): number | null {
  return target != null && price != null && price > 0 ? +((target / price - 1) * 100).toFixed(1) : null;
}

// 투자의견 판정(규칙) — 컨센서스 등급·상승여력·수익성·밸류·부채를 점수화. AI 아님.
function deriveVerdict(d: {
  recommMean: number | null; upside: number | null; roe: number | null; netMargin: number | null; per: number | null; debtRatio: number | null;
}): KanalystData['verdict'] {
  let pts = 0;
  const reasons: string[] = [];
  const { recommMean: rm, upside: up, roe, netMargin: nm, per, debtRatio: dr } = d;
  if (rm != null) {
    if (rm <= 1.8) { pts += 2; reasons.push('증권가 컨센서스 매수 우위'); }
    else if (rm <= 2.5) { pts += 1; reasons.push('증권가 의견 매수 쪽'); }
    else if (rm >= 3.5) { pts -= 2; reasons.push('컨센서스 중립·매도 우위'); }
    else if (rm >= 3) { pts -= 1; reasons.push('컨센서스 다소 신중'); }
  }
  if (up != null) {
    if (up >= 25) { pts += 2; reasons.push(`목표가 대비 상승여력 ${up.toFixed(0)}%`); }
    else if (up >= 10) { pts += 1; reasons.push(`상승여력 ${up.toFixed(0)}%`); }
    else if (up <= -10) { pts -= 2; reasons.push(`목표가를 ${Math.abs(up).toFixed(0)}% 상회(고평가 신호)`); }
    else if (up <= -3) { pts -= 1; reasons.push('목표가에 근접·소폭 상회'); }
  }
  if (roe != null) {
    if (roe >= 15) { pts += 1; reasons.push(`ROE ${roe.toFixed(0)}%로 우수`); }
    else if (roe < 5) { pts -= 1; reasons.push('ROE 부진'); }
  }
  if (nm != null && nm >= 15) { pts += 1; reasons.push(`순이익률 ${nm.toFixed(0)}%로 견조`); }
  if (per != null) {
    if (per <= 12) { pts += 1; reasons.push(`PER ${per.toFixed(0)}배로 저평가 영역`); }
    else if (per >= 45) { pts -= 1; reasons.push(`PER ${per.toFixed(0)}배로 밸류 부담`); }
  }
  if (dr != null && dr > 200) { pts -= 1; reasons.push('부채비율 높음'); }

  let label: string, tone: 'pos' | 'neu' | 'neg';
  if (pts >= 4) { label = '강한 매수'; tone = 'pos'; }
  else if (pts >= 2) { label = '매수'; tone = 'pos'; }
  else if (pts >= -1) { label = '중립'; tone = 'neu'; }
  else { label = '비중 축소'; tone = 'neg'; }
  if (!reasons.length) reasons.push('컨센서스·수익성 데이터가 부족해 중립적으로 판정');
  return { label, tone, reasons: reasons.slice(0, 4) };
}

function growth(cur: number | null, prev: number | null): number | null {
  return cur != null && prev != null && prev !== 0 ? +((cur / prev - 1) * 100).toFixed(1) : null;
}

// ── 데이터 조립(숫자·차트·판정·지문). AI 호출 없음. ──
export async function buildKanalystData(market: KMarket, code: string, name: string, ticker: string, clientPrice?: number): Promise<KanalystData | null> {
  const base = {
    code, name, ticker, market,
    asOf: kstDate(),
  };

  if (market === 'us') {
    const [research, fin] = await Promise.all([getUsResearch(ticker), getEdgarFinance(ticker)]);
    if (!research && !fin) return null;
    const price = clientPrice ?? research?.price ?? null;
    const trend: KTrendYear[] = (fin?.years ?? []).map((y) => ({
      year: y.year, revenue: y.revenue, netIncome: y.netIncome, eps: y.eps, fcf: y.fcf, netMargin: y.netMargin,
    }));
    const target = research?.target ?? null;
    const upside = upsideOf(target, price);
    const debtRatio = research?.debtToEquity ?? null;
    const verdict = deriveVerdict({ recommMean: research?.recommMean ?? null, upside, roe: research?.roe ?? null, netMargin: research?.netMargin ?? null, per: research?.per ?? null, debtRatio });
    const last = trend[trend.length - 1];
    const fingerprint = `us:${code}:${fin?.fiscalYearEnd ?? '-'}:${last?.revenue ?? '-'}:${last?.eps ?? '-'}:${research?.recommMean?.toFixed(1) ?? 'na'}`;
    return {
      ...base, cur: '$', revUnit: 'USD',
      sector: research?.sector ?? null, industry: research?.industry ?? null,
      price, hi52: research?.hi52 ?? null, lo52: research?.lo52 ?? null, marketCapText: research?.marketCapText ?? null,
      per: research?.per ?? null, fwdPer: research?.fwdPer ?? null, pbr: research?.pbr ?? null,
      pegRatio: research?.pegRatio ?? null, evToEbitda: research?.evToEbitda ?? null, divYield: research?.divYield ?? null,
      roe: research?.roe ?? null, netMargin: research?.netMargin ?? null, debtRatio, currentRatio: research?.currentRatio ?? null,
      revenueGrowth: research?.revenueGrowth ?? null, earningsGrowth: research?.earningsGrowth ?? null, fwdEpsGrowth: research?.fwdEpsGrowth ?? null,
      target, targetHigh: research?.targetHigh ?? null, targetLow: research?.targetLow ?? null, upside,
      recommMean: research?.recommMean ?? null, numAnalysts: research?.numAnalysts ?? null,
      dist: research ? { strongBuy: research.strongBuy, buy: research.buy, hold: research.hold, sell: research.sell, strongSell: research.strongSell } : null,
      trend, verdict, fingerprint,
      sources: ['SEC EDGAR (재무제표)', 'Yahoo Finance (밸류에이션·컨센서스)'],
    };
  }

  // KR
  const [kr, f] = await Promise.all([getKrResearch(code), getFundamentals(code)]);
  if (!kr && !f) return null;
  const price = clientPrice ?? null;
  const trend: KTrendYear[] = (kr?.trend ?? []).map((y) => ({
    year: y.year, revenue: y.revenue, netIncome: y.netIncome, eps: y.eps, fcf: null, netMargin: y.netMargin,
  }));
  const last = trend[trend.length - 1];
  const prev = trend[trend.length - 2];
  const target = f?.targetPrice ?? null;
  const upside = upsideOf(target, price);
  const roe = kr?.trend?.[kr.trend.length - 1]?.roe ?? null;
  const netMargin = last?.netMargin ?? null;
  const debtRatio = kr?.trend?.[kr.trend.length - 1]?.debtRatio ?? null;
  // 네이버 투자의견은 "높을수록 매수"(4≈매수) 스케일 → 앱 표준(1=매수~5=매도)으로 6-x 변환.
  const recommMean = f?.recommMean != null ? +(6 - f.recommMean).toFixed(2) : null;
  const verdict = deriveVerdict({ recommMean, upside, roe, netMargin, per: f?.per ?? null, debtRatio });
  const fingerprint = `kr:${code}:${last?.year ?? '-'}:${last?.revenue ?? '-'}:${last?.eps ?? '-'}:${recommMean?.toFixed(1) ?? 'na'}`;
  return {
    ...base, cur: '₩', revUnit: '억원',
    sector: kr?.sector ?? null, industry: null,
    price, hi52: f?.hi52 ?? null, lo52: null, marketCapText: null,
    per: f?.per ?? null, fwdPer: f?.fwdPer ?? null, pbr: f?.pbr ?? null,
    pegRatio: null, evToEbitda: null, divYield: f?.divYield ?? null,
    roe, netMargin, debtRatio, currentRatio: null,
    revenueGrowth: growth(last?.revenue ?? null, prev?.revenue ?? null),
    earningsGrowth: growth(last?.netIncome ?? null, prev?.netIncome ?? null),
    fwdEpsGrowth: growth(f?.fwdEps ?? null, f?.eps ?? null),
    target, targetHigh: null, targetLow: null, upside,
    recommMean, numAnalysts: null, dist: null,
    trend, verdict, fingerprint,
    sources: ['네이버 금융 (재무제표·컨센서스)'],
  };
}

// AI 서술 프롬프트에 넣을 숫자 요약(캐시 미스 때만 실행).
function narrativePrompt(d: KanalystData): string {
  const num = (v: number | null, s = '', suf = '') => (v == null ? '-' : `${s}${v}${suf}`);
  const revU = d.revUnit === 'USD' ? '백만$' : '억원';
  const scale = d.revUnit === 'USD' ? 1e6 : 1;
  const trend = d.trend.map((y) => `${y.year}: 매출 ${y.revenue == null ? '-' : Math.round(y.revenue / scale).toLocaleString()}${revU}, 순이익 ${y.netIncome == null ? '-' : Math.round(y.netIncome / scale).toLocaleString()}${revU}, 순이익률 ${num(y.netMargin, '', '%')}, EPS ${num(y.eps)}`).join('\n');
  return [
    `[종목] ${d.name} (${d.ticker}) · 업종 ${d.sector ?? '-'}${d.industry ? ' / ' + d.industry : ''}`,
    `[현재가] ${d.price ?? '-'} ${d.cur} · 52주 ${num(d.lo52)}~${num(d.hi52)}${d.marketCapText ? ' · 시총 ' + d.marketCapText : ''}`,
    `[밸류에이션] PER ${num(d.per, '', '배')} · 선행PER ${num(d.fwdPer, '', '배')} · PBR ${num(d.pbr, '', '배')}${d.pegRatio != null ? ` · PEG ${d.pegRatio}` : ''}${d.evToEbitda != null ? ` · EV/EBITDA ${d.evToEbitda}` : ''} · 배당수익률 ${num(d.divYield, '', '%')}`,
    `[수익성·건전성] ROE ${num(d.roe, '', '%')} · 순이익률 ${num(d.netMargin, '', '%')} · 부채비율 ${num(d.debtRatio, '', '%')} · 유동비율 ${num(d.currentRatio)}`,
    `[성장] 매출성장 ${num(d.revenueGrowth, '', '%')} · 이익성장 ${num(d.earningsGrowth, '', '%')} · 내년EPS추정성장 ${num(d.fwdEpsGrowth, '', '%')}`,
    `[컨센서스] 목표가 ${num(d.target)} (범위 ${num(d.targetLow)}~${num(d.targetHigh)}) · 상승여력 ${num(d.upside, '', '%')} · 투자의견 ${num(d.recommMean)}(1매수~5매도)${d.numAnalysts ? ` · 애널리스트 ${d.numAnalysts}명` : ''}`,
    d.dist ? `[추천분포] 적극매수 ${d.dist.strongBuy} · 매수 ${d.dist.buy} · 중립 ${d.dist.hold} · 매도 ${d.dist.sell} · 적극매도 ${d.dist.strongSell}` : '',
    `[연간 실적 추세]\n${trend || '-'}`,
    `[규칙 기반 판정] ${d.verdict.label} (${d.verdict.reasons.join(', ')})`,
    '',
    '위 실제 수치만 근거로 한국어 애널리스트 보고서를 JSON으로 작성하라. 반드시 아래 형식(키 고정)만 출력:',
    '{',
    '  "thesis": "핵심 투자 논지 2~3문장(수치 인용)",',
    '  "business": "이 회사가 무엇으로 돈을 버는지·경쟁력 2~3문장",',
    '  "bull": ["강점/투자포인트 3~4개(각 한 문장, 수치 인용)"],',
    '  "bear": ["리스크/약점 3~4개(각 한 문장)"],',
    '  "valuation": "밸류에이션 평가 2~3문장(PER/목표가 상승여력 등 인용)",',
    '  "catalyst": ["앞으로 관전 포인트/촉매 2~3개"]',
    '}',
    '규칙: (1) 제공된 숫자만 사용, 없는 수치 지어내지 말 것. (2) 목표가는 컨센서스만 인용(스스로 예측 금지). (3) 단정적 미래 주가 예측·매매 권유 금지. (4) 마크다운·별표 없이 순수 문장. (5) JSON만 출력.',
  ].filter(Boolean).join('\n');
}

const EMPTY: KanalystNarrative = { thesis: '', business: '', bull: [], bear: [], valuation: '', catalyst: [] };

// 데이터 + AI 서술(지문 캐시). force면 서술 강제 재생성.
export async function getKanalyst(market: KMarket, code: string, name: string, ticker: string, clientPrice?: number, force = false): Promise<KanalystReport | null> {
  const data = await buildKanalystData(market, code, name, ticker, clientPrice);
  if (!data) return null;

  if (!has.anthropic()) return { data, narrative: null, generated: false };

  const narrative = await getOrGenerateJSON<KanalystNarrative>({
    cacheKey: `kanalyst:v1:${data.fingerprint}`,
    kind: 'kanalyst',
    system:
      '너는 한국어로 쓰는 증권 애널리스트다. 제공된 실제 재무·컨센서스 수치만 근거로 간결하고 전문적인 보고서를 쓴다. ' +
      '수치를 지어내지 말고, 목표가는 컨센서스만 인용하며, 단정적 미래 예측·매매 권유는 하지 않는다. 반드시 지정된 JSON 형식만 출력한다.',
    prompt: async () => narrativePrompt(data),
    fallback: EMPTY,
    force,
  });

  const generated = !!narrative.thesis;
  return { data, narrative: generated ? narrative : null, generated };
}
