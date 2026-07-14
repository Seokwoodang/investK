import 'server-only';

// 네이버 금융에서 종목별 재무지표(밸류·퀄리티·환원 스크리닝용)를 수집한다. 키 불필요.
// - 후보: marketValue 엔드포인트(시총 내림차순)에서 상위 N 종목.
// - 지표: 종목별 integration 엔드포인트의 totalInfos(PER/PBR/배당 등) + consensusInfo(목표주가).
// ROE·부채비율·이익률은 finance/annual(재무제표 실측)에서 수집한다(getKrFinance).

const UA = { 'User-Agent': 'Mozilla/5.0', Referer: 'https://m.stock.naver.com/' };

// "28.98배"·"0.47%"·"1,668원" → 28.98 / 0.47 / 1668. "N/A"·빈값 → null.
function pnum(s: unknown): number | null {
  if (s == null) return null;
  const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

export interface Candidate {
  code: string;
  name: string;
  price: number;
  marketCap: number; // 정렬용 숫자(단위 무관, 순서 보존)
  marketCapText: string; // 표시용 "2,095조 8,909억"
}

interface MvStock {
  itemCode: string;
  stockName: string;
  closePrice: string;
  marketValue?: string;
  marketValueHangeul?: string;
}

async function fetchMvPage(mkt: 'KOSPI' | 'KOSDAQ', page: number): Promise<MvStock[]> {
  const res = await fetch(`https://m.stock.naver.com/api/stocks/marketValue/${mkt}?page=${page}&pageSize=100`, {
    headers: UA,
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`naver mv ${mkt} p${page} ${res.status}`);
  const j = (await res.json()) as { stocks: MvStock[] };
  return j.stocks ?? [];
}

// 시총 상위 N(KOSPI+KOSDAQ 합산). 두 시장 각각 시총순이라, 넉넉히 받아 합쳐 다시 정렬.
export async function getTopByMarketCap(limit: number): Promise<Candidate[]> {
  const pagesPerMkt = Math.min(20, Math.ceil(limit / 100) + 4); // 여유분(코스닥 대형주가 끼도록)
  const fetchMkt = async (mkt: 'KOSPI' | 'KOSDAQ'): Promise<MvStock[]> => {
    const nums = Array.from({ length: pagesPerMkt }, (_, i) => i + 1);
    const out: MvStock[] = [];
    for (let i = 0; i < nums.length; i += 6) {
      const res = await Promise.allSettled(nums.slice(i, i + 6).map((p) => fetchMvPage(mkt, p)));
      res.forEach((r) => r.status === 'fulfilled' && out.push(...r.value));
    }
    return out;
  };
  const [kospi, kosdaq] = await Promise.all([fetchMkt('KOSPI'), fetchMkt('KOSDAQ')]);
  return [...kospi, ...kosdaq]
    .map((s) => ({
      code: s.itemCode,
      name: s.stockName,
      price: pnum(s.closePrice) ?? 0,
      marketCap: pnum(s.marketValue) ?? 0,
      marketCapText: s.marketValueHangeul ?? '',
    }))
    .filter((c) => c.code && c.marketCap > 0)
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, limit);
}

// KOSPI 전용 시총 상위 N(백테스트 유니버스 = KOSPI200 근사). 시장 단일이라 페이지만 순서대로 모은다.
export async function getTopKospi(limit: number): Promise<Candidate[]> {
  const pages = Math.ceil(limit / 100) + 1; // 여유 1페이지
  const out: MvStock[] = [];
  for (let i = 0; i < pages; i += 6) {
    const nums = Array.from({ length: Math.min(6, pages - i) }, (_, k) => i + k + 1);
    const res = await Promise.allSettled(nums.map((p) => fetchMvPage('KOSPI', p)));
    res.forEach((r) => r.status === 'fulfilled' && out.push(...r.value));
  }
  return out
    .map((s) => ({ code: s.itemCode, name: s.stockName, price: pnum(s.closePrice) ?? 0, marketCap: pnum(s.marketValue) ?? 0, marketCapText: s.marketValueHangeul ?? '' }))
    .filter((c) => c.code && c.marketCap > 0)
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, limit);
}

// 미국(나스닥+뉴욕) 시총 상위 N. code=심볼(AAPL 등, 야후/상세와 동일).
export async function getTopUsByMarketCap(limit: number): Promise<Candidate[]> {
  const pagesPerEx = Math.min(15, Math.ceil(limit / 100) + 3);
  const fetchEx = async (ex: 'NASDAQ' | 'NYSE'): Promise<Candidate[]> => {
    const out: Candidate[] = [];
    const get = async (p: number) => {
      const r = await fetch(`https://api.stock.naver.com/stock/exchange/${ex}/marketValue?page=${p}&pageSize=100`, { headers: UA, next: { revalidate: 3600 } });
      if (!r.ok) throw new Error(`${ex} p${p} ${r.status}`);
      return ((await r.json()).stocks ?? []) as (MvStock & { symbolCode?: string })[];
    };
    const nums = Array.from({ length: pagesPerEx }, (_, i) => i + 1);
    for (let i = 0; i < nums.length; i += 6) {
      const res = await Promise.allSettled(nums.slice(i, i + 6).map(get));
      res.forEach((rr) => {
        if (rr.status === 'fulfilled')
          out.push(
            ...rr.value.map((s) => ({
              code: s.symbolCode ?? s.itemCode,
              name: s.stockName,
              price: pnum(s.closePrice) ?? 0,
              marketCap: pnum(s.marketValue) ?? 0,
              marketCapText: s.marketValueHangeul ?? '',
            })),
          );
      });
    }
    return out;
  };
  const [nasdaq, nyse] = await Promise.all([fetchEx('NASDAQ'), fetchEx('NYSE')]);
  return [...nasdaq, ...nyse].filter((c) => c.code && c.marketCap > 0).sort((a, b) => b.marketCap - a.marketCap).slice(0, limit);
}

// 국내 재무제표(연간) — 실측 ROE·부채비율·이익률 + EPS/BPS/주당배당금(최근 실적연도) + 컨센서스 EPS.
export interface KrFinance {
  roe: number | null; // %
  netMargin: number | null; // 순이익률 %
  debtRatio: number | null; // 부채비율 %
  quickRatio: number | null; // 당좌비율
  eps: number | null;
  bps: number | null;
  dps: number | null; // 주당배당금
  fwdEps: number | null; // 컨센서스(추정) EPS
  roePrev: number | null; // 직전연도 ROE (전년比 비교용)
  netMarginPrev: number | null;
  debtRatioPrev: number | null;
}

export async function getKrFinance(code: string): Promise<KrFinance | null> {
  try {
    const r = await fetch(`https://m.stock.naver.com/api/stock/${code}/finance/annual`, { headers: UA, next: { revalidate: 3600 } });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      financeInfo?: {
        trTitleList?: { isConsensus?: string; key: string }[];
        rowList?: { title: string; columns: Record<string, { value?: string }> }[];
      };
    };
    const fi = j.financeInfo;
    const titles = fi?.trTitleList ?? [];
    const rows = fi?.rowList ?? [];
    if (!titles.length || !rows.length) return null;
    const actuals = titles.filter((t) => t.isConsensus !== 'Y').map((t) => t.key);
    const latest = actuals[actuals.length - 1];
    const prev = actuals[actuals.length - 2];
    const consensus = titles.filter((t) => t.isConsensus === 'Y').map((t) => t.key).pop();
    if (!latest) return null;
    const val = (title: string, key?: string) => {
      if (!key) return null;
      const row = rows.find((x) => x.title === title);
      return row ? pnum(row.columns[key]?.value) : null;
    };
    return {
      roe: val('ROE', latest),
      netMargin: val('순이익률', latest),
      debtRatio: val('부채비율', latest),
      quickRatio: val('당좌비율', latest),
      eps: val('EPS', latest),
      bps: val('BPS', latest),
      dps: val('주당배당금', latest),
      fwdEps: val('EPS', consensus),
      roePrev: val('ROE', prev),
      netMarginPrev: val('순이익률', prev),
      debtRatioPrev: val('부채비율', prev),
    };
  } catch {
    return null;
  }
}

// 국내 K-리서치용 다년 재무 시계열(실적연도만) + 업종. 재무제표 annual 엔드포인트 재사용.
export interface KrTrendYear {
  year: number; // 예 2025
  revenue: number | null; // 억원
  netIncome: number | null; // 억원
  operMargin: number | null; // %
  netMargin: number | null; // %
  roe: number | null; // %
  debtRatio: number | null; // %
  eps: number | null;
}
export interface KrResearch {
  sector: string | null;
  trend: KrTrendYear[]; // 오래된→최신
}

export async function getKrResearch(code: string): Promise<KrResearch | null> {
  try {
    const finR = await fetch(`https://m.stock.naver.com/api/stock/${code}/finance/annual`, { headers: UA, next: { revalidate: 3600 } });
    if (!finR.ok) return null;
    const j = (await finR.json()) as {
      financeInfo?: { trTitleList?: { isConsensus?: string; key: string }[]; rowList?: { title: string; columns: Record<string, { value?: string }> }[] };
    };
    const fi = j.financeInfo;
    const titles = fi?.trTitleList ?? [];
    const rows = fi?.rowList ?? [];
    if (!titles.length || !rows.length) return null;
    const actualKeys = titles.filter((t) => t.isConsensus !== 'Y').map((t) => t.key); // 실적연도만(추정 제외)
    const cell = (title: string, key: string) => {
      const row = rows.find((x) => x.title === title);
      return row ? pnum(row.columns[key]?.value) : null;
    };
    const trend: KrTrendYear[] = actualKeys.map((k) => ({
      year: Number(k.slice(0, 4)),
      revenue: cell('매출액', k),
      netIncome: cell('당기순이익', k),
      operMargin: cell('영업이익률', k),
      netMargin: cell('순이익률', k),
      roe: cell('ROE', k),
      debtRatio: cell('부채비율', k),
      eps: cell('EPS', k),
    }));

    // 네이버 integration은 업종'코드'만 주고 업종명 필드가 없어 KR 업종은 생략(null).
    return { sector: null, trend };
  } catch {
    return null;
  }
}

export interface Fundamentals {
  per: number | null;
  fwdPer: number | null;
  pbr: number | null;
  eps: number | null;
  fwdEps: number | null;
  bps: number | null;
  divYield: number | null; // 배당수익률 %
  dps: number | null; // 주당배당금
  targetPrice: number | null; // 컨센서스 목표주가
  recommMean: number | null; // 투자의견 — 주의: 네이버는 야후와 반대 스케일(높을수록 매수, 4≈매수). 표준(1=매수)으로 쓰려면 6-x 변환.
  hi52: number | null; // 52주 최고가
}

interface TotalInfo {
  key?: string;
  code?: string;
  value?: string;
}

// 종목 1개의 재무지표. 실패/미상장/데이터없음 시 null.
export async function getFundamentals(code: string): Promise<Fundamentals | null> {
  try {
    const res = await fetch(`https://m.stock.naver.com/api/stock/${code}/integration`, {
      headers: UA,
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { totalInfos?: TotalInfo[]; consensusInfo?: { priceTargetMean?: string; recommMean?: string } };
    const map = new Map<string, string>();
    (j.totalInfos ?? []).forEach((t) => {
      const k = t.key ?? t.code;
      if (k && t.value != null) map.set(k, t.value);
    });
    const get = (k: string) => pnum(map.get(k));
    return {
      per: get('PER'),
      fwdPer: get('추정PER'),
      pbr: get('PBR'),
      eps: get('EPS'),
      fwdEps: get('추정EPS'),
      bps: get('BPS'),
      divYield: get('배당수익률'),
      dps: get('주당배당금'),
      targetPrice: pnum(j.consensusInfo?.priceTargetMean),
      recommMean: pnum(j.consensusInfo?.recommMean),
      hi52: get('52주 최고'),
    };
  } catch {
    return null;
  }
}
