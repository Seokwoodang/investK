'use client';

import { useEffect, useMemo, useState } from 'react';
import { genCandles } from '../../lib/chart';
import { fetchCoinCandles } from '../../lib/coinCandles';
import { fmtPrice, fmtPct, fmtTradeValue, formatVol, riskMeta, scoreColor, upColor } from '../../lib/format';
import { SRC, SRC_CANDLE } from '../../lib/sources';
import { useViewportLayout } from '../DashboardChrome';
import { useDashboard } from '../../store/DashboardContext';
import { useRealtime, useSubscribeStocks, useSubscribeCoins, useSubscribeUs } from '../../store/RealtimeContext';
import type { AlertKey, Candle, DetailTab, Period, Stock, Stocks, TabId } from '../../types';
import { CandleChart } from '../CandleChart';
import { SourceNote, UpdateNote } from '../SourceNote';
import { TermTip } from '../GlossaryTip';
import { InlineSpinner } from '../Footer';

const CARD: React.CSSProperties = {
  background: 'var(--c-w04)', border: '1px solid var(--c-w08)',
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
  호재: { bg: 'var(--c-gn22)', color: 'var(--c-upbr)', border: 'var(--c-gn50)' },
  악재: { bg: 'var(--c-rd22)', color: 'var(--c-downbr)', border: 'var(--c-rd50)' },
  중립: { bg: 'var(--c-gy18)', color: 'var(--c-tx4b)', border: 'var(--c-gy40)' },
};

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: 'chart', label: '차트' },
  { id: 'news', label: '뉴스·정세' },
  { id: 'ai', label: 'AI 관점' },
  { id: 'risk', label: '위험도' },
];

// 봉 단위 선택지. 코인은 거래소가 분/시간봉도 주므로 1시간 포함, 주식(KIS)은 일/주/월.
const PERIODS_COIN: Period[] = ['1분', '5분', '15분', '1시간', '일봉', '주봉', '월봉'];
const PERIODS_STOCK: Period[] = ['일봉', '주봉', '월봉'];
// 차트 봉 표시 라벨(트레이딩뷰 스타일). 내부 값은 한글 Period 유지.
const PERIOD_LABEL: Record<Period, string> = { '1분': '1m', '5분': '5m', '15분': '15m', '1시간': '1H', '일봉': '1D', '주봉': '1W', '월봉': '1M' };
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

function findStock(stocks: Stocks, id: string, tab: TabId): Stock | null {
  const inTab = stocks[tab].find((s) => s.id === id);
  if (inTab) return inTab;
  for (const tb of Object.keys(stocks) as TabId[]) {
    const f = stocks[tb].find((s) => s.id === id);
    if (f) return f;
  }
  return null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const RANGE_PRESETS = ['1주', '1개월', '3개월', '6개월', '1년'] as const;
type RangePreset = (typeof RANGE_PRESETS)[number];
// 기간 수익률용 봉: 시작가가 1회 호출에 포함되도록 구간 길이에 맞춰 자동 선택(거래소 호출 상한 대응).
function autoInterval(fromMs: number, toMs: number): Period {
  const days = (toMs - fromMs) / 86400000;
  if (days <= 95) return '일봉';
  if (days <= 550) return '주봉';
  return '월봉';
}
// 종료일(오늘) 기준으로 프리셋만큼 뺀 시작일.
function presetStart(end: Date, kind: RangePreset): Date {
  const s = new Date(end);
  if (kind === '1주') s.setDate(s.getDate() - 7);
  else if (kind === '1개월') s.setMonth(s.getMonth() - 1);
  else if (kind === '3개월') s.setMonth(s.getMonth() - 3);
  else if (kind === '6개월') s.setMonth(s.getMonth() - 6);
  else s.setFullYear(s.getFullYear() - 1);
  return s;
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

  // ── 차트 데이터(독립) — 봉 단위별 기본 구간만 불러온다. 기간 수익률 컨트롤과 무관. ──
  // 코인은 브라우저에서 거래소 직접 호출, 주식은 서버(/api/candles=KIS). 로딩/실패 시 mock(genCandles) 폴백.
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
  // 참조 안정화 → 다른 state 변경으로 리렌더돼도 차트 패닝/줌이 리셋되지 않음.
  const candles = useMemo(() => realCandles ?? mockCandles, [realCandles, mockCandles]);
  const ret = candles.length ? ((candles[candles.length - 1].c - candles[0].o) / candles[0].o) * 100 : 0;

  // ── 기간 수익률(독립) — 칩으로 고른 기간만 별도 조회해 (시작가→종료가)로 계산. 차트와 무관. ──
  const [presetSel, setPresetSel] = useState<RangePreset>('6개월');
  const [retData, setRetData] = useState<{
    ret: number; fromMs: number; toMs: number;
    high: number; low: number; close: number; offHigh: number; offLow: number; upRatio: number;
  } | null>(null);
  useEffect(() => {
    if (!selId || !selTicker) return;
    const tab = state.activeTab;
    const isCoin = tab === 'kr_coin' || tab === 'global_coin';
    const end = new Date();
    const startD = presetStart(end, presetSel);
    const fromMs = startD.getTime();
    const toMs = end.getTime();
    const per = autoInterval(fromMs, toMs);
    let cancelled = false;
    setRetData(null);
    const calc = (c: Candle[] | null) => {
      if (cancelled || !c || !c.length) return;
      const f = c[0];
      const l = c[c.length - 1];
      const close = l.c;
      const high = Math.max(...c.map((x) => x.h));
      const low = Math.min(...c.map((x) => x.l));
      const up = c.filter((x) => x.c >= x.o).length;
      setRetData({
        ret: ((close - f.o) / f.o) * 100,
        fromMs: (f.t as number) ?? fromMs,
        toMs: (l.t as number) ?? toMs,
        high, low, close,
        offHigh: high > 0 ? (close / high - 1) * 100 : 0,
        offLow: low > 0 ? (close / low - 1) * 100 : 0,
        upRatio: Math.round((up / c.length) * 100),
      });
    };
    if (isCoin) {
      fetchCoinCandles(tab, selTicker, per, { fromMs, toMs }).then(calc).catch(() => {});
    } else {
      const ymd = (d: Date) => isoDate(d).replace(/-/g, '');
      fetch('/api/candles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tab, ticker: selTicker, period: per, from: ymd(startD), to: ymd(end) }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => calc(j?.candles ?? null))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [selId, selTicker, state.activeTab, presetSel]);

  // ── AI 차트 분석 전용 통계(고정: 최근 6개월 일봉) — 수익률 기간 칩·봉 토글과 무관. ──
  const [dayStat, setDayStat] = useState<{ ret: number; high: number; low: number; close: number; offHigh: number; offLow: number; upRatio: number } | null>(null);
  useEffect(() => {
    if (!selId || !selTicker) return;
    const tab = state.activeTab;
    const isCoin = tab === 'kr_coin' || tab === 'global_coin';
    const end = new Date();
    const startD = new Date(end);
    startD.setMonth(end.getMonth() - 6);
    const fromMs = startD.getTime();
    const toMs = end.getTime();
    let cancelled = false;
    setDayStat(null);
    const calc = (c: Candle[] | null) => {
      if (cancelled || !c || !c.length) return;
      const f = c[0];
      const close = c[c.length - 1].c;
      const high = Math.max(...c.map((x) => x.h));
      const low = Math.min(...c.map((x) => x.l));
      const up = c.filter((x) => x.c >= x.o).length;
      setDayStat({
        ret: ((close - f.o) / f.o) * 100,
        high, low, close,
        offHigh: high > 0 ? (close / high - 1) * 100 : 0,
        offLow: low > 0 ? (close / low - 1) * 100 : 0,
        upRatio: Math.round((up / c.length) * 100),
      });
    };
    if (isCoin) {
      fetchCoinCandles(tab, selTicker, '일봉', { fromMs, toMs }).then(calc).catch(() => {});
    } else {
      const ymd = (d: Date) => isoDate(d).replace(/-/g, '');
      fetch('/api/candles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tab, ticker: selTicker, period: '일봉', from: ymd(startD), to: ymd(end) }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => calc(j?.candles ?? null))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [selId, selTicker, state.activeTab]);

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
    if (state.detailTab !== 'chart' || !sel) return;
    if (!dayStat) return; // 고정 일봉(최근 6개월) 통계가 준비되면 호출 — 수익률 기간 칩과 무관
    let cancelled = false;
    setAiAnalysis(null);
    fetch('/api/ai/analysis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: sel.id, period: '최근 일봉', ret: dayStat.ret,
        name: sel.name, ticker: sel.ticker, issue: sel.issue, chartNote: sel.chartNote, risk: sel.risk,
        cur: sel.cur,
        close: dayStat.close, high: dayStat.high, low: dayStat.low,
        offHigh: dayStat.offHigh, offLow: dayStat.offLow, upRatio: dayStat.upRatio,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.text) setAiAnalysis(j.text as string);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selId, dayStat, state.detailTab]);

  // 'AI 관점'(긍정/부정/주의)도 서버(/api/ai/perspective)에서 Claude 생성+캐시.
  // 로딩/실패/키 없음 시 정적 sel.ai 폴백.
  const [aiPerspective, setAiPerspective] = useState<Stock['ai'] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  useEffect(() => {
    if (state.detailTab !== 'ai' || !sel) return;
    let cancelled = false;
    setAiPerspective(null);
    setAiLoading(true);
    fetch('/api/ai/perspective', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: selId,
        name: sel.name,
        ticker: sel.ticker,
        cur: sel.cur,
        pct: sel.pct,
        risk: sel.risk,
        issue: sel.issue,
        chartNote: sel.chartNote,
        newsTitles: sel.news.map((n) => n.title),
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.pos) setAiPerspective(j as Stock['ai']);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selId, state.detailTab]);

  // 직접 진입/새로고침 시 전체 유니버스(/api/universe)가 아직 도착 전이라 종목을 못 찾을 수 있다 → 잠깐 로딩 표시.
  if (!sel) {
    return (
      <div style={{ padding: '80px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--c-tx5)', fontSize: 14 }}>
        <InlineSpinner />
        종목 정보를 불러오는 중…
      </div>
    );
  }

  const ai = aiPerspective ?? sel.ai;

  const rm = riskMeta(sel.risk);
  const livePrice = rt[sel.id]?.price ?? sel.price; // 실시간 소켓 우선
  const livePct = rt[sel.id]?.pct ?? sel.pct;
  // AI 차트 분석·폴백 문구는 고정 일봉(최근 6개월) 기준 — 수익률 기간 칩과 무관.
  const volWord = sel.risk === 'high' ? '변동성이 매우 큰' : sel.risk === 'mid' ? '변동성이 다소 있는' : '비교적 안정적인';
  const chartAnalysis = dayStat
    ? `${sel.name}은(는) 최근 일봉 기준 ${fmtPct(dayStat.ret)} ${dayStat.ret > 0 ? '상승' : dayStat.ret < 0 ? '하락' : '보합'}했고, 현재가는 고점 대비 ${fmtPct(dayStat.offHigh)} 수준입니다. 상승 마감 비율은 약 ${dayStat.upRatio}%로 ${volWord} 흐름입니다. (참고용)`
    : `${sel.name} 차트를 분석하는 중입니다. (참고용)`;
  const newsContext = `${sel.name}의 단기 주가에는 ${sel.issue} 이슈가 핵심 변수로 작용하고 있습니다. 아래는 현재 영향을 주고 있는 주요 뉴스입니다.`;
  // 실제 뉴스 우선, 없으면 정적(sel.news) 폴백.
  const relatedList: RelatedNewsItem[] = relatedNews && relatedNews.length ? relatedNews : sel.news;

  const overall = Math.round((sel.risk4.vol + sel.risk4.liq + sel.risk4.evt + sel.risk4.sent) / 4);
  const aCur = state.alerts[sel.id] || [];

  const detailTab = state.detailTab;

  const segStyle = (active: boolean): React.CSSProperties => ({
    cursor: 'pointer', border: 'none', padding: '7px 16px', borderRadius: 9, fontSize: 13,
    fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 180ms',
    ...(active ? { background: 'var(--c-cy18)', color: 'var(--c-accyanbr)' } : { background: 'transparent', color: 'var(--c-tx4)' }),
  });
  const chipStyle = (active: boolean): React.CSSProperties => ({
    cursor: 'pointer', border: 'none', padding: '6px 11px', borderRadius: 8, fontSize: 12,
    fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 160ms',
    ...(active ? { background: 'var(--c-cy18)', color: 'var(--c-accyanbr)' } : { background: 'transparent', color: 'var(--c-tx4)' }),
  });
  const fmtDay = (ms?: number) => {
    if (!ms) return '';
    const d = new Date(ms);
    return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
  };
  const isCoinTab = state.activeTab === 'kr_coin' || state.activeTab === 'global_coin';
  // 기간 수익률 = 칩으로 고른 기간 기준(차트와 독립). 로딩/실패 시 차트 로드분으로 폴백.
  const shownRet = retData ? retData.ret : ret;
  const shownSpan = retData ? `${fmtDay(retData.fromMs)} ~ ${fmtDay(retData.toMs)}` : '';

  return (
    <div>
      <button onClick={actions.goBack} className="back-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: 'var(--c-w05)', border: '1px solid var(--c-w10)', borderRadius: 999, padding: '9px 18px 9px 14px', color: 'var(--c-tx3)', fontSize: 13, fontWeight: 600, marginBottom: 24, fontFamily: 'inherit' }}>
        ← 뒤로
      </button>

      {/* Header */}
      <div style={{ display: 'flex', flexDirection: layout.detailHeadDir, alignItems: layout.detailHeadAlign, justifyContent: 'space-between', gap: 16, marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--c-tx1)', whiteSpace: 'nowrap' }}>{sel.name}</h1>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-tx6)' }}>{sel.ticker}</span>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.02em', padding: '4px 11px', borderRadius: 999, whiteSpace: 'nowrap', background: rm.bg, color: rm.color }}>위험도 {rm.label}</span>
          </div>
          <div style={{ fontSize: 14, color: 'var(--c-tx5)', marginTop: 10, lineHeight: 1.5 }}>{sel.issue}</div>
        </div>
        <div style={{ textAlign: layout.detailPriceAlign }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>{fmtPrice(livePrice, sel.cur)}</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2, color: upColor(livePct) }}>
            {fmtPct(livePct)} <span style={{ fontSize: 13, color: 'var(--c-tx6)', fontWeight: 500 }}>오늘</span>
            {state.activeTab === 'us_stock' && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, marginLeft: 8, background: 'var(--c-am16)', color: 'var(--c-warn)' }}>지연</span>
            )}
          </div>
          {(sel.vol != null || sel.shares != null) && (
            <div style={{ fontSize: 12, color: 'var(--c-tx6)', marginTop: 6 }}>
              {sel.vol != null && <><TermTip term="거래대금">거래대금</TermTip> {fmtTradeValue(sel.vol, sel.cur)}</>}
              {sel.vol != null && sel.shares != null && sel.shares > 0 && ' · '}
              {sel.shares != null && sel.shares > 0 && <>거래량 {formatVol(sel.shares)}{state.activeTab === 'kr_stock' || state.activeTab === 'us_stock' ? '주' : ''}</>}
            </div>
          )}
        </div>
      </div>

      <UpdateNote text="시세 실시간(국내주식·코인) · 해외주식 약 15분 지연 · AI 차트분석·관점은 하루 1회 캐시" style={{ marginBottom: 20 }} />

      {/* Alerts */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: 'var(--c-tx4)', whiteSpace: 'nowrap' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: 'var(--c-tx4)' }}>
            <path d="M12 3a6 6 0 0 0-6 6c0 5-2 6-2 6h16s-2-1-2-6a6 6 0 0 0-6-6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
                  ? { background: 'var(--c-cy18)', border: '1px solid var(--c-cy40)', color: 'var(--c-accyanbr)' }
                  : { background: 'var(--c-w04)', border: '1px solid var(--c-w10)', color: 'var(--c-tx4)' }),
              }}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      {/* Detail tabs */}
      <div className="no-scrollbar" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--c-w08)', marginBottom: 28, overflowX: 'auto' }}>
        {DETAIL_TABS.map((t) => {
          const active = detailTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => actions.setDetailTab(t.id)}
              style={{
                cursor: 'pointer', border: 'none', background: 'transparent', padding: '12px 20px',
                fontSize: 15, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap',
                borderBottom: `2px solid ${active ? 'var(--c-accyan)' : 'transparent'}`, marginBottom: -1,
                color: active ? 'var(--c-accyan)' : 'var(--c-tx6)', transition: 'all 180ms',
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
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              {/* 왼쪽: 기간 수익률(숫자) + 그 수익률을 계산할 기간 칩을 한 묶음으로 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-tx4)' }}><TermTip term="기간 수익률">기간 수익률</TermTip></span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: upColor(shownRet) }}>{fmtPct(shownRet)}</span>
                  {shownSpan && <span style={{ fontSize: 12, color: 'var(--c-tx6)' }}>{shownSpan}</span>}
                </div>
                <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: 'var(--c-w04)', borderRadius: 10, alignSelf: 'flex-start' }}>
                  {RANGE_PRESETS.map((k) => (
                    <button key={k} onClick={() => setPresetSel(k)} style={chipStyle(presetSel === k)}>{k}</button>
                  ))}
                </div>
                <span style={{ fontSize: 11, color: 'var(--c-tx6)' }}>↑ 위 수익률을 계산할 기간 (아래 차트와는 별개)</span>
              </div>
              {/* 오른쪽: 차트 봉 단위 */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--c-w04)', borderRadius: 12 }}>
                  {(isCoinTab ? PERIODS_COIN : PERIODS_STOCK).map((p) => (
                    <button key={p} onClick={() => actions.setPeriod(p)} style={segStyle(state.period === p)}>{PERIOD_LABEL[p]}</button>
                  ))}
                </div>
                <span style={{ fontSize: 11, color: 'var(--c-tx6)' }}>차트 봉 단위</span>
              </div>
            </div>
            <div style={{ margin: '8px 0 0' }}>
              <CandleChart candles={candles} period={state.period} cur={sel.cur} theme={state.theme} />
            </div>
            <SourceNote text={`차트 — ${SRC_CANDLE[state.activeTab]}`} style={{ marginTop: 14 }} />
          </div>
          <div style={{ background: 'linear-gradient(135deg, var(--c-cy07), var(--c-bl05))', border: '1px solid var(--c-cy18)', borderRadius: 20, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 6, background: 'var(--c-cy18)', color: 'var(--c-accyanbr)' }}>AI 차트 분석</span>
              <span style={{ fontSize: 12, color: 'var(--c-tx6)' }}>최근 일봉 기준</span>
            </div>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: 'var(--c-tx2)' }}>{aiAnalysis || chartAnalysis}</p>
            <SourceNote text={aiAnalysis ? SRC.ai : 'AI 생성 — Claude (Anthropic) · 현재 정적 샘플 표시 중'} style={{ marginTop: 14 }} />
          </div>
        </div>
      )}

      {/* News tab */}
      {detailTab === 'news' && (
        <div>
          <div style={{ ...CARD, borderRadius: 20, padding: 24, marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--c-acblue)', marginBottom: 12 }}>정세 분석 · MACRO CONTEXT</div>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: 'var(--c-tx2)' }}>{newsContext}</p>
          </div>
          {relatedNews !== null && relatedList.length === 0 && (
            <div style={{ ...CARD, borderRadius: 20, padding: 24, textAlign: 'center', color: 'var(--c-tx6)', fontSize: 14 }}>관련 뉴스가 없습니다.</div>
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
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'var(--c-w06)', color: 'var(--c-tx4)' }}>중요도 {n.importance}</span>
                    )}
                  </div>
                )}
                <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, lineHeight: 1.4, color: 'var(--c-tx1b)' }}>{n.title}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-tx6)', whiteSpace: 'nowrap' }}>{n.src}</span>
                  {n.tags.map((tag) => (
                    <span key={tag} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap', background: 'var(--c-cy10)', border: '1px solid var(--c-cy20)', color: 'var(--c-accyanbr)' }}>{tag}</span>
                  ))}
                </div>
                {n.why && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12, padding: '10px 12px', borderRadius: 12, background: 'var(--c-cy06)', border: '1px solid var(--c-cy16)' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--c-accyanbr)', flexShrink: 0, marginTop: 2 }}>왜 중요</span>
                    <span style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--c-tx3)' }}>{n.why}</span>
                  </div>
                )}
                <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6, color: 'var(--c-tx4)' }}>{n.summary}</p>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-acblue)' }}>원문 보기 ↗</span>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14, fontSize: 12, color: 'var(--c-tx6)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 6, background: 'var(--c-cy16)', color: 'var(--c-accyanbr)' }}>AI 생성</span>
            이 탭을 열 때 AI가 해당 종목 데이터로 생성하며, 같은 날에는 저장된 결과를 즉시 보여줍니다. 투자 판단의 참고용입니다.
          </div>
          {aiLoading && ai.pos.length === 0 && ai.neg.length === 0 && ai.caution.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '40px 24px', borderRadius: 20, border: '1px solid var(--c-w08)', background: 'var(--c-w03)', color: 'var(--c-tx4)', fontSize: 14 }}>
              <InlineSpinner />
              AI가 이 종목을 분석하는 중입니다… (처음 열 때 몇 초 걸리고, 이후에는 저장된 결과를 바로 보여줍니다)
            </div>
          ) : (
          <div style={{ display: 'grid', gridTemplateColumns: layout.aiCols, gap: 16, alignItems: 'start' }}>
            {([
              { title: '긍정 요인', color: 'var(--c-up)', bg: 'var(--c-gn06)', border: 'var(--c-gn20)', items: ai.pos },
              { title: '부정 요인', color: 'var(--c-down)', bg: 'var(--c-rd06)', border: 'var(--c-rd20)', items: ai.neg },
              { title: '주의할 점', color: 'var(--c-warn)', bg: 'var(--c-am06)', border: 'var(--c-am20)', items: ai.caution },
            ] as const).map((col) => (
              <div key={col.title} style={{ background: col.bg, border: `1px solid ${col.border}`, borderRadius: 20, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: col.color, whiteSpace: 'nowrap' }}>{col.title}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {col.items.map((it, i) => (
                    <div key={i}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-tx1d)', lineHeight: 1.45, marginBottom: 6 }}>{it.p}</div>
                      <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--c-tx4)' }}>{it.r}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          )}
          <SourceNote
            text={
              aiPerspective
                ? 'AI 생성 — Claude (Anthropic) · 이 종목을 열 때 당일 1회 생성 후 저장(캐시)'
                : 'AI 생성 — Claude (Anthropic) · 현재 정적 샘플 표시 중'
            }
            style={{ marginTop: 18 }}
          />
        </>
      )}

      {/* Risk tab */}
      {detailTab === 'risk' && (
        <div>
          <div style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 24, borderRadius: 20, padding: '24px 28px', marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1, color: scoreColor(overall) }}>{overall}</div>
              <div style={{ fontSize: 12, color: 'var(--c-tx6)', marginTop: 6 }}>종합 위험점수</div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: scoreColor(overall), marginBottom: 6 }}>위험도 {rm.label}</div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--c-tx4)' }}>{sel.riskNote}</p>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {RISK_DIMS.map((dm) => {
              const sc = sel.risk4[dm.key];
              const band = sc < 40 ? '낮은' : sc < 70 ? '보통' : '높은';
              const color = scoreColor(sc);
              return (
                <div key={dm.key} style={{ background: 'var(--c-w03)', border: '1px solid var(--c-w07)', borderRadius: 16, padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--c-tx1d)', whiteSpace: 'nowrap' }}>{dm.label}</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color }}>{sc}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: 'var(--c-w06)', overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ height: '100%', borderRadius: 999, width: `${sc}%`, background: color }} />
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--c-tx4)' }}>{dm.tail} · 현재 {band} 수준입니다.</div>
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
