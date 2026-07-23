'use client';

import { useEffect, useRef, useState } from 'react';

// PWA 설치 유도 바텀시트. 모바일에서만, 미설치 + 최근 닫지 않은 경우 아래에서 올라온다.
//  · 안드로이드/크롬: beforeinstallprompt 이벤트를 잡아 네이티브 설치 다이얼로그 호출.
//  · iOS(Safari): 이벤트 미지원 → "공유 → 홈 화면에 추가" 가이드 표시.
// 서비스워커(/sw.js)도 여기서 등록해 설치 조건을 만족시킨다(웹푸시 구독 전에도 설치 가능하도록).

const DISMISS_KEY = 'pwa_install_dismiss'; // 값: 타임스탬프(ms) | '-1'(영구)
const SUPPRESS_DAYS = 14;

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
}
function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 640px)').matches || /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}
function suppressed(): boolean {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    if (v === '-1') return true;
    return Date.now() - Number(v) < SUPPRESS_DAYS * 86400000;
  } catch { return false; }
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [ios, setIos] = useState(false);
  const [render, setRender] = useState(false); // 마운트 유지(닫힘 애니메이션용)

  // (A) 항상: SW 등록 + beforeinstallprompt 캡처 + 설정의 '앱 설치' 버튼이 여는 커스텀 이벤트 수신.
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const onBip = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent); };
    const onInstalled = () => { setOpen(false); try { localStorage.setItem(DISMISS_KEY, '-1'); } catch { /* */ } };
    // 설정 '앱 설치' 버튼 → 억제/데스크톱 여부와 무관하게 시트를 연다.
    const onOpen = () => { setIos(isIos()); setRender(true); setTimeout(() => setOpen(true), 30); };
    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('ik:open-install', onOpen);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('ik:open-install', onOpen);
    };
  }, []);

  // (B) 자동 노출: 모바일 + 미설치 + 최근 안 닫음일 때만. iOS는 잠깐 뒤, 안드로이드는 bip 잡히면.
  useEffect(() => {
    if (isStandalone() || suppressed() || !isMobile()) return;
    if (isIos()) {
      setIos(true); setRender(true);
      const t = setTimeout(() => setOpen(true), 3500);
      return () => clearTimeout(t);
    }
    if (deferred) {
      setRender(true);
      const t = setTimeout(() => setOpen(true), 1500);
      return () => clearTimeout(t);
    }
  }, [deferred]);

  const close = (permanent = false) => {
    try { localStorage.setItem(DISMISS_KEY, permanent ? '-1' : String(Date.now())); } catch { /* */ }
    setOpen(false);
    setTimeout(() => setRender(false), 280);
  };

  // 시트 상단 핸들 드래그로 내려서 닫기.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef<number | null>(null);
  const lastDy = useRef(0);
  const onDragDown = (e: React.PointerEvent) => {
    startY.current = e.clientY;
    setDragging(true);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (startY.current == null) return;
    const dy = Math.max(0, e.clientY - startY.current);
    lastDy.current = dy;
    setDragY(dy);
  };
  const onDragUp = () => {
    if (startY.current == null) return;
    startY.current = null;
    setDragging(false);
    if (lastDy.current > 90) close(false); // 충분히 내리면 닫힘, 아니면 스냅백
    lastDy.current = 0;
    setDragY(0);
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      if (choice.outcome === 'accepted') { setOpen(false); setTimeout(() => setRender(false), 280); }
      else close(false);
    } catch { close(false); }
  };

  if (!render) return null;

  return (
    <>
      {/* 배경 딤 */}
      <div
        onClick={() => close(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)',
          opacity: open ? 1 : 0, transition: 'opacity .28s ease', pointerEvents: open ? 'auto' : 'none',
        }}
      />
      {/* 바텀시트 */}
      <div
        role="dialog"
        aria-label="앱 설치"
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 201,
          transform: open ? `translateY(${dragY}px)` : 'translateY(110%)',
          transition: dragging ? 'none' : 'transform .32s cubic-bezier(.22,1,.36,1)',
          background: 'var(--c-panel)', borderTop: '1px solid var(--c-w12)', borderRadius: '22px 22px 0 0',
          boxShadow: '0 -18px 48px rgba(0,0,0,.5)', padding: '22px 20px calc(24px + env(safe-area-inset-bottom))',
          maxWidth: 520, margin: '0 auto',
        }}
      >
        {/* 드래그 핸들 — 아래로 끌어 닫기(터치 영역을 넉넉히). */}
        <div
          onPointerDown={onDragDown}
          onPointerMove={onDragMove}
          onPointerUp={onDragUp}
          onPointerCancel={onDragUp}
          style={{ margin: '-14px 0 6px', padding: '14px 0 10px', cursor: 'grab', touchAction: 'none' }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--c-w12)', margin: '0 auto' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" width={44} height={44} style={{ borderRadius: 11, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-tx1c)' }}>InvestK 앱으로 설치</div>
            <div style={{ fontSize: 12, color: 'var(--c-tx6)' }}>홈 화면에 추가하고 앱처럼 빠르게</div>
          </div>
        </div>

        <ul style={{ margin: '0 0 18px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {['홈 화면에서 한 번에 실행', '주소창 없는 전체 화면', '가격·목표가 알림 받기'].map((b) => (
            <li key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--c-tx4)' }}>
              <span style={{ color: 'var(--c-accyanbr)', fontWeight: 800 }}>✓</span>{b}
            </li>
          ))}
        </ul>

        {ios ? (
          <>
            {/* iOS — beforeinstallprompt 미지원 → 수동 가이드 */}
            <div style={{ background: 'var(--c-w04)', border: '1px solid var(--c-w08)', borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Step n={1}><b style={{ color: 'var(--c-tx3)' }}>공유 버튼</b>(<span style={{ color: 'var(--c-acblue)' }}>⬆︎</span>)을 누르세요 <span style={{ color: 'var(--c-tx6)' }}>· 사파리는 하단, 크롬은 주소창 옆 상단</span></Step>
              <Step n={2}><b style={{ color: 'var(--c-tx3)' }}>&ldquo;홈 화면에 추가&rdquo;</b> 를 선택 <span style={{ color: 'var(--c-tx6)' }}>· 안 보이면 &ldquo;더 보기&rdquo;를 누르고 아래로</span></Step>
              <Step n={3}>오른쪽 위 <b style={{ color: 'var(--c-tx3)' }}>&ldquo;추가&rdquo;</b> 를 누르면 끝!</Step>
            </div>
            <button onClick={() => close(false)} style={ghostBtn}>알겠어요</button>
          </>
        ) : (
          <>
            <button onClick={install} disabled={!deferred} style={{ ...primaryBtn, opacity: deferred ? 1 : 0.5 }}>앱 설치하기</button>
            <button onClick={() => close(false)} style={ghostBtn}>나중에</button>
          </>
        )}

        <button onClick={() => close(true)} style={{ display: 'block', margin: '10px auto 0', background: 'none', border: 'none', color: 'var(--c-tx6)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>
          다시 보지 않기
        </button>
      </div>
    </>
  );
}

const primaryBtn: React.CSSProperties = {
  width: '100%', cursor: 'pointer', borderRadius: 12, padding: '14px 0', fontSize: 15, fontWeight: 800,
  fontFamily: 'inherit', border: 'none', background: 'var(--c-cy18)', color: 'var(--c-accyanbr)',
};
const ghostBtn: React.CSSProperties = {
  width: '100%', cursor: 'pointer', borderRadius: 12, padding: '12px 0', fontSize: 14, fontWeight: 700,
  fontFamily: 'inherit', border: 'none', background: 'transparent', color: 'var(--c-tx6)', marginTop: 8,
};

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: 'var(--c-cy18)', color: 'var(--c-accyanbr)', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
      <span style={{ fontSize: 13, color: 'var(--c-tx5)', lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}
