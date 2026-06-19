'use client';

import { useEffect, useMemo, useState } from 'react';
import { genVol } from '../../lib/chart';
import { fmtPrice, fmtPct, fmtTradeValue, scoreColor, upColor } from '../../lib/format';
import { SRC_QUOTE } from '../../lib/sources';
import { useDashboard } from '../../store/DashboardContext';
import { useRealtime, useSubscribeStocks, useSubscribeCoins, useSubscribeUs } from '../../store/RealtimeContext';
import type { SortKey } from '../../types';
import { TabBar } from '../TabBar';
import { SourceNote } from '../SourceNote';
import { useViewportLayout } from '../DashboardChrome';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'vol', label: '거래대금' },
  { key: 'price', label: '가격' },
  { key: 'pct', label: '변동률' },
  { key: 'risk', label: '위험도' },
];

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke="#6E7A90" strokeWidth="2" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#6E7A90" strokeWidth="2" strokeLinecap="round" />
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
        const volNum = s.vol ?? genVol(s, activeTab);
        const riskQuant = Math.round((s.risk4.vol + s.risk4.liq + s.risk4.evt) / 3);
        const riskLabel = riskQuant < 40 ? '낮음' : riskQuant < 70 ? '중간' : '높음';
        return {
          id: s.id, name: s.name, ticker: s.ticker,
          priceText: fmtPrice(price, s.cur), pctText: fmtPct(pct), pctColor: upColor(pct),
          volText: fmtTradeValue(volNum, s.cur), // 4개 자산군 모두 거래대금 기준
          riskScore: riskQuant, riskLabel, riskColor: scoreColor(riskQuant),
          starred: watchlist.includes(s.id),
          sortVals: { vol: volNum, price, pct, risk: riskQuant } as Record<SortKey, number>,
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

  // 보이는 종목만 실시간 구독: 국내주식=KIS SSE, 코인=거래소 ws. (나머지 탭은 구독 해제)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visKey, subscribeStocks, subscribeCoins, subscribeUs]);

  const noResults = rows.length === 0 && (query.trim().length > 0 || watchOnly);
  const emptyMsg = watchOnly
    ? '이 자산군에 등록된 관심 종목이 없습니다. ☆ 로 등록해 보세요.'
    : '검색 결과가 없습니다. 다른 종목명이나 티커로 검색해 보세요.';

  const showWatchSummary = watchOnly && rows.length > 0;
  const wsAvgPct = showWatchSummary ? rows.reduce((a, x) => a + x.sortVals.pct, 0) / rows.length : 0;
  const wsAvgRisk = showWatchSummary ? Math.round(rows.reduce((a, x) => a + x.riskScore, 0) / rows.length) : 0;

  const headColor = (key: SortKey) => (sortKey === key ? '#5fd9e6' : '#6E7A90');
  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === 'desc' ? '↓' : '↑') : '');

  const sortBtnStyle = (active: boolean): React.CSSProperties => ({
    cursor: 'pointer', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 13,
    fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 180ms',
    ...(active ? { background: 'rgba(0,199,217,0.18)', color: '#5fd9e6' } : { background: 'transparent', color: '#9AA6BC' }),
  });

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>종목</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: '#7E8AA0' }}>자산군을 고르고 거래대금·가격·변동률 기준으로 정렬해 보세요.</p>
      </div>

      <TabBar marginBottom={activeTab === 'us_stock' ? 12 : 24} />
      {activeTab === 'us_stock' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: 12, color: '#9AA6BC' }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(245,181,68,0.16)', color: '#f5b544' }}>지연</span>
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
              width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)', borderRadius: 11, padding: '11px 14px 11px 40px',
              color: '#E7ECF5', fontSize: 14, fontFamily: 'inherit', outline: 'none',
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
                ? { background: 'rgba(0,199,217,0.18)', border: '1px solid rgba(0,199,217,0.40)', color: '#5fd9e6' }
                : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: '#9AA6BC' }),
            }}
          >
            ★ 관심종목
          </button>
          <span style={{ fontSize: 12, color: '#6E7A90' }}>정렬</span>
          <div style={{ display: 'flex', gap: 4, padding: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 11 }}>
            {SORTS.map((s) => (
              <button key={s.key} onClick={() => actions.setSort(s.key)} style={sortBtnStyle(sortKey === s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showWatchSummary && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap', background: 'rgba(0,199,217,0.06)', border: '1px solid rgba(0,199,217,0.16)', borderRadius: 14, padding: '14px 22px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#6E7A90' }}>관심 종목</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: '#EAF2FF' }}>{rows.length}</span>
            <span style={{ fontSize: 12, color: '#6E7A90' }}>종목</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#6E7A90' }}>평균 등락</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: upColor(wsAvgPct) }}>{fmtPct(wsAvgPct)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#6E7A90' }}>평균 위험점수</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: '#EAF2FF' }}>{wsAvgRisk}</span>
          </div>
        </div>
      )}

      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: layout.rowCols, alignItems: 'center', gap: 12, padding: '0 18px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6E7A90' }}>종목</span>
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
        style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderTop: 'none', borderRadius: '0 0 18px 18px', maxHeight: '60vh' }}
      >
        {visible.map((s) => (
          <div
            key={s.id}
            className="stock-row"
            onClick={() => actions.openStock(s.id, activeTab)}
            style={{ display: 'grid', gridTemplateColumns: layout.rowCols, alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); actions.toggleWatch(s.id); }}
              title="관심 종목"
              style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontSize: 18, lineHeight: 1, color: s.starred ? '#00C7D9' : '#5E6B82', fontFamily: 'inherit' }}
            >
              {s.starred ? '★' : '☆'}
            </button>
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#EEF2F8', whiteSpace: 'nowrap' }}>{s.name}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#6E7A90', whiteSpace: 'nowrap' }}>{s.ticker}</span>
            </div>
            {layout.showVol && <span style={{ fontSize: 14, fontWeight: 600, color: '#C4CDDC', textAlign: 'right' }}>{s.volText}</span>}
            <span style={{ fontSize: 16, fontWeight: 700, color: '#F4F7FB', textAlign: 'right' }}>{s.priceText}</span>
            <span style={{ fontSize: 14, fontWeight: 700, textAlign: 'right', color: s.pctColor }}>{s.pctText}</span>
            {layout.showRisk && (
              <div className="risk-cell" style={{ justifySelf: 'end', position: 'relative', textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1, color: s.riskColor }}>{s.riskScore}</div>
                <div style={{ fontSize: 10, fontWeight: 600, marginTop: 3, color: s.riskColor }}>{s.riskLabel}</div>
                <div className="risk-tip" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 250, textAlign: 'left', background: 'rgba(18,24,38,0.98)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '13px 15px', boxShadow: '0 14px 36px rgba(0,0,0,0.5)', zIndex: 30 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#5fd9e6', marginBottom: 7 }}>정량 위험점수</div>
                  <div style={{ fontSize: 12, lineHeight: 1.6, color: '#C4CDDC' }}>
                    변동성 · 유동성 · 이벤트 리스크를 시세 데이터로 자동 산출한 점수입니다. 뉴스 감성까지 반영한 정확한 <span style={{ color: '#73BFF9', fontWeight: 600 }}>AI 종합 위험도</span>는 상세 페이지에서 확인하세요.
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
          <span style={{ fontSize: 12, color: '#6E7A90' }}>
            {visible.length.toLocaleString('ko-KR')} / {rows.length.toLocaleString('ko-KR')}종목
            {limit < rows.length ? ' · 스크롤하면 더 불러옵니다' : ''}
          </span>
        </div>
      )}
      {noResults && (
        <div style={{ padding: 48, textAlign: 'center', color: '#6E7A90', fontSize: 14, border: '1px solid rgba(255,255,255,0.06)', borderTop: 'none', borderRadius: '0 0 18px 18px' }}>
          {emptyMsg}
        </div>
      )}
    </div>
  );
}
