'use client';

import { useEffect, useMemo, useState } from 'react';
import { genCandles } from '../../lib/chart';
import { fetchCoinCandles } from '../../lib/coinCandles';
import { fmtPrice, fmtPct, riskMeta, scoreColor, upColor } from '../../lib/format';
import { SRC, SRC_CANDLE } from '../../lib/sources';
import { useViewportLayout } from '../DashboardChrome';
import { useDashboard } from '../../store/DashboardContext';
import { useRealtime, useSubscribeStocks, useSubscribeCoins, useSubscribeUs } from '../../store/RealtimeContext';
import type { AlertKey, Candle, ChartMarker, DetailTab, Period, Stock, Stocks, TabId } from '../../types';
import { CandleChart } from '../CandleChart';
import { SourceNote } from '../SourceNote';

const CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
};

interface RelatedNewsItem {
  title: string;
  summary: string;
  src: string;
  tags: string[];
  url?: string;
  impact?: '호재' | '악재' | '중립';
  importance?: '상' | '중' | '하';
  why?: string;
  target?: string;
}

const IMPACT_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  호재: { bg: 'rgba(52,211,154,0.22)', color: '#5ee7b0', border: 'rgba(52,211,154,0.5)' },
  악재: { bg: 'rgba(246,104,94,0.22)', color: '#ff8a80', border: 'rgba(246,104,94,0.5)' },
  중립: { bg: 'rgba(154,166,188,0.18)', color: '#aab4c6', border: 'rgba(154,166,188,0.4)' },
};

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: 'chart', label: '차트' },
  { id: 'news', label: '뉴스·정세' },
  { id: 'ai', label: 'AI 관점' },
  { id: 'risk', label: '위험도' },
];

// 봉 단위 선택지. 코인은 거래소가 분/시간봉도 주므로 1시간 포함, 주식(KIS)은 일/주/월.
const PERIODS_COIN: Period[] = ['1시간', '일봉', '주봉', '월봉'];
const PERIODS_STOCK: Period[] = ['일봉', '주봉', '월봉'];
const ALERTS: { k: AlertKey; label: string }[] = [
  { k: 'target', label: '목표가 도달' },
  { k: 'swing', label: '급등락 ±5%' },
  { k: 'risk', label: '위험도 상승' },
];

const RISK_DIMS: { key: keyof Stock['risk4']; label: string; tail: string }[] = [
  { key: 'vol', label: '변동성', tail: '가격 등락 폭의 크기' },
  { key: 'liq', label: '유동성', tail: '거래량·체결 안정성 (낮을수록 양호)' },
  { key: 'evt', label: '이벤트 리스크', tail: '규제·일정 등 외부 이벤트 노출도' },
  { key: 'sent', label: '뉴스 감성', tail: '최근 뉴스 톤의 부정 정도' },
];

function shortLabel(n: string): string {
  return /CPI/.test(n) ? 'CPI' : /FOMC/.test(n) ? 'FOMC' : /PCE/.test(n) ? 'PCE' : /GDP/.test(n) ? 'GDP' : /ECB/.test(n) ? 'ECB' : n.slice(0, 4);
}

function findStock(stocks: Stocks, id: string, tab: TabId): Stock | null {
  const inTab = stocks[tab].find((s) => s.id === id);
  if (inTab) return inTab;
  for (const tb of Object.keys(stocks) as TabId[]) {
    const f = stocks[tb].find((s) => s.id === id);
    if (f) return f;
  }
  return null;
}

export function Detail({ id }: { id: string }) {
  const { layout } = useViewportLayout();
  const { state, actions, data } = useDashboard();
  const rt = useRealtime();
  const subscribeStocks = useSubscribeStocks();
  const subscribeCoins = useSubscribeCoins();
  const subscribeUs = useSubscribeUs();
  const sel = findStock(data.stocks, id, state.activeTab);

  const selId = sel?.id;

  // 실제 과거 OHLC. 코인은 브라우저에서 거래소 직접 호출, 주식은 서버(/api/candles=KIS).
  // 로딩/실패 시 mock(genCandles) 폴백.
  const mockCandles = useMemo(() => (sel ? genCandles(sel, state.period) : []), [sel, state.period]);
  const [realCandles, setRealCandles] = useState<Candle[] | null>(null);
  const selTicker = sel?.ticker;
  useEffect(() => {
    if (!selId || !selTicker) return;
    const tab = state.activeTab;
    const isCoin = tab === 'kr_coin' || tab === 'global_coin';
    let cancelled = false;
    setRealCandles(null);
    const got = (c: Candle[] | null) => {
      if (!cancelled && c && c.length) setRealCandles(c);
    };
    if (isCoin) {
      fetchCoinCandles(tab, selTicker, state.period).then(got).catch(() => {});
    } else {
      fetch('/api/candles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tab, ticker: selTicker, period: state.period }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => got(j?.candles ?? null))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [selId, selTicker, state.activeTab, state.period]);
  const candles = realCandles ?? mockCandles;
  const ret = candles.length ? ((candles[candles.length - 1].c - candles[0].o) / candles[0].o) * 100 : 0;

  // 상세 종목 실시간 구독: 국내주식=KIS SSE, 코인=거래소 ws.
  useEffect(() => {
    const tab = state.activeTab;
    const clear = () => {
      subscribeStocks([]);
      subscribeCoins({}, {});
      subscribeUs({});
    };
    if (tab === 'kr_stock' && selId) {
      clear();
      subscribeStocks([selId]);
    } else if (tab === 'kr_coin' && sel) {
      clear();
      subscribeCoins({ ['KRW-' + sel.ticker.split('/')[0]]: sel.id }, {});
    } else if (tab === 'global_coin' && sel) {
      clear();
      subscribeCoins({}, { [sel.ticker + 'USDT']: sel.id });
    } else {
      clear();
    }
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeTab, selId, sel?.ticker, subscribeStocks, subscribeCoins, subscribeUs]);

  // '뉴스·정세' 탭: 해당 종목의 실제 네이버 뉴스. 코인/실패 시 [] → 정적 sel.news 폴백.
  const selTickerForNews = sel?.ticker;
  const selNameForNews = sel?.name;
  const [relatedNews, setRelatedNews] = useState<RelatedNewsItem[] | null>(null);
  useEffect(() => {
    if (state.detailTab !== 'news' || !selId || !selTickerForNews) return;
    let cancelled = false;
    setRelatedNews(null);
    fetch('/api/news', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tab: state.activeTab, items: [{ code: selTickerForNews, name: selNameForNews }] }),
    })
      .then((r) => (r.ok ? r.json() : { news: [] }))
      .then((j) => {
        if (!cancelled) setRelatedNews(j.news ?? []);
      })
      .catch(() => {
        if (!cancelled) setRelatedNews([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selId, selTickerForNews, selNameForNews, state.activeTab, state.detailTab]);

  // 'AI 차트 분석'을 서버(/api/ai/analysis)에서 가져온다 — 캐시 히트면 즉시, 아니면 Claude 생성.
  // 로딩/실패/키 없음 시에는 아래 chartAnalysis 템플릿으로 폴백.
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  useEffect(() => {
    if (state.detailTab !== 'chart' || !selId) return;
    let cancelled = false;
    setAiAnalysis(null);
    fetch('/api/ai/analysis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: selId, period: state.period, ret }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.text) setAiAnalysis(j.text as string);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selId, state.period, ret, state.detailTab]);

  // 'AI 관점'(긍정/부정/주의)도 서버(/api/ai/perspective)에서 Claude 생성+캐시.
  // 로딩/실패/키 없음 시 정적 sel.ai 폴백.
  const [aiPerspective, setAiPerspective] = useState<Stock['ai'] | null>(null);
  useEffect(() => {
    if (state.detailTab !== 'ai' || !selId) return;
    let cancelled = false;
    setAiPerspective(null);
    fetch('/api/ai/perspective', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: selId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.pos) setAiPerspective(j as Stock['ai']);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selId, state.detailTab]);

  if (!sel) return null;

  const ai = aiPerspective ?? sel.ai;

  const rm = riskMeta(sel.risk);
  const livePrice = rt[sel.id]?.price ?? sel.price; // 실시간 소켓 우선
  const livePct = rt[sel.id]?.pct ?? sel.pct;
  const dirWord = ret > 0 ? '상승' : ret < 0 ? '하락' : '보합';
  const volWord = sel.risk === 'high' ? '변동성이 매우 큰' : sel.risk === 'mid' ? '변동성이 다소 있는' : '비교적 안정적인';
  const chartAnalysis = `${sel.name}은(는) 최근 ${state.period} 기준 ${fmtPct(ret)} ${dirWord}했습니다. ${sel.chartNote} 해당 흐름은 ${volWord} 모습으로, 매매 시 분할 접근과 손절 기준을 함께 점검하는 것이 좋습니다.`;
  const newsContext = `${sel.name}의 단기 주가에는 ${sel.issue} 이슈가 핵심 변수로 작용하고 있습니다. 아래는 현재 영향을 주고 있는 주요 뉴스입니다.`;
  // 실제 뉴스 우선, 없으면 정적(sel.news) 폴백.
  const relatedList: RelatedNewsItem[] = relatedNews && relatedNews.length ? relatedNews : sel.news;

  const hiEvents = data.macro.events.filter((e) => e.tag === '고영향');
  const markerFracs = [0.5, 0.8];
  const markers: ChartMarker[] = hiEvents.slice(0, 2).map((e, i) => ({ xFrac: markerFracs[i], label: shortLabel(e.name), color: '#f5b544' }));

  const overall = Math.round((sel.risk4.vol + sel.risk4.liq + sel.risk4.evt + sel.risk4.sent) / 4);
  const aCur = state.alerts[sel.id] || [];

  const detailTab = state.detailTab;

  const segStyle = (active: boolean): React.CSSProperties => ({
    cursor: 'pointer', border: 'none', padding: '7px 16px', borderRadius: 9, fontSize: 13,
    fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 180ms',
    ...(active ? { background: 'rgba(0,199,217,0.18)', color: '#5fd9e6' } : { background: 'transparent', color: '#9AA6BC' }),
  });

  return (
    <div>
      <button onClick={actions.goBack} className="back-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 999, padding: '9px 18px 9px 14px', color: '#C4CDDC', fontSize: 13, fontWeight: 600, marginBottom: 24, fontFamily: 'inherit' }}>
        ← 뒤로
      </button>

      {/* Header */}
      <div style={{ display: 'flex', flexDirection: layout.detailHeadDir, alignItems: layout.detailHeadAlign, justifyContent: 'space-between', gap: 16, marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', color: '#F4F7FB', whiteSpace: 'nowrap' }}>{sel.name}</h1>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#6E7A90' }}>{sel.ticker}</span>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.02em', padding: '4px 11px', borderRadius: 999, whiteSpace: 'nowrap', background: rm.bg, color: rm.color }}>위험도 {rm.label}</span>
          </div>
          <div style={{ fontSize: 14, color: '#7E8AA0', marginTop: 10, lineHeight: 1.5 }}>{sel.issue}</div>
        </div>
        <div style={{ textAlign: layout.detailPriceAlign }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>{fmtPrice(livePrice, sel.cur)}</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2, color: upColor(livePct) }}>
            {fmtPct(livePct)} <span style={{ fontSize: 13, color: '#6E7A90', fontWeight: 500 }}>오늘</span>
            {state.activeTab === 'us_stock' && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, marginLeft: 8, background: 'rgba(245,181,68,0.16)', color: '#f5b544' }}>지연</span>
            )}
          </div>
        </div>
      </div>

      {/* Alerts */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#9AA6BC', whiteSpace: 'nowrap' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M12 3a6 6 0 0 0-6 6c0 5-2 6-2 6h16s-2-1-2-6a6 6 0 0 0-6-6Z" stroke="#9AA6BC" strokeWidth="2" strokeLinejoin="round" />
            <path d="M10 20a2 2 0 0 0 4 0" stroke="#9AA6BC" strokeWidth="2" strokeLinecap="round" />
          </svg>
          알림 설정
        </span>
        {ALERTS.map((a) => {
          const active = aCur.includes(a.k);
          return (
            <button
              key={a.k}
              onClick={() => actions.toggleAlert(sel.id, a.k)}
              style={{
                cursor: 'pointer', padding: '7px 14px', borderRadius: 999, fontSize: 12,
                fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 180ms',
                ...(active
                  ? { background: 'rgba(0,199,217,0.18)', border: '1px solid rgba(0,199,217,0.40)', color: '#5fd9e6' }
                  : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: '#9AA6BC' }),
              }}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      {/* Detail tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 28, overflowX: 'auto' }}>
        {DETAIL_TABS.map((t) => {
          const active = detailTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => actions.setDetailTab(t.id)}
              style={{
                cursor: 'pointer', border: 'none', background: 'transparent', padding: '12px 20px',
                fontSize: 15, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap',
                borderBottom: `2px solid ${active ? '#00C7D9' : 'transparent'}`, marginBottom: -1,
                color: active ? '#00C7D9' : '#6E7A90', transition: 'all 180ms',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Chart tab */}
      {detailTab === 'chart' && (
        <div>
          <div style={{ ...CARD, borderRadius: 24, padding: 24, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#9AA6BC' }}>기간 수익률</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: upColor(ret) }}>{fmtPct(ret)}</span>
              </div>
              <div style={{ display: 'flex', gap: 4, padding: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 12 }}>
                {(state.activeTab === 'kr_coin' || state.activeTab === 'global_coin' ? PERIODS_COIN : PERIODS_STOCK).map((p) => (
                  <button key={p} onClick={() => actions.setPeriod(p)} style={segStyle(state.period === p)}>{p}</button>
                ))}
              </div>
            </div>
            <div style={{ margin: '8px -4px 0' }}>
              <CandleChart candles={candles} markers={markers} period={state.period} cur={sel.cur} />
            </div>
            <SourceNote text={`차트 — ${SRC_CANDLE[state.activeTab]}`} style={{ marginTop: 14 }} />
          </div>
          <div style={{ background: 'linear-gradient(135deg, rgba(0,199,217,0.07), rgba(64,120,255,0.05))', border: '1px solid rgba(0,199,217,0.18)', borderRadius: 20, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 6, background: 'rgba(0,199,217,0.18)', color: '#5fd9e6' }}>AI 차트 분석</span>
              <span style={{ fontSize: 12, color: '#6E7A90' }}>{state.period} 기준</span>
            </div>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: '#D4DCE8' }}>{aiAnalysis || chartAnalysis}</p>
            <SourceNote text={aiAnalysis ? SRC.ai : 'AI 생성 — Claude (Anthropic) · 현재 정적 샘플 표시 중'} style={{ marginTop: 14 }} />
          </div>
        </div>
      )}

      {/* News tab */}
      {detailTab === 'news' && (
        <div>
          <div style={{ ...CARD, borderRadius: 20, padding: 24, marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: '#73BFF9', marginBottom: 12 }}>정세 분석 · MACRO CONTEXT</div>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: '#D4DCE8' }}>{newsContext}</p>
          </div>
          {relatedNews !== null && relatedList.length === 0 && (
            <div style={{ ...CARD, borderRadius: 20, padding: 24, textAlign: 'center', color: '#6E7A90', fontSize: 14 }}>관련 뉴스가 없습니다.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {relatedList.map((n, i) => (
              <a key={i} href={n.url || '#'} target="_blank" rel="noopener noreferrer" style={{ ...CARD, display: 'block', textDecoration: 'none', borderRadius: 20, padding: 22 }}>
                {(n.impact || n.target) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                    {n.impact && (
                      <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.02em', padding: '5px 14px', borderRadius: 9, background: IMPACT_STYLE[n.impact].bg, border: `1px solid ${IMPACT_STYLE[n.impact].border}`, color: IMPACT_STYLE[n.impact].color }}>{n.impact}</span>
                    )}
                    {n.target && <span style={{ fontSize: 15, fontWeight: 800, color: IMPACT_STYLE[n.impact || '중립'].color }}>{n.target}</span>}
                    {n.importance && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: '#9AA6BC' }}>중요도 {n.importance}</span>
                    )}
                  </div>
                )}
                <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, lineHeight: 1.4, color: '#EEF2F8' }}>{n.title}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#6E7A90', whiteSpace: 'nowrap' }}>{n.src}</span>
                  {n.tags.map((tag) => (
                    <span key={tag} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap', background: 'rgba(0,199,217,0.10)', border: '1px solid rgba(0,199,217,0.20)', color: '#5fd9e6' }}>{tag}</span>
                  ))}
                </div>
                {n.why && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12, padding: '10px 12px', borderRadius: 12, background: 'rgba(0,199,217,0.06)', border: '1px solid rgba(0,199,217,0.16)' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#5fd9e6', flexShrink: 0, marginTop: 2 }}>왜 중요</span>
                    <span style={{ fontSize: 13, lineHeight: 1.55, color: '#C4CDDC' }}>{n.why}</span>
                  </div>
                )}
                <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6, color: '#9AA6BC' }}>{n.summary}</p>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#73BFF9' }}>원문 보기 ↗</span>
              </a>
            ))}
          </div>
          <SourceNote
            text={relatedNews && relatedNews.length ? '네이버 금융 종목뉴스' : '관련 뉴스 — 정적 샘플 (실연동 시 네이버 금융 뉴스)'}
            style={{ marginTop: 18 }}
          />
        </div>
      )}

      {/* AI tab */}
      {detailTab === 'ai' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14, fontSize: 12, color: '#6E7A90' }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 6, background: 'rgba(0,199,217,0.16)', color: '#5fd9e6' }}>AI 생성</span>
            AI가 데이터를 종합해 생성한 의견입니다. 투자 판단의 참고용입니다.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: layout.aiCols, gap: 16, alignItems: 'start' }}>
            {([
              { title: '긍정 요인', color: '#34d39a', bg: 'rgba(52,211,154,0.06)', border: 'rgba(52,211,154,0.20)', items: ai.pos },
              { title: '부정 요인', color: '#f6685e', bg: 'rgba(246,104,94,0.06)', border: 'rgba(246,104,94,0.20)', items: ai.neg },
              { title: '주의할 점', color: '#f5b544', bg: 'rgba(245,181,68,0.06)', border: 'rgba(245,181,68,0.20)', items: ai.caution },
            ] as const).map((col) => (
              <div key={col.title} style={{ background: col.bg, border: `1px solid ${col.border}`, borderRadius: 20, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: col.color, whiteSpace: 'nowrap' }}>{col.title}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {col.items.map((it, i) => (
                    <div key={i}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#E7ECF5', lineHeight: 1.45, marginBottom: 6 }}>{it.p}</div>
                      <div style={{ fontSize: 13, lineHeight: 1.6, color: '#9AA6BC' }}>{it.r}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <SourceNote text={aiPerspective ? SRC.ai : 'AI 생성 — Claude (Anthropic) · 현재 정적 샘플 표시 중'} style={{ marginTop: 18 }} />
        </>
      )}

      {/* Risk tab */}
      {detailTab === 'risk' && (
        <div>
          <div style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 24, borderRadius: 20, padding: '24px 28px', marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1, color: scoreColor(overall) }}>{overall}</div>
              <div style={{ fontSize: 12, color: '#6E7A90', marginTop: 6 }}>종합 위험점수</div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: scoreColor(overall), marginBottom: 6 }}>위험도 {rm.label}</div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#9AA6BC' }}>{sel.riskNote}</p>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {RISK_DIMS.map((dm) => {
              const sc = sel.risk4[dm.key];
              const band = sc < 40 ? '낮은' : sc < 70 ? '보통' : '높은';
              const color = scoreColor(sc);
              return (
                <div key={dm.key} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#E7ECF5', whiteSpace: 'nowrap' }}>{dm.label}</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color }}>{sc}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ height: '100%', borderRadius: 999, width: `${sc}%`, background: color }} />
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: '#9AA6BC' }}>{dm.tail} · 현재 {band} 수준입니다.</div>
                </div>
              );
            })}
          </div>
          <SourceNote text={SRC.risk} style={{ marginTop: 18 }} />
        </div>
      )}
    </div>
  );
}
