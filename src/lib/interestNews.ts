// 관심사(섹터 + 보유·관심 종목) ↔ 뉴스 매칭. 순수 함수 — 서버 왕복 없이 클라에서 계산한다.
//
// 왜 클라인가: 랭킹 뉴스는 이미 공개 캐시(/api/news)로 클라에 오고, 관심사·보유·watchlist도
// 전부 클라 상태다. 서버 매칭은 새 집계 엔드포인트 + watchlist 서버화를 강제한다.
//
// 신호 우선순위: target(AI가 판정한 '영향 종목/섹터', 짧고 정규화됨) ≫ 제목 ≫ 요약/함의.
// 키워드 단독 매칭이 target 매칭을 절대 못 이기게 해서 오탐이 상단을 차지하지 않게 한다.

import { SECTOR_DEFS } from '@/data/sectors';
import { bareRef, sectorByKey } from './sectors';

export interface MatchableNews {
  title: string;
  summary?: string;
  why?: string;
  target?: string;
  impact?: '호재' | '악재' | '중립';
  importance?: '상' | '중' | '하';
  datetime?: string;
  src?: string;
  url?: string;
}

export interface MatchedNews extends MatchableNews {
  score: number;
  label: string; // 왜 떴는지 사용자에게 보여줄 매칭 라벨(예: '반도체', '삼성전자')
}

export interface MatchTerm {
  text: string; // 정규화된 검색어(한글·혼합용)
  raw: string; // 소문자 원문(영문 단어경계 검사용 — 'home depot'처럼 공백이 있어야 맞는다)
  kind: 'stock' | 'sector' | 'keyword';
  label: string;
  ascii: boolean;
}

export interface InterestStock {
  id?: string;
  name: string;
  ticker?: string;
  tab?: string; // TabId — 어느 뉴스 탭을 받아올지 판단용
}

// '코스피 전반'처럼 시장 전체를 가리키는 target은 개인화 신호가 아니라 제외.
const BROAD_TARGET = /(전반|전체|시장|증시|코스피|코스닥|나스닥|다우|S&P)/i;

const norm = (s: string) => s.toLowerCase().replace(/[\s·・\-.,()&]/g, '');
const isAscii = (s: string) => /^[\x20-\x7F]+$/.test(s);

// 영문 짧은 약어(HD·GE·SO)가 아무 데나 걸리는 걸 막으려 단어 경계로 검사.
const asciiHit = (hay: string, term: string) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay);

function pushTerm(out: MatchTerm[], seen: Set<string>, src: string, kind: MatchTerm['kind'], label: string) {
  const t = norm(src);
  const raw = src.trim().toLowerCase();
  const ascii = isAscii(src);
  // 한글 2자 / 영문 3자 미만은 오탐만 만든다.
  if (t.length < (ascii ? 3 : 2)) return;
  const k = `${kind}:${t}`;
  if (seen.has(k)) return;
  seen.add(k);
  out.push({ text: t, raw, kind, label, ascii });
}

// 관심 섹터 + 관심 종목 → 검색어 목록.
export function buildMatchTerms(sectorKeys: string[], stocks: InterestStock[]): MatchTerm[] {
  const out: MatchTerm[] = [];
  const seen = new Set<string>();

  // 종목이 가장 강한 신호 — 먼저.
  for (const s of stocks) {
    if (s.name) pushTerm(out, seen, s.name, 'stock', s.name);
    if (s.ticker && !/^\d{6}$/.test(s.ticker)) pushTerm(out, seen, s.ticker, 'stock', s.name || s.ticker);
  }

  for (const key of sectorKeys) {
    const def = sectorByKey(key);
    if (!def) continue;
    pushTerm(out, seen, def.name, 'sector', def.name);
    for (const ld of def.leaders) {
      pushTerm(out, seen, ld.name, 'stock', ld.name);
      for (const a of ld.aliases ?? []) pushTerm(out, seen, a, 'stock', ld.name);
      const bare = bareRef(ld.ref);
      if (!/^\d{6}$/.test(bare)) pushTerm(out, seen, bare, 'stock', ld.name);
    }
    for (const kw of def.keywords) pushTerm(out, seen, kw, 'keyword', def.name);
  }
  return out;
}

// 영문은 원문(공백 유지) + 단어경계 — 'HD'가 아무 데나 걸리는 걸 막으면서 'home depot'은 잡는다.
// 한글·혼합('삼성SDI')은 정규화 문자열에 부분일치.
const hit = (hayNorm: string, hayRaw: string, t: MatchTerm) =>
  t.ascii ? asciiHit(hayRaw, t.raw) : hayNorm.includes(t.text);

function freshnessBonus(dt?: string): number {
  if (!dt) return 0;
  const s = dt.trim();
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(s);
  const d = /^\d{8,14}$/.test(s) && m ? new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+09:00`) : new Date(s);
  if (isNaN(d.getTime())) return 0;
  const days = (Date.now() - d.getTime()) / 86400000;
  if (days < 1) return 8;
  if (days < 2) return 4;
  return 0;
}

// 뉴스 1건 점수. 0이면 비매칭.
export function scoreNews(n: MatchableNews, terms: MatchTerm[]): { score: number; label: string } {
  if (!terms.length) return { score: 0, label: '' };

  const targetRaw = (n.target ?? '').toLowerCase();
  const targetNorm = norm(n.target ?? '');
  const titleRaw = (n.title ?? '').toLowerCase();
  const titleNorm = norm(n.title ?? '');
  const bodyRaw = `${n.summary ?? ''} ${n.why ?? ''}`.toLowerCase();
  const bodyNorm = norm(`${n.summary ?? ''} ${n.why ?? ''}`);
  const broadTarget = !n.target || BROAD_TARGET.test(n.target);

  // 가장 강한 신호 하나만 채택(합산하지 않음) — 키워드 여러 개가 걸려도 target 매칭을 못 이기게.
  let best = 0;
  let label = '';
  let bodyCounted = false;

  for (const t of terms) {
    let s = 0;
    if (!broadTarget && hit(targetNorm, targetRaw, t)) {
      if (t.kind === 'stock') s = targetNorm === t.text ? 120 : 100;
      else if (t.kind === 'sector') s = 60;
      else s = 30; // 키워드가 target에 걸린 경우
    } else if (hit(titleNorm, titleRaw, t)) {
      s = t.kind === 'stock' ? 40 : 25;
    } else if (!bodyCounted && hit(bodyNorm, bodyRaw, t)) {
      s = 10;
      bodyCounted = true;
    }
    if (s > best) {
      best = s;
      label = t.label;
    }
  }
  if (best === 0) return { score: 0, label: '' };

  let score = best;
  score += n.importance === '상' ? 12 : n.importance === '중' ? 6 : 0;
  if (n.impact === '호재' || n.impact === '악재') score += 4;
  score += freshnessBonus(n.datetime);
  return { score, label };
}

// 매칭된 뉴스 상위 N건. 제목 중복 제거, 점수 → 최신순.
export function matchNews(news: MatchableNews[], terms: MatchTerm[], limit = 5): MatchedNews[] {
  if (!terms.length) return [];
  const out: MatchedNews[] = [];
  const seenTitle = new Set<string>();
  for (const n of news) {
    const key = norm(n.title ?? '');
    if (!key || seenTitle.has(key)) continue;
    const { score, label } = scoreNews(n, terms);
    if (score <= 0) continue;
    seenTitle.add(key);
    out.push({ ...n, score, label });
  }
  out.sort((a, b) => b.score - a.score || String(b.datetime ?? '').localeCompare(String(a.datetime ?? '')));
  return out.slice(0, limit);
}

export type NewsTab = 'kr_stock' | 'us_stock' | 'global_coin';

// 관심사로부터 어떤 뉴스 탭을 받아와야 하는지(최대 3회 fetch).
// 국내/해외 코인 뉴스는 소스가 같아 global_coin 하나로 합쳐져 있다(NEWS_TABS 참고).
export function tabsForInterests(sectorKeys: string[], stocks: InterestStock[]): NewsTab[] {
  const tabs = new Set<NewsTab>();
  for (const k of sectorKeys) {
    if (k.startsWith('kr:')) tabs.add('kr_stock');
    else if (k.startsWith('us:')) tabs.add('us_stock');
    else if (k.startsWith('coin:')) tabs.add('global_coin');
  }
  for (const s of stocks) {
    if (s.tab === 'kr_coin' || s.tab === 'global_coin') tabs.add('global_coin');
    else if (s.tab === 'kr_stock') tabs.add('kr_stock');
    else if (s.tab === 'us_stock') tabs.add('us_stock');
    else if (s.ticker && /^\d{6}$/.test(s.ticker)) tabs.add('kr_stock'); // tab 없으면 티커로 추정
    else if (s.ticker) tabs.add('us_stock');
  }
  return [...tabs];
}

// 섹터 키가 하나도 없을 때 콜드스타트에서 권하는 인기 분야.
export const POPULAR_SECTOR_KEYS = SECTOR_DEFS.filter((d) =>
  ['kr:반도체', 'kr:2차전지', 'kr:바이오', 'kr:자동차', 'us:반도체', 'us:기술'].includes(d.key),
).map((d) => d.key);
