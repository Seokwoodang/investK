import 'server-only';
import type { MacroEvent } from '../../types';

// 경제 캘린더 = Nasdaq 경제지표 API(키 불필요). 미국·유로존·일본 등 글로벌 지표(한국 일정은 미제공).
// 고영향 지표만 화이트리스트로 추려 한글로 매핑. 실패 시 호출부가 mock(MACRO.events)로 폴백.
// api.nasdaq.com/api/calendar/economicevents?date=YYYY-MM-DD → data.rows[{gmt,country,eventName,previous,consensus}]

interface Row {
  gmt: string;
  country: string;
  eventName: string;
  previous?: string;
  consensus?: string;
}

// 이벤트명 정규식 → {한글명, 고영향, what=무엇·왜 중요, read=결과 해석(호재/악재 방향)}. 매칭 안 되면 제외.
const MAP: { re: RegExp; ko: string; high: boolean; what: string; read: string }[] = [
  { re: /FOMC.*Minutes/i, ko: 'FOMC 의사록', high: true, what: '미국 연준의 직전 통화정책 회의 논의 내용이 공개됩니다. 향후 금리 방향 힌트로 시장이 민감하게 반응합니다.', read: '금리 인하 쪽에 무게가 실리면 증시에 호재, 금리 인상 쪽이면 악재.' },
  { re: /FOMC|Federal Funds|Fed Interest Rate Decision/i, ko: 'FOMC 기준금리 결정', high: true, what: '미국 기준금리 결정 발표입니다. 글로벌 유동성·달러·위험자산 전반에 가장 큰 영향을 주는 일정입니다.', read: '동결·인하면 증시에 호재, 인상·추가 긴축 시사면 악재.' },
  { re: /Non.?Farm Payrolls/i, ko: '비농업 고용', high: true, what: '미국 비농업 부문 신규 고용 발표입니다. 경기·연준 금리 판단의 핵심 지표라 증시·환율이 크게 움직입니다.', read: '적당한 호조는 호재, 과열(예상 크게 상회)은 금리 인상 우려로 악재가 되기도 함.' },
  { re: /Core CPI/i, ko: '근원 CPI', high: true, what: '변동성 큰 식품·에너지를 뺀 근원 소비자물가입니다. 연준이 추세적 인플레이션을 볼 때 중시합니다.', read: '예상보다 낮으면 호재(완화 기대), 높으면 악재(긴축 우려).' },
  { re: /\bCPI\b/i, ko: 'CPI 소비자물가', high: true, what: '소비자물가 상승률 발표입니다. 인플레이션과 금리 정책의 핵심 근거가 됩니다.', read: '예상보다 낮으면 호재(완화 기대), 높으면 악재(긴축 우려).' },
  { re: /Core PCE|PCE Price/i, ko: 'PCE 물가지수', high: true, what: '연준이 가장 선호하는 물가 지표입니다. 금리 정책 경로를 가늠하는 핵심 발표입니다.', read: '예상보다 낮으면 호재, 높으면 악재.' },
  { re: /\bGDP\b/i, ko: 'GDP 성장률', high: true, what: '경제 성장 속도 발표입니다. 경기 강약과 기업 실적 전망의 바탕이 됩니다.', read: '예상보다 높으면 경기 호조로 호재, 크게 낮으면 둔화 우려로 악재.' },
  { re: /Unemployment Rate/i, ko: '실업률', high: true, what: '고용 시장 건전성을 보여주는 발표입니다. 연준의 고용·금리 판단에 직접 영향을 줍니다.', read: '예상보다 낮으면 고용 견조로 호재, 높으면 경기 둔화로 악재.' },
  { re: /(ECB|Deposit|Main Refinancing).*(Rate|Decision)|Interest Rate Decision/i, ko: '기준금리 결정', high: true, what: '중앙은행의 정책금리 결정 발표입니다. 해당 통화·채권·증시에 직접 영향을 줍니다.', read: '인하·동결이면 증시에 호재, 인상이면 악재.' },
  { re: /\bPPI\b/i, ko: 'PPI 생산자물가', high: false, what: '생산자(기업) 물가 발표입니다. 소비자물가에 선행하는 인플레이션 신호로 봅니다.', read: '예상보다 낮으면 호재, 높으면 악재.' },
  { re: /Retail Sales/i, ko: '소매판매', high: false, what: '소비 경기를 가늠하는 발표입니다. 내수·기업 매출 전망에 영향을 줍니다.', read: '예상보다 높으면 소비 호조로 호재, 낮으면 악재.' },
  { re: /ISM/i, ko: 'ISM 지수', high: false, what: '제조업·서비스업 체감 경기 지수입니다. 50을 기준으로 확장/위축을 판단합니다.', read: '50 이상·예상 상회면 호재, 50 미만·하회면 악재.' },
  { re: /Initial Jobless Claims/i, ko: '신규 실업수당 청구', high: false, what: '주간 신규 실업수당 청구 건수입니다. 고용 흐름을 빠르게 보여주는 지표입니다.', read: '예상보다 적으면 고용 견조로 호재, 많으면 악재.' },
  { re: /(Powell|Fed Chair|Fed.*Speaks|Buba President.*Speaks|ECB President)/i, ko: '중앙은행 인사 발언', high: false, what: '중앙은행 주요 인사의 발언 일정입니다. 정책 방향 시그널이 나오면 시장이 반응합니다.', read: '금리 인하·완화를 시사하면 호재, 금리 인상·긴축을 시사하면 악재.' },
  { re: /Durable Goods/i, ko: '내구재 주문', high: false, what: '내구재(기계·장비 등) 주문 발표입니다. 기업 투자·제조 수요의 가늠자입니다.', read: '예상보다 높으면 호재, 낮으면 악재.' },
  { re: /(Consumer Confidence|Michigan)/i, ko: '소비자심리지수', high: false, what: '가계 소비 심리 지수입니다. 향후 소비 지출 흐름을 예측하는 데 쓰입니다.', read: '예상보다 높으면 호재, 낮으면 악재.' },
];

const COUNTRY: Record<string, string> = {
  'United States': '美', 'Euro Zone': '유로존', Germany: '독일', Japan: '日',
  'United Kingdom': '英', Canada: '캐나다', China: '中', France: '프랑스',
};

const UA = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// GMT "HH:MM" → KST "HH:MM" (+9h).
function toKst(gmt: string): string {
  const m = gmt?.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return gmt || '';
  const h = (parseInt(m[1], 10) + 9) % 24;
  return `${pad(h)}:${m[2]}`;
}

const cache = new Map<string, { at: number; data: MacroEvent[] }>();
const CACHE_MS = 3600 * 1000; // 1시간

// 날짜 하루치 Nasdaq 경제지표를 가져와 화이트리스트 매핑된 MacroEvent 배열로 변환.
async function fetchDay(date: string): Promise<MacroEvent[]> {
  try {
    const r = await fetch(`https://api.nasdaq.com/api/calendar/economicevents?date=${date}`, { headers: UA });
    if (!r.ok) return [];
    const j = (await r.json()) as { data?: { rows?: Row[] } };
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
      const nums = previous || consensus ? ` (직전 ${previous ?? '–'} · 시장 예상 ${consensus ?? '–'})` : '';
      out.push({
        date,
        time: toKst(row.gmt) || '미정',
        name,
        tag: hit.high ? '고영향' : '중간',
        rel: { title: row.eventName, src: 'Nasdaq' },
        desc: `${hit.what}${nums}`,
        interpret: hit.read,
        previous,
        consensus,
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
  const all = (await Promise.all(dates.map(fetchDay))).flat();
  all.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  if (all.length) cache.set(key, { at: Date.now(), data: all });
  return all;
}

// 오늘부터 N일치(대시보드 기본 일정 목록·달력의 "현재 달" 근방).
export async function getEconomicCalendar(days = 12): Promise<MacroEvent[]> {
  const base = new Date();
  const dates = Array.from({ length: days }, (_, i) => ymd(new Date(base.getTime() + i * 86400000)));
  return fetchDates(`next:${days}`, dates);
}

// 임의 월 전체(달력 월 이동 시 on-demand). month는 0-indexed.
export async function getMonthCalendar(year: number, month: number): Promise<MacroEvent[]> {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => `${year}-${pad(month + 1)}-${pad(i + 1)}`);
  return fetchDates(`month:${year}-${pad(month + 1)}`, dates);
}
