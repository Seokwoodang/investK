import { NextResponse } from 'next/server';
import { getOrGenerateJSON } from '@/server/ai';

interface Line { name: string; group: string; weight: number; plPct: number; risk?: string }
interface Body {
  lines: Line[];
  totalValueKrw?: number;
  totalPlPct?: number;
  groupWeights?: { group: string; weight: number }[];
  fx?: string; // 환율 요약
  indices?: string; // 지수 요약
  events?: string; // 다가오는 주요 일정
}

interface Report {
  overview: string; // 전체 요약
  performance: string; // 성과 분석
  diagnosis: string; // 집중도·위험·분산 진단
  marketContext: string; // 현재 시장 환경과 내 포트폴리오의 연결
  checkpoints: string[]; // 다음 점검 포인트
}

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
  const sig = hash(JSON.stringify(lines.map((l) => [l.name, Math.round(l.weight), Math.round(l.plPct)])) + (b.events || ''));

  const lineText = lines
    .map((l) => `- ${l.name} (${l.group}): 비중 ${l.weight.toFixed(1)}%, 평가손익 ${l.plPct > 0 ? '+' : ''}${l.plPct.toFixed(1)}%${l.risk ? `, 리스크 ${l.risk}` : ''}`)
    .join('\n');
  const groupText = (b.groupWeights ?? []).map((g) => `${g.group} ${g.weight.toFixed(0)}%`).join(', ');

  const result = await getOrGenerateJSON<Report>({
    cacheKey: `report:${sig}:${today}`,
    kind: 'report',
    system:
      '너는 한국어로 답하는 투자 분석 보조자다. 사용자의 보유 포트폴리오와 현재 시장 데이터를 묶어 "정기 투자 보고서"를 작성한다. ' +
      '반드시 JSON만 출력(설명·코드펜스 금지). 형식: ' +
      '{"overview":"포트폴리오 전체 요약 2~3문장","performance":"성과(수익/손실 종목, 자산군 기여) 2~3문장",' +
      '"diagnosis":"집중도·위험·분산 진단 2~3문장","marketContext":"현재 환율·지수·예정 일정이 이 포트폴리오에 주는 함의 2~3문장",' +
      '"checkpoints":["다음에 점검할 포인트 3~5개"]}. ' +
      '보고서 톤(객관적·간결), 투자 권유·단정적 수익 예측 금지, 참고용. 사용자가 보유한 자산군·종목에 한정해 구체적으로.',
    prompt:
      `[내 포트폴리오]\n총 평가액(원): ${b.totalValueKrw ? Math.round(b.totalValueKrw).toLocaleString('ko-KR') : '미상'}\n` +
      `총 평가손익률: ${b.totalPlPct != null ? (b.totalPlPct > 0 ? '+' : '') + b.totalPlPct.toFixed(1) + '%' : '미상'}\n` +
      `자산군 비중: ${groupText || '미상'}\n보유 종목:\n${lineText}\n\n` +
      `[현재 시장]\n환율: ${b.fx || '미상'}\n지수: ${b.indices || '미상'}\n다가오는 주요 일정: ${b.events || '없음'}\n\n` +
      `위 내용을 종합해 오늘(${today}) 기준 투자 보고서를 JSON으로 작성해줘.`,
    fallback: { overview: '', performance: '', diagnosis: '', marketContext: '', checkpoints: [] },
  });

  return NextResponse.json(result);
}
