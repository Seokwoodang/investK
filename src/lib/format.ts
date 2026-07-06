import type { Currency, RiskLevel } from '../types';

// Formatting / color helpers — ported verbatim from the prototype's renderVals().

export function fmtPrice(n: number, cur: Currency): string {
  if (cur === '₩') {
    // 1원 미만(일부 알트코인)은 반올림하면 "₩0"이 되므로 소수 유지.
    if (n > 0 && n < 1) return '₩' + n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return '₩' + Math.round(n).toLocaleString('ko-KR');
  }
  const dec = n < 1 ? 4 : 2;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function fmtPct(p: number): string {
  return (p >= 0 ? '+' : '') + p.toFixed(2) + '%';
}

export function upColor(p: number): string {
  return p > 0 ? 'var(--c-up)' : p < 0 ? 'var(--c-down)' : 'var(--c-tx4)';
}

export interface RiskMeta {
  label: string;
  color: string;
  bg: string;
}

export function riskMeta(r: RiskLevel): RiskMeta {
  if (r === 'low') return { label: '낮음', color: 'var(--c-tealx)', bg: 'var(--c-tl12)' };
  if (r === 'high') return { label: '높음', color: 'var(--c-down)', bg: 'var(--c-rd12)' };
  return { label: '중간', color: 'var(--c-warn)', bg: 'var(--c-am12)' };
}

export function scoreColor(s: number): string {
  return s < 40 ? 'var(--c-tealx)' : s < 70 ? 'var(--c-warn)' : 'var(--c-down)';
}

// 주식 거래량(주 수량) — 전체 숫자, 콤마 구분(축약 단위 안 씀).
export function formatVol(n: number): string {
  return Math.round(n).toLocaleString('ko-KR');
}

// 거래대금(value) 표기 — 큰 수는 조/억(₩)·B/M($)으로 축약해 목록 가독성 확보.
// (과거엔 "₩10,593,644,000,000"처럼 전체 자릿수를 표기해 읽기 어려웠음)
export function fmtTradeValue(n: number, cur: Currency): string {
  if (cur === '$') {
    const a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  const a = Math.abs(n);
  if (a >= 1e12) return '₩' + (n / 1e12).toFixed(1) + '조';
  if (a >= 1e8) return '₩' + Math.round(n / 1e8).toLocaleString('ko-KR') + '억';
  return '₩' + Math.round(n).toLocaleString('ko-KR');
}

// Impact-tag pill colors (고영향 / 중간 / 실적).
export function tagColors(tag: string): { bg: string; color: string } {
  if (tag === '고영향') return { bg: 'var(--c-rd14)', color: 'var(--c-down)' };
  if (tag === '실적') return { bg: 'var(--c-cy16)', color: 'var(--c-accyanbr)' };
  return { bg: 'var(--c-am14)', color: 'var(--c-warn)' };
}
