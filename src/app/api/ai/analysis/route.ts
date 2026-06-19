import { NextResponse } from 'next/server';
import { STOCKS } from '@/data';
import { fmtPct } from '@/lib/format';
import { getOrGenerate } from '@/server/ai';
import type { Period, Stock, TabId } from '@/types';

// POST /api/ai/analysis  { id, period, ret }
// Returns the AI chart-analysis text for an instrument/period, cached server-side
// (same key → never re-generated). Falls back to the deterministic template when
// no Anthropic key is configured. The client can adopt this in place of its
// inline templating once a key is set.
export async function POST(req: Request) {
  const { id, period, ret } = (await req.json()) as { id: string; period: Period; ret: number };

  let stock: Stock | undefined;
  for (const tb of Object.keys(STOCKS) as TabId[]) {
    stock = STOCKS[tb].find((s) => s.id === id);
    if (stock) break;
  }
  if (!stock) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const dirWord = ret > 0 ? '상승' : ret < 0 ? '하락' : '보합';
  const volWord = stock.risk === 'high' ? '변동성이 매우 큰' : stock.risk === 'mid' ? '변동성이 다소 있는' : '비교적 안정적인';
  const fallback = `${stock.name}은(는) 최근 ${period} 동안 ${fmtPct(ret)} ${dirWord}했습니다. ${stock.chartNote} 해당 기간 흐름은 ${volWord} 모습으로, 매매 시 분할 접근과 손절 기준을 함께 점검하는 것이 좋습니다.`;

  const text = await getOrGenerate({
    cacheKey: `analysis:${id}:${period}:2026-06-15`,
    kind: 'analysis',
    system:
      '너는 한국어로 답하는 시장 분석 보조자다. 사실·수치 중심으로 1문단(2~3문장)으로 차트 흐름을 설명하되, 투자 권유나 단정적 예측은 하지 않는다. 참고용 정보임을 전제한다. 마크다운이나 별표(*)·강조 서식 없이 순수 일반 텍스트 한 문단으로만 답한다.',
    prompt: `종목: ${stock.name} (${stock.ticker})\n기간: ${period}\n기간수익률: ${fmtPct(ret)}\n이슈: ${stock.issue}\n차트 특징: ${stock.chartNote}\n리스크 등급: ${stock.risk}\n위 정보를 바탕으로 차트 흐름을 한 문단으로 설명해줘.`,
    fallback,
  });

  // 혹시 모델이 마크다운 강조를 넣어도 평문으로 표시되도록 방어적으로 제거.
  const clean = text.replace(/\*\*/g, '').replace(/__/g, '');
  return NextResponse.json({ text: clean });
}
