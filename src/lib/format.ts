import type { Currency, RiskLevel } from '../types';

// Formatting / color helpers — ported verbatim from the prototype's renderVals().

export function fmtPrice(n: number, cur: Currency): string {
  if (cur === '₩') return '₩' + Math.round(n).toLocaleString('ko-KR');
  const dec = n < 1 ? 4 : 2;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function fmtPct(p: number): string {
  return (p >= 0 ? '+' : '') + p.toFixed(2) + '%';
}

export function upColor(p: number): string {
  return p > 0 ? '#34d39a' : p < 0 ? '#f6685e' : '#9AA6BC';
}

export interface RiskMeta {
  label: string;
  color: string;
  bg: string;
}

export function riskMeta(r: RiskLevel): RiskMeta {
  if (r === 'low') return { label: '낮음', color: '#2dd4bf', bg: 'rgba(45,212,191,0.12)' };
  if (r === 'high') return { label: '높음', color: '#f6685e', bg: 'rgba(246,104,94,0.12)' };
  return { label: '중간', color: '#f5b544', bg: 'rgba(245,181,68,0.12)' };
}

export function scoreColor(s: number): string {
  return s < 40 ? '#2dd4bf' : s < 70 ? '#f5b544' : '#f6685e';
}

// 주식 거래량(주 수량) — 전체 숫자, 콤마 구분(축약 단위 안 씀).
export function formatVol(n: number): string {
  return Math.round(n).toLocaleString('ko-KR');
}

// 거래대금(value) 표기 — 통화 기호 + 전체 숫자(콤마 구분, 축약 안 씀).
export function fmtTradeValue(n: number, cur: Currency): string {
  return (cur === '$' ? '$' : '₩') + Math.round(n).toLocaleString('ko-KR');
}

// Impact-tag pill colors (고영향 / 중간).
export function tagColors(tag: string): { bg: string; color: string } {
  return tag === '고영향'
    ? { bg: 'rgba(246,104,94,0.14)', color: '#f6685e' }
    : { bg: 'rgba(245,181,68,0.14)', color: '#f5b544' };
}
