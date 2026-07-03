import 'server-only';

// SEC EDGAR — 미국 상장사 "원천" 재무제표(회사가 직접 제출한 10-K XBRL). 키 불필요.
// K-리서치의 재무 시계열(매출·순이익·EPS·영업현금흐름·CAPEX→FCF·자산·자본)을 여기서 받는다.
// 컨센서스·목표가·투자의견·현재가·밸류에이션 배수는 EDGAR에 없어 야후로 보완(하이브리드).
// SEC 요구사항: User-Agent에 연락처 명시, 초당 호출 제한 → 종목별 하루 캐시(revalidate=86400).

const UA = { 'User-Agent': 'investkang/1.0 (contact: swkang@parametacorp.com)' };
const DAY = 86400;

// ── ticker → CIK(10자리) 매핑. 한 번 받아 메모리에 캐시. ──
let cikMap: Map<string, string> | null = null;
let cikAt = 0;

async function loadCikMap(): Promise<Map<string, string> | null> {
  if (cikMap && Date.now() - cikAt < DAY * 1000) return cikMap;
  try {
    const r = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: UA, next: { revalidate: DAY } });
    if (!r.ok) return cikMap;
    const j = (await r.json()) as Record<string, { cik_str: number; ticker: string }>;
    const m = new Map<string, string>();
    for (const v of Object.values(j)) {
      if (v.ticker) m.set(v.ticker.toUpperCase(), String(v.cik_str).padStart(10, '0'));
    }
    cikMap = m;
    cikAt = Date.now();
    return m;
  } catch {
    return cikMap;
  }
}

export interface FinYear {
  year: number;
  revenue: number | null;
  netIncome: number | null;
  eps: number | null; // 희석 EPS
  ocf: number | null; // 영업활동 현금흐름
  capex: number | null;
  fcf: number | null; // ocf - capex
  netMargin: number | null; // %
  assets: number | null;
  equity: number | null;
  liabilities: number | null;
}

export interface EdgarFinance {
  cik: string;
  years: FinYear[]; // 오래된→최신 순, 최대 5개
  fiscalYearEnd: string | null; // 최근 회계연도(예 "2025")
}

interface FactUnit {
  form?: string;
  frame?: string;
  val: number;
}

// 특정 태그(들)에서 연간 전사 값만 추출: form=10-K + frame이 "CY####"(분기·세그먼트 제외).
// 여러 태그 후보를 "병합"한다(첫 태그 우선, 이후 태그로 빈 연도만 채움).
// 단일 태그만 보면 회사가 중간에 태그를 바꾼 경우 특정 연도가 통째로 비어버린다.
//   예) PLTR: NetIncomeLoss는 2018~2020만, 2021~ 는 ProfitLoss로 신고 → 병합해야 전 연도가 채워짐.
function annualSeries(gaap: Record<string, { units?: Record<string, FactUnit[]> }>, tags: string[]): Record<number, number> {
  const m: Record<number, number> = {};
  for (const t of tags) {
    const arr = gaap[t]?.units?.USD ?? gaap[t]?.units?.['USD/shares'];
    if (!arr) continue;
    for (const x of arr) {
      if (x.form !== '10-K' || !x.frame || !/^CY\d{4}$/.test(x.frame)) continue;
      const y = Number(x.frame.slice(2));
      if (m[y] === undefined) m[y] = x.val; // 먼저 나온(우선순위 높은) 태그가 이긴다
    }
  }
  return m;
}

// companyfacts JSON은 수 MB라 Next fetch 캐시(항목당 2MB 한도)에 안 들어간다 →
// 파싱 결과(작은 객체)를 모듈 메모리에 하루 캐시해 탭 열 때마다 수 MB 재다운로드를 방지.
const memFin = new Map<string, { at: number; fin: EdgarFinance | null }>();

// 미국 종목 심볼의 EDGAR 연간 재무. 미상장/해외기업(ADR 등 CIK 없음)/실패 시 null.
export async function getEdgarFinance(symbol: string): Promise<EdgarFinance | null> {
  const hit = memFin.get(symbol);
  if (hit && Date.now() - hit.at < DAY * 1000) return hit.fin;
  const fin = await fetchEdgarFinance(symbol);
  // 실패(null)는 짧게만 기억되도록 저장하지 않음 — 다음 요청에서 재시도.
  if (fin) memFin.set(symbol, { at: Date.now(), fin });
  return fin;
}

async function fetchEdgarFinance(symbol: string): Promise<EdgarFinance | null> {
  const map = await loadCikMap();
  const cik = map?.get(symbol.toUpperCase());
  if (!cik) return null;
  try {
    const r = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers: UA, next: { revalidate: DAY } });
    if (!r.ok) return null;
    const j = (await r.json()) as { facts?: { 'us-gaap'?: Record<string, { units?: Record<string, FactUnit[]> }> } };
    const g = j.facts?.['us-gaap'];
    if (!g) return null;

    const rev = annualSeries(g, ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenuesNetOfInterestExpense']);
    // 순이익: 지배주주 귀속(NetIncomeLoss/…AvailableToCommon) 우선, 없으면 총 순이익(ProfitLoss)로 채움.
    const ni = annualSeries(g, ['NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLoss']);
    const eps = annualSeries(g, ['EarningsPerShareDiluted', 'EarningsPerShareBasic']);
    const ocf = annualSeries(g, ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations']);
    const capex = annualSeries(g, ['PaymentsToAcquirePropertyPlantAndEquipment']);
    const assets = annualSeries(g, ['Assets']);
    const equity = annualSeries(g, ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']);
    const liab = annualSeries(g, ['Liabilities']);

    // 매출 기준으로 대상 연도 결정(최근 5개).
    const yrs = Object.keys(rev).map(Number).sort((a, b) => a - b).slice(-5);
    if (!yrs.length) return null;

    const years: FinYear[] = yrs.map((y) => {
      const revenue = rev[y] ?? null;
      const netIncome = ni[y] ?? null;
      const o = ocf[y] ?? null;
      const c = capex[y] ?? null;
      const fcf = o != null && c != null ? o - c : null;
      const netMargin = revenue && netIncome != null && revenue !== 0 ? +((netIncome / revenue) * 100).toFixed(1) : null;
      return {
        year: y, revenue, netIncome, eps: eps[y] ?? null, ocf: o, capex: c, fcf, netMargin,
        assets: assets[y] ?? null, equity: equity[y] ?? null, liabilities: liab[y] ?? null,
      };
    });

    return { cik, years, fiscalYearEnd: String(yrs[yrs.length - 1]) };
  } catch {
    return null;
  }
}
