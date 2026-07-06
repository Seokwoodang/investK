'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { buildCalendar } from '../../lib/calendar';
import { WEEKDAYS } from '../../lib/constants';
import { fmtPct, upColor } from '../../lib/format';
import { glossDef } from '../../lib/glossary';
import { usePortfolio, usdKrwFromFx, useResolvedPrices, valuePortfolio } from '../../lib/portfolio';
import { SRC } from '../../lib/sources';
import { useDashboard } from '../../store/DashboardContext';
import { useAuthed, useViewportLayout } from '../DashboardChrome';
import { TAB_LABELS, type Impact } from '../../types';
import { GlossaryTip, ImpactTag } from '../GlossaryTip';
import { EventResult } from '../EventResult';
import { SourceNote, UpdateNote } from '../SourceNote';
import { InlineSpinner } from '../Footer';

const CARD: React.CSSProperties = {
  background: 'var(--c-w04)', border: '1px solid var(--c-w08)',
  borderRadius: 20, backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
};

const calNavBtn: React.CSSProperties = {
  cursor: 'pointer', background: 'var(--c-w05)', border: '1px solid var(--c-w10)',
  borderRadius: 8, width: 28, height: 28, color: 'var(--c-tx3)', fontSize: 15, lineHeight: 1, fontFamily: 'inherit',
};

const segBtn = (active: boolean): React.CSSProperties => ({
  cursor: 'pointer', border: 'none', padding: '7px 16px', borderRadius: 9, fontSize: 13,
  fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 180ms',
  ...(active ? { background: 'var(--c-cy18)', color: 'var(--c-accyanbr)' } : { background: 'transparent', color: 'var(--c-tx4)' }),
});

// 섹션 헤더 + "더 보기 →" 링크.
function SectionHead({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>
      {href && (
        <Link href={href} style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-accyanbr)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          {linkLabel ?? '더 보기'} →
        </Link>
      )}
    </div>
  );
}

function MacroCard({ title, rows, source }: { title: string; rows: { label: string; val: string; chg: number }[]; source: string }) {
  return (
    <div style={{ ...CARD, padding: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: 'var(--c-accyan)', marginBottom: 18 }}>{title}</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--c-w05)' }}>
          <span style={{ fontSize: 14, color: 'var(--c-tx3)', whiteSpace: 'nowrap' }}>{r.label}</span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{r.val}</span>
            <span style={{ fontSize: 12, fontWeight: 600, width: 56, textAlign: 'right', color: upColor(r.chg) }}>{fmtPct(r.chg)}</span>
          </span>
        </div>
      ))}
      <SourceNote text={source} style={{ marginTop: 14 }} />
    </div>
  );
}

// ① 오늘의 한 줄 — 데일리 브리핑 헤드라인. 공개 읽기 전용 라우트(/api/briefing)라 비로그인도 보인다.
//    항상 오늘 날짜로 요청(과거엔 state.briefDate에 끌려가 과거 헤드라인이 뜨거나, 미설정 시 아예 안 떴음).
function HeadlineBanner() {
  const [headline, setHeadline] = useState<string | null>(null);
  useEffect(() => {
    const t = new Date();
    const date = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    let cancelled = false;
    fetch(`/api/briefing?date=${date}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.brief?.headline) setHeadline(j.brief.headline as string);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  if (!headline) return null;
  return (
    <Link
      href="/daily"
      className="card-hover"
      style={{
        display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', marginBottom: 20,
        padding: '18px 22px', borderRadius: 18, border: '1px solid var(--c-cy18)',
        background: 'linear-gradient(135deg, var(--c-cy07), var(--c-bl05))',
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap', background: 'var(--c-cy18)', color: 'var(--c-accyanbr)' }}>오늘의 한 줄</span>
      <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.5, color: 'var(--c-tx1)', flex: 1, minWidth: 0 }}>{headline}</span>
      <span style={{ fontSize: 13, color: 'var(--c-tx6)', whiteSpace: 'nowrap' }}>데일리 →</span>
    </Link>
  );
}

// ② 내 자산 스냅샷 — 보유 등록된 로그인 사용자에게만 표시.
function MyAssetsStrip() {
  const { data, universeReady } = useDashboard();
  const { holdings } = usePortfolio();
  const usdkrw = useMemo(() => usdKrwFromFx(data.macro.fx), [data.macro.fx]);
  const { prices: extra, pending: pxPending } = useResolvedPrices(holdings, data.stocks);
  const val = useMemo(() => valuePortfolio(holdings, data.stocks, usdkrw, extra, universeReady), [holdings, data.stocks, usdkrw, extra, universeReady]);
  // 시세 확보 전(라이브 유니버스 도착 전/즉석조회 중)엔 평단·목 폴백으로 총계가 틀리므로 스트립을 안 띄운다. 확보 후 표시.
  if (!holdings.length || (!val.allPriced && (pxPending || !universeReady)) || val.totalKrw <= 0) return null;
  const krw = (v: number) => '₩' + Math.round(v).toLocaleString('ko-KR');
  const top = [...val.rows].sort((a, b) => b.valueKrw - a.valueKrw)[0];
  return (
    <div style={{ marginBottom: 36 }}>
      <SectionHead title="내 자산" href="/portfolio" linkLabel="내자산 · 매도 점검" />
      <div style={{ ...CARD, padding: 22, display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 4 }}>총 평가액</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{krw(val.totalKrw)}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 4 }}>총 평가손익</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: upColor(val.totalPlPct) }}>
            {val.totalPlKrw >= 0 ? '+' : '-'}{krw(Math.abs(val.totalPlKrw)).slice(1)}원 ({fmtPct(val.totalPlPct)})
          </div>
        </div>
        {top && (
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 4 }}>최대 보유</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-tx2)' }}>
              {top.name} <span style={{ color: upColor(top.plPct) }}>{fmtPct(top.plPct)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ④ 오늘의 저평가 우량주 Top 5 (국내/해외 토글, 종합점수순 — 캐시 즉시).
interface VTopItem { code: string; name: string; score: number; per: number | null; roe: number | null; graham: boolean; buffett: boolean }
function ValueTopCard() {
  const { actions } = useDashboard();
  const [market, setMarket] = useState<'kr' | 'us'>('kr');
  const [items, setItems] = useState<VTopItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setItems(null);
    fetch(`/api/value-screen?market=${market}&sort=score&offset=0&limit=5`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled) setItems((j?.items as VTopItem[]) ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [market]);
  const tabId = market === 'kr' ? 'kr_stock' : 'us_stock';
  const toggle = (m: 'kr' | 'us', label: string) => (
    <button
      onClick={() => setMarket(m)}
      style={{
        cursor: 'pointer', border: 'none', padding: '3px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
        ...(market === m ? { background: 'var(--c-cy18)', color: 'var(--c-accyanbr)' } : { background: 'transparent', color: 'var(--c-tx5)' }),
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ ...CARD, padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: 'var(--c-accyan)' }}>오늘의 저평가 우량주 TOP 5</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 2, padding: 2, background: 'var(--c-w04)', borderRadius: 9 }}>
            {toggle('kr', '국내')}
            {toggle('us', '해외')}
          </div>
          <Link href="/value" style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-accyanbr)', textDecoration: 'none', whiteSpace: 'nowrap' }}>전체 →</Link>
        </div>
      </div>
      {items === null && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 0', fontSize: 13, color: 'var(--c-tx6)' }}><InlineSpinner size={13} />불러오는 중…</div>}
      {items !== null && items.length === 0 && <div style={{ padding: '14px 0', fontSize: 13, color: 'var(--c-tx6)' }}>데이터 준비 중입니다.</div>}
      {items?.map((s, i) => (
        <div
          key={s.code}
          onClick={() => actions.openStock(s.code, tabId)}
          className="event-row"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', margin: '0 -8px', borderRadius: 10, borderBottom: i < items.length - 1 ? '1px solid var(--c-w05)' : 'none', cursor: 'pointer' }}
        >
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-tx6)', width: 16, flexShrink: 0 }}>{i + 1}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-tx1b)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
          {s.graham && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 5, color: 'var(--c-up)', background: 'color-mix(in srgb, var(--c-up) 18%, transparent)', whiteSpace: 'nowrap' }}>그레이엄</span>}
          {s.buffett && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 5, color: 'var(--c-accyanbr)', background: 'var(--c-cy16)', whiteSpace: 'nowrap' }}>버핏형</span>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'baseline', flexShrink: 0 }}>
            {s.per != null && <span style={{ fontSize: 11, color: 'var(--c-tx6)' }}>PER {s.per.toFixed(1)}</span>}
            {s.roe != null && <span style={{ fontSize: 11, color: 'var(--c-tx6)' }}>ROE {s.roe.toFixed(0)}%</span>}
            <span style={{ fontSize: 15, fontWeight: 800, color: s.score >= 70 ? 'var(--c-up)' : 'var(--c-accyan)' }}>{s.score}</span>
          </span>
        </div>
      ))}
      <SourceNote text="점수 — 밸류·퀄리티·안정성·환원 복합(매일 18시 KST 갱신)" style={{ marginTop: 12 }} />
    </div>
  );
}

// ⑤ 주요 뉴스 Top 3 (국내주식, AI 중요도순 — 캐시 즉시).
interface NewsTopItem { title: string; url?: string; src: string; impact?: '호재' | '악재' | '중립'; target?: string }
const NEWS_PILL: Record<string, { bg: string; color: string }> = {
  호재: { bg: 'var(--c-gn22)', color: 'var(--c-upbr)' },
  악재: { bg: 'var(--c-rd22)', color: 'var(--c-downbr)' },
  중립: { bg: 'var(--c-gy18)', color: 'var(--c-tx4b)' },
};
function NewsTopCard() {
  const [items, setItems] = useState<NewsTopItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/news', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tab: 'kr_stock' }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled) setItems(((j?.news as NewsTopItem[]) ?? []).slice(0, 3));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div style={{ ...CARD, padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: 'var(--c-accyan)' }}>주요 뉴스 TOP 3</div>
        <Link href="/news" style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-accyanbr)', textDecoration: 'none', whiteSpace: 'nowrap' }}>전체 →</Link>
      </div>
      {items === null && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 0', fontSize: 13, color: 'var(--c-tx6)' }}><InlineSpinner size={13} />불러오는 중…</div>}
      {items !== null && items.length === 0 && <div style={{ padding: '14px 0', fontSize: 13, color: 'var(--c-tx6)' }}>뉴스 준비 중입니다.</div>}
      {items?.map((n, i) => {
        const pill = NEWS_PILL[n.impact ?? '중립'];
        const inner = (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            {n.impact && <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 7, whiteSpace: 'nowrap', flexShrink: 0, background: pill.bg, color: pill.color }}>{n.impact}</span>}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.5, color: 'var(--c-tx2)' }}>{n.title}</div>
              <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginTop: 3 }}>{n.target ? `${n.target} · ` : ''}{n.src}</div>
            </div>
          </div>
        );
        const rowStyle: React.CSSProperties = { display: 'block', padding: '11px 8px', margin: '0 -8px', borderRadius: 10, borderBottom: i < items.length - 1 ? '1px solid var(--c-w05)' : 'none', textDecoration: 'none' };
        return n.url ? (
          <a key={i} href={n.url} target="_blank" rel="noreferrer" className="event-row" style={{ ...rowStyle, cursor: 'pointer' }}>{inner}</a>
        ) : (
          <div key={i} style={rowStyle}>{inner}</div>
        );
      })}
      <SourceNote text="뉴스 — 언론사 RSS · AI(Claude) 호재/악재 판별 · 하루 4회(06·12·18·24시 KST) 갱신" style={{ marginTop: 12 }} />
    </div>
  );
}

export function Dashboard() {
  const { vw, layout } = useViewportLayout();
  const authed = useAuthed();
  const { state, actions, data } = useDashboard();
  const { macro, assetSummary } = data;
  // 일정 분류 필터(복수 선택, 최소 1개 유지) — 목록·달력·상세 모달에 공통 적용.
  const [evFilter, setEvFilter] = useState<Impact[]>(['고영향', '중간', '실적']);
  const toggleEvFilter = (t: Impact) =>
    setEvFilter((prev) => (prev.includes(t) ? (prev.length > 1 ? prev.filter((x) => x !== t) : prev) : [...prev, t]));

  // 내 보유(로그인 시) + 관심(☆) 종목의 실적 이벤트는 mine=true로 주입해 테두리 강조.
  // US 종목은 유니버스 id=심볼이라 watchlist id를 그대로 심볼로 비교할 수 있다.
  const { holdings: myHoldings } = usePortfolio(authed);
  const mySymbols = useMemo(() => {
    const s = new Set<string>();
    myHoldings.forEach((h) => h.ticker && s.add(h.ticker.toUpperCase()));
    state.watchlist.forEach((id) => s.add(id.toUpperCase()));
    return s;
  }, [myHoldings, state.watchlist]);
  const annotate = useMemo(
    () => (evs: typeof macro.events) =>
      evs.map((e) => (e.tag === '실적' && e.symbol && mySymbols.has(e.symbol.toUpperCase()) ? { ...e, mine: true } : e)),
    [mySymbols],
  );

  const listEvents = useMemo(() => annotate(macro.events.filter((e) => evFilter.includes(e.tag))), [macro.events, evFilter, annotate]);
  const calEventsF = useMemo(() => annotate(state.calEvents.filter((e) => evFilter.includes(e.tag))), [state.calEvents, evFilter, annotate]);
  const weeks = buildCalendar(calEventsF, vw, state.calYear, state.calMonth, state.today);
  const monthLabel = `${state.calYear}년 ${state.calMonth + 1}월`;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>대시보드</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-tx5)' }}>시장 상태 · 내 자산 · 오늘의 기회와 리스크를 한 화면에서 확인하세요.</p>
        <UpdateNote text="실시간 시세(국내주식·코인) · 해외주식 약 15분 지연 · 환율·지수·시장지표 수 분~1시간 캐시" style={{ marginTop: 8 }} />
      </div>

      {/* ① 오늘의 한 줄 (데일리 헤드라인) */}
      <HeadlineBanner />

      {/* ② 내 자산 스냅샷 (로그인 + 보유 등록 시) — 비로그인은 마운트하지 않아 /api/portfolio 401 호출 자체가 없다 */}
      {authed && <MyAssetsStrip />}

      {/* ③ 시장 심리 게이지 — VIX·금리·크립토 공포지수·김프 */}
      {macro.market && (() => {
        const gauges = [macro.market.vix, macro.market.ust10y, macro.market.cryptoFng, macro.market.kimchi].filter(Boolean);
        if (!gauges.length) return null;
        const toneColor = (t?: string) =>
          t === 'fear' || t === 'down' ? 'var(--c-down)' : t === 'greed' || t === 'up' ? 'var(--c-up)' : 'var(--c-tx1b)';
        return (
          // position/zIndex: 아래 저평가·뉴스 카드(backdrop-filter=독립 stacking context)가 게이지 툴팁을
          // 덮지 않도록 이 섹션을 위 레이어로 올린다.
          <div style={{ marginBottom: 36, position: 'relative', zIndex: 5 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>시장 심리 · 지표</h2>
            <div style={{ display: 'grid', gridTemplateColumns: layout.assetCols, gap: 16 }}>
              {gauges.map((g, gi) => (
                // 지표 뜻·해석을 모르는 사용자를 위해 카드 자체를 호버(또는 포커스)하면 설명 팝오버 표시.
                <div key={g!.label} className={g!.hint ? 'gloss' : undefined} tabIndex={g!.hint ? 0 : undefined} style={{ ...CARD, padding: 20, position: 'relative', cursor: g!.hint ? 'help' : 'default', outline: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--c-tx5)' }}>{g!.label}</span>
                    {g!.hint && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: '50%', border: '1px solid var(--c-w22)', color: 'var(--c-tx5)', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>i</span>
                    )}
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em', color: toneColor(g!.tone), marginTop: 8 }}>{g!.value}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                    {g!.sub && <span style={{ fontSize: 12, fontWeight: 700, color: toneColor(g!.tone) }}>{g!.sub}</span>}
                    {/* 변동률은 '지수 자체의 전일 대비'라 라벨 없이는 오해(수익률 등)하기 쉬움 → '전일' 명시 */}
                    {g!.chg != null && (
                      <span style={{ fontSize: 12, fontWeight: 600, color: upColor(g!.chg) }}>
                        <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--c-tx6)' }}>전일 </span>{fmtPct(g!.chg)}
                      </span>
                    )}
                  </div>
                  {g!.hint && (
                    <span
                      className="gloss-pop"
                      style={{
                        position: 'absolute', top: 'calc(100% + 6px)', width: 280, zIndex: 70,
                        ...(gi >= gauges.length - 2 ? { right: 0 } : { left: 0 }), // 우측 카드는 오른쪽 정렬(화면 밖 방지)
                        background: 'var(--c-panel)', border: '1px solid var(--c-w12)', borderRadius: 12,
                        padding: '12px 14px', boxShadow: '0 14px 36px var(--c-shadow)', textAlign: 'left', whiteSpace: 'normal',
                      }}
                    >
                      <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--c-accyanbr)', marginBottom: 5 }}>{g!.label}</span>
                      <span style={{ display: 'block', fontSize: 12, lineHeight: 1.6, color: 'var(--c-tx3)', fontWeight: 400 }}>{g!.hint}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
            <SourceNote text="VIX·美10년물 — Yahoo Finance · 크립토 공포·탐욕 — alternative.me · 김치프리미엄 — 업비트/바이낸스" style={{ marginTop: 14 }} />
          </div>
        );
      })()}

      {/* ④⑤ 오늘의 기회(저평가 Top5) + 리스크(뉴스 Top3) */}
      <div style={{ display: 'grid', gridTemplateColumns: layout.macroCols2, gap: 16, marginBottom: 36 }}>
        <ValueTopCard />
        <NewsTopCard />
      </div>

      {/* ⑥ 환율·지수 */}
      <div style={{ marginBottom: 36 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>오늘의 매크로 브리핑</h2>
        <div style={{ display: 'grid', gridTemplateColumns: layout.macroCols2, gap: 16 }}>
          <MacroCard title="환율 · FX" rows={macro.fx.map((r) => ({ label: r.pair, val: r.val, chg: r.chg }))} source={SRC.fx} />
          <MacroCard title="글로벌 지수 · INDEX" rows={macro.indices.map((r) => ({ label: r.name, val: r.val, chg: r.chg }))} source={SRC.index} />
        </div>
      </div>

      {/* ⑦ 자산군 현황 (요약 정보 — 아래로 이동) */}
      <div style={{ marginBottom: 36 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>자산군 현황</h2>
        <div style={{ display: 'grid', gridTemplateColumns: layout.assetCols, gap: 16 }}>
          {TAB_LABELS.map((t) => {
            // 전체 유니버스 기준 집계는 서버가 미리 계산해 보낸다(전 종목 배열을 클라로 안 보냄).
            const sum = assetSummary[t.id];
            const avg = sum.avgPct;
            const top = sum.top;
            return (
              <button
                key={t.id}
                className="card-hover"
                onClick={() => actions.openTabbedStocks(t.id)}
                style={{ ...CARD, textAlign: 'left', cursor: 'pointer', display: 'block', width: '100%', padding: 22 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-tx1b)' }}>{t.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--c-tx6)' }}>{sum.count.toLocaleString('ko-KR')}종목</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 4 }}>평균 등락</div>
                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em', color: upColor(avg) }}>{fmtPct(avg)}</div>
                {top && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--c-w06)' }}>
                    <span style={{ fontSize: 12, color: 'var(--c-tx6)' }}>상위</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-tx3)' }}>{top.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 'auto', color: upColor(top.pct) }}>{fmtPct(top.pct)}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <SourceNote text={SRC.assetStatus} style={{ marginTop: 14 }} />
      </div>

      {/* ⑧ 주요 일정 */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap' }}>주요 일정</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* 분류 필터(복수 선택) — 색 점이 있어 범례 역할도 겸한다 */}
            <div style={{ display: 'flex', gap: 6 }}>
              {([
                { t: '고영향' as Impact, color: 'var(--c-down)', label: '고영향' },
                { t: '중간' as Impact, color: 'var(--c-warn)', label: '중간' },
                { t: '실적' as Impact, color: 'var(--c-accyan)', label: '실적(美)' },
              ]).map(({ t, color, label }) => {
                const on = evFilter.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleEvFilter(t)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: 999, transition: 'all 140ms',
                      border: `1px solid ${on ? 'var(--c-w12)' : 'var(--c-w07)'}`,
                      background: on ? 'var(--c-w06)' : 'transparent',
                      color: on ? 'var(--c-tx2)' : 'var(--c-tx6)',
                      opacity: on ? 1 : 0.55,
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, opacity: on ? 1 : 0.4 }} />
                    {label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--c-w04)', border: '1px solid var(--c-w07)', borderRadius: 11 }}>
              <button onClick={() => actions.setEventView('list')} style={segBtn(state.eventView === 'list')}>목록</button>
              <button onClick={() => actions.setEventView('calendar')} style={segBtn(state.eventView === 'calendar')}>달력</button>
            </div>
          </div>
        </div>

        {state.eventView === 'list' ? (
          <div style={{ ...CARD, padding: '6px 24px' }}>
            {listEvents.length === 0 && (
              <div style={{ padding: '20px 0', fontSize: 13, color: 'var(--c-tx6)', textAlign: 'center' }}>선택한 분류의 일정이 없습니다.</div>
            )}
            {listEvents.map((e, i) => {
              const yr = parseInt(e.date.slice(0, 4), 10);
              const da = parseInt(e.date.slice(8, 10), 10);
              const mo = parseInt(e.date.slice(5, 7), 10);
              const dow = WEEKDAYS[new Date(yr, mo - 1, da).getDay()];
              const today = !!state.today && state.today.y === yr && state.today.m === mo - 1 && state.today.d === da;
              const g = glossDef(e.name);
              return (
                <div
                  key={i}
                  className="event-row"
                  onClick={() => actions.openEventModal({ year: yr, month: mo - 1, day: da, events: listEvents })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16, padding: '14px 8px', margin: '0 -8px', borderRadius: 10, cursor: 'pointer',
                    // 내 보유·관심 종목 실적은 테두리로 강조
                    ...(e.mine
                      ? { border: '1px solid var(--c-cy40)', background: 'var(--c-cy06)', marginBottom: 4, marginTop: 4 }
                      : { borderBottom: '1px solid var(--c-w05)' }),
                  }}
                >
                  <div style={{ width: 60, flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: today ? 'var(--c-accyan)' : 'var(--c-tx1c)' }}>
                      {mo}/{da} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--c-tx6)' }}>({dow})</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginTop: 2 }}>{e.time}</div>
                  </div>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, color: 'var(--c-tx3)' }}>{e.name}</span>
                      {e.mine && (
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: 'var(--c-cy18)', color: 'var(--c-accyanbr)', whiteSpace: 'nowrap' }}>내 종목</span>
                      )}
                      {g && <GlossaryTip hit={g} />}
                    </span>
                    <EventResult e={e} compact />
                  </span>
                  <ImpactTag tag={e.tag} />
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ ...CARD, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => actions.gotoCalMonth(-1)} aria-label="이전 달" style={calNavBtn}>‹</button>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-tx1c)', whiteSpace: 'nowrap', minWidth: 96, textAlign: 'center' }}>{monthLabel}</div>
                <button onClick={() => actions.gotoCalMonth(1)} aria-label="다음 달" style={calNavBtn}>›</button>
                {state.calLoading && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--c-tx6)' }}><InlineSpinner size={11} />불러오는 중…</span>}
              </div>
              {/* 범례는 상단 필터 칩(색 점 포함)이 겸한다 */}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 6 }}>
              {WEEKDAYS.map((w, i) => (
                <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, padding: '4px 0', color: i === 0 ? 'var(--c-rdsun)' : i === 6 ? 'var(--c-acblue)' : 'var(--c-tx6)' }}>{w}</div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {weeks.map((wk, wi) => (
                <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
                  {wk.days.map((c, ci) => {
                    const clickable = c.show && c.hasDot;
                    return (
                      <div
                        key={ci}
                        className={`cal-cell${clickable ? ' clickable' : ''}`}
                        onClick={clickable ? () => actions.openEventModal({ year: state.calYear, month: state.calMonth, day: c.day as number, events: calEventsF }) : undefined}
                        style={{
                          minHeight: c.minHeight, borderRadius: 10, overflow: 'hidden',
                          padding: c.show ? 8 : 0,
                          border: c.show ? `1px solid ${c.cellBorder}` : 'none',
                          background: c.cellBg, cursor: clickable ? 'pointer' : 'default',
                        }}
                      >
                        {c.show && (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 13, fontWeight: c.today ? 800 : 600, color: c.dayColor }}>{c.day}</span>
                              {c.hasDot && <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: c.dotColor }} />}
                            </div>
                            {c.showLabels && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                                {c.chips.map((ch, idx) => (
                                  <div key={idx} style={{ fontSize: 10, lineHeight: 1.3, padding: '2px 5px', borderRadius: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: ch.bg, color: ch.color, border: ch.border ? `1px solid ${ch.border}` : undefined }}>
                                    {ch.name}
                                  </div>
                                ))}
                                {c.hasMore && <div style={{ fontSize: 9, color: 'var(--c-tx6)', paddingLeft: 5 }}>{c.moreText}</div>}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
        <SourceNote text={SRC.calendar} style={{ marginTop: 12 }} />
      </div>
    </div>
  );
}
