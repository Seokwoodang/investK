import 'server-only';
import { BRIEFING } from '@/data';
import { getOrGenerateJSON, readJSONCache } from '@/server/ai';
import { getDashboardData } from '@/server/data';
import { TAB_LABELS, type BriefingDay } from '@/types';

// 데일리 브리핑은 전부 Claude가 실시장 데이터로 생성해 Supabase(ai_cache)에 저장한다.
// 하루에 여러 번(슬롯) 생성하고 덮어쓰지 않고 따로 보관한다:
//   am = 오전 6시(KST) 국내장 개장 전 / pm = 오후 5시(KST) 국내장 마감 후 / ny = 오후 10시(KST) 뉴욕장 개장 전
// 화면(데일리 탭)은 그날의 "가장 최신 슬롯"을 보여주고, 아직 cron이 안 돈 콜드 상태면 현재 시각 슬롯을 1회 생성한다.

export type Slot = 'am' | 'pm' | 'ny';
export const SLOTS: Slot[] = ['am', 'pm', 'ny'];
export const SLOT_LABEL: Record<Slot, string> = {
  am: '오전 브리핑 · 국내장 개장 전 (06:00 KST)',
  pm: '오후 브리핑 · 국내장 마감 후 (17:00 KST)',
  ny: '저녁 브리핑 · 뉴욕장 개장 전 (22:00 KST)',
};

// 서버는 UTC. KST(=UTC+9)의 연·월·일·시를 구한다.
function kstParts(): { date: string; hour: number } {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const date = `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')}`;
  return { date, hour: k.getUTCHours() };
}

// 현재 KST 시각이 속한 슬롯. (cron이 어떤 시각에 호출돼도 자동 분류)
export function currentSlot(hour: number): Slot {
  if (hour < 12) return 'am';
  if (hour < 21) return 'pm';
  return 'ny';
}

const SYSTEM =
  '너는 한국어로 답하는 시장 브리핑 작성자다. 의견·전망 없이 사실·수치·인과만 정리한다. ' +
  'JSON만 출력(코드펜스 금지). 형식: {"headline":"한 줄 요약","facts":[{"k":"지수|환율|코인","t":"문장"}],' +
  '"causes":[["원인","과정","결과"]],"byAsset":[{"label":"국내주식","line":"한 줄","dir":"up|down|flat"}],' +
  '"checkpoints":[{"when":"오늘 21:30","name":"이벤트명","tag":"고영향|중간"}]}. ' +
  'facts 3개, causes 2~3개, byAsset는 정확히 4개(국내주식·해외주식·국내코인·해외코인 순), 투자 권유 금지. ' +
  'headline 원칙: 제공된 수치 중 그 시점 가장 크게 움직였거나 중요한 것 하나를 중심으로 쓴다(지수·업종·코인·VIX·금리·일정 등 무엇이든). ' +
  '환율은 변동률이 ±0.7% 이상으로 클 때만 헤드라인 소재로 쓰고, 그 외에는 headline에 넣지 않는다(매번 환율로 시작하는 획일화 금지).';

function buildPrompt(date: string, slot: Slot) {
  return async () => {
    const data = await getDashboardData({ withUniverse: true }); // 브리핑은 자산군 집계가 필요 → 유니버스 포함
    // 자산군 등락은 반드시 실데이터 집계(assetSummary = 전체 유니버스 기준)를 쓴다.
    // 과거 버그: data.stocks(정적 큐레이션 샘플, 등락률 고정)를 써서 매일 같은 가짜 수치로 브리핑이 생성됐음.
    const fmt = (n: number) => (n > 0 ? '+' : '') + n.toFixed(2) + '%';
    const summaries = TAB_LABELS.map((t) => {
      const s = data.assetSummary[t.id];
      const top = s.top ? `, 상위 ${s.top.name} ${fmt(s.top.pct)}` : '';
      return `- ${t.label}: ${s.count}종목 평균 ${fmt(s.avgPct)}${top}`;
    }).join('\n');
    const fx = data.macro.fx.map((r) => `${r.pair} ${r.val}(${r.chg > 0 ? '+' : ''}${r.chg}%)`).join(', ');
    const indices = data.macro.indices.map((r) => `${r.name} ${r.val}(${r.chg > 0 ? '+' : ''}${r.chg}%)`).join(', ');
    // 시장지표(VIX·크립토 심리·김프) — 헤드라인 소재를 환율·지수 외로도 다양화.
    const mk = data.macro.market;
    const gauges = mk
      ? [mk.vix, mk.cryptoFng, mk.kimchi]
          .filter(Boolean)
          .map((g) => `${g!.label} ${g!.value}${g!.sub ? `(${g!.sub})` : ''}${g!.chg != null ? ` 전일 ${g!.chg > 0 ? '+' : ''}${g!.chg}%` : ''}`)
          .join(', ')
      : '';
    const events = data.macro.events
      .filter((e) => e.date >= date)
      .slice(0, 4)
      .map((e) => `${e.date} ${e.time} ${e.name} [${e.tag}]`)
      .join('\n');
    const when = SLOT_LABEL[slot];
    return `시점: ${when}\n날짜: ${date}\n지수: ${indices}\n환율: ${fx}\n${gauges ? `시장지표: ${gauges}\n` : ''}자산군 등락:\n${summaries}\n예정 일정:\n${events}\n\n위 실데이터로 이 시점 기준 팩트 브리핑을 JSON으로 작성해줘. 제공된 수치만 인용하고 없는 수치는 지어내지 마.`;
  };
}

function fallbackFor(date: string): BriefingDay {
  const dates = Object.keys(BRIEFING).sort();
  return BRIEFING[date] ?? BRIEFING[dates[dates.length - 1]];
}

// cron: 현재 KST 시각의 슬롯을 강제 재생성(기존 슬롯은 그대로 두고 새 슬롯 저장 = 덮어쓰지 않음).
export async function refreshBriefing(): Promise<{ date: string; slot: Slot }> {
  const { date, hour } = kstParts();
  const slot = currentSlot(hour);
  await getOrGenerateJSON<BriefingDay>({
    cacheKey: `briefing:${date}:${slot}`,
    kind: 'briefing',
    system: SYSTEM,
    prompt: buildPrompt(date, slot),
    fallback: fallbackFor(date),
    force: true,
  });
  return { date, slot };
}

// 읽기 전용: 그날의 가장 최신 슬롯을 반환(생성 절대 없음 → 공개 라우트에서 안전).
// cron이 하루 3회 미리 만들어두므로 보통 항상 존재. 없으면 null(화면은 "생성 전" 안내).
export async function readBriefing(date: string): Promise<(BriefingDay & { _slot: Slot }) | null> {
  for (const slot of ['ny', 'pm', 'am'] as Slot[]) {
    const cached = await readJSONCache<BriefingDay>(`briefing:${date}:${slot}`);
    if (cached?.headline) return { ...cached, _slot: slot };
  }
  return null;
}

// 화면용: 그날의 가장 최신 슬롯을 반환. 미리 만들어둔 게 있으면 즉시(생성 없음).
// 아무 슬롯도 없으면(콜드) 현재 시각 슬롯을 1회 생성해 저장.
export async function getBriefing(date: string): Promise<BriefingDay & { _slot: Slot }> {
  for (const slot of ['ny', 'pm', 'am'] as Slot[]) {
    const cached = await readJSONCache<BriefingDay>(`briefing:${date}:${slot}`);
    if (cached) return { ...cached, _slot: slot };
  }
  // 콜드: 현재 시각 슬롯 생성. (요청한 날짜가 과거면 'pm'을 기본 생성)
  const { date: todayKst, hour } = kstParts();
  const slot = date === todayKst ? currentSlot(hour) : 'pm';
  const obj = await getOrGenerateJSON<BriefingDay>({
    cacheKey: `briefing:${date}:${slot}`,
    kind: 'briefing',
    system: SYSTEM,
    prompt: buildPrompt(date, slot),
    fallback: fallbackFor(date),
  });
  return { ...obj, _slot: slot };
}
