'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MAX_INTERESTS } from '../lib/interests';
import { sectorsOf } from '../lib/sectors';

// 관심 분야(섹터) 선택 모달. 국내 12 / 해외 12 칩을 다중 선택해 저장.
// 설정 전용 라우트를 새로 만들지 않고 인라인 모달로 둔다(칩 24개 + 저장 버튼이 전부).
// 포털·스크롤락 껍데기는 SectorModal과 동일한 패턴.

const KR = sectorsOf('kr');
const US = sectorsOf('us');

export function InterestPicker({
  initial,
  onSave,
  onClose,
}: {
  initial: string[];
  onSave: (sectors: string[]) => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState<string[]>(initial);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const full = sel.length >= MAX_INTERESTS;
  const toggle = (key: string) =>
    setSel((s) => (s.includes(key) ? s.filter((k) => k !== key) : full ? s : [...s, key]));

  const chip = (key: string, label: string) => {
    const on = sel.includes(key);
    const disabled = !on && full;
    return (
      <button
        key={key}
        onClick={() => toggle(key)}
        disabled={disabled}
        style={{
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 700,
          padding: '9px 15px',
          borderRadius: 999,
          transition: 'all 140ms',
          background: on ? 'var(--c-cy16)' : 'var(--c-w04)',
          border: `1px solid ${on ? 'var(--c-accyan)' : 'var(--c-w08)'}`,
          color: on ? 'var(--c-accyanbr)' : disabled ? 'var(--c-tx6)' : 'var(--c-tx3)',
          opacity: disabled ? 0.45 : 1,
        }}
      >
        {on ? '✓ ' : ''}
        {label}
      </button>
    );
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100, background: 'var(--c-overlay)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 4vw, 24px)',
        overflow: 'hidden',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: 'min(92dvh, 780px)', background: 'var(--c-panel97)',
          border: '1px solid var(--c-w10)', borderRadius: 24,
          boxShadow: '0 24px 80px var(--c-shadow)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px clamp(16px, 4vw, 26px)', borderBottom: '1px solid var(--c-w08)', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--c-tx1)' }}>관심 분야 선택</h3>
          <span style={{ fontSize: 12, color: full ? 'var(--c-warn)' : 'var(--c-tx6)' }}>
            {sel.length}/{MAX_INTERESTS}
          </span>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{ marginLeft: 'auto', cursor: 'pointer', background: 'var(--c-w06)', border: 'none', borderRadius: 9, width: 32, height: 32, color: 'var(--c-tx3)', fontSize: 18, lineHeight: 1, fontFamily: 'inherit' }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '18px clamp(16px, 4vw, 26px)', flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.6, color: 'var(--c-tx5)' }}>
            고른 분야의 뉴스·업종 흐름을 대시보드 맨 위에 모아서 보여드려요.
            보유·관심 종목은 따로 고르지 않아도 자동으로 반영됩니다.
          </p>

          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--c-accyan)', marginBottom: 10 }}>국내</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
            {KR.map((d) => chip(d.key, d.name))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--c-accyan)', marginBottom: 10 }}>해외</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {US.map((d) => chip(d.key, d.name))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '14px clamp(16px, 4vw, 26px)', borderTop: '1px solid var(--c-w08)', flexShrink: 0 }}>
          <button
            onClick={() => setSel([])}
            style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: '10px 16px', borderRadius: 11, background: 'transparent', border: '1px solid var(--c-w08)', color: 'var(--c-tx5)' }}
          >
            전체 해제
          </button>
          <button
            onClick={() => { onSave(sel); onClose(); }}
            style={{ marginLeft: 'auto', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, padding: '10px 22px', borderRadius: 11, background: 'var(--c-cy18)', border: 'none', color: 'var(--c-accyanbr)' }}
          >
            저장
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
