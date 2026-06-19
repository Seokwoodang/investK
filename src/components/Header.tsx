import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { fmtPrice, fmtPct, upColor } from '../lib/format';
import { useDashboard } from '../store/DashboardContext';
import { TAB_MAP, type TabId } from '../types';
import { useViewportLayout } from './DashboardChrome';

const NAV: { href: string; label: string }[] = [
  { href: '/', label: '대시보드' },
  { href: '/daily', label: '데일리' },
  { href: '/stocks', label: '종목' },
  { href: '/news', label: '뉴스' },
];

function SearchIcon({ size, stroke = '#6E7A90' }: { size: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke={stroke} strokeWidth="2" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Header() {
  const { layout } = useViewportLayout();
  const { state, actions, data } = useDashboard();
  const pathname = usePathname();

  // 실시간 KST 시계 + 시장별 장 상태(코스피·뉴욕). 타임존으로 계산해 미국 DST 자동 반영.
  // SSR 불일치 방지 위해 마운트 후 설정.
  const [now, setNow] = useState<Date | null>(null);
  const [hoverMkt, setHoverMkt] = useState<string | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(t);
  }, []);
  const clock = useMemo(() => {
    if (!now) return { date: '', time: '--:--', markets: [] as { name: string; label: string; color: string; hours: string }[] };
    // 해당 타임존의 요일/분 단위 시각 + 정규장 시간으로 상태 산출.
    const status = (tz: string, openMin: number, closeMin: number) => {
      const p = Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
          .formatToParts(now)
          .map((x) => [x.type, x.value]),
      ) as Record<string, string>;
      const mins = +p.hour * 60 + +p.minute;
      if (p.weekday === 'Sat' || p.weekday === 'Sun') return { label: '휴장', color: '#6E7A90' };
      if (mins < openMin) return { label: '장 시작 전', color: '#f5b544' };
      if (mins >= closeMin) return { label: '장 마감', color: '#6E7A90' };
      return { label: '정규장', color: '#34d39a' };
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
        { name: '코스피', ...status('Asia/Seoul', 540, 930), hours: '정규장 09:00 ~ 15:30 (KST) · 평일' }, // 09:00~15:30
        { name: '뉴욕', ...status('America/New_York', 570, 960), hours: '정규장 09:30 ~ 16:00 (현지) · 한국시간 약 22:30 ~ 05:00 · 평일 (서머타임 자동 반영)' }, // 09:30~16:00 ET
      ],
    };
  }, [now]);

  // 현재 경로로 활성 탭 결정. 상세(/instrument)는 '종목' 강조.
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

  return (
    <header
      style={{
        position: 'sticky', top: 0, zIndex: 40, background: 'rgba(7,11,20,0.82)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <div
        style={{
          maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center',
          gap: layout.navGap, padding: `0 ${layout.padX}`, height: 64,
        }}
      >
        <Link
          href="/"
          style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', flexShrink: 0, textDecoration: 'none' }}
        >
          <div
            style={{
              width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#00C7D9,#4078FF)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 18px rgba(0,199,217,0.22)',
            }}
          >
            <div style={{ width: 12, height: 12, borderRadius: 4, background: '#05080f' }} />
          </div>
          {layout.showBrand && (
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
              파라메타 인베스트
            </div>
          )}
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: layout.navGap, flex: 1, overflowX: 'auto' }}>
          {NAV.map((n) => {
            const active = activeHref === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                style={{
                  textDecoration: 'none',
                  fontSize: 15, fontWeight: 600, padding: '6px 2px', whiteSpace: 'nowrap',
                  borderBottom: `2px solid ${active ? '#00C7D9' : 'transparent'}`,
                  color: active ? '#EAF2FF' : '#7E8AA0', transition: 'color 180ms',
                }}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        {layout.showGSearch && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
              <SearchIcon size={15} />
            </span>
            <input
              className="search-input"
              value={state.gQuery}
              onChange={(e) => actions.setGQuery(e.target.value)}
              placeholder="종목 검색"
              style={{
                width: 170, boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, padding: '8px 12px 8px 32px',
                color: '#E7ECF5', fontSize: 13, fontFamily: 'inherit', outline: 'none',
              }}
            />
            {gq.length > 0 && (
              <div
                style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 340,
                  background: 'rgba(18,24,38,0.98)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 14, boxShadow: '0 18px 48px rgba(0,0,0,0.5)', maxHeight: 380,
                  overflowY: 'auto', zIndex: 60, padding: 6,
                }}
              >
                {gResults.map((g) => (
                  <div
                    key={g.id}
                    className="gsearch-result"
                    onClick={() => actions.openStock(g.id, g.tab)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 10, cursor: 'pointer' }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#EEF2F8', whiteSpace: 'nowrap' }}>{g.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#5fd9e6', whiteSpace: 'nowrap' }}>{g.tabLabel}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#6E7A90', marginTop: 2 }}>{g.ticker}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#F4F7FB' }}>{g.priceText}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: g.pctColor }}>{g.pctText}</div>
                    </div>
                  </div>
                ))}
                {gResults.length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: '#6E7A90' }}>
                    검색 결과가 없습니다.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {layout.showStatus && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 12, color: '#9AA6BC', whiteSpace: 'nowrap' }} suppressHydrationWarning>{clock.date ? `${clock.date} · KST ${clock.time}` : 'KST --:--'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', marginTop: 3, whiteSpace: 'nowrap' }}>
              {clock.markets.map((m) => (
                <span
                  key={m.name}
                  onMouseEnter={() => setHoverMkt(m.name)}
                  onMouseLeave={() => setHoverMkt(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, position: 'relative', cursor: 'default' }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, boxShadow: `0 0 8px ${m.color}` }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#9AA6BC' }}>{m.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: m.color }}>{m.label}</span>
                  {hoverMkt === m.name && (
                    <span
                      style={{
                        position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50,
                        width: 'max-content', maxWidth: 260, textAlign: 'left', whiteSpace: 'normal',
                        background: 'rgba(18,24,38,0.98)', border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 10, padding: '9px 12px', boxShadow: '0 14px 36px rgba(0,0,0,0.5)',
                        fontSize: 11, fontWeight: 500, lineHeight: 1.5, color: '#C4CDDC',
                      }}
                    >
                      <span style={{ display: 'block', fontWeight: 700, color: '#EAF2FF', marginBottom: 3 }}>{m.name} · {m.label}</span>
                      {m.hours}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
