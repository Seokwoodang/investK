import { NextResponse } from 'next/server';
import { getOrGenerateJSON } from '@/server/ai';

// AI 매도 총평 — 매도 "판정"은 이미 규칙 로직이 내렸고(보유/관찰/점검필요), AI는 그 신호를 종합해
// 무엇을 점검·대응할지 설명·조언만 한다(사고팔지 결정하지 않음). 참고용.
interface Item { name: string; verdict: string; plPct: number; signals: string[]; per?: number | null; roe?: number | null; debtRatio?: number | null }
interface Body { items?: Item[] }
interface SellAi { summary: string; perStock: { name: string; comment: string }[] }

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const VK: Record<string, string> = { hold: '보유 유지', watch: '관찰', review: '점검 필요' };

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Body;
  const items = (b.items ?? []).slice(0, 60);
  if (!items.length) return NextResponse.json({ error: 'empty' }, { status: 400 });

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const lineText = items
    .map((i) => `- ${i.name} [${VK[i.verdict] || i.verdict}] 평가손익 ${i.plPct >= 0 ? '+' : ''}${i.plPct.toFixed(0)}%${i.per != null ? `, PER ${i.per}` : ''}${i.roe != null ? `, ROE ${i.roe}%` : ''}${i.debtRatio != null ? `, 부채 ${i.debtRatio}%` : ''} · 신호: ${i.signals.length ? i.signals.join('; ') : '없음'}`)
    .join('\n');
  const sig = hash(items.map((i) => `${i.name}:${i.verdict}:${Math.round(i.plPct)}:${i.signals.length}`).join('|'));

  const result = await getOrGenerateJSON<SellAi>({
    cacheKey: `sell-ai:${sig}:${today}`,
    kind: 'sell',
    system:
      '너는 한국어로 답하는 투자 보조자다. 매도 "판정"(보유 유지/관찰/점검 필요)과 각 신호는 이미 규칙 로직으로 정해져 입력으로 주어진다. ' +
      '너는 새로 사고팔지 결정하지 말고, 그 신호들을 종합해 사용자가 무엇을·왜 점검하고 어떻게 대응(분할매도·손절·관망 등)을 검토하면 좋을지 설명·조언만 한다. ' +
      '단정적 매도/매수 지시나 수익 보장은 금지(참고용). 반드시 JSON만 출력: ' +
      '{"summary":"포트폴리오 전체 매도 관점 3~4문장 — 점검 필요 종목을 먼저 짚고 전반 리스크를 정리",' +
      '"perStock":[{"name":"종목명","comment":"그 종목에서 어떤 신호 때문에 무엇을 점검·대응할지 1~2문장. 신호 없으면 보유 유지 관점 한 줄"}]}. ' +
      '각 종목을 이름으로 구체적으로 언급한다.',
    prompt: `[보유 종목 · 규칙 판정/신호]\n${lineText}\n\n위 판정과 신호를 바탕으로 오늘(${today}) 기준 매도 점검 총평을 JSON으로 작성해줘.`,
    fallback: { summary: '', perStock: [] },
  });

  return NextResponse.json(result);
}
