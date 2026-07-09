import 'server-only';
import type { Candle } from '../../types';

// 지수 상세(대시보드 지수 클릭 → 모달)용 데이터.
//  - 캔들: Yahoo chart API(키 불필요) — 코스피(^KS11)·코스닥(^KQ11)·S&P500(^GSPC)·나스닥(^IXIC)
//  - 투자자별 매매동향(코스피·코스닥만): 네이버 지수 API trend?bizdate=일자 — 개인/외국인/기관 순매수(억원)
//    해외 지수엔 이런 집계가 없어(한국 시장 제도) 미제공.

const SYMBOLS: Record<string, string> = {
  '코스피': '^KS11',
  '코스닥': '^KQ11',
  'S&P 500': '^GSPC',
  '나스닥': '^IXIC',
};
export const INDEX_NAMES = Object.keys(SYMBOLS);
export type IndexRange = '1mo' | '3mo' | '1y';

const UA = { 'User-Agent': 'Mozilla/5.0' };

export async function getIndexCandles(name: string, range: IndexRange): Promise<Candle[]> {
  const sym = SYMBOLS[name];
  if (!sym) return [];
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=${range}`,
      { headers: UA, next: { revalidate: 600 } },
    );
    if (!r.ok) return [];
    const j = (await r.json()) as {
      chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[] }> } }> };
    };
    const res = j?.chart?.result?.[0];
    const ts = res?.timestamp ?? [];
    const q = res?.indicators?.quote?.[0];
    if (!q) return [];
    const out: Candle[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
      if (o == null || h == null || l == null || c == null) continue; // 휴장·결측 봉 제외
      out.push({ o, h, l, c, t: ts[i] * 1000 });
    }
    return out;
  } catch {
    return [];
  }
}

export interface InvestorDay {
  date: string; // YYYY-MM-DD
  personal: number; // 개인 순매수(억원)
  foreign: number; // 외국인
  institutional: number; // 기관
}

const NAVER_INDEX: Record<string, string> = { '코스피': 'KOSPI', '코스닥': 'KOSDAQ' };
const num = (s?: string) => {
  const v = parseFloat((s ?? '').replace(/[+,]/g, ''));
  return Number.isFinite(v) ? v : 0;
};

// 최근 days 거래일의 투자자별 순매수. 달력일을 넉넉히 훑어 휴장일(전부 0)은 건너뛴다.
export async function getInvestorTrend(name: string, days = 10): Promise<InvestorDay[]> {
  const idx = NAVER_INDEX[name];
  if (!idx) return [];
  const dates: string[] = [];
  for (let i = 0; i < days * 2 && dates.length < days * 2; i++) {
    const d = new Date(Date.now() - i * 86400_000);
    const dow = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(d);
    if (dow === 'Sat' || dow === 'Sun') continue;
    dates.push(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d).replace(/-/g, ''));
  }

  // 동시 4개로 제한(네이버 예의). 과거 일자는 값이 안 변해 오래 캐시.
  const out: InvestorDay[] = [];
  for (let i = 0; i < dates.length; i += 4) {
    const chunk = dates.slice(i, i + 4);
    const rows = await Promise.all(
      chunk.map(async (bd) => {
        try {
          const r = await fetch(`https://m.stock.naver.com/api/index/${idx}/trend?bizdate=${bd}`, {
            headers: { ...UA, Referer: 'https://m.stock.naver.com/' },
            next: { revalidate: bd === dates[0] ? 600 : 21600 }, // 오늘은 10분, 과거는 6시간
          });
          if (!r.ok) return null;
          const j = (await r.json()) as { bizdate?: string; personalValue?: string; foreignValue?: string; institutionalValue?: string };
          const p = num(j.personalValue), f = num(j.foreignValue), inst = num(j.institutionalValue);
          if (p === 0 && f === 0 && inst === 0) return null; // 휴장/미집계
          const bd2 = j.bizdate ?? bd;
          return { date: `${bd2.slice(0, 4)}-${bd2.slice(4, 6)}-${bd2.slice(6, 8)}`, personal: p, foreign: f, institutional: inst };
        } catch {
          return null;
        }
      }),
    );
    for (const row of rows) if (row) out.push(row);
    if (out.length >= days) break;
  }
  return out.slice(0, days).sort((a, b) => a.date.localeCompare(b.date));
}
