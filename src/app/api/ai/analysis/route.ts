import { NextResponse } from 'next/server';
import { fmtPct } from '@/lib/format';
import { getOrGenerate } from '@/server/ai';
import type { Period } from '@/types';

// POST /api/ai/analysis { id, period, ret, name, ticker, issue?, chartNote?, risk? }
// 종목 차트 흐름 분석 텍스트를 Claude로 생성·캐시. 큐레이션 종목뿐 아니라 모든 종목 지원
// (클라이언트가 보낸 종목 정보로 생성). 키 없거나 실패 시 결정적 템플릿 폴백.
export async function POST(req: Request) {
  const b = (await req.json()) as {
    id: string; period: Period; ret: number;
    name?: string; ticker?: string; issue?: string; chartNote?: string; risk?: string;
  };
  if (!b?.id || !b?.name) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const dirWord = b.ret > 0 ? '상승' : b.ret < 0 ? '하락' : '보합';
  const volWord = b.risk === 'high' ? '변동성이 매우 큰' : b.risk === 'mid' ? '변동성이 다소 있는' : '비교적 안정적인';
  const fallback = `${b.name}은(는) 최근 ${b.period} 동안 ${fmtPct(b.ret)} ${dirWord}했습니다. ${b.chartNote ?? ''} 해당 기간 흐름은 ${volWord} 모습으로, 매매 시 분할 접근과 손절 기준을 함께 점검하는 것이 좋습니다.`.replace(/\s+/g, ' ').trim();

  const text = await getOrGenerate({
    cacheKey: `analysis:${b.id}:${b.period}:${today}`,
    kind: 'analysis',
    system:
      '너는 한국어로 답하는 시장 분석 보조자다. 사실·수치 중심으로 1문단(2~3문장)으로 차트 흐름을 설명하되, 투자 권유나 단정적 예측은 하지 않는다. 참고용 정보임을 전제한다. 마크다운이나 별표(*)·강조 서식 없이 순수 일반 텍스트 한 문단으로만 답한다. 정보가 부족하면 일반적으로 알려진 종목 특성에 근거한다.',
    prompt:
      `종목: ${b.name} (${b.ticker ?? '-'})\n기간: ${b.period}\n기간수익률: ${fmtPct(b.ret)}\n` +
      (b.issue ? `이슈: ${b.issue}\n` : '') +
      (b.chartNote ? `차트 특징: ${b.chartNote}\n` : '') +
      (b.risk ? `리스크 등급: ${b.risk}\n` : '') +
      `위 정보를 바탕으로 차트 흐름을 한 문단으로 설명해줘.`,
    fallback,
  });

  const clean = text.replace(/\*\*/g, '').replace(/__/g, '');
  return NextResponse.json({ text: clean });
}
