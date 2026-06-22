import type { GlossHit } from '../lib/glossary';

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
