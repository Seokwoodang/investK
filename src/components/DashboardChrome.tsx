'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { DashboardData } from '@/types';
import { useLayout, useViewport, type Layout } from '@/lib/useViewport';
import { DashboardProvider } from '@/store/DashboardContext';
import { RealtimeProvider } from '@/store/RealtimeContext';
import { Header } from './Header';
import { Footer } from './Footer';
import { EventModal } from './EventModal';

interface ViewportLayout {
  vw: number;
  layout: Layout;
}
const LayoutCtx = createContext<ViewportLayout | null>(null);

export function useViewportLayout(): ViewportLayout {
  const ctx = useContext(LayoutCtx);
  if (!ctx) throw new Error('useViewportLayout must be used within DashboardChrome');
  return ctx;
}

// 공유 셸: 데이터/실시간 프로바이더 + 헤더/푸터/모달 + 반응형 레이아웃 컨텍스트.
// 라우트 layout에서 1회 마운트되어 페이지 이동 간에도 유지(소켓·상태 보존).
export function DashboardChrome({ data, children }: { data: DashboardData; children: ReactNode }) {
  const vw = useViewport();
  const layout = useLayout(vw);

  return (
    <DashboardProvider data={data}>
      <RealtimeProvider>
        <LayoutCtx.Provider value={{ vw, layout }}>
          <div style={{ position: 'relative', minHeight: '100vh', overflowX: 'hidden' }}>
            <div style={{ position: 'fixed', top: -220, left: -160, width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle, var(--c-cy14), transparent 62%)', filter: 'blur(40px)', pointerEvents: 'none', zIndex: 0 }} />
            <div style={{ position: 'fixed', top: 140, right: -220, width: 620, height: 620, borderRadius: '50%', background: 'radial-gradient(circle, var(--c-bl12), transparent 62%)', filter: 'blur(40px)', pointerEvents: 'none', zIndex: 0 }} />

            <Header />

            <div style={{ position: 'relative', zIndex: 1, maxWidth: 1280, margin: '0 auto', padding: `36px ${layout.padX} 96px` }}>
              {children}
              <Footer />
            </div>

            <EventModal />
          </div>
        </LayoutCtx.Provider>
      </RealtimeProvider>
    </DashboardProvider>
  );
}
