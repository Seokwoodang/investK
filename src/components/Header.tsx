import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtPrice, fmtPct, upColor } from '../lib/format';
import { usePush } from '../lib/push';
import { useDashboard } from '../store/DashboardContext';
import { TAB_MAP, type TabId } from '../types';
import { useViewportLayout } from './DashboardChrome';

const NAV: { href: string; label: string }[] = [
  { href: '/', label: '대시보드' },
  { href: '/daily', label: '데일리' },
  { href: '/stocks', label: '종목' },
  { href: '/value', label: '저평가우량주' },
  { href: '/portfolio', label: '내자산' },
  { href: '/report', label: '보고서' },
  { href: '/news', label: '뉴스' },
];

function SearchIcon({ size, stroke = 'var(--c-tx6)' }: { size: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ color: stroke }}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {open ? (
        <>
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </>
      ) : (
        <>
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </>
      )}
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const utilBtnBase: React.CSSProperties = {
  cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1, display: 'flex', alignItems: 'center', gap: 5,
  padding: '7px 11px', borderRadius: 10, border: '1px solid var(--c-w10)', background: 'var(--c-w05)',
  color: 'var(--c-tx4)', whiteSpace: 'nowrap',
};
const iconBtn = (active: boolean): React.CSSProperties => ({
  flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 40, height: 40, borderRadius: 10, border: '1px solid var(--c-w10)',
  background: active ? 'var(--c-w08)' : 'var(--c-w05)', color: 'var(--c-tx2)',
});

export function Header({ authed = true, isAdmin = false, user = null }: { authed?: boolean; isAdmin?: boolean; user?: string | null }) {
  const { vw, layout } = useViewportLayout();
  const { state, actions, data } = useDashboard();
  const pathname = usePathname();
  const push = usePush(); // 브라우저 알림(웹푸시) — 설정 드롭다운 토글

  // 테마 버튼 표시용 OS 다크 여부(theme='system'일 때 실효 테마 계산). 마운트 후에만 정확.
  const [osDark, setOsDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setOsDark(mq.matches);
    const h = () => setOsDark(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  const themeIsDark = state.theme === 'dark' || (state.theme === 'system' && osDark);

  // 관리자(swoo1427)에게만 '회원관리' 메뉴 노출.
  const navItems = isAdmin ? [...NAV, { href: '/admin', label: '회원관리' }] : NAV;

  // 좁은 화면에선 메뉴를 햄버거(≡)로 접는다. 다크/큰글씨/로그아웃은 항상 ⚙ 설정 드롭다운으로 묶어 공간 절약.
  const navInline = vw >= 1340;
  const [menuOpen, setMenuOpen] = useState(false);
  const [setOpen, setSetOpen] = useState(false);
  const setWrapRef = useRef<HTMLDivElement>(null); // 설정 기어+드롭다운 묶음(바깥클릭 판정용)
  useEffect(() => {
    setMenuOpen(false);
    setSetOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (navInline) setMenuOpen(false);
  }, [navInline]);
  // 설정 드롭다운: 바깥(기어·드롭다운 외 아무 곳) 클릭 시 닫기 + ESC.
  useEffect(() => {
    if (!setOpen) return;
    const onDown = (e: PointerEvent) => {
      if (setWrapRef.current && !setWrapRef.current.contains(e.target as Node)) setSetOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setSetOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [setOpen]);

  // 실시간 KST 시계 + 시장별 장 상태(코스피·뉴욕). 타임존으로 계산해 미국 DST 자동 반영.
  const [now, setNow] = useState<Date | null>(null);
  const [hoverMkt, setHoverMkt] = useState<string | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(t);
  }, []);
  const clock = useMemo(() => {
    if (!now) return { date: '', time: '--:--', markets: [] as { name: string; label: string; color: string; hours: string }[] };
    const status = (tz: string, openMin: number, closeMin: number) => {
      const p = Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
          .formatToParts(now)
          .map((x) => [x.type, x.value]),
      ) as Record<string, string>;
      const mins = +p.hour * 60 + +p.minute;
      if (p.weekday === 'Sat' || p.weekday === 'Sun') return { label: '휴장', color: 'var(--c-tx6)' };
      if (mins < openMin) return { label: '장 시작 전', color: 'var(--c-warn)' };
      if (mins >= closeMin) return { label: '장 마감', color: 'var(--c-tx6)' };
      return { label: '정규장', color: 'var(--c-up)' };
    };
    const k = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
        .formatToParts(now)
        .map((x) => [x.type, x.value]),
    ) as Record<string, string>;
    return {
      date: `${k.year}.${k.month}.${k.day}`,
      time: `${k.hour}:${k.minute}`,
      markets: [
        { name: '코스피', ...status('Asia/Seoul', 540, 930), hours: '정규장 09:00 ~ 15:30 (KST) · 평일' },
        { name: '뉴욕', ...status('America/New_York', 570, 960), hours: '정규장 09:30 ~ 16:00 (현지) · 한국시간 약 22:30 ~ 05:00 · 평일 (서머타임 자동 반영)' },
      ],
    };
  }, [now]);

  const activeHref =
    pathname === '/' ? '/' : pathname.startsWith('/instrument') ? '/stocks' : '/' + (pathname.split('/')[1] || '');
  const gq = state.gQuery.trim().toLowerCase();

  const gResults = useMemo(() => {
    if (!gq) return [];
    const out: {
      id: string; name: string; ticker: string; tabLabel: string; tab: TabId;
      priceText: string; pctText: string; pctColor: string;
    }[] = [];
    (Object.keys(data.stocks) as TabId[]).forEach((tb) => {
      data.stocks[tb].forEach((s) => {
        if (s.name.toLowerCase().includes(gq) || s.ticker.toLowerCase().includes(gq)) {
          out.push({
            id: s.id, name: s.name, ticker: s.ticker, tab: tb, tabLabel: TAB_MAP[tb],
            priceText: fmtPrice(s.price, s.cur), pctText: fmtPct(s.pct), pctColor: upColor(s.pct),
          });
        }
      });
    });
    return out.slice(0, 8);
  }, [gq, data.stocks]);

  // 설정 항목(테마/큰글씨/로그아웃) — 드롭다운 안 세로 풀폭 버튼.
  const settingsItems = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {authed && user && (
        <div style={{ padding: '4px 12px 10px', marginBottom: 2, borderBottom: '1px solid var(--c-w06)' }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--c-tx6)', marginBottom: 3 }}>로그인 계정</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-tx1b)', wordBreak: 'break-all' }}>
            {user}{isAdmin && <span style={{ fontSize: 10, fontWeight: 800, marginLeft: 6, padding: '2px 7px', borderRadius: 999, background: 'var(--c-cy16)', color: 'var(--c-accyanbr)' }}>관리자</span>}
          </div>
        </div>
      )}
      <button onClick={actions.toggleTheme} style={{ ...utilBtnBase, width: '100%', justifyContent: 'flex-start', padding: '11px 12px' }}>
        <span style={{ fontSize: 14 }}>{themeIsDark ? '☾' : '☀'}</span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>테마: {themeIsDark ? '다크' : '라이트'}</span>
      </button>
      <button
        onClick={actions.toggleLargeFont}
        aria-pressed={state.largeFont}
        style={{
          ...utilBtnBase, width: '100%', justifyContent: 'flex-start', padding: '11px 12px',
          border: `1px solid ${state.largeFont ? 'var(--c-cy45)' : 'var(--c-w10)'}`,
          background: state.largeFont ? 'var(--c-cy16)' : 'var(--c-w05)',
          color: state.largeFont ? 'var(--c-accyanbr)' : 'var(--c-tx4)',
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 800 }}>가</span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>큰글씨 {state.largeFont ? '켜짐' : '꺼짐'}</span>
      </button>
      {/* 브라우저 알림(웹푸시) — 로그인 사용자만. 켜면 공시·급등락·목표가 알림이 기기로 도착. */}
      {authed && push.state !== 'unsupported' && (
        <button
          onClick={async () => {
            if (push.state === 'on') await push.disable();
            else if (push.state === 'off') await push.enable();
          }}
          disabled={push.state === 'denied' || push.state === 'loading'}
          title={push.state === 'denied' ? '브라우저 설정에서 알림 차단을 해제해야 합니다' : '내 종목 공시·급등락·목표가 알림을 이 기기로 받습니다'}
          style={{
            ...utilBtnBase, width: '100%', justifyContent: 'flex-start', padding: '11px 12px',
            border: `1px solid ${push.state === 'on' ? 'var(--c-cy45)' : 'var(--c-w10)'}`,
            background: push.state === 'on' ? 'var(--c-cy16)' : 'var(--c-w05)',
            color: push.state === 'on' ? 'var(--c-accyanbr)' : 'var(--c-tx4)',
            opacity: push.state === 'denied' ? 0.5 : 1,
          }}
        >
          <span style={{ fontSize: 14 }}>🔔</span>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            알림 {push.state === 'on' ? '켜짐' : push.state === 'denied' ? '차단됨' : '꺼짐'}
          </span>
        </button>
      )}
      {authed ? (
        <button
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
            window.location.href = '/login';
          }}
          style={{ ...utilBtnBase, width: '100%', justifyContent: 'flex-start', padding: '11px 12px', fontSize: 13, fontWeight: 700 }}
        >
          로그아웃
        </button>
      ) : (
        <button
          onClick={() => { window.location.href = `/login?next=${encodeURIComponent(pathname || '/')}`; }}
          style={{ ...utilBtnBase, width: '100%', justifyContent: 'flex-start', padding: '11px 12px', fontSize: 13, fontWeight: 700, border: '1px solid var(--c-cy45)', background: 'var(--c-cy16)', color: 'var(--c-accyanbr)' }}
        >
          로그인
        </button>
      )}
    </div>
  );

  return (
    <header
      style={{
        position: 'sticky', top: 0, zIndex: 40, background: 'var(--c-headerbg)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--c-w07)',
      }}
    >
      <div
        style={{
          maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center',
          gap: layout.navGap, padding: `0 ${layout.padX}`, height: 64,
        }}
      >
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', flexShrink: 0, textDecoration: 'none' }}>
          <div
            style={{
              width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,var(--c-accyan),var(--c-blue))',
              display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 18px var(--c-cy22)',
            }}
          >
            <div style={{ width: 12, height: 12, borderRadius: 4, background: 'var(--c-bg)' }} />
          </div>
          {layout.showBrand && (
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>InvestKang</div>
          )}
        </Link>

        {navInline ? (
          <nav className="no-scrollbar" style={{ display: 'flex', alignItems: 'center', gap: 22, flex: 1, overflowX: 'auto' }}>
            {navItems.map((n) => {
              const active = activeHref === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  style={{
                    textDecoration: 'none', fontSize: 15, fontWeight: 600, padding: '6px 2px', whiteSpace: 'nowrap',
                    borderBottom: `2px solid ${active ? 'var(--c-accyan)' : 'transparent'}`,
                    color: active ? 'var(--c-tx1c)' : 'var(--c-tx5)', transition: 'color 180ms',
                  }}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        ) : (
          <div style={{ flex: 1 }} />
        )}

        {layout.showGSearch && (
          <div
            style={{ position: 'relative', flexShrink: 0 }}
            // ESC·바깥 클릭(포커스 이탈)으로 검색 결과를 닫는다 — 과거엔 쿼리를 지워야만 닫혔음.
            onKeyDown={(e) => e.key === 'Escape' && actions.setGQuery('')}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) actions.setGQuery('');
            }}
          >
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
              <SearchIcon size={15} />
            </span>
            <input
              className="search-input"
              value={state.gQuery}
              onChange={(e) => actions.setGQuery(e.target.value)}
              placeholder="종목 검색"
              style={{
                width: 170, boxSizing: 'border-box', background: 'var(--c-w05)',
                border: '1px solid var(--c-w10)', borderRadius: 10, padding: '8px 12px 8px 32px',
                color: 'var(--c-tx1d)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
              }}
            />
            {gq.length > 0 && (
              <div
                style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 340,
                  background: 'var(--c-panel)', border: '1px solid var(--c-w12)',
                  borderRadius: 14, boxShadow: '0 18px 48px var(--c-shadow)', maxHeight: 380,
                  overflowY: 'auto', zIndex: 60, padding: 6,
                }}
              >
                {gResults.map((g) => (
                  <div
                    key={g.id}
                    className="gsearch-result"
                    // mousedown: 입력창 blur(드롭다운 닫힘)보다 먼저 실행돼 클릭이 씹히지 않게.
                    onMouseDown={() => actions.openStock(g.id, g.tab)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 10, cursor: 'pointer' }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-tx1b)', whiteSpace: 'nowrap' }}>{g.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--c-accyanbr)', whiteSpace: 'nowrap' }}>{g.tabLabel}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginTop: 2 }}>{g.ticker}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-tx1)' }}>{g.priceText}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: g.pctColor }}>{g.pctText}</div>
                    </div>
                  </div>
                ))}
                {gResults.length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--c-tx6)' }}>검색 결과가 없습니다.</div>
                )}
              </div>
            )}
          </div>
        )}

        {layout.showStatus && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--c-tx4)', whiteSpace: 'nowrap' }} suppressHydrationWarning>{clock.date ? `${clock.date} · KST ${clock.time}` : 'KST --:--'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', marginTop: 3, whiteSpace: 'nowrap' }}>
              {clock.markets.map((m) => (
                <span
                  key={m.name}
                  onMouseEnter={() => setHoverMkt(m.name)}
                  onMouseLeave={() => setHoverMkt(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, position: 'relative', cursor: 'default' }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, boxShadow: `0 0 8px ${m.color}` }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-tx4)' }}>{m.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: m.color }}>{m.label}</span>
                  {hoverMkt === m.name && (
                    <span
                      style={{
                        position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50,
                        width: 'max-content', maxWidth: 260, textAlign: 'left', whiteSpace: 'normal',
                        background: 'var(--c-panel)', border: '1px solid var(--c-w12)',
                        borderRadius: 10, padding: '9px 12px', boxShadow: '0 14px 36px var(--c-shadow)',
                        fontSize: 11, fontWeight: 500, lineHeight: 1.5, color: 'var(--c-tx3)',
                      }}
                    >
                      <span style={{ display: 'block', fontWeight: 700, color: 'var(--c-tx1c)', marginBottom: 3 }}>{m.name} · {m.label}</span>
                      {m.hours}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 햄버거(메뉴) — 좁은 화면 */}
        {!navInline && (
          <button onClick={() => { setMenuOpen((v) => !v); setSetOpen(false); }} aria-label="메뉴" aria-expanded={menuOpen} style={iconBtn(menuOpen)}>
            <MenuIcon open={menuOpen} />
          </button>
        )}

        {/* 설정(⚙) — 다크/큰글씨/알림/로그아웃. 드롭다운을 기어에 붙여 우측정렬. */}
        <div ref={setWrapRef} style={{ position: 'relative', display: 'flex' }}>
          <button onClick={() => { setSetOpen((v) => !v); setMenuOpen(false); }} aria-label="설정" aria-expanded={setOpen} title="설정 (계정·테마·알림·로그아웃)" style={iconBtn(setOpen)}>
            <GearIcon />
          </button>
          {setOpen && (
            <div
              style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 55, width: 'min(240px, calc(100vw - 32px))',
                background: 'var(--c-panel)', border: '1px solid var(--c-w12)', borderRadius: 16, boxShadow: '0 18px 48px var(--c-shadow)', padding: 8,
              }}
            >
              {settingsItems}
            </div>
          )}
        </div>
      </div>

      {/* 햄버거 드롭다운(메뉴 링크) */}
      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, top: 64, zIndex: 45, background: 'var(--c-shadow)' }} />
          <div
            style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: layout.padX, zIndex: 55, width: 'min(240px, calc(100vw - 32px))',
              background: 'var(--c-panel)', border: '1px solid var(--c-w12)', borderRadius: 16, boxShadow: '0 18px 48px var(--c-shadow)', padding: 8,
            }}
          >
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {navItems.map((n) => {
                const active = activeHref === n.href;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setMenuOpen(false)}
                    style={{
                      textDecoration: 'none', display: 'block', padding: '11px 12px', borderRadius: 10, fontSize: 15, fontWeight: 600,
                      background: active ? 'var(--c-w06)' : 'transparent', color: active ? 'var(--c-tx1c)' : 'var(--c-tx4)',
                    }}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </>
      )}

    </header>
  );
}
