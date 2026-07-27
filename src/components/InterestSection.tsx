'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchSectors, fetchTabNews } from '../lib/fetchOnce';
import { fmtNewsDate, fmtPct, NEWS_PILL, upColor } from '../lib/format';
import { useInterests } from '../lib/interests';
import {
  buildMatchTerms, matchNews, tabsForInterests, POPULAR_SECTOR_KEYS,
  type MatchableNews, type MatchedNews, type InterestStock,
} from '../lib/interestNews';
import { PHASE_META, parseSectorKey, sectorByKey } from '../lib/sectors';
import { useDashboard } from '../store/DashboardContext';
import type { Holding } from '../lib/portfolio';
import type { SectorRow, Stock, TabId } from '../types';
import { InterestPicker } from './InterestPicker';
import { SectorModal } from './SectorModal';
import { SourceNote } from './SourceNote';
import { InlineSpinner } from './Footer';

// 대시보드 최상단 '내 관심' 섹션.
//  · 관심 분야(직접 선택) + 관심 종목(보유 ∪ ☆관심종목, 자동)을 기준으로
//    내 종목 등락 · 내 업종 흐름 · 관심사에 매칭된 뉴스를 모아 보여준다.
//  · 뉴스 매칭은 기존 캐시(/api/news)를 클라에서 별칭·키워드로 거른 것 — AI 재생성 없음.
//  · holdings는 prop으로 받는다(대시보드가 이미 usePortfolio를 3번 호출 중 — 4번째 방지).

const CARD: React.CSSProperties = {
  background: 'var(--c-w04)', border: '1px solid var(--c-w08)',
  borderRadius: 20, backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
};

const MAX_STOCKS = 8;

export function InterestSection({ holdings }: { holdings: Holding[] }) {
  const { state, actions, data } = useDashboard();
  const { sectors, loaded, setSectors } = useInterests();
  const [picking, setPicking] = useState(false);
  const [rows, setRows] = useState<Record<string, SectorRow[]>>({});
  const [news, setNews] = useState<MatchableNews[] | null>(null);
  const [selSector, setSelSector] = useState<{ market: 'kr' | 'us'; name: string } | null>(null);

  // 유니버스 전 탭을 id로 색인(보유·관심종목 가격 조회용).
  const byId = useMemo(() => {
    const m = new Map<string, { s: Stock; tab: TabId }>();
    for (const [tab, arr] of Object.entries(data.stocks ?? {}) as [TabId, Stock[]][]) {
      for (const s of arr ?? []) if (!m.has(s.id)) m.set(s.id, { s, tab });
    }
    return m;
  }, [data.stocks]);

  // 관심 종목 = 보유 ∪ ☆관심종목. manual: 보유는 가격행에서 빼되 이름은 매칭에 쓴다.
  const myStocks = useMemo<InterestStock[]>(() => {
    const out: InterestStock[] = [];
    const seen = new Set<string>();
    const add = (name?: string, ticker?: string) => {
      const k = (name ?? ticker ?? '').trim();
      if (!k || seen.has(k)) return;
      seen.add(k);
      out.push({ name: k, ticker });
    };
    for (const h of holdings) add(h.name, h.ticker ?? h.id);
    for (const id of state.watchlist) {
      const e = byId.get(id);
      add(e?.s.name ?? id, e?.s.ticker ?? id);
    }
    return out;
  }, [holdings, state.watchlist, byId]);

  // 가격을 보여줄 수 있는 종목(유니버스에 있는 것만).
  const priced = useMemo(() => {
    const out: { s: Stock; tab: TabId }[] = [];
    const seen = new Set<string>();
    for (const h of holdings) {
      const e = byId.get(h.id) ?? (h.ticker ? byId.get(h.ticker) : undefined);
      if (e && !seen.has(e.s.id)) { seen.add(e.s.id); out.push(e); }
    }
    for (const id of state.watchlist) {
      const e = byId.get(id);
      if (e && !seen.has(e.s.id)) { seen.add(e.s.id); out.push(e); }
    }
    return out;
  }, [holdings, state.watchlist, byId]);

  const terms = useMemo(() => buildMatchTerms(sectors, myStocks), [sectors, myStocks]);
  const tabs = useMemo(() => tabsForInterests(sectors, myStocks), [sectors, myStocks]);

  // 관심 섹터의 업종 흐름 — 필요한 시장만 호출.
  const markets = useMemo(() => {
    const set = new Set<'kr' | 'us'>();
    for (const k of sectors) { const p = parseSectorKey(k); if (p) set.add(p.market); }
    return [...set];
  }, [sectors]);

  useEffect(() => {
    let cancelled = false;
    const need = markets.filter((m) => !rows[m]);
    if (!need.length) return;
    Promise.all(need.map((m) => fetchSectors<SectorRow>(m).then((rows) => [m, rows] as const)))
      .then((res) => { if (!cancelled) setRows((p) => ({ ...p, ...Object.fromEntries(res) })); });
    return () => { cancelled = true; };
  }, [markets, rows]);

  // 관심사에 해당하는 탭 뉴스만 받아와 클라에서 매칭.
  useEffect(() => {
    let cancelled = false;
    if (!tabs.length) { setNews([]); return; }
    setNews(null);
    Promise.all(tabs.map((t) => fetchTabNews<MatchableNews>(t)))
      .then((lists) => { if (!cancelled) setNews(lists.flat()); });
    return () => { cancelled = true; };
  }, [tabs.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const matched: MatchedNews[] = useMemo(
    () => (news ? matchNews(news, terms) : []),
    [news, terms],
  );

  const myRows = useMemo(() => {
    const out: { row: SectorRow; market: 'kr' | 'us' }[] = [];
    for (const k of sectors) {
      const p = parseSectorKey(k);
      if (!p) continue;
      const r = (rows[p.market] ?? []).find((x) => x.name === p.name);
      if (r) out.push({ row: r, market: p.market });
    }
    return out;
  }, [sectors, rows]);

  // 하이드레이션 전에는 아무것도 안 그린다(SSR/CSR 불일치 방지).
  if (!loaded && !sectors.length) return null;

  const hasInterests = sectors.length > 0;
  const label = (k: string) => sectorByKey(k)?.name ?? k;

  return (
    <>
      <section style={{ ...CARD, padding: 22, marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: hasInterests ? 16 : 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: 'var(--c-accyan)' }}>내 관심</div>
          {sectors.slice(0, 6).map((k) => (
            <span key={k} style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 7, background: 'var(--c-cy16)', color: 'var(--c-accyanbr)' }}>
              {label(k)}
            </span>
          ))}
          {sectors.length > 6 && <span style={{ fontSize: 11.5, color: 'var(--c-tx6)' }}>+{sectors.length - 6}</span>}
          <button
            onClick={() => setPicking(true)}
            style={{ marginLeft: 'auto', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: '6px 13px', borderRadius: 9, background: 'var(--c-w05)', border: '1px solid var(--c-w10)', color: 'var(--c-tx3)' }}
          >
            관심 설정
          </button>
        </div>

        {!hasInterests ? (
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-tx2)', marginBottom: 6 }}>
              관심 분야를 고르면 이 자리에 모아서 보여드려요.
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--c-tx5)', marginBottom: 14, lineHeight: 1.6 }}>
              고른 분야의 뉴스와 업종 흐름이 대시보드 맨 위에 뜹니다.
              {priced.length > 0 && ` 보유·관심 종목 ${priced.length}개는 자동으로 반영돼요.`}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {POPULAR_SECTOR_KEYS.map((k) => {
                const p = parseSectorKey(k);
                return (
                  <button
                    key={k}
                    onClick={() => setSectors([k])}
                    style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, padding: '7px 13px', borderRadius: 999, background: 'var(--c-w04)', border: '1px solid var(--c-w08)', color: 'var(--c-tx3)' }}
                  >
                    {p?.market === 'us' ? '해외 ' : ''}{label(k)}
                  </button>
                );
              })}
              <button
                onClick={() => setPicking(true)}
                style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, padding: '7px 13px', borderRadius: 999, background: 'var(--c-cy18)', border: 'none', color: 'var(--c-accyanbr)' }}
              >
                전체 보기 →
              </button>
            </div>
          </div>
        ) : (
          <>
            {priced.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {priced.slice(0, MAX_STOCKS).map(({ s, tab }) => (
                  <button
                    key={s.id}
                    onClick={() => actions.openStock(s.id, tab)}
                    style={{ cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'baseline', gap: 7, padding: '8px 13px', borderRadius: 11, background: 'var(--c-w05)', border: '1px solid var(--c-w08)' }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-tx2)' }}>{s.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: upColor(s.pct) }}>{fmtPct(s.pct)}</span>
                  </button>
                ))}
                {priced.length > MAX_STOCKS && (
                  <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--c-tx6)' }}>+{priced.length - MAX_STOCKS}</span>
                )}
              </div>
            )}

            {myRows.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {myRows.map(({ row, market }) => {
                  const ph = PHASE_META[row.phase];
                  return (
                    <button
                      key={`${market}:${row.name}`}
                      onClick={() => setSelSector({ market, name: row.name })}
                      className="event-row"
                      style={{ cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', margin: '0 -10px', borderRadius: 10, background: 'transparent', border: 'none' }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-tx2)', minWidth: 92 }}>
                        {market === 'us' ? '해외 ' : ''}{row.name}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: ph.bg, color: ph.c, whiteSpace: 'nowrap' }}>
                        {ph.arrow} {ph.label}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: upColor(row.changePct) }}>{fmtPct(row.changePct)}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--c-w05)', paddingTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--c-tx5)', marginBottom: 8 }}>관심 뉴스</div>
              {news === null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', fontSize: 13, color: 'var(--c-tx6)' }}>
                  <InlineSpinner size={13} />불러오는 중…
                </div>
              )}
              {news !== null && matched.length === 0 && (
                <div style={{ padding: '10px 0', fontSize: 13, color: 'var(--c-tx6)' }}>
                  관심 분야에 해당하는 뉴스가 아직 없어요.
                </div>
              )}
              {matched.map((n, i) => {
                const pill = NEWS_PILL[n.impact ?? '중립'];
                const inner = (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {n.impact && (
                      <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 7, whiteSpace: 'nowrap', flexShrink: 0, background: pill.bg, color: pill.color }}>{n.impact}</span>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.5, color: 'var(--c-tx2)' }}>{n.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginTop: 3 }}>
                        <span style={{ color: 'var(--c-accyanbr)', fontWeight: 700 }}>{n.label}</span>
                        {n.src ? ` · ${n.src}` : ''}{fmtNewsDate(n.datetime) ? ` · ${fmtNewsDate(n.datetime)}` : ''}
                      </div>
                    </div>
                  </div>
                );
                const rowStyle: React.CSSProperties = {
                  display: 'block', padding: '11px 8px', margin: '0 -8px', borderRadius: 10,
                  borderBottom: i < matched.length - 1 ? '1px solid var(--c-w05)' : 'none', textDecoration: 'none',
                };
                return n.url ? (
                  <a key={i} href={n.url} target="_blank" rel="noreferrer" className="event-row" style={{ ...rowStyle, cursor: 'pointer' }}>{inner}</a>
                ) : (
                  <div key={i} style={rowStyle}>{inner}</div>
                );
              })}
            </div>

            <SourceNote
              text="관심 분야·보유/관심 종목의 이름과 키워드로 기존 뉴스에서 매칭 · AI 재생성 없음 · 업종 흐름은 대표 ETF 종가(Yahoo)"
              style={{ marginTop: 12 }}
            />
          </>
        )}
      </section>

      {picking && (
        <InterestPicker initial={sectors} onSave={setSectors} onClose={() => setPicking(false)} />
      )}
      {selSector && (
        <SectorModal market={selSector.market} name={selSector.name} onClose={() => setSelSector(null)} />
      )}
    </>
  );
}
