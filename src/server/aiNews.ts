import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { env, has } from './env';
import { getSupabase } from './supabase';
import type { NewsArticle } from './providers/naverNews';
import { logAiUsage } from './ai';

// RSS/네이버에서 가져온 후보 기사를 Claude가 읽고 투자 관점으로 판별·정렬한다.
// 소스(기사)는 rssNews/naverNews가 담당하고, 이 모듈은 그 위에 "판별" 레이어만 얹는다.
// 가벼운 분류라 Haiku 사용(분석·브리핑·AI관점은 Sonnet 유지).
// 캐시 계층: 메모리 → Supabase(ai_cache, kind 'news') → Haiku 생성. 15분 시간버킷 키 → 버킷당 1회만 생성·저장,
// 서버 재시작/서버리스 인스턴스 교체와 무관하게 DB에서 공유(같은 버킷이면 AI 재호출 없음).
const NEWS_MODEL = 'claude-haiku-4-5';

export interface RankedNews extends NewsArticle {
  impact: '호재' | '악재' | '중립';
  importance: '상' | '중' | '하';
  why: string;
  target: string; // 호재/악재로 작용하는 핵심 종목/섹터 (예: 삼성전자, 반도체, 코스피 전반)
}

const IMP: Record<RankedNews['importance'], number> = { 상: 0, 중: 1, 하: 2 };
const mem = new Map<string, { news: RankedNews[]; at: number }>();

interface Scored {
  i: number;
  impact: RankedNews['impact'];
  importance: RankedNews['importance'];
  why: string;
  target: string;
  title_ko?: string; // 영문 기사면 한국어 번역 제목, 이미 한국어면 빈 문자열
}

const keyOf = (scope: string) => `news:v6:${scope}`; // v6: 상한 20개(더 보기)

// 캐시 엔트리(뉴스 + 생성시각). AI 호출 안 함. 없으면 null.
export async function getCachedEntry(scope: string): Promise<{ news: RankedNews[]; at: number } | null> {
  const key = keyOf(scope);
  const hit = mem.get(key);
  if (hit) return hit;
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb.from('ai_cache').select('payload').eq('cache_key', key).maybeSingle();
    if (data?.payload?.news) {
      const entry = { news: data.payload.news as RankedNews[], at: (data.payload.at as number) ?? 0 };
      mem.set(key, entry);
      return entry;
    }
  }
  return null;
}

// 캐시 뉴스만(즉시). 없으면 null.
export async function getCachedRankedNews(scope: string): Promise<RankedNews[] | null> {
  return (await getCachedEntry(scope))?.news ?? null;
}

// 캐시 있으면 그대로, 없으면 1회 생성. (상세 페이지 등 지연 경로). focus=도메인 한정 지시.
export async function rankNews(scope: string, candidates: NewsArticle[], focus?: string): Promise<RankedNews[] | null> {
  const cached = await getCachedRankedNews(scope);
  if (cached) return cached;
  return generateRankedNews(scope, candidates, focus);
}

// 항상 새로 생성해 mem+Supabase에 저장(덮어쓰기). cron이 1시간마다 호출 → 사용자는 이걸 읽기만.
// focus: 도메인 한정(예: 코인 탭은 암호화폐 뉴스만 선별).
export async function generateRankedNews(scope: string, candidates: NewsArticle[], focus?: string): Promise<RankedNews[] | null> {
  if (!candidates.length) return null;
  if (!has.anthropic()) return getCachedRankedNews(scope);

  const key = keyOf(scope);
  const sb = getSupabase();
  try {
    const list = candidates
      .map((c, i) => `${i}. [${c.tags.join(',')}] ${c.title}${c.summary ? ' — ' + c.summary : ''}`)
      .join('\n');
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: NEWS_MODEL,
      max_tokens: 5500, // 최대 20건 + 영문 제목 번역 포함 시 길어져 잘림 방지
      system:
        '너는 한국어 투자 뉴스 큐레이터다. 주어진 뉴스 후보 중 투자 판단에 실제로 도움되는 것만 골라 중요도순으로 정렬한다. ' +
        '실적·공시·M&A·금리·규제·정책·수급처럼 시세에 직접 영향을 주는 뉴스를 우선하고, 단순 시황 반복·홍보성·중복은 제외한다. ' +
        '각 뉴스마다 호재/악재/중립을 판단하고, 그것이 영향을 주는 핵심 대상(target)을 명시한다. ' +
        'target은 특정 종목이 있으면 종목명(예: 삼성전자, SK하이닉스, 비트코인), 없으면 섹터/시장(예: 반도체, 2차전지, 코스피 전반, 코인 전반)으로 짧게. ' +
        '제목이 영어 등 외국어면 자연스러운 한국어 제목으로 번역해 title_ko에 넣고, 이미 한국어면 title_ko는 빈 문자열("")로 둔다. ' +
        (focus ? `${focus} ` : '') +
        '반드시 JSON 배열만 출력한다(설명·코드펜스 금지). 형식: [{"i":후보번호,"target":"영향 대상","impact":"호재|악재|중립","importance":"상|중|하","why":"왜 투자에 중요한지 한 줄","title_ko":"한국어 제목 또는 빈 문자열"}]. ' +
        '최대 20개. importance 상→하 순으로. 단정적 예측·투자 권유 금지, 사실 기반.',
      messages: [{ role: 'user', content: `뉴스 후보 목록:\n${list}\n\n각 뉴스의 영향 대상(target)·호재/악재를 판단하고 영문 제목은 한국어로 번역(title_ko)해, 투자 중요도순(상→하)으로 골라 JSON 배열로 답해줘.` }],
    });
    await logAiUsage('news', key, undefined, msg.usage, NEWS_MODEL); // 뉴스 랭킹도 토큰 측정(cron 생성 — 계정 없음)
    const block = msg.content.find((b) => b.type === 'text');
    let txt = block && block.type === 'text' ? block.text.trim() : '[]';
    txt = txt.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    // 코드펜스/잡설이 섞여도 첫 배열만 추출.
    const arrStart = txt.indexOf('[');
    const arrEnd = txt.lastIndexOf(']');
    if (arrStart >= 0 && arrEnd > arrStart) txt = txt.slice(arrStart, arrEnd + 1);
    const scored = JSON.parse(txt) as Scored[];

    const ranked: RankedNews[] = scored
      // 값 화이트리스트 검증 — 모델이 '긍정'·'높음' 같은 비표준 값을 내면 정렬(NaN)·배지가 깨진 채 캐시됨.
      .filter((s) => candidates[s.i] && ['호재', '악재', '중립'].includes(s.impact) && s.importance in IMP)
      .map((s) => ({
        ...candidates[s.i],
        title: (s.title_ko ?? '').trim() || candidates[s.i].title, // 영문 기사는 번역 제목으로
        impact: s.impact,
        importance: s.importance,
        why: (s.why ?? '').trim(),
        target: (s.target ?? '').trim(),
      }))
      .sort((a, b) => IMP[a.importance] - IMP[b.importance]);

    if (ranked.length) {
      const at = Date.now();
      mem.set(key, { news: ranked, at });
      if (mem.size > 60) for (const k of [...mem.keys()].slice(0, 30)) mem.delete(k); // 오래된 키 정리
      if (sb) await sb.from('ai_cache').upsert({ cache_key: key, kind: 'news', payload: { news: ranked, at }, model: NEWS_MODEL });
    }
    return ranked.length ? ranked : null;
  } catch (e) {
    console.error('[aiNews] rank failed, falling back to raw feed:', e);
    return null;
  }
}
