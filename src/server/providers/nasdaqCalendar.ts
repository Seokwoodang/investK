import 'server-only';
import type { MacroEvent } from '../../types';

// 경제 캘린더 = Nasdaq 경제지표 API(키 불필요). 미국·유로존·일본 + 한국(금통위·CPI·GDP 등) 글로벌 지표.
// 고영향 지표만 화이트리스트로 추려 한글로 매핑. 실패 시 호출부가 mock(MACRO.events)로 폴백.
// api.nasdaq.com/api/calendar/economicevents?date=YYYY-MM-DD → data.rows[{gmt,country,eventName,previous,consensus}]

interface Row {
  gmt: string;
  country: string;
  eventName: string;
  previous?: string;
  consensus?: string;
  actual?: string;
}

// 이벤트명 정규식 → {한글명, 고영향, what=무엇·왜 중요, read=결과 해석(호재/악재 방향)}.
// good='low'|'high' = 실제값이 예상보다 낮을/높을 때가 호재인 방향(결과 판정용). 애매하면 생략.
const MAP: { re: RegExp; ko: string; high: boolean; what: string; read: string; good?: 'low' | 'high' }[] = [
  { re: /FOMC.*Minutes/i, ko: 'FOMC 의사록', high: true, what: '미국 연준의 직전 통화정책 회의 논의 내용이 공개됩니다. 향후 금리 방향 힌트로 시장이 민감하게 반응합니다.', read: '금리 인하 쪽에 무게가 실리면 증시에 호재, 금리 인상 쪽이면 악재.' },
  { re: /FOMC|Federal Funds|Fed Interest Rate Decision/i, ko: 'FOMC 기준금리 결정', high: true, what: '미국 기준금리 결정 발표입니다. 글로벌 유동성·달러·위험자산 전반에 가장 큰 영향을 주는 일정입니다.', read: '동결·인하면 증시에 호재, 인상·추가 긴축 시사면 악재.', good: 'low' },
  { re: /Non.?Farm Payrolls/i, ko: '비농업 고용', high: true, what: '미국 비농업 부문 신규 고용 발표입니다. 경기·연준 금리 판단의 핵심 지표라 증시·환율이 크게 움직입니다.', read: '적당한 호조는 호재, 과열(예상 크게 상회)은 금리 인상 우려로 악재가 되기도 함.' },
  { re: /Core CPI/i, ko: '근원 CPI', high: true, what: '변동성 큰 식품·에너지를 뺀 근원 소비자물가입니다. 연준이 추세적 인플레이션을 볼 때 중시합니다.', read: '예상보다 낮으면 호재(완화 기대), 높으면 악재(긴축 우려).', good: 'low' },
  { re: /\bCPI\b/i, ko: 'CPI 소비자물가', high: true, what: '소비자물가 상승률 발표입니다. 인플레이션과 금리 정책의 핵심 근거가 됩니다.', read: '예상보다 낮으면 호재(완화 기대), 높으면 악재(긴축 우려).', good: 'low' },
  { re: /Core PCE|PCE Price/i, ko: 'PCE 물가지수', high: true, what: '연준이 가장 선호하는 물가 지표입니다. 금리 정책 경로를 가늠하는 핵심 발표입니다.', read: '예상보다 낮으면 호재, 높으면 악재.', good: 'low' },
  { re: /\bGDP\b/i, ko: 'GDP 성장률', high: true, what: '경제 성장 속도 발표입니다. 경기 강약과 기업 실적 전망의 바탕이 됩니다.', read: '예상보다 높으면 경기 호조로 호재, 크게 낮으면 둔화 우려로 악재.', good: 'high' },
  { re: /Unemployment Rate/i, ko: '실업률', high: true, what: '고용 시장 건전성을 보여주는 발표입니다. 연준의 고용·금리 판단에 직접 영향을 줍니다.', read: '예상보다 낮으면 고용 견조로 호재, 높으면 경기 둔화로 악재.', good: 'low' },
  { re: /(ECB|Deposit|Main Refinancing).*(Rate|Decision)|Interest Rate Decision/i, ko: '기준금리 결정', high: true, what: '중앙은행의 정책금리 결정 발표입니다. 해당 통화·채권·증시에 직접 영향을 줍니다.', read: '인하·동결이면 증시에 호재, 인상이면 악재.', good: 'low' },
  { re: /\bPPI\b/i, ko: 'PPI 생산자물가', high: false, what: '생산자(기업) 물가 발표입니다. 소비자물가에 선행하는 인플레이션 신호로 봅니다.', read: '예상보다 낮으면 호재, 높으면 악재.', good: 'low' },
  { re: /Retail Sales/i, ko: '소매판매', high: false, what: '소비 경기를 가늠하는 발표입니다. 내수·기업 매출 전망에 영향을 줍니다.', read: '예상보다 높으면 소비 호조로 호재, 낮으면 악재.', good: 'high' },
  { re: /ISM/i, ko: 'ISM 지수', high: false, what: '제조업·서비스업 체감 경기 지수입니다. 50을 기준으로 확장/위축을 판단합니다.', read: '50 이상·예상 상회면 호재, 50 미만·하회면 악재.', good: 'high' },
  { re: /Initial Jobless Claims/i, ko: '신규 실업수당 청구', high: false, what: '주간 신규 실업수당 청구 건수입니다. 고용 흐름을 빠르게 보여주는 지표입니다.', read: '예상보다 적으면 고용 견조로 호재, 많으면 악재.', good: 'low' },
  { re: /(Powell|Fed Chair|Fed.*Speaks|Buba President.*Speaks|ECB President)/i, ko: '중앙은행 인사 발언', high: false, what: '중앙은행 주요 인사의 발언 일정입니다. 정책 방향 시그널이 나오면 시장이 반응합니다.', read: '금리 인하·완화를 시사하면 호재, 금리 인상·긴축을 시사하면 악재.' },
  { re: /Durable Goods/i, ko: '내구재 주문', high: false, what: '내구재(기계·장비 등) 주문 발표입니다. 기업 투자·제조 수요의 가늠자입니다.', read: '예상보다 높으면 호재, 낮으면 악재.', good: 'high' },
  { re: /(Consumer Confidence|Michigan)/i, ko: '소비자심리지수', high: false, what: '가계 소비 심리 지수입니다. 향후 소비 지출 흐름을 예측하는 데 쓰입니다.', read: '예상보다 높으면 호재, 낮으면 악재.', good: 'high' },
];

// "0.2%"·"336.12"·"-1.3%"·" " → 숫자 or null.
function toNum(s?: string): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

const COUNTRY: Record<string, string> = {
  'United States': '美', 'Euro Zone': '유로존', Germany: '독일', Japan: '日',
  'United Kingdom': '英', Canada: '캐나다', China: '中', France: '프랑스',
  'South Korea': '韓',
};

const UA = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };
const pad = (n: number) => String(n).padStart(2, '0');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Nasdaq은 버스트(월 뷰=수십 건 동시)에 빈 응답/차단으로 응수 → 동시성 제한 + 1회 재시도.
// 과거엔 무제한 동시 호출이라 일부 날짜가 조용히 빠졌음(韓 금통위 누락 등으로 발견).
async function mapPool(dates: string[], n: number, fn: (d: string) => Promise<MacroEvent[]>): Promise<MacroEvent[]> {
  const out: MacroEvent[][] = new Array(dates.length);
  let i = 0;
  const worker = async () => {
    while (i < dates.length) {
      const idx = i++;
      out[idx] = await fn(dates[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, dates.length) }, worker));
  return out.flat();
}

// JSON fetch + 실패(차단·빈 응답 포함) 시 1회 재시도.
async function fetchRows<T>(url: string): Promise<T | null> {
  for (let att = 0; att < 2; att++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as T; // 빈 바디면 여기서 throw → 재시도
    } catch {
      if (att === 0) await sleep(500 + Math.random() * 700);
    }
  }
  return null;
}
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// GMT "HH:MM" + 날짜 → KST {date, time}. +9h로 자정을 넘으면 날짜도 +1일 롤오버.
// 과거 버그: 시각만 (h+9)%24 하고 날짜는 GMT 그대로 써서, GMT 15:00 이후 이벤트
// (FOMC 19:00 GMT = KST 익일 04:00 등)가 하루 전 날짜로 표시되고 "오늘 이후" 필터에서 누락됐음.
function toKstDateTime(gmtDate: string, gmtTime: string): { date: string; time: string } {
  const m = gmtTime?.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return { date: gmtDate, time: gmtTime || '' };
  const h = parseInt(m[1], 10) + 9;
  if (h < 24) return { date: gmtDate, time: `${pad(h)}:${m[2]}` };
  const [y, mo, d] = gmtDate.split('-').map(Number);
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  return { date: ymd(next), time: `${pad(h - 24)}:${m[2]}` };
}

// 한국(South Korea) 행 전용: Nasdaq의 한국 이벤트는 GMT+9 규칙이 안 맞는다(하루 밀림).
// 실측 5종(CPI·고용 08:00, PMI 09:30, 금통위 ~10:00, M2 12:00, 외환보유액 06:00 KST) 전부
// "page date = KST 날짜 그대로, KST 시각 = gmt필드 + 13h" 로 일관 → 그 규칙으로 변환한다.
// (겨울철 ±1h 오차 가능성은 있으나 발표가 모두 오전대라 날짜는 안전. 날짜 정확성이 우선.)
function toKstKorea(pageDate: string, gmtTime: string): { date: string; time: string } {
  const m = gmtTime?.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return { date: pageDate, time: gmtTime || '' };
  const h = (parseInt(m[1], 10) + 13) % 24;
  return { date: pageDate, time: `${pad(h)}:${m[2]}` };
}

// ── 실적 발표 캘린더(미국) — 같은 Nasdaq API의 earnings 엔드포인트. ──
// 하루 수십~수백 건이라 시총 대형주만 추려 달력 노이즈를 막는다. 국내는 마땅한 무료 소스가 없어 미제공.
interface EarnRow {
  symbol?: string;
  name?: string;
  marketCap?: string; // "$9,422,608,150"
  time?: string; // time-pre-market | time-after-hours | time-not-supplied
  epsForecast?: string; // "$0.24"
  lastYearEPS?: string;
  fiscalQuarterEnding?: string; // "May/2026"
}
const EARN_MIN_CAP = 100e9; // $1,000억(=$100B) 이상 대형주만
const EARN_MAX_PER_DAY = 4;

async function fetchEarningsDay(date: string): Promise<MacroEvent[]> {
  try {
    const j = await fetchRows<{ data?: { rows?: EarnRow[] } }>(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`);
    if (!j) return [];
    const rows = (j?.data?.rows ?? [])
      .map((row) => ({ ...row, cap: Number((row.marketCap ?? '').replace(/[^0-9]/g, '')) || 0 }))
      .filter((row) => row.symbol && row.cap >= EARN_MIN_CAP)
      .sort((a, b) => b.cap - a.cap)
      .slice(0, EARN_MAX_PER_DAY);

    return rows.map((row) => {
      // 발표 시점을 KST 감각으로: 美 개장 전(프리마켓) ≈ 같은 날 저녁 KST, 장 마감 후 ≈ 다음 날 새벽 KST.
      const after = row.time === 'time-after-hours';
      const [y, m, d] = date.split('-').map(Number);
      const kstDate = after ? ymd(new Date(Date.UTC(y, m - 1, d + 1))) : date;
      const time = after ? '새벽(美 장 마감 후)' : row.time === 'time-pre-market' ? '저녁(美 개장 전)' : '시간 미정';
      const capB = `$${Math.round(row.cap / 1e9).toLocaleString('en-US')}B`;
      const forecast = (row.epsForecast ?? '').trim() || undefined;
      const lastYear = (row.lastYearEPS ?? '').trim() || undefined;
      return {
        date: kstDate,
        time,
        name: `${row.symbol} 실적 발표`,
        symbol: row.symbol, // 보유·관심 종목 매칭용
        region: 'overseas' as const, // 실적 캘린더는 미국 대형주만
        tag: '실적' as const,
        rel: { title: row.name ?? row.symbol!, src: 'Nasdaq' },
        desc: `${row.name}(${row.symbol})의 분기 실적 발표입니다(${row.fiscalQuarterEnding ?? '-'} 분기 마감 · 시총 ${capB}).${lastYear ? ` 전년 동기 EPS ${lastYear}.` : ''}`,
        interpret: '발표 EPS·가이던스가 시장 예상(컨센서스)을 웃돌면 호재, 밑돌면 악재로 반응하는 경우가 많습니다.',
        consensus: forecast, // 예상 EPS — 발표 전 미리보기로 표시
      };
    });
  } catch {
    return [];
  }
}

const cache = new Map<string, { at: number; data: MacroEvent[] }>();
const CACHE_MS = 3600 * 1000; // 1시간

// 날짜 하루치 Nasdaq 경제지표를 가져와 화이트리스트 매핑된 MacroEvent 배열로 변환.
async function fetchDay(date: string): Promise<MacroEvent[]> {
  try {
    const j = await fetchRows<{ data?: { rows?: Row[] } }>(`https://api.nasdaq.com/api/calendar/economicevents?date=${date}`);
    if (!j) return [];
    const rows = j?.data?.rows ?? [];
    const out: MacroEvent[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const hit = MAP.find((m) => m.re.test(row.eventName || ''));
      if (!hit) continue;
      const prefix = COUNTRY[row.country];
      if (!prefix) continue; // 주요국만
      const name = `${prefix} ${hit.ko}`;
      if (seen.has(name)) continue;
      seen.add(name);
      // 직전치·예상치 정리(&nbsp;·빈값 제외)
      const num = (s?: string) => {
        const v = (s ?? '').replace(/&nbsp;|&#160;/g, '').trim();
        return v || undefined;
      };
      const previous = num(row.previous);
      const consensus = num(row.consensus);
      const actual = num(row.actual);

      // 발표 후: 실제값 vs 예상 비교 → 상회/부합/하회 + (지표 방향을 알면) 호재/악재 판정.
      let surprise: MacroEvent['surprise'];
      let resultImpact: MacroEvent['resultImpact'];
      const a = toNum(actual);
      const c = toNum(consensus);
      if (a != null && c != null) {
        surprise = a > c ? 'above' : a < c ? 'below' : 'inline';
        if (surprise === 'inline') resultImpact = '중립';
        else if (hit.good) resultImpact = (surprise === 'below') === (hit.good === 'low') ? '호재' : '악재';
      }

      const isKr = row.country === 'South Korea';
      const kst = isKr ? toKstKorea(date, row.gmt) : toKstDateTime(date, row.gmt);
      out.push({
        date: kst.date,
        time: kst.time || '미정',
        name,
        region: isKr ? 'kr' : 'overseas',
        tag: hit.high ? '고영향' : '중간',
        rel: { title: row.eventName, src: 'Nasdaq' },
        desc: hit.what,
        interpret: hit.read,
        previous,
        consensus,
        actual,
        surprise,
        resultImpact,
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchDates(key: string, dates: string[]): Promise<MacroEvent[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  // 경제지표 + 대형주 실적 발표를 함께 수집. (동시성 제한 — 무제한이면 Nasdaq이 드롭/차단)
  const [eco, earn] = await Promise.all([mapPool(dates, 5, fetchDay), mapPool(dates, 3, fetchEarningsDay)]);
  const all = [...eco, ...earn];
  all.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  if (all.length) cache.set(key, { at: Date.now(), data: all });
  return all;
}

// 최근 과거 back일 ~ 미래 fwd일(대시보드 일정 목록). 과거를 포함해야 이미 발표된 지표가
// '결과'와 함께 목록에 남는다(과거엔 미래만 불러와 발표 즉시 목록에서 사라졌음).
export async function getEconomicCalendar(back = 4, fwd = 12): Promise<MacroEvent[]> {
  const base = new Date();
  const dates = Array.from({ length: back + fwd }, (_, i) => ymd(new Date(base.getTime() + (i - back) * 86400000)));
  return fetchDates(`win:${back}:${fwd}`, dates);
}

// 임의 월 전체(달력 월 이동 시 on-demand). month는 0-indexed.
export async function getMonthCalendar(year: number, month: number): Promise<MacroEvent[]> {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => `${year}-${pad(month + 1)}-${pad(i + 1)}`);
  return fetchDates(`month:${year}-${pad(month + 1)}`, dates);
}
