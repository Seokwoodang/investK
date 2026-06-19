import { NextResponse } from 'next/server';
import { BRIEFING, MACRO } from '@/data';
import { getOrGenerateJSON } from '@/server/ai';
import { getDashboardData } from '@/server/data';
import { TAB_LABELS, type BriefingDay } from '@/types';

// POST /api/ai/briefing { date }
// 그날의 '팩트 브리핑'을 실시장 데이터(환율·자산군 등락·예정 일정)를 근거로 Claude가 생성하고
// 날짜로 캐시. 키 없거나 실패 시 정적 BRIEFING 폴백. 컨텍스트 조립은 캐시 미스 때만 실행.
export async function POST(req: Request) {
  const { date } = (await req.json()) as { date: string };
  const dates = Object.keys(BRIEFING).sort();
  const fallback: BriefingDay = BRIEFING[date] ?? BRIEFING[dates[dates.length - 1]];

  const result = await getOrGenerateJSON<BriefingDay>({
    cacheKey: `briefing:${date}`,
    kind: 'briefing',
    system:
      '너는 한국어로 답하는 시장 브리핑 작성자다. 의견·전망 없이 사실·수치·인과만 정리한다. ' +
      'JSON만 출력(코드펜스 금지). 형식: {"headline":"한 줄 요약","facts":[{"k":"지수|환율|코인","t":"문장"}],' +
      '"causes":[["원인","과정","결과"]],"byAsset":[{"label":"국내주식","line":"한 줄","dir":"up|down|flat"}],' +
      '"checkpoints":[{"when":"오늘 21:30","name":"이벤트명","tag":"고영향|중간"}]}. ' +
      'facts 3개, causes 2~3개, byAsset는 정확히 4개(국내주식·해외주식·국내코인·해외코인 순), 투자 권유 금지.',
    prompt: async () => {
      const data = await getDashboardData();
      const summaries = TAB_LABELS.map((t) => {
        const arr = data.stocks[t.id];
        const avg = arr.reduce((s, x) => s + x.pct, 0) / arr.length;
        const sorted = [...arr].sort((a, b) => b.pct - a.pct);
        const top = sorted[0];
        const bottom = sorted[sorted.length - 1];
        const fmt = (n: number) => (n > 0 ? '+' : '') + n.toFixed(2) + '%';
        return `- ${t.label}: 평균 ${fmt(avg)}, 상위 ${top.name} ${fmt(top.pct)}, 하위 ${bottom.name} ${fmt(bottom.pct)}`;
      }).join('\n');
      const fx = data.macro.fx.map((r) => `${r.pair} ${r.val}(${r.chg > 0 ? '+' : ''}${r.chg}%)`).join(', ');
      const events = MACRO.events
        .filter((e) => e.date >= date)
        .slice(0, 4)
        .map((e) => `${e.date} ${e.time} ${e.name} [${e.tag}]`)
        .join('\n');
      return `날짜: ${date}\n환율: ${fx}\n자산군 등락:\n${summaries}\n예정 일정:\n${events}\n\n위 실데이터로 오늘의 팩트 브리핑을 JSON으로 작성해줘.`;
    },
    fallback,
  });

  return NextResponse.json(result);
}
