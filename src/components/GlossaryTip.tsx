'use client';

import { useRef, type ReactNode } from 'react';
import type { GlossHit } from '../lib/glossary';
import { GLOSSARY } from '../data/glossary';

// 팝오버가 화면 밖으로 나가지 않게: 표시 시점(hover/focus/tap)에 위치를 재고 뷰포트 안으로 밀어넣는다.
// 모바일(375px)에서 오른쪽 끝 용어를 탭하면 툴팁이 잘려 보이던 문제의 공통 해결.
// (인라인 gloss-pop을 직접 그리는 곳 — ValueStocks Badge 등 — 도 이 훅을 재사용)
export function useClampPop() {
  const popRef = useRef<HTMLSpanElement>(null);
  const onReveal = () => {
    const el = popRef.current;
    if (!el) return;
    el.style.transform = ''; // 이전 보정 초기화 후 재측정
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const M = 10; // 화면 가장자리 여백
    let dx = 0;
    if (r.right > vw - M) dx = vw - M - r.right;
    if (r.left + dx < M) dx = M - r.left;
    if (dx !== 0) el.style.transform = `translateX(${Math.round(dx)}px)`;
  };
  return { popRef, onReveal };
}

// 팝 폭: 지정 폭이 뷰포트보다 크면 뷰포트에 맞춤(모바일).
const popWidth = (w: number) => `min(${w}px, calc(100vw - 24px))`;

// 용어에 점선 밑줄 + 호버/탭 시 설명 툴팁. term이 사전에 없으면 그냥 텍스트만 보여준다.
// up=위로, align='right'=오른쪽 정렬(우측 끝 셀에서 화면 밖으로 넘치지 않게).
// 아래로 여는 기본값은 다음 섹션 카드(backdrop-filter=독립 stacking context)에 덮일 수 있어,
// 카드형 지표 목록에서는 up을 쓰는 걸 권장.
export function TermTip({
  term, children, width = 250, up = false, align = 'left',
}: { term: string; children?: ReactNode; width?: number; up?: boolean; align?: 'left' | 'right' }) {
  const def = GLOSSARY[term];
  const content = children ?? term;
  const { popRef, onReveal } = useClampPop();
  if (!def) return <>{content}</>;
  return (
    <span className={`gloss${up ? ' gloss-up' : ''}`} tabIndex={0} onMouseEnter={onReveal} onFocus={onReveal} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'help', outline: 'none' }}>
      <span style={{ borderBottom: '1px dotted var(--c-w22)' }}>{content}</span>
      <span
        ref={popRef}
        className="gloss-pop"
        style={{
          position: 'absolute', ...(up ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }),
          ...(align === 'right' ? { right: 0 } : { left: 0 }), width: popWidth(width),
          background: 'var(--c-panel)', border: '1px solid var(--c-w12)', borderRadius: 12,
          padding: '12px 14px', boxShadow: '0 14px 36px var(--c-shadow)', zIndex: 70, textAlign: 'left', whiteSpace: 'normal',
        }}
      >
        <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--c-accyanbr)', marginBottom: 5 }}>{term}</span>
        <span style={{ display: 'block', fontSize: 12, lineHeight: 1.55, color: 'var(--c-tx3)', fontWeight: 400 }}>{def}</span>
      </span>
    </span>
  );
}

// 임의 문구용 호버 툴팁(용어사전과 무관). 자식(앵커)을 감싸면 호버/포커스 시 설명 팝오버를 띄운다.
// .gloss/.gloss-pop CSS(hover·focus reveal)를 재사용한다.
export function Tip({
  title, body, children, width = 240, up = false, align = 'left',
}: { title?: string; body: string; children: ReactNode; width?: number; up?: boolean; align?: 'left' | 'right' }) {
  const { popRef, onReveal } = useClampPop();
  return (
    <span className={`gloss${up ? ' gloss-up' : ''}`} tabIndex={0} onMouseEnter={onReveal} onFocus={onReveal} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', outline: 'none' }}>
      {children}
      <span
        ref={popRef}
        className="gloss-pop"
        style={{
          position: 'absolute', ...(up ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }),
          ...(align === 'right' ? { right: 0 } : { left: 0 }), width: popWidth(width),
          background: 'var(--c-panel)', border: '1px solid var(--c-w12)', borderRadius: 12,
          padding: '12px 14px', boxShadow: '0 14px 36px var(--c-shadow)', zIndex: 70, textAlign: 'left', whiteSpace: 'normal',
        }}
      >
        {title && <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--c-accyanbr)', marginBottom: 5 }}>{title}</span>}
        <span style={{ display: 'block', fontSize: 12, lineHeight: 1.55, color: 'var(--c-tx3)', fontWeight: 400 }}>{body}</span>
      </span>
    </span>
  );
}

// The ⓘ glossary badge + hover popover (250px). Shown wherever a known term appears.
export function GlossaryTip({ hit, zIndex = 45 }: { hit: GlossHit; zIndex?: number }) {
  const { popRef, onReveal } = useClampPop();
  return (
    <span className="gloss" tabIndex={0} onMouseEnter={onReveal} onFocus={onReveal} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', outline: 'none' }}>
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--c-w22)',
          color: 'var(--c-tx4)', fontSize: 10, fontWeight: 700, cursor: 'help', flexShrink: 0,
        }}
      >
        i
      </span>
      <span
        ref={popRef}
        className="gloss-pop"
        style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, width: popWidth(250),
          background: 'var(--c-panel)', border: '1px solid var(--c-w12)',
          borderRadius: 12, padding: '12px 14px', boxShadow: '0 14px 36px var(--c-shadow)',
          zIndex, textAlign: 'left',
        }}
      >
        <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--c-accyanbr)', marginBottom: 5 }}>
          {hit.term}
        </span>
        <span style={{ display: 'block', fontSize: 12, lineHeight: 1.55, color: 'var(--c-tx3)' }}>{hit.def}</span>
      </span>
    </span>
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
