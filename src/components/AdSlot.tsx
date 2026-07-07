'use client';

import { useEffect, useRef } from 'react';
import { useViewportLayout } from './DashboardChrome';

// 카카오 애드핏 광고 슬롯. 유닛 ID가 env에 없으면 아무것도 렌더하지 않는다(빈 박스 금지).
//  - PC(vw>=720): 300×250 (NEXT_PUBLIC_ADFIT_UNIT_PC)
//  - 모바일:      320×100 (NEXT_PUBLIC_ADFIT_UNIT_MO)
// 크기를 컨테이너에 미리 고정해 광고 로드 시 레이아웃 시프트가 없다.
// 활성화: Vercel env에 유닛 ID 2개 추가 → 재배포. (애드핏 심사 통과 후)

const UNIT_PC = process.env.NEXT_PUBLIC_ADFIT_UNIT_PC || '';
const UNIT_MO = process.env.NEXT_PUBLIC_ADFIT_UNIT_MO || '';

let scriptLoaded = false;
function ensureScript() {
  if (scriptLoaded || typeof document === 'undefined') return;
  scriptLoaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://t1.daumcdn.net/kas/static/ba.min.js';
  document.body.appendChild(s);
}

export function AdSlot({ style }: { style?: React.CSSProperties }) {
  const { vw } = useViewportLayout();
  const pc = vw >= 720;
  const unit = pc ? UNIT_PC : UNIT_MO;
  const w = pc ? 300 : 320;
  const h = pc ? 250 : 100;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (unit) ensureScript();
  }, [unit]);

  if (!unit) return null; // 유닛 미설정 = 슬롯 자체를 그리지 않음

  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0', ...style }}>
      <div ref={ref} style={{ width: w, height: h, overflow: 'hidden' }}>
        <ins
          className="kakao_ad_area"
          style={{ display: 'block', width: w, height: h }}
          data-ad-unit={unit}
          data-ad-width={String(w)}
          data-ad-height={String(h)}
        />
      </div>
    </div>
  );
}
