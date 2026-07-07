'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
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

// 로그인 여부(서버 layout에서 판정해 내려줌). 공개 페이지가 개인 API(/api/portfolio 등)를
// 익명으로 호출해 401을 만드는 것을 막는 데 쓴다.
const AuthedCtx = createContext(false);
export const useAuthed = () => useContext(AuthedCtx);

// 관리자 여부(swoo1427). 관리자 전용 UI(K-리서치 '다시분석' 등)에서 사용.
const AdminCtx = createContext(false);
export const useAdmin = () => useContext(AdminCtx);

// 공유 셸: 데이터/실시간 프로바이더 + 헤더/푸터/모달 + 반응형 레이아웃 컨텍스트.
// 라우트 layout에서 1회 마운트되어 페이지 이동 간에도 유지(소켓·상태 보존).
export function DashboardChrome({ data, children, authed = true, isAdmin = false, uid = null }: { data: DashboardData; children: ReactNode; authed?: boolean; isAdmin?: boolean; uid?: string | null }) {
  const vw = useViewport();
  const layout = useLayout(vw);

  // GA User-ID: 로그인 계정의 불투명 uid를 GA에 붙여 이후 이벤트를 계정 단위로 묶는다(uuid라 PII 아님).
  // gtag('set', {user_id}) 형태로 dataLayer에 큐잉 — GA 스크립트 로드 순서와 무관하게 적용된다.
  useEffect(() => {
    if (!uid || typeof window === 'undefined') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    w.dataLayer = w.dataLayer || [];
    // 로드된 gtag가 있으면 그걸, 없으면 표준 큐 함수로(스크립트 로드 전이라도 dataLayer에 큐잉).
    // eslint-disable-next-line prefer-rest-params
    const g = w.gtag || function () { w.dataLayer.push(arguments); };
    g('set', { user_id: uid });
  }, [uid]);

  return (
    <DashboardProvider data={data}>
      <RealtimeProvider>
        <AuthedCtx.Provider value={authed}>
        <AdminCtx.Provider value={isAdmin}>
        <LayoutCtx.Provider value={{ vw, layout }}>
          <div style={{ position: 'relative', minHeight: '100vh', overflowX: 'hidden' }}>
            <div style={{ position: 'fixed', top: -220, left: -160, width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle, var(--c-cy14), transparent 62%)', filter: 'blur(40px)', pointerEvents: 'none', zIndex: 0 }} />
            <div style={{ position: 'fixed', top: 140, right: -220, width: 620, height: 620, borderRadius: '50%', background: 'radial-gradient(circle, var(--c-bl12), transparent 62%)', filter: 'blur(40px)', pointerEvents: 'none', zIndex: 0 }} />

            <Header authed={authed} isAdmin={isAdmin} />

            <div style={{ position: 'relative', zIndex: 1, maxWidth: 1280, margin: '0 auto', padding: `36px ${layout.padX} 20px` }}>
              {children}
              <Footer />
            </div>

            <EventModal />
          </div>
        </LayoutCtx.Provider>
        </AdminCtx.Provider>
        </AuthedCtx.Provider>
      </RealtimeProvider>
    </DashboardProvider>
  );
}
