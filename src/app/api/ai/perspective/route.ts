import { NextResponse } from 'next/server';
import { STOCKS } from '@/data';
import { getOrGenerateJSON } from '@/server/ai';
import type { AiPoint, Stock, TabId } from '@/types';

interface Perspective {
  pos: AiPoint[];
  neg: AiPoint[];
  caution: AiPoint[];
}

// POST /api/ai/perspective { id }
// 종목별 AI 관점(긍정/부정/주의)을 Claude로 생성하고 (종목·날짜)로 캐시.
// 키 없거나 실패 시 정적 sel.ai 폴백.
export async function POST(req: Request) {
  const { id } = (await req.json()) as { id: string };

  let stock: Stock | undefined;
  for (const tb of Object.keys(STOCKS) as TabId[]) {
    stock = STOCKS[tb].find((s) => s.id === id);
    if (stock) break;
  }
  if (!stock) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const newsTitles = stock.news.map((n) => `- ${n.title}`).join('\n');

  const result = await getOrGenerateJSON<Perspective>({
    cacheKey: `perspective:${id}:2026-06-15`,
    kind: 'perspective',
    system:
      '너는 한국어로 답하는 투자 분석 보조자다. 한 종목의 긍정 요인·부정 요인·주의할 점을 정리한다. ' +
      '반드시 JSON만 출력한다(설명·코드펜스 금지). 형식: {"pos":[{"p":"짧은 제목","r":"1~2문장 근거"}],"neg":[...],"caution":[...]}. ' +
      '각 배열은 1~3개. 투자 권유나 단정적 예측은 금지하고 참고용 톤을 유지한다.',
    prompt:
      `종목: ${stock.name} (${stock.ticker})\n통화: ${stock.cur}\n당일 등락률: ${stock.pct}%\n리스크 등급: ${stock.risk}\n` +
      `핵심 이슈: ${stock.issue}\n차트 특징: ${stock.chartNote}\n관련 뉴스 제목:\n${newsTitles}\n\n` +
      `위 정보를 바탕으로 긍정 요인(pos)/부정 요인(neg)/주의할 점(caution)을 JSON으로 작성해줘.`,
    fallback: stock.ai,
  });

  return NextResponse.json(result);
}
