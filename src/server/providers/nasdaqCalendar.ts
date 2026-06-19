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

// 이벤트명 정규식 → {한글명, 고영향 여부}. 매칭 안 되면 제외(주요 일정만).
const MAP: { re: RegExp; ko: string; high: boolean }[] = [
  { re: /FOMC.*Minutes/i, ko: 'FOMC 의사록', high: true },
  { re: /FOMC|Federal Funds|Fed Interest Rate Decision/i, ko: 'FOMC 기준금리 결정', high: true },
  { re: /Non.?Farm Payrolls/i, ko: '비농업 고용', high: true },
  { re: /Core CPI/i, ko: '근원 CPI', high: true },
  { re: /\bCPI\b/i, ko: 'CPI 소비자물가', high: true },
  { re: /Core PCE|PCE Price/i, ko: 'PCE 물가지수', high: true },
  { re: /\bGDP\b/i, ko: 'GDP 성장률', high: true },
  { re: /Unemployment Rate/i, ko: '실업률', high: true },
  { re: /(ECB|Deposit|Main Refinancing).*(Rate|Decision)|Interest Rate Decision/i, ko: '기준금리 결정', high: true },
  { re: /\bPPI\b/i, ko: 'PPI 생산자물가', high: false },
  { re: /Retail Sales/i, ko: '소매판매', high: false },
  { re: /ISM/i, ko: 'ISM 지수', high: false },
  { re: /Initial Jobless Claims/i, ko: '신규 실업수당 청구', high: false },
  { re: /(Powell|Fed Chair|Fed.*Speaks|Buba President.*Speaks|ECB President)/i, ko: '중앙은행 인사 발언', high: false },
  { re: /Durable Goods/i, ko: '내구재 주문', high: false },
  { re: /(Consumer Confidence|Michigan)/i, ko: '소비자심리지수', high: false },
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

let cache: { at: number; data: MacroEvent[] } | null = null;
const CACHE_MS = 3600 * 1000; // 1시간

export async function getEconomicCalendar(days = 12): Promise<MacroEvent[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  const base = new Date();
  const dates = Array.from({ length: days }, (_, i) => ymd(new Date(base.getTime() + i * 86400000)));

  const perDay = await Promise.all(
    dates.map(async (date) => {
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
          out.push({
            date,
            time: toKst(row.gmt) || '미정',
            name,
            tag: hit.high ? '고영향' : '중간',
            rel: { title: row.eventName, src: 'Nasdaq' },
          });
        }
        return out;
      } catch {
        return [];
      }
    }),
  );

  const all = perDay.flat();
  // 고영향 우선 + 날짜/시간 정렬, 너무 많으면 상위로 제한.
  all.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  if (all.length) cache = { at: Date.now(), data: all };
  return all;
}
