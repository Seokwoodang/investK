import 'server-only';
import { getYahooQuote } from './yahoo';
import type { MarketGauge, MarketIndicators } from '@/types';

// 대시보드 '시장 심리·지표' — VIX(공포지수)·美10년물 금리·크립토 공포탐욕지수·김치프리미엄. 모두 키 불필요.

async function vixGauge(): Promise<MarketGauge | null> {
  const q = await getYahooQuote('^VIX');
  if (!q) return null;
  const v = q.price;
  const tone = v >= 25 ? 'fear' : v <= 15 ? 'greed' : 'neutral';
  const sub = v >= 30 ? '공포 구간' : v >= 20 ? '경계' : v >= 15 ? '보통' : '안정';
  return { label: 'VIX 공포지수', value: v.toFixed(2), sub, chg: q.chg, tone, hint: 'S&P500 변동성지수. 높을수록 시장 공포·불안(통상 20↑ 경계, 30↑ 공포).' };
}

async function ust10yGauge(): Promise<MarketGauge | null> {
  const q = await getYahooQuote('^TNX');
  if (!q) return null;
  return { label: '미 10년물 금리', value: `${q.price.toFixed(2)}%`, chg: q.chg, tone: q.chg > 0 ? 'up' : q.chg < 0 ? 'down' : 'neutral', hint: '미국 10년 국채 금리. 상승 시 성장주·위험자산에 부담.' };
}

async function cryptoFngGauge(): Promise<MarketGauge | null> {
  try {
    const r = await fetch('https://api.alternative.me/fng/?limit=1', { next: { revalidate: 1800 } });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { value?: string; value_classification?: string }[] };
    const d = j.data?.[0];
    const v = Number(d?.value);
    if (!Number.isFinite(v)) return null;
    const sub = v <= 24 ? '극단적 공포' : v <= 44 ? '공포' : v <= 55 ? '중립' : v <= 74 ? '탐욕' : '극단적 탐욕';
    const tone = v < 45 ? 'fear' : v > 55 ? 'greed' : 'neutral';
    return { label: '크립토 공포·탐욕', value: String(v), sub, tone, hint: '암호화폐 시장 심리지수(0 극단적 공포 ~ 100 극단적 탐욕).' };
  } catch {
    return null;
  }
}

// 김치프리미엄: 업비트 BTC(원화) vs 바이낸스 BTC(달러)×환율. 양수면 국내가 더 비쌈.
async function kimchiGauge(usdkrw: number | null): Promise<MarketGauge | null> {
  if (!usdkrw || usdkrw <= 0) return null;
  try {
    const [u, b] = await Promise.all([
      fetch('https://api.upbit.com/v1/ticker?markets=KRW-BTC', { next: { revalidate: 120 } }).then((r) => (r.ok ? r.json() : null)),
      fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', { next: { revalidate: 120 } }).then((r) => (r.ok ? r.json() : null)),
    ]);
    const krw = Array.isArray(u) ? u[0]?.trade_price : null;
    const usd = b?.price ? Number(b.price) : null;
    if (!krw || !usd) return null;
    const prem = (krw / (usd * usdkrw) - 1) * 100;
    return {
      label: '김치프리미엄',
      value: `${prem > 0 ? '+' : ''}${prem.toFixed(2)}%`,
      sub: 'BTC 기준',
      tone: prem > 0 ? 'up' : prem < 0 ? 'down' : 'neutral',
      hint: '국내(업비트)와 해외(바이낸스) 비트코인 가격차. 양수면 국내가 더 비쌈(과열 신호).',
    };
  } catch {
    return null;
  }
}

export async function getMarketIndicators(usdkrw: number | null): Promise<MarketIndicators> {
  const [vix, ust10y, cryptoFng, kimchi] = await Promise.all([vixGauge(), ust10yGauge(), cryptoFngGauge(), kimchiGauge(usdkrw)]);
  return { vix, ust10y, cryptoFng, kimchi };
}
