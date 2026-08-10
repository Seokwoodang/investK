import { GLOSSARY } from '@/data/glossary';

// 용어 사전을 색인 가능한 웹 페이지로 발행하기 위한 보조 모듈.
//
// 배경: GLOSSARY의 40여 개 설명은 지금까지 앱 안의 툴팁으로만 쓰였다. 인스타 '투자 용어
// 1분' 카드로도 나가지만 이미지라 검색엔진이 읽지 못한다. 같은 내용을 /glossary/{slug}
// 페이지로 발행하면 "PER 뜻", "부채비율 계산" 같은 롱테일 검색의 진입점이 된다.
// 각 상세는 같은 분류의 다른 용어를 링크해 내부 링크 그래프도 함께 만든다.

/** 용어 → URL 슬러그. 공백·슬래시는 하이픈으로, ASCII는 소문자로. 한글은 그대로 둔다. */
export function termSlug(term: string): string {
  return term.trim().replace(/[\s/]+/g, '-').toLowerCase();
}

export const TERMS: string[] = Object.keys(GLOSSARY);

/** 슬러그 → 원본 용어 역인덱스(대소문자·인코딩 차이를 흡수). */
const BY_SLUG = new Map<string, string>(TERMS.map((t) => [termSlug(t), t]));

export function termFromSlug(slug: string): string | null {
  return BY_SLUG.get(decodeURIComponent(slug).trim().toLowerCase()) ?? null;
}

export function definitionOf(term: string): string {
  return GLOSSARY[term] ?? '';
}

// 분류 — 허브의 묶음이자 상세의 '관련 용어' 기준. 여기 안 적힌 용어는 '기타'로 자동 편입되므로
// GLOSSARY에 용어를 추가해도 페이지에서 누락되지 않는다.
const GROUP_DEFS: { key: string; title: string; note: string; terms: string[] }[] = [
  {
    key: 'macro',
    title: '거시·시장 지표',
    note: '금리·물가·환율처럼 시장 전체를 움직이는 지표',
    terms: ['CPI', 'PCE', 'GDP', 'FOMC', 'ECB', 'BOJ', 'DXY', 'VIX', '김치프리미엄', 'HBM'],
  },
  {
    key: 'valuation',
    title: '밸류에이션(주가가 싼가 비싼가)',
    note: '이익·자산 대비 주가 수준을 보는 지표',
    terms: ['PER', '추정PER', 'PBR', 'PEG', 'EV/EBITDA', 'EPS', 'BPS', '목표주가', '상승여력', '투자의견', '밸류'],
  },
  {
    key: 'financial',
    title: '수익성·재무 안정성',
    note: '얼마나 잘 벌고 얼마나 튼튼한가',
    terms: ['ROE', '순이익률', '영업이익률', '자유현금흐름', '배당수익률', '부채비율', '당좌비율', '유동비율', '퀄리티', '안정성', '주주환원'],
  },
  {
    key: 'market',
    title: '시세·거래',
    note: '가격이 어떻게 움직이고 얼마나 거래되는가',
    terms: ['시가총액', '거래대금', 'ATR', '이동평균선', '기간 수익률', '위험도', '외인소진율'],
  },
  {
    key: 'trade',
    title: '매매 규칙',
    note: '언제 사고 언제 파는지에 대한 기준',
    terms: ['손절', '익절', '트레일링 스톱'],
  },
];

export interface TermGroup { key: string; title: string; note: string; terms: string[] }

export const GROUPS: TermGroup[] = (() => {
  const assigned = new Set<string>();
  const groups = GROUP_DEFS.map((g) => {
    const terms = g.terms.filter((t) => t in GLOSSARY);
    terms.forEach((t) => assigned.add(t));
    return { ...g, terms };
  });
  const rest = TERMS.filter((t) => !assigned.has(t));
  if (rest.length) groups.push({ key: 'etc', title: '기타', note: '그 밖의 용어', terms: rest });
  return groups.filter((g) => g.terms.length > 0);
})();

/** 이 용어가 속한 분류(없으면 null). */
export function groupOf(term: string): TermGroup | null {
  return GROUPS.find((g) => g.terms.includes(term)) ?? null;
}

/** 같은 분류의 다른 용어 — 상세 페이지의 '관련 용어' 내부 링크. */
export function relatedTerms(term: string, limit = 8): string[] {
  const g = groupOf(term);
  if (!g) return [];
  return g.terms.filter((t) => t !== term).slice(0, limit);
}

// 용어별로 "사이트 어디서 실제로 보나" 연결 — 사전에서 끝나지 않고 서비스로 들어오게.
const USED_ON: { path: string; label: string; terms: string[] }[] = [
  { path: '/value', label: '저평가 우량주 스크리너', terms: ['PER', '추정PER', 'PBR', 'PEG', 'EV/EBITDA', 'ROE', 'EPS', 'BPS', '순이익률', '영업이익률', '부채비율', '당좌비율', '유동비율', '자유현금흐름', '배당수익률', '밸류', '퀄리티', '안정성', '주주환원', '목표주가', '상승여력', '투자의견'] },
  { path: '/stocks', label: '종목 시세', terms: ['시가총액', '거래대금', '위험도', 'ATR', '이동평균선', '기간 수익률', '외인소진율', '손절', '익절', '트레일링 스톱'] },
  { path: '/', label: '대시보드', terms: ['CPI', 'PCE', 'GDP', 'FOMC', 'ECB', 'BOJ', 'DXY', 'VIX', '김치프리미엄', 'HBM'] },
  { path: '/etf', label: 'ETF', terms: ['배당수익률', '기간 수익률', '시가총액'] },
];

export function usedOn(term: string): { path: string; label: string }[] {
  return USED_ON.filter((u) => u.terms.includes(term)).map(({ path, label }) => ({ path, label }));
}
