'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { GlossHit } from '../lib/glossary';
import { GLOSSARY } from '../data/glossary';

// SSR에서 useLayoutEffect 경고 방지.
const useIso = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// 공통 팝오버 — 툴팁 내용을 document.body에 portal로 렌더해 모든 스택 컨텍스트(backdrop-filter 카드 등)와
// overflow 클리핑을 탈출시킨다. 이래야 "다음 카드에 덮여서 안 보임 / 화면 밖으로 잘림" 문제가 원천 해결된다.
// hover(데스크톱)·focus·tap(모바일)에서 열리고, 스크롤/리사이즈/blur 시 닫힌다. 위치는 앵커 기준으로
// 뷰포트 안에 들어오도록 계산(공간 부족 시 위로 뒤집음).
export function Popover({
  content, children, width = 250, anchorStyle,
}: { content: ReactNode; children: ReactNode; width?: number; anchorStyle?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });
  const [mounted, setMounted] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const place = () => {
    const a = anchorRef.current?.getBoundingClientRect();
    const p = popRef.current;
    if (!a || !p) return;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const pw = p.offsetWidth, ph = p.offsetHeight;
    let left = Math.min(a.left, vw - pw - 10);
    left = Math.max(10, left);
    let top = a.bottom + 6;
    if (top + ph > vh - 10 && a.top - ph - 6 > 10) top = a.top - ph - 6; // 아래 공간 부족 → 위로
    setPos({ top, left });
  };

  useIso(() => { if (open) place(); /* eslint-disable-next-line */ }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);

  return (
    <span
      ref={anchorRef}
      tabIndex={0}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen((o) => !o)}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', outline: 'none', cursor: 'help', ...anchorStyle }}
    >
      {children}
      {mounted && open && createPortal(
        <div
          ref={popRef}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, width: `min(${width}px, calc(100vw - 20px))`,
            zIndex: 9999, background: 'var(--c-panel)', border: '1px solid var(--c-w12)', borderRadius: 12,
            padding: '12px 14px', boxShadow: '0 14px 36px var(--c-shadow)', textAlign: 'left', whiteSpace: 'normal',
            pointerEvents: 'none',
          }}
        >
          {content}
        </div>,
        document.body,
      )}
    </span>
  );
}

const popTitle = (color = 'var(--c-accyanbr)'): React.CSSProperties => ({ display: 'block', fontSize: 11, fontWeight: 700, color, marginBottom: 5 });
const popBody: React.CSSProperties = { display: 'block', fontSize: 12, lineHeight: 1.55, color: 'var(--c-tx3)', fontWeight: 400 };

// 용어에 점선 밑줄 + 호버/탭 시 설명 툴팁. term이 사전에 없으면 그냥 텍스트만 보여준다.
export function TermTip({
  term, children, width = 250,
}: { term: string; children?: ReactNode; width?: number; up?: boolean; align?: 'left' | 'right' }) {
  const def = GLOSSARY[term];
  const content = children ?? term;
  if (!def) return <>{content}</>;
  return (
    <Popover width={width} content={<><span style={popTitle()}>{term}</span><span style={popBody}>{def}</span></>}>
      <span style={{ borderBottom: '1px dotted var(--c-w22)' }}>{content}</span>
    </Popover>
  );
}

// 임의 문구용 호버 툴팁(용어사전과 무관).
export function Tip({
  title, body, children, width = 240,
}: { title?: string; body: string; children: ReactNode; width?: number; up?: boolean; align?: 'left' | 'right' }) {
  return (
    <Popover width={width} anchorStyle={{ cursor: 'default' }} content={<>{title && <span style={popTitle()}>{title}</span>}<span style={popBody}>{body}</span></>}>
      {children}
    </Popover>
  );
}

// The ⓘ glossary badge + popover. Shown wherever a known term appears.
export function GlossaryTip({ hit }: { hit: GlossHit; zIndex?: number }) {
  return (
    <Popover content={<><span style={popTitle()}>{hit.term}</span><span style={popBody}>{hit.def}</span></>}>
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--c-w22)',
          color: 'var(--c-tx4)', fontSize: 10, fontWeight: 700, flexShrink: 0,
        }}
      >
        i
      </span>
    </Popover>
  );
}

// Impact tag pill (고영향 / 중간).
export function ImpactTag({ tag }: { tag: string }) {
  const colors =
    tag === '고영향'
      ? { bg: 'var(--c-rd14)', color: 'var(--c-down)' }
      : { bg: 'var(--c-am14)', color: 'var(--c-warn)' };
  return (
    <span
      style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', padding: '3px 9px',
        borderRadius: 999, whiteSpace: 'nowrap', background: colors.bg, color: colors.color,
      }}
    >
      {tag}
    </span>
  );
}
