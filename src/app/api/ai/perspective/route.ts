import { NextResponse } from 'next/server';
import { getOrGenerateJSON } from '@/server/ai';
import type { AiPoint } from '@/types';

interface Perspective {
  pos: AiPoint[];
  neg: AiPoint[];
  caution: AiPoint[];
}

interface Body {
  id: string;
  name: string;
  ticker: string;
  cur?: string;
  pct?: number;
  risk?: string;
  issue?: string;
  chartNote?: string;
  newsTitles?: string[];
}

// POST /api/ai/perspective { id, name, ticker, cur, pct, risk, issue, chartNote, newsTitles }
// 종목별 AI 관점(긍정/부정/주의)을 Claude로 생성하고 (종목·날짜)로 캐시.
// 큐레이션 종목뿐 아니라 모든 유니버스 종목 지원 — 클라이언트가 보낸 종목 정보로 생성한다.
// 평소엔 비워두고, 사용자가 'AI 관점' 탭을 열 때(=이 요청이 올 때) 1회 생성 후 그날은 캐시 재사용.
export async function POST(req: Request) {
  const b = (await req.json()) as Body;
  if (!b?.id || !b?.name) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const newsTitles = (b.newsTitles ?? []).slice(0, 8).map((t) => `- ${t}`).join('\n');

  const result = await getOrGenerateJSON<Perspective>({
    cacheKey: `perspective:${b.id}:${today}`,
    kind: 'perspective',
    system:
      '너는 한국어로 답하는 투자 분석 보조자다. 한 종목의 긍정 요인·부정 요인·주의할 점을 정리한다. ' +
      '반드시 JSON만 출력한다(설명·코드펜스 금지). 형식: {"pos":[{"p":"짧은 제목","r":"1~2문장 근거"}],"neg":[...],"caution":[...]}. ' +
      '각 배열은 1~3개. 투자 권유나 단정적 예측은 금지하고 참고용 톤을 유지한다. 정보가 부족하면 일반적으로 알려진 종목 특성에 근거해 작성한다.',
    prompt:
      `종목: ${b.name} (${b.ticker})\n통화: ${b.cur ?? '-'}\n당일 등락률: ${b.pct ?? '-'}%\n리스크 등급: ${b.risk ?? '-'}\n` +
      (b.issue ? `핵심 이슈: ${b.issue}\n` : '') +
      (b.chartNote ? `차트 특징: ${b.chartNote}\n` : '') +
      (newsTitles ? `관련 뉴스 제목:\n${newsTitles}\n` : '') +
      `\n위 정보를 바탕으로 긍정 요인(pos)/부정 요인(neg)/주의할 점(caution)을 JSON으로 작성해줘.`,
    fallback: { pos: [], neg: [], caution: [] },
  });

  return NextResponse.json(result);
}
