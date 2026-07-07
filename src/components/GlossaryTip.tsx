import type { ReactNode } from 'react';
import type { GlossHit } from '../lib/glossary';
import { GLOSSARY } from '../data/glossary';

// 용어에 점선 밑줄 + 호버/탭 시 설명 툴팁. term이 사전에 없으면 그냥 텍스트만 보여준다.
// up=위로, align='right'=오른쪽 정렬(우측 끝 셀에서 화면 밖으로 넘치지 않게).
// 아래로 여는 기본값은 다음 섹션 카드(backdrop-filter=독립 stacking context)에 덮일 수 있어,
// 카드형 지표 목록에서는 up을 쓰는 걸 권장.
export function TermTip({
  term, children, width = 250, up = false, align = 'left',
}: { term: string; children?: ReactNode; width?: number; up?: boolean; align?: 'left' | 'right' }) {
  const def = GLOSSARY[term];
  const content = children ?? term;
  if (!def) return <>{content}</>;
  return (
    <span className={`gloss${up ? ' gloss-up' : ''}`} tabIndex={0} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'help', outline: 'none' }}>
      <span style={{ borderBottom: '1px dotted var(--c-w22)' }}>{content}</span>
      <span
        className="gloss-pop"
        style={{
          position: 'absolute', ...(up ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }),
          ...(align === 'right' ? { right: 0 } : { left: 0 }), width,
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
  return (
    <span className={`gloss${up ? ' gloss-up' : ''}`} tabIndex={0} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', outline: 'none' }}>
      {children}
      <span
        className="gloss-pop"
        style={{
          position: 'absolute', ...(up ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }),
          ...(align === 'right' ? { right: 0 } : { left: 0 }), width,
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
  return (
    <span className="gloss" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
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
        className="gloss-pop"
        style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, width: 250,
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
