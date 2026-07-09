'use client';

import { useEffect, useRef } from 'react';
import { useViewportLayout } from './DashboardChrome';

// 카카오 애드핏 광고 슬롯. 유닛 ID가 env에 없으면 아무것도 렌더하지 않는다(빈 박스 금지).
//  - PC(vw>=720): 300×250 (NEXT_PUBLIC_ADFIT_UNIT_PC)
//  - 모바일:      320×100 (NEXT_PUBLIC_ADFIT_UNIT_MO)
// 크기를 컨테이너에 미리 고정해 광고 로드 시 레이아웃 시프트가 없다.
// SPA 대응: 슬롯이 마운트/유닛변경될 때마다 <ins> + ba.min.js를 새로 삽입한다.
//   (애드핏 스크립트는 로드 시점의 ins만 처리 → 페이지 이동으로 나중에 생긴 ins는
//    스크립트를 다시 붙여줘야 렌더된다.)

const UNIT_PC = process.env.NEXT_PUBLIC_ADFIT_UNIT_PC || '';
const UNIT_MO = process.env.NEXT_PUBLIC_ADFIT_UNIT_MO || '';

export function AdSlot({ style }: { style?: React.CSSProperties }) {
  const { vw } = useViewportLayout();
  const pc = vw >= 720;
  const unit = pc ? UNIT_PC : UNIT_MO;
  const w = pc ? 300 : 320;
  const h = pc ? 250 : 100;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!unit || !el) return;
    el.innerHTML = ''; // 유닛(모바일↔PC) 바뀌면 이전 광고 제거
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

  if (!unit) return null; // 유닛 미설정 = 슬롯 자체를 그리지 않음

  return (
    // '광고' 라벨 + 크기 선확보. 라벨이 있어야 "깨진 콘텐츠"가 아니라 광고로 읽힌다.
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, margin: '28px 0', ...style }}>
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--c-tx6)' }}>광고 · AD</span>
      <div ref={ref} style={{ width: w, height: h, overflow: 'hidden', borderRadius: 8 }} />
    </div>
  );
}
