import { NextResponse } from 'next/server';
import { getOrGenerateJSON } from '@/server/ai';

interface Line {
  name: string;
  group: string; // 자산군(국내주식 등)
  weight: number; // 비중 %
  plPct: number; // 평가손익 %
  risk?: string; // 리스크 등급
}
interface Body {
  lines: Line[];
  totalValueKrw?: number;
  groupWeights?: { group: string; weight: number }[];
}

interface Evaluation {
  summary: string;
  concentration: string;
  risk: string;
  perStock: { name: string; comment: string }[];
  rebalance: string[];
}

// POST /api/ai/portfolio { lines, groupWeights, totalValueKrw }
// 보유 포트폴리오를 Claude가 평가(집중도·위험·종목코멘트·리밸런싱). 내용 해시+날짜로 캐시.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export async function POST(req: Request) {
  const b = (await req.json()) as Body;
  const lines = b?.lines ?? [];
  if (!lines.length) return NextResponse.json({ error: 'empty' }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const sig = hash(JSON.stringify(lines.map((l) => [l.name, Math.round(l.weight), Math.round(l.plPct)])));

  const lineText = lines
    .map((l) => `- ${l.name} (${l.group}): 비중 ${l.weight.toFixed(1)}%, 평가손익 ${l.plPct > 0 ? '+' : ''}${l.plPct.toFixed(1)}%${l.risk ? `, 리스크 ${l.risk}` : ''}`)
    .join('\n');
  const groupText = (b.groupWeights ?? []).map((g) => `${g.group} ${g.weight.toFixed(0)}%`).join(', ');

  const result = await getOrGenerateJSON<Evaluation>({
    cacheKey: `portfolio:${sig}:${today}`,
    kind: 'portfolio',
    system:
      '너는 한국어로 답하는 투자 분석 보조자다. 사용자의 보유 포트폴리오를 객관적으로 평가한다. ' +
      '반드시 JSON만 출력(설명·코드펜스 금지). 형식: ' +
      '{"summary":"2~3문장 총평","concentration":"집중도(특정 종목·자산군 쏠림) 평가 1~2문장",' +
      '"risk":"위험 수준 평가 1~2문장","perStock":[{"name":"종목","comment":"1문장 코멘트"}],' +
      '"rebalance":["구체적 제안 1","제안 2"]}. ' +
      'perStock은 비중 큰 순으로 최대 6개. 투자 권유·단정적 수익 예측 금지, 참고용 톤. 분산·집중·위험 관점 위주로.',
    prompt:
      `총 평가액(원 환산): ${b.totalValueKrw ? Math.round(b.totalValueKrw).toLocaleString('ko-KR') + '원' : '미상'}\n` +
      `자산군 비중: ${groupText || '미상'}\n보유 종목:\n${lineText}\n\n` +
      `위 포트폴리오를 집중도·위험·분산 관점에서 평가하고 JSON으로 작성해줘.`,
    fallback: { summary: '', concentration: '', risk: '', perStock: [], rebalance: [] },
  });

  return NextResponse.json(result);
}
