import { NextResponse } from 'next/server';
import { fmtPct } from '@/lib/format';
import { getOrGenerate } from '@/server/ai';

// POST /api/ai/analysis { id, period, ret, name, ticker, issue?, chartNote?, risk? }
// 종목 차트 흐름 분석 텍스트를 Claude로 생성·캐시. 큐레이션 종목뿐 아니라 모든 종목 지원
// (클라이언트가 보낸 종목 정보로 생성). 키 없거나 실패 시 결정적 템플릿 폴백.
export async function POST(req: Request) {
  const b = (await req.json()) as {
    id: string; period: string; ret: number;
    name?: string; ticker?: string; issue?: string; chartNote?: string; risk?: string;
    cur?: string; close?: number; high?: number; low?: number; offHigh?: number; offLow?: number; upRatio?: number;
  };
  if (!b?.id || !b?.name) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  // 캐시 '하루' 경계는 KST 기준 — UTC(toISOString)를 쓰면 실제로는 오전 9시에 갱신돼 안내 문구와 어긋남.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const dirWord = b.ret > 0 ? '상승' : b.ret < 0 ? '하락' : '보합';
  const cur = b.cur === '$' ? '$' : '';
  const won = b.cur === '$' ? '' : '원';
  const px = (n?: number) => (n == null ? '' : `${cur}${Math.round(n).toLocaleString('en-US')}${won}`);
  // 실제 차트 수치(고점 대비 위치·상승일 비율)로 폴백도 구체화.
  const posWord = b.offHigh != null ? (b.offHigh >= -2 ? '기간 고점 부근' : b.offHigh >= -10 ? '고점에서 다소 눌린' : '고점 대비 크게 조정된') : '';
  const fallback = `${b.name}은(는) 최근 ${b.period} 동안 ${fmtPct(b.ret)} ${dirWord}했습니다.${b.close != null ? ` 현재가 ${px(b.close)}로 기간 고점(${px(b.high)}) 대비 ${b.offHigh != null ? fmtPct(b.offHigh) : '-'}, ${posWord} 수준입니다.` : ''}${b.upRatio != null ? ` 해당 기간 상승 마감 비율은 약 ${b.upRatio}%였습니다.` : ''} 참고용 정보이며 매매 판단은 거래량·재무와 함께 확인하세요.`.replace(/\s+/g, ' ').trim();

  const text = await getOrGenerate({
    cacheKey: `analysis:v3:${b.id}:${b.period}:${today}`,
    kind: 'analysis',
    system:
      '너는 한국어로 답하는 시장 분석 보조자다. 제공된 실제 수치(기간수익률·현재가·기간 고점/저점·고점 대비 위치·상승일 비율)를 반드시 근거로 인용해 차트 흐름을 2~3문장으로 구체적으로 설명한다. ' +
      '반드시 지킬 것: (1) "종목 특성상", "업황에 따라", "추가 정보를 확인하세요" 같은 막연한 일반론·면책 채우기를 쓰지 말 것. (2) 추세 방향(상승/하락/횡보)·고점 대비 위치·변동성을 수치와 함께 언급할 것. (3) 단정적 미래 예측이나 매매 권유는 하지 말 것. (4) 마크다운·별표 없이 순수 한 문단 텍스트로만.',
    prompt:
      `종목: ${b.name} (${b.ticker ?? '-'})\n기간: ${b.period}\n기간수익률: ${fmtPct(b.ret)}\n` +
      (b.close != null ? `현재가: ${px(b.close)}\n` : '') +
      (b.high != null ? `기간 고점: ${px(b.high)} (현재가는 고점 대비 ${b.offHigh != null ? fmtPct(b.offHigh) : '-'})\n` : '') +
      (b.low != null ? `기간 저점: ${px(b.low)} (현재가는 저점 대비 ${b.offLow != null ? fmtPct(b.offLow) : '-'})\n` : '') +
      (b.upRatio != null ? `상승 마감 비율: ${b.upRatio}%\n` : '') +
      (b.risk ? `리스크 등급: ${b.risk}\n` : '') +
      `위 실제 수치를 근거로(숫자를 직접 인용) 이 종목의 ${b.period} 차트 흐름을 구체적으로 설명해줘. 추세 방향·고점 대비 위치·변동성을 포함해.`,
    fallback,
  });

  const clean = text.replace(/\*\*/g, '').replace(/__/g, '');
  return NextResponse.json({ text: clean });
}
