'use client';

import { useEffect, useMemo, useState } from 'react';
import { fmtPrice, fmtPct, fmtTradeValue, formatVol, scoreColor, upColor } from '../../lib/format';
import { SRC_QUOTE } from '../../lib/sources';
import { useDashboard } from '../../store/DashboardContext';
import { useRealtime, useSubscribeStocks, useSubscribeCoins, useSubscribeUs } from '../../store/RealtimeContext';
import type { SortKey } from '../../types';
import { TabBar } from '../TabBar';
import { SourceNote, UpdateNote } from '../SourceNote';
import { Tip } from '../GlossaryTip';
import { useViewportLayout } from '../DashboardChrome';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'vol', label: '거래대금' },
  { key: 'shares', label: '거래량' },
  { key: 'price', label: '가격' },
  { key: 'pct', label: '변동률' },
  { key: 'risk', label: '위험도' },
];

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--c-tx6)' }}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Stocks() {
  const { layout } = useViewportLayout();
  const { state, actions, data } = useDashboard();
  const rt = useRealtime();
  const { activeTab, query, watchOnly, watchlist, sortKey, sortDir } = state;
  const isCoin = activeTab === 'kr_coin' || activeTab === 'global_coin';

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data.stocks[activeTab]
      .filter(
        (s) =>
          (!q || s.name.toLowerCase().includes(q) || s.ticker.toLowerCase().includes(q)) &&
          (!watchOnly || watchlist.includes(s.id)),
      )
      .map((s) => {
        const live = rt[s.id]; // 실시간 소켓 틱이 있으면 우선
        const price = live?.price ?? s.price;
        const pct = live?.pct ?? s.pct;
        // 거래대금은 실데이터(vol)만 표시 — 없으면 '—'. (과거엔 PRNG 가짜 값을 라벨 없이 표시했음)
        const volNum = s.vol ?? 0;
        const sharesNum = s.shares ?? 0;
        const riskQuant = Math.round((s.risk4.vol + s.risk4.liq + s.risk4.evt) / 3);
        const riskLabel = riskQuant < 40 ? '낮음' : riskQuant < 70 ? '중간' : '높음';
        return {
          id: s.id, name: s.name, ticker: s.ticker,
          priceText: fmtPrice(price, s.cur), pctText: fmtPct(pct), pctColor: upColor(pct),
          volText: s.vol != null ? fmtTradeValue(s.vol, s.cur) : '—', // 4개 자산군 모두 거래대금 기준
          sharesText: sharesNum > 0 ? formatVol(sharesNum) + (isCoin ? '' : '주') : '', // 거래량(이슈 #3)
          riskScore: riskQuant, riskLabel, riskColor: scoreColor(riskQuant),
          starred: watchlist.includes(s.id),
          sortVals: { vol: volNum, shares: sharesNum, price, pct, risk: riskQuant } as Record<SortKey, number>,
        };
      });
    list.sort((a, b) => {
      const va = a.sortVals[sortKey];
      const vb = b.sortVals[sortKey];
      return sortDir === 'desc' ? vb - va : va - vb;
    });
    return list;
  }, [data.stocks, rt, activeTab, isCoin, query, watchOnly, watchlist, sortKey, sortDir]);

  // 한 페이지 30개 — 실시간 소켓 구독 대상(보이는 종목)을 한도(KIS ~41) 안으로 유지.
  const PAGE = 30;
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [activeTab, query, watchOnly, sortKey, sortDir]);
  const visible = rows.slice(0, limit);

  // 보이는 종목만 실시간 구독: 국내주식=KIS SSE, 코인=거래소 ws, 해외주식=30초 REST 폴링(15분 지연).
  const subscribeStocks = useSubscribeStocks();
  const subscribeCoins = useSubscribeCoins();
  const subscribeUs = useSubscribeUs();
  const visKey = activeTab + '|' + visible.map((s) => s.id).join(',');
  useEffect(() => {
    const clear = () => {
      subscribeStocks([]);
      subscribeCoins({}, {});
      subscribeUs({});
    };
    if (activeTab === 'kr_stock') {
      clear();
      subscribeStocks(visible.map((s) => s.id));
    } else if (activeTab === 'us_stock') {
      // 과거 버그: 해외주식은 구독 배선이 빠져 있어 폴링이 데드코드였고 시세가 로드 시점에 동결됐음.
      const us: Record<string, string> = {};
      visible.forEach((s) => (us[s.ticker] = s.id));
      clear();
      subscribeUs(us);
    } else if (activeTab === 'kr_coin') {
      const up: Record<string, string> = {};
      visible.forEach((s) => (up['KRW-' + s.ticker.split('/')[0]] = s.id));
      clear();
      subscribeCoins(up, {});
    } else if (activeTab === 'global_coin') {
      const bn: Record<string, string> = {};
      visible.forEach((s) => (bn[s.ticker + 'USDT'] = s.id));
      clear();
      subscribeCoins({}, bn);
    } else {
      clear();
    }
    // 페이지를 떠날 때 구독 해제(소켓·폴링이 세션 내내 살아있지 않게).
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visKey, subscribeStocks, subscribeCoins, subscribeUs]);

  const noResults = rows.length === 0 && (query.trim().length > 0 || watchOnly);
  const emptyMsg = watchOnly
    ? '이 자산군에 등록된 관심 종목이 없습니다. ☆ 로 등록해 보세요.'
    : '검색 결과가 없습니다. 다른 종목명이나 티커로 검색해 보세요.';

  const showWatchSummary = watchOnly && rows.length > 0;
  const wsAvgPct = showWatchSummary ? rows.reduce((a, x) => a + x.sortVals.pct, 0) / rows.length : 0;
  const wsAvgRisk = showWatchSummary ? Math.round(rows.reduce((a, x) => a + x.riskScore, 0) / rows.length) : 0;

  const headColor = (key: SortKey) => (sortKey === key ? 'var(--c-accyanbr)' : 'var(--c-tx6)');
  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === 'desc' ? '↓' : '↑') : '');

  const sortBtnStyle = (active: boolean): React.CSSProperties => ({
    cursor: 'pointer', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 13,
    fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 180ms',
    ...(active ? { background: 'var(--c-cy18)', color: 'var(--c-accyanbr)' } : { background: 'transparent', color: 'var(--c-tx4)' }),
  });

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>종목</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-tx5)' }}>자산군을 고르고 거래대금·가격·변동률 기준으로 정렬해 보세요.</p>
        <UpdateNote text="국내주식·코인 실시간 · 해외주식 약 15분 지연 · 종목 목록 수 분 캐시" style={{ marginTop: 8 }} />
      </div>

      <TabBar marginBottom={activeTab === 'us_stock' ? 12 : 24} />
      {activeTab === 'us_stock' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: 12, color: 'var(--c-tx4)' }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'var(--c-am16)', color: 'var(--c-warn)' }}>지연</span>
          해외주식은 약 15분 지연시세입니다.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 340 }}>
          <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
            <SearchIcon />
          </span>
          <input
            className="search-input"
            value={query}
            onChange={(e) => actions.setQuery(e.target.value)}
            placeholder="종목명 · 티커 검색"
            style={{
              width: '100%', boxSizing: 'border-box', background: 'var(--c-w04)',
              border: '1px solid var(--c-w10)', borderRadius: 11, padding: '11px 14px 11px 40px',
              color: 'var(--c-tx1d)', fontSize: 14, fontFamily: 'inherit', outline: 'none',
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={actions.toggleWatchOnly}
            style={{
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
              borderRadius: 11, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap',
              transition: 'all 180ms',
              ...(watchOnly
                ? { background: 'var(--c-cy18)', border: '1px solid var(--c-cy40)', color: 'var(--c-accyanbr)' }
                : { background: 'var(--c-w04)', border: '1px solid var(--c-w10)', color: 'var(--c-tx4)' }),
            }}
          >
            ★ 관심종목
          </button>
          <span style={{ fontSize: 12, color: 'var(--c-tx6)' }}>정렬</span>
          <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--c-w04)', border: '1px solid var(--c-w07)', borderRadius: 11 }}>
            {SORTS.map((s) => (
              <button key={s.key} onClick={() => actions.setSort(s.key)} style={sortBtnStyle(sortKey === s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showWatchSummary && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap', background: 'var(--c-cy06)', border: '1px solid var(--c-cy16)', borderRadius: 14, padding: '14px 22px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--c-tx6)' }}>관심 종목</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--c-tx1c)' }}>{rows.length}</span>
            <span style={{ fontSize: 12, color: 'var(--c-tx6)' }}>종목</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--c-tx6)' }}>평균 등락</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: upColor(wsAvgPct) }}>{fmtPct(wsAvgPct)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--c-tx6)' }}>평균 위험점수</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--c-tx1c)' }}>{wsAvgRisk}</span>
          </div>
        </div>
      )}

      {/* Header row — 리스트 박스의 상단부(테두리·상단 라운드 포함). 아래 리스트와 한 박스를 이룬다. */}
      <div style={{ display: 'grid', gridTemplateColumns: layout.rowCols, alignItems: 'center', gap: 12, padding: '14px 18px 12px', background: 'var(--c-w025)', border: '1px solid var(--c-w06)', borderBottom: '1px solid var(--c-w08)', borderRadius: '18px 18px 0 0' }}>
        <span />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-tx6)' }}>종목</span>
        {layout.showVol && (
          <span onClick={() => actions.setSort('vol')} style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', color: headColor('vol'), cursor: 'pointer' }}>거래대금 {arrow('vol')}</span>
        )}
        <span onClick={() => actions.setSort('price')} style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', color: headColor('price'), cursor: 'pointer' }}>현재가 {arrow('price')}</span>
        <span onClick={() => actions.setSort('pct')} style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', color: headColor('pct'), cursor: 'pointer' }}>변동률 {arrow('pct')}</span>
        {layout.showRisk && (
          <span onClick={() => actions.setSort('risk')} style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', color: headColor('risk'), cursor: 'pointer' }}>위험도 {arrow('risk')}</span>
        )}
      </div>

      <div
        className="list-scroll"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 280) {
            setLimit((n) => (n < rows.length ? n + PAGE : n));
          }
        }}
        style={{ display: 'flex', flexDirection: 'column', background: 'var(--c-w025)', border: '1px solid var(--c-w06)', borderTop: 'none', borderRadius: '0 0 18px 18px', maxHeight: '60vh' }}
      >
        {visible.map((s) => (
          <div
            key={s.id}
            className="stock-row"
            onClick={() => actions.openStock(s.id, activeTab)}
            style={{ display: 'grid', gridTemplateColumns: layout.rowCols, alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--c-w05)', cursor: 'pointer' }}
          >
            <Tip
              title={s.starred ? '관심 종목 (등록됨)' : '관심 종목'}
              body="☆를 누르면 관심 종목으로 등록됩니다. 등록하면 ① 위 ‘★ 관심종목’ 필터로 모아 볼 수 있고, ② 대시보드 ‘주요 일정’ 달력에서 이 종목의 실적 발표일이 테두리로 강조됩니다."
              width={230}
            >
              <button
                onClick={(e) => { e.stopPropagation(); actions.toggleWatch(s.id); }}
                aria-label={s.starred ? '관심 종목 해제' : '관심 종목 등록'}
                style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontSize: 18, lineHeight: 1, color: s.starred ? 'var(--c-accyan)' : 'var(--c-txph)', fontFamily: 'inherit' }}
              >
                {s.starred ? '★' : '☆'}
              </button>
            </Tip>
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-tx1b)', whiteSpace: 'nowrap' }}>{s.name}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-tx6)', whiteSpace: 'nowrap' }}>{s.ticker}</span>
            </div>
            {layout.showVol && (
              <span style={{ textAlign: 'right' }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--c-tx3)' }}>{s.volText}</span>
                {s.sharesText && <span style={{ display: 'block', fontSize: 11, color: 'var(--c-tx6)', marginTop: 2 }}>{s.sharesText}</span>}
              </span>
            )}
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-tx1)', textAlign: 'right' }}>{s.priceText}</span>
            <span style={{ fontSize: 14, fontWeight: 700, textAlign: 'right', color: s.pctColor }}>{s.pctText}</span>
            {layout.showRisk && (
              <div className="risk-cell" style={{ justifySelf: 'end', position: 'relative', textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1, color: s.riskColor }}>{s.riskScore}</div>
                <div style={{ fontSize: 10, fontWeight: 600, marginTop: 3, color: s.riskColor }}>{s.riskLabel}</div>
                {/* 스크롤 컨테이너(.list-scroll) 안이라 아래로 펼치면 하단 행에서 잘림 → 셀 왼쪽·세로 중앙에 표시 */}
                <div className="risk-tip" style={{ position: 'absolute', top: '50%', right: 'calc(100% + 10px)', transform: 'translateY(-50%)', width: 250, textAlign: 'left', background: 'var(--c-panel)', border: '1px solid var(--c-w12)', borderRadius: 12, padding: '13px 15px', boxShadow: '0 14px 36px var(--c-shadow)', zIndex: 30 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-accyanbr)', marginBottom: 7 }}>정량 위험점수</div>
                  <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--c-tx3)' }}>
                    변동성 · 유동성 · 이벤트 리스크를 시세 데이터로 자동 산출한 점수입니다. 뉴스 감성까지 반영한 정확한 <span style={{ color: 'var(--c-acblue)', fontWeight: 600 }}>AI 종합 위험도</span>는 상세 페이지에서 확인하세요.
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {!noResults && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 2px 0', flexWrap: 'wrap' }}>
          <SourceNote text={SRC_QUOTE[activeTab]} />
          <span style={{ fontSize: 12, color: 'var(--c-tx6)' }}>
            {visible.length.toLocaleString('ko-KR')} / {rows.length.toLocaleString('ko-KR')}종목
            {limit < rows.length ? ' · 스크롤하면 더 불러옵니다' : ''}
          </span>
        </div>
      )}
      {noResults && (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--c-tx6)', fontSize: 14, border: '1px solid var(--c-w06)', borderTop: 'none', borderRadius: '0 0 18px 18px' }}>
          {emptyMsg}
        </div>
      )}
    </div>
  );
}
