'use client';

import { useEffect, useRef } from 'react';
import { useViewportLayout } from './DashboardChrome';

// 카카오 애드핏 광고 슬롯. 유닛 ID가 env에 없으면 아무것도 렌더하지 않는다(빈 박스 금지).
// 광고를 '따로 노는 흰 박스'가 아니라 앱 카드 문법 안에 넣기 위해 두 변형을 제공:
//  - variant="card":   그리드의 카드 한 칸으로 렌더(뉴스 그리드·매크로 3열 등). 앱 카드와 같은
//                      배경/테두리/라운드, 내부에 광고를 중앙 배치. PC 300×250 / 모바일 320×100.
//  - variant="banner": 가로로 긴 자리(데일리 중간 등). PC는 728×90 배너(유닛 있으면) →
//                      정사각보다 훨씬 덜 침입적. 없으면 300×250 폴백. 모바일 320×100.
// SPA 대응: 마운트/유닛 변경 시 <ins>+ba.min.js를 새로 삽입(애드핏 스크립트는 로드 시점의 ins만 처리).

const UNIT_PC = process.env.NEXT_PUBLIC_ADFIT_UNIT_PC || ''; // 300×250
const UNIT_MO = process.env.NEXT_PUBLIC_ADFIT_UNIT_MO || ''; // 320×100
const UNIT_BANNER = process.env.NEXT_PUBLIC_ADFIT_UNIT_BANNER_PC || ''; // 728×90 (선택 — 있으면 배너 자리 우선 사용)

function useAdInject(unit: string, w: number, h: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!unit || !el) return;
    el.innerHTML = '';
    const ins = document.createElement('ins');
    ins.className = 'kakao_ad_area';
    ins.style.display = 'none';
    ins.setAttribute('data-ad-unit', unit);
    ins.setAttribute('data-ad-width', String(w));
    ins.setAttribute('data-ad-height', String(h));
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://t1.kakaocdn.net/kas/static/ba.min.js';
    el.appendChild(ins);
    el.appendChild(s);
  }, [unit, w, h]);
  return ref;
}

const LABEL: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--c-tx6)' };

export function AdSlot({ variant = 'banner', style }: { variant?: 'card' | 'banner'; style?: React.CSSProperties }) {
  const { vw } = useViewportLayout();
  const pc = vw >= 720;

  // 변형·화면폭에 따라 유닛/크기 결정. 728 배너는 폭 여유가 확실할 때만(≥860px) → 좁은 화면 잘림 방지.
  let unit = UNIT_MO, w = 320, h = 100;
  if (pc) {
    if (variant === 'banner' && UNIT_BANNER && vw >= 860) { unit = UNIT_BANNER; w = 728; h = 90; }
    else { unit = UNIT_PC; w = 300; h = 250; }
  }
  const ref = useAdInject(unit, w, h);

  if (!unit) return null; // 유닛 미설정 = 슬롯 자체를 그리지 않음

  if (variant === 'card') {
    // 그리드 칸 하나를 차지하는 '광고 카드' — 주변 카드와 같은 문법(배경·테두리·라운드).
    // 모바일: 320px 고정 소재 + 좌우 패딩이 그리드 1fr 트랙의 min-content를 뷰포트보다 크게 만들어
    // 옆 카드까지 전부 밀리던 문제 → 좁은 화면에선 좌우 패딩 축소 + minWidth:0.
    return (
      <div
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
          minHeight: h + 56, height: '100%', boxSizing: 'border-box', padding: vw < 420 ? '20px 8px' : 20, borderRadius: 20,
          background: 'var(--c-w04)', border: '1px solid var(--c-w08)', minWidth: 0,
          backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
          ...style,
        }}
      >
        <span style={LABEL}>광고 · AD</span>
        {/* 광고 소재는 변형 금지(애드핏 규정): 라운딩/overflow-hidden 없이 원본 그대로 노출 */}
        <div ref={ref} style={{ width: w, height: h }} />
      </div>
    );
  }

  // banner: 가로 자리 — 얇은 프레임으로 중앙 배치(728×90이면 슬림해서 흐름을 덜 끊음).
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '28px 0', ...style }}>
      <div
        style={{
          display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          padding: '10px 10px 12px', borderRadius: 16, maxWidth: '100%',
          background: 'var(--c-w03)', border: '1px solid var(--c-w07)',
        }}
      >
        <span style={LABEL}>광고 · AD</span>
        {/* 광고 소재는 변형 금지(애드핏 규정): 라운딩/overflow-hidden 없이 원본 그대로 노출 */}
        <div ref={ref} style={{ width: w, height: h }} />
      </div>
    </div>
  );
}
