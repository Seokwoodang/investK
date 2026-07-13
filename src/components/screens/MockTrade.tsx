'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fmtPct, fmtPrice, upColor } from '../../lib/format';
import { useDashboard } from '../../store/DashboardContext';
import { track } from '../../lib/ga';
import type { Candle, Period, TabId } from '../../types';
import { CandleChart } from '../CandleChart';
import { fetchOlderCandles } from '../../lib/candleHistory';
import { InlineSpinner } from '../Footer';
import { AssetLineChart, AllocationDonut } from '../MockCharts';

// 모의투자 (HTS 스타일) — 가운데 큰 차트 + 종목 전환 + 오른쪽 주문창.
// 씨드 1,000만원(원화). 국내주식·국내코인 실시간 매매 + 총자산 랭킹.
// 체결가는 서버가 조회(POST /api/mock/trade)하므로 여기 표시가는 참고용이다.

const CARD: React.CSSProperties = {
  background: 'var(--c-w04)', border: '1px solid var(--c-w08)', borderRadius: 20,
  backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
};
const inputStyle: React.CSSProperties = {
  background: 'var(--c-w04)', border: '1px solid var(--c-w10)', borderRadius: 9, padding: '9px 12px',
  color: 'var(--c-tx1d)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', width: '100%',
};
const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');

type MockTab = 'kr_stock' | 'kr_coin';
type AcctKind = 'season' | 'longterm';
interface Holding { tab: MockTab; code: string; name: string; qty: number; avgCost: number; price: number; value: number; cost: number; pnl: number; pnlPct: number }
interface OpenOrder { id: number; tab: MockTab; code: string; name: string; side: 'buy' | 'sell'; limitPrice: number; qty: number; reserved: number }
interface Account {
  kind: AcctKind; season: string | null;
  cash: number; holdings: Holding[]; holdingsValue: number; totalAsset: number;
  pnl: number; pnlPct: number; canReset: boolean; resets: number; seed: number; rank: number | null; players: number;
  openOrders: OpenOrder[];
}
interface BoardRow { rank: number; name: string; totalAsset: number; pnlPct: number; isMe?: boolean }
interface Sel { tab: MockTab; code: string; name: string; ticker: string }
interface AllocSeg { name: string; value: number; pct: number; tab: string }
interface SnapPoint { date: string; total: number }
interface SeasonRecord { season: string; finalAsset: number; returnPct: number; rank: number | null; players: number | null }
interface History { snapshots: SnapPoint[]; allocation: AllocSeg[]; seasonRecords: SeasonRecord[] }

const KINDS: { id: AcctKind; label: string; emoji: string }[] = [
  { id: 'season', label: '시즌전', emoji: '🏆' },
  { id: 'longterm', label: '장기투자', emoji: '🌱' },
];

const TABS: { id: MockTab; label: string }[] = [
  { id: 'kr_stock', label: '국내주식' },
  { id: 'kr_coin', label: '국내코인' },
];
const PERIODS_STOCK: Period[] = ['1분', '5분', '30분', '1시간', '일봉', '주봉', '월봉']; // 국내주식은 KIS 분봉(4시간 미지원)
const PERIODS_COIN: Period[] = ['1분', '5분', '30분', '1시간', '4시간', '일봉', '주봉', '월봉'];
const PERIOD_LABEL: Record<Period, string> = { '1분': '1분', '5분': '5분', '15분': '15분', '30분': '30분', '1시간': '1시간', '4시간': '4시간', '일봉': '일', '주봉': '주', '월봉': '월' };

export function MockTrade() {
  const { data, state, universeReady } = useDashboard();
  const [kind, setKind] = useState<AcctKind>('season');
  const [acct, setAcct] = useState<Account | null>(null);
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [hist, setHist] = useState<History | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const [sel, setSel] = useState<Sel | null>(null);
  const [period, setPeriod] = useState<Period>('일봉');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candleLoading, setCandleLoading] = useState(true);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<MockTab>('kr_stock');
  const [query, setQuery] = useState('');
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [limitPrice, setLimitPrice] = useState('');

  const loadAccount = useCallback(async () => {
    const r = await fetch(`/api/mock?kind=${kind}`, { cache: 'no-store' });
    if (r.ok) setAcct(await r.json());
  }, [kind]);
  const loadBoard = useCallback(async () => {
    const r = await fetch(`/api/mock/leaderboard?kind=${kind}`, { cache: 'no-store' });
    if (r.ok) setBoard((await r.json()).rows ?? []);
  }, [kind]);
  const loadHistory = useCallback(async () => {
    const r = await fetch(`/api/mock/history?kind=${kind}`, { cache: 'no-store' });
    if (r.ok) setHist(await r.json());
  }, [kind]);

  // kind(시즌/장기) 전환 시 계좌·랭킹·히스토리 모두 다시 로드.
  useEffect(() => {
    let alive = true;
    setAcct(null); setBoard(null); setHist(null);
    (async () => {
      await Promise.all([loadAccount(), loadBoard(), loadHistory()]);
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [loadAccount, loadBoard, loadHistory]);

  // 기본 종목 = 삼성전자(실제 코드로 고정). 큐레이션 시드의 임시 id('samsung' 등)를 물지 않도록
  // 유니버스 데이터에서 파생하지 않고 실 코드를 직접 지정한다.
  useEffect(() => {
    if (!sel) setSel({ tab: 'kr_stock', code: '005930', name: '삼성전자', ticker: '005930' });
  }, [sel]);

  // 선택 종목·기간 캔들 로드(국내주식=KIS, 국내코인=업비트 — 둘 다 /api/candles).
  useEffect(() => {
    if (!sel) return;
    let alive = true;
    setCandleLoading(true); setCandles([]);
    fetch('/api/candles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tab: sel.tab, ticker: sel.ticker, period }),
    })
      .then((r) => r.json())
      .then((j) => { if (alive) { setCandles(j?.candles ?? []); setCandleLoading(false); } })
      .catch(() => { if (alive) { setCandles([]); setCandleLoading(false); } });
    return () => { alive = false; };
  }, [sel, period]);

  const periods = sel?.tab === 'kr_coin' ? PERIODS_COIN : PERIODS_STOCK;

  // 현재가: 유니버스 실시간가 우선, 없으면 마지막 캔들 종가.
  const curPrice = useMemo(() => {
    if (!sel) return 0;
    const m = (data.stocks[sel.tab as TabId] ?? []).find((s) => s.id === sel.code);
    return m?.price || (candles.length ? candles[candles.length - 1].c : 0);
  }, [sel, data.stocks, candles]);
  const curPct = useMemo(() => {
    if (!sel) return 0;
    return (data.stocks[sel.tab as TabId] ?? []).find((s) => s.id === sel.code)?.pct ?? 0;
  }, [sel, data.stocks]);

  const heldQty = useMemo(() => {
    if (!sel || !acct) return 0;
    return acct.holdings.find((h) => h.tab === sel.tab && h.code === sel.code)?.qty ?? 0;
  }, [sel, acct]);

  // 지정가 모드면 지정가로 금액·최대수량 계산(예약 기준).
  const effPrice = orderType === 'limit' && Number(limitPrice) > 0 ? Number(limitPrice) : curPrice;
  const estCost = effPrice > 0 && Number(qty) > 0 ? Number(qty) * effPrice : 0;
  const maxBuy = acct && effPrice > 0
    ? (sel?.tab === 'kr_stock' ? Math.floor(acct.cash / effPrice) : Math.floor((acct.cash / effPrice) * 1e4) / 1e4)
    : 0;

  // 유니버스(실 종목코드)가 도착한 뒤에만 선택 가능 — 큐레이션 시드의 임시 id 매매를 방지.
  const matches = useMemo(() => {
    if (!universeReady) return [];
    const list = data.stocks[pickerTab as TabId] ?? [];
    const q = query.trim().toLowerCase();
    const filtered = q ? list.filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)) : list;
    return filtered.slice(0, 30);
  }, [data.stocks, pickerTab, query, universeReady]);

  function selectSymbol(tab: MockTab, code: string, name: string, ticker: string) {
    setSel({ tab, code, name, ticker });
    // 국내주식은 4시간봉 미지원 → 코인에서 4시간 보다가 주식으로 바꾸면 1시간으로.
    if (tab === 'kr_stock' && period === '4시간') setPeriod('1시간');
    setPickerOpen(false); setQuery(''); setQty('');
  }

  async function submitTrade(side: 'buy' | 'sell') {
    if (!sel || !(Number(qty) > 0) || busy) return;
    const limit = orderType === 'limit';
    if (limit && !(Number(limitPrice) > 0)) { setMsg({ t: '지정가를 입력하세요', ok: false }); return; }
    setBusy(true); setMsg(null);
    try {
      const url = limit ? '/api/mock/order' : '/api/mock/trade';
      const body = limit
        ? { kind, tab: sel.tab, code: sel.code, name: sel.name, side, limitPrice: Number(limitPrice), qty: Number(qty) }
        : { kind, tab: sel.tab, code: sel.code, name: sel.name, side, qty: Number(qty) };
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { setMsg({ t: j.error || '주문 실패', ok: false }); return; }
      setAcct(j); setQty('');
      // 지정가 주문이 즉시 체결됐는지(미체결 목록에 없으면 체결)로 메시지 구분
      const stillOpen = limit && (j.openOrders ?? []).some((o: OpenOrder) => o.side === side && o.code === sel.code && o.limitPrice === Number(limitPrice));
      setMsg({ t: `${sel.name} ${side === 'buy' ? '매수' : '매도'} ${limit ? (stillOpen ? '지정가 주문 등록' : '지정가 즉시 체결') : '체결'}`, ok: true });
      track('mock_trade', { side, tab: sel.tab, kind, type: orderType });
      loadBoard(); loadHistory();
    } catch { setMsg({ t: '네트워크 오류', ok: false }); }
    finally { setBusy(false); }
  }

  async function cancelOrder(id: number) {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/mock/order', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, orderId: id }) });
      const j = await r.json();
      if (!r.ok) { setMsg({ t: j.error || '취소 실패', ok: false }); return; }
      setAcct(j); setMsg({ t: '주문을 취소했어요', ok: true });
      loadBoard();
    } catch { setMsg({ t: '네트워크 오류', ok: false }); }
    finally { setBusy(false); }
  }

  async function doReset() {
    if (busy) return;
    if (!confirm('현재 자산을 모두 몰수하고 1,000만원으로 다시 시작합니다.\n오늘 하루 1회만 가능합니다. 진행할까요?')) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/mock/reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      const j = await r.json();
      if (!r.ok) { setMsg({ t: j.error || '재충전 실패', ok: false }); return; }
      setAcct(j); setQty('');
      setMsg({ t: '1,000만원으로 다시 시작했습니다. 행운을 빌어요!', ok: true });
      track('mock_reset', { kind });
      loadBoard(); loadHistory();
    } catch { setMsg({ t: '네트워크 오류', ok: false }); }
    finally { setBusy(false); }
  }

  if (loading) {
    return (
      <div style={{ ...CARD, padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--c-tx6)' }}>
        <InlineSpinner /> 모의투자 계좌 불러오는 중…
      </div>
    );
  }
  if (!acct) return <div style={{ ...CARD, padding: 32, color: 'var(--c-tx6)' }}>계좌를 불러오지 못했습니다. 새로고침해 주세요.</div>;

  const limitOk = orderType === 'market' || Number(limitPrice) > 0;
  const canBuy = !busy && Number(qty) > 0 && limitOk && estCost <= acct.cash;
  const canSell = !busy && Number(qty) > 0 && limitOk && heldQty > 0 && Number(qty) <= heldQty + 1e-9;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-tx1c)', margin: '0 0 10px' }}>모의투자 🎮</h1>
        {/* 모드 토글: 시즌전(분기 리셋·경쟁) / 장기투자(리셋 없는 영속 계좌) */}
        <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: 'var(--c-w04)', border: '1px solid var(--c-w08)', borderRadius: 12, marginBottom: 8 }}>
          {KINDS.map((k) => (
            <button key={k.id} onClick={() => { if (k.id !== kind) { setLoading(true); setKind(k.id); } }}
              style={{ cursor: 'pointer', borderRadius: 9, padding: '7px 16px', fontSize: 13, fontWeight: 800, fontFamily: 'inherit', border: 'none',
                background: kind === k.id ? 'var(--c-cy18)' : 'transparent', color: kind === k.id ? 'var(--c-accyanbr)' : 'var(--c-tx6)' }}>
              {k.emoji} {k.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 13, color: 'var(--c-tx6)', margin: 0, lineHeight: 1.6 }}>
          {kind === 'season' ? (
            <>가상 <b style={{ color: 'var(--c-tx4)' }}>1,000만원</b>으로 <b style={{ color: 'var(--c-tx4)' }}>{acct?.season ?? '이번 분기'}</b> 순위를 겨뤄보세요. 분기가 끝나면 기록이 남고 새로 시작해요. (실제 투자 아님)</>
          ) : (
            <>가상 <b style={{ color: 'var(--c-tx4)' }}>1,000만원</b>으로 <b style={{ color: 'var(--c-tx4)' }}>리셋 없이 장기</b>로 굴려보세요. 시즌과 별개 계좌예요. (실제 투자 아님)</>
          )}
        </p>
      </div>

      {/* ── 트레이딩 터미널: 차트 + 주문창 ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' }}>
        {/* 차트 */}
        <div style={{ ...CARD, padding: '16px 18px', flex: '1 1 460px', minWidth: 300, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <button onClick={() => { setPickerOpen((v) => !v); setPickerTab(sel?.tab ?? 'kr_stock'); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: 'var(--c-w05)', border: '1px solid var(--c-w10)', borderRadius: 10, padding: '7px 12px', fontFamily: 'inherit' }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--c-tx1c)' }}>{sel?.name ?? '종목 선택'}</span>
                <span style={{ fontSize: 12, color: 'var(--c-accyanbr)' }}>변경 ▾</span>
              </button>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--c-tx1d)' }}>{curPrice > 0 ? fmtPrice(curPrice, '₩') : '—'}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: upColor(curPct) }}>{fmtPct(curPct)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {periods.map((p) => (
                <button key={p} onClick={() => setPeriod(p)}
                  style={{ cursor: 'pointer', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                    border: period === p ? '1px solid var(--c-cy18)' : '1px solid var(--c-w10)',
                    background: period === p ? 'var(--c-cy14)' : 'transparent', color: period === p ? 'var(--c-accyanbr)' : 'var(--c-tx6)' }}>
                  {PERIOD_LABEL[p]}
                </button>
              ))}
            </div>
          </div>

          {candleLoading ? (
            <div style={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--c-tx6)', fontSize: 13 }}><InlineSpinner /> 차트 불러오는 중…</div>
          ) : candles.length ? (
            <CandleChart candles={candles} period={period} theme={state.theme}
              loadOlder={sel ? (ms) => fetchOlderCandles(sel.tab as TabId, sel.ticker, period, ms) : undefined} />
          ) : (
            <div style={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-tx6)', fontSize: 13 }}>차트 데이터 없음</div>
          )}

          {/* 종목 검색 드롭다운 */}
          {pickerOpen && (
            // 차트 위에 뜨는 종목 검색창 — CARD의 반투명 배경(var(--c-w04))을 쓰면 뒤 차트가 비쳐
            // 글씨가 안 읽힘. 불투명 패널색으로 덮는다(backdrop-filter는 canvas를 못 흐리게 함).
            <div style={{ position: 'absolute', top: 60, left: 18, right: 18, zIndex: 20, background: 'var(--c-panel)', border: '1px solid var(--c-w12)', borderRadius: 16, padding: 14, boxShadow: '0 16px 48px rgba(0,0,0,.55)' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {TABS.map((t) => (
                  <button key={t.id} onClick={() => { setPickerTab(t.id); setQuery(''); }}
                    style={{ flex: 1, cursor: 'pointer', borderRadius: 9, padding: '7px 0', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                      border: pickerTab === t.id ? '1px solid var(--c-cy18)' : '1px solid var(--c-w10)',
                      background: pickerTab === t.id ? 'var(--c-cy14)' : 'var(--c-w04)', color: pickerTab === t.id ? 'var(--c-accyanbr)' : 'var(--c-tx6)' }}>
                    {t.label}
                  </button>
                ))}
                <button onClick={() => setPickerOpen(false)} style={{ cursor: 'pointer', background: 'var(--c-w05)', border: '1px solid var(--c-w10)', borderRadius: 9, padding: '0 12px', fontSize: 13, color: 'var(--c-tx6)', fontFamily: 'inherit' }}>닫기</button>
              </div>
              <input style={inputStyle} autoFocus placeholder={pickerTab === 'kr_stock' ? '종목명·코드 (예: 삼성전자, 005930)' : '코인 (예: 비트코인, BTC)'}
                value={query} onChange={(e) => setQuery(e.target.value)} />
              {!universeReady && <div style={{ fontSize: 12, color: 'var(--c-tx6)', marginTop: 8 }}><InlineSpinner /> 전체 종목 불러오는 중…</div>}
              <div style={{ marginTop: 8, maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {matches.map((s) => (
                  <button key={s.id} onClick={() => selectSymbol(pickerTab, s.id, s.name, s.ticker)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, cursor: 'pointer', background: 'transparent', border: '1px solid transparent', borderRadius: 8, padding: '9px 10px', textAlign: 'left', fontFamily: 'inherit' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-w05)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-tx1d)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    <span style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                      <span style={{ fontSize: 13, color: 'var(--c-tx4)' }}>{fmtPrice(s.price, '₩')}</span>
                      <span style={{ fontSize: 12, color: upColor(s.pct), minWidth: 52, textAlign: 'right' }}>{fmtPct(s.pct)}</span>
                    </span>
                  </button>
                ))}
                {!matches.length && <div style={{ fontSize: 13, color: 'var(--c-tx6)', padding: '12px 4px' }}>검색 결과가 없어요.</div>}
              </div>
            </div>
          )}
        </div>

        {/* 주문창 */}
        <div style={{ ...CARD, padding: '16px 18px', flex: '0 1 300px', minWidth: 260, display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-tx1c)', margin: '0 0 12px' }}>주문</h2>
          <div style={{ fontSize: 12, color: 'var(--c-tx6)', marginBottom: 2 }}>{sel?.name ?? '—'} · 현재가</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-tx1c)', marginBottom: 12 }}>{curPrice > 0 ? fmtPrice(curPrice, '₩') : '—'}</div>

          {/* 시장가 / 지정가 토글 */}
          <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--c-w04)', border: '1px solid var(--c-w08)', borderRadius: 9, marginBottom: 12 }}>
            {([['market', '시장가'], ['limit', '지정가']] as const).map(([t, label]) => (
              <button key={t} onClick={() => { setOrderType(t); if (t === 'limit' && !limitPrice && curPrice > 0) setLimitPrice(String(Math.round(curPrice))); }}
                style={{ flex: 1, cursor: 'pointer', borderRadius: 7, padding: '6px 0', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', border: 'none',
                  background: orderType === t ? 'var(--c-cy18)' : 'transparent', color: orderType === t ? 'var(--c-accyanbr)' : 'var(--c-tx6)' }}>
                {label}
              </button>
            ))}
          </div>

          {orderType === 'limit' && (
            <>
              <label style={{ fontSize: 12, color: 'var(--c-tx6)', display: 'block', marginBottom: 6 }}>지정가 (원)</label>
              <input style={inputStyle} type="number" inputMode="decimal" min={0} placeholder={curPrice > 0 ? String(Math.round(curPrice)) : '0'} value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} />
              <div style={{ height: 10 }} />
            </>
          )}

          <label style={{ fontSize: 12, color: 'var(--c-tx6)', display: 'block', marginBottom: 6 }}>수량 {sel?.tab === 'kr_coin' && '(소수 가능)'}</label>
          <input style={inputStyle} type="number" inputMode="decimal" min={0} placeholder="0" value={qty} onChange={(e) => setQty(e.target.value)} />

          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {[0.25, 0.5, 1].map((f) => (
              <button key={f} onClick={() => setQty(String(sel?.tab === 'kr_stock' ? Math.floor(maxBuy * f) : Math.floor(maxBuy * f * 1e4) / 1e4))}
                style={{ flex: 1, cursor: 'pointer', background: 'var(--c-w05)', border: '1px solid var(--c-w10)', borderRadius: 8, padding: '6px 0', fontSize: 12, color: 'var(--c-tx6)', fontFamily: 'inherit' }}>
                {f === 1 ? '최대' : `${f * 100}%`}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--c-tx6)', margin: '12px 0 4px' }}>
            <span>예상 금액</span><b style={{ color: 'var(--c-tx4)' }}>{estCost > 0 ? won(estCost) : '—'}</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--c-tx6)', marginBottom: 4 }}>
            <span>주문가능 현금</span><span>{won(acct.cash)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--c-tx6)' }}>
            <span>보유 수량</span><span>{heldQty > 0 ? heldQty.toLocaleString('ko-KR') : 0}{sel?.tab === 'kr_stock' ? '주' : ''}</span>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={() => submitTrade('buy')} disabled={!canBuy}
              style={{ flex: 1, cursor: canBuy ? 'pointer' : 'not-allowed', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', border: 'none', background: 'var(--c-up)', color: '#fff', opacity: canBuy ? 1 : 0.45 }}>매수</button>
            <button onClick={() => submitTrade('sell')} disabled={!canSell}
              style={{ flex: 1, cursor: canSell ? 'pointer' : 'not-allowed', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', border: 'none', background: 'var(--c-down)', color: '#fff', opacity: canSell ? 1 : 0.45 }}>매도</button>
          </div>
          {msg && <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: msg.ok ? 'var(--c-up)' : 'var(--c-down)' }}>{msg.t}</div>}
          <p style={{ fontSize: 11, color: 'var(--c-tx6)', marginTop: 12, lineHeight: 1.5 }}>체결가는 주문 시점 서버 실시간 시세로 확정돼요(표시가와 소폭 다를 수 있음).</p>
        </div>
      </div>

      {/* 계좌 요약 */}
      <div style={{ ...CARD, padding: '18px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14 }}>
          <Stat label="총자산" value={won(acct.totalAsset)} big />
          <Stat label="수익률" value={fmtPct(acct.pnlPct)} sub={won(acct.pnl)} color={upColor(acct.pnl)} big />
          <Stat label="현금" value={won(acct.cash)} />
          <Stat label="순위" value={acct.rank ? `${acct.rank}위` : '—'} sub={acct.players ? `총 ${acct.players}명` : undefined} />
        </div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={doReset} disabled={!acct.canReset || busy}
            style={{ cursor: !acct.canReset || busy ? 'not-allowed' : 'pointer', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 800, fontFamily: 'inherit', border: 'none', background: 'var(--c-cy18)', color: 'var(--c-accyanbr)', opacity: !acct.canReset || busy ? 0.45 : 1 }}>
            🔄 재충전 (1,000만원 재시작)
          </button>
          <span style={{ fontSize: 12, color: 'var(--c-tx6)' }}>
            {acct.canReset ? '총자산이 시드 이하일 때만 가능 · 오늘 사용 가능'
              : acct.totalAsset > acct.seed ? '수익 중이라 재충전이 필요 없어요'
                : '오늘은 이미 재충전했어요 · 내일 다시 도전'}
            {acct.resets > 0 ? ` · 누적 ${acct.resets}회` : ''}
          </span>
        </div>
      </div>

      {/* 미체결 지정가 주문 */}
      {acct.openOrders.length > 0 && (
        <div style={{ ...CARD, padding: '18px 20px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-tx1c)', margin: '0 0 14px' }}>⏳ 미체결 지정가 주문</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {acct.openOrders.map((o) => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--c-w04)', border: '1px solid var(--c-w08)' }}>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6, flexShrink: 0, color: o.side === 'buy' ? 'var(--c-up)' : 'var(--c-down)', background: o.side === 'buy' ? 'color-mix(in srgb, var(--c-up) 16%, transparent)' : 'color-mix(in srgb, var(--c-down) 16%, transparent)' }}>{o.side === 'buy' ? '매수' : '매도'}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: 'var(--c-tx1d)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                <span style={{ fontSize: 12, color: 'var(--c-tx5)', flexShrink: 0 }}>{o.qty.toLocaleString('ko-KR')}{o.tab === 'kr_stock' ? '주' : ''} · {fmtPrice(o.limitPrice, '₩')}</span>
                <button onClick={() => cancelOrder(o.id)} disabled={busy} style={{ flexShrink: 0, cursor: busy ? 'not-allowed' : 'pointer', background: 'var(--c-w05)', border: '1px solid var(--c-w10)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--c-tx5)', fontFamily: 'inherit' }}>취소</button>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--c-tx6)', marginTop: 10, lineHeight: 1.5 }}>매수는 현재가가 지정가 이하, 매도는 지정가 이상일 때 자동 체결돼요(약 10분마다·접속 시 즉시 확인).</p>
        </div>
      )}

      {/* 자산 변화 그래프 + 자산 비중 도넛 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div style={{ ...CARD, padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-tx1c)', margin: 0 }}>자산 변화</h2>
            <span style={{ fontSize: 12, color: 'var(--c-tx6)' }}>{kind === 'season' ? (acct.season ?? '이번 분기') : '최근'}</span>
          </div>
          <AssetLineChart points={hist?.snapshots ?? []} seed={acct.seed} />
        </div>
        <div style={{ ...CARD, padding: '18px 20px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-tx1c)', margin: '0 0 14px' }}>자산 비중</h2>
          <AllocationDonut segments={hist?.allocation ?? []} />
        </div>
      </div>

      {/* 보유 종목 + 랭킹 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div style={{ ...CARD, padding: '18px 20px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-tx1c)', margin: '0 0 14px' }}>보유 종목</h2>
          {acct.holdings.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--c-tx6)', padding: '20px 0', textAlign: 'center' }}>아직 보유 종목이 없어요.<br />위에서 첫 매수를 해보세요.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {acct.holdings.map((h) => (
                <button key={`${h.tab}:${h.code}`}
                  onClick={() => selectSymbol(h.tab, h.code, h.name, h.tab === 'kr_stock' ? h.code : `${h.code.replace('KRW-', '')}/KRW`)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, cursor: 'pointer', background: 'var(--c-w04)', border: '1px solid var(--c-w08)', borderRadius: 10, padding: '10px 12px', textAlign: 'left', fontFamily: 'inherit' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-tx1d)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--c-tx6)' }}>{h.qty.toLocaleString('ko-KR')}{h.tab === 'kr_stock' ? '주' : ''} · 평단 {fmtPrice(h.avgCost, '₩')}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-tx1d)' }}>{won(h.value)}</div>
                    <div style={{ fontSize: 12, color: upColor(h.pnl) }}>{fmtPct(h.pnlPct)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ ...CARD, padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-tx1c)', margin: 0 }}>{kind === 'season' ? '🏆 시즌 랭킹' : '🌱 장기 랭킹'}</h2>
            <span style={{ fontSize: 12, color: 'var(--c-tx6)' }}>총자산 기준 · 60초 갱신</span>
          </div>
          {board === null ? (
            <div style={{ fontSize: 13, color: 'var(--c-tx6)' }}><InlineSpinner /> 불러오는 중…</div>
          ) : board.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--c-tx6)' }}>아직 참가자가 없어요. 첫 매매로 1위에 도전하세요!</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {board.map((r) => (
                <div key={r.rank} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 9,
                  background: r.isMe ? 'var(--c-cy14)' : 'transparent', border: r.isMe ? '1px solid var(--c-cy18)' : '1px solid transparent' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, width: 34, color: r.rank <= 3 ? 'var(--c-accyanbr)' : 'var(--c-tx6)' }}>
                    {r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: r.isMe ? 800 : 600, color: 'var(--c-tx1d)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.name}{r.isMe ? ' (나)' : ''}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--c-tx4)' }}>{won(r.totalAsset)}</span>
                  <span style={{ fontSize: 12, color: upColor(r.pnlPct), width: 66, textAlign: 'right' }}>{fmtPct(r.pnlPct)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 시즌 기록 보관함 (시즌 모드 전용) */}
      {kind === 'season' && hist && hist.seasonRecords.length > 0 && (
        <div style={{ ...CARD, padding: '18px 20px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-tx1c)', margin: '0 0 14px' }}>📚 지난 시즌 기록</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {hist.seasonRecords.map((r) => (
              <div key={r.season} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 9, background: 'var(--c-w04)', border: '1px solid var(--c-w08)' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-tx1d)', width: 76, flexShrink: 0 }}>{r.season}</span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--c-tx5)' }}>{r.rank ? `${r.rank}위${r.players ? ` / ${r.players}명` : ''}` : '—'}</span>
                <span style={{ fontSize: 13, color: 'var(--c-tx4)' }}>{won(r.finalAsset)}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: upColor(r.returnPct), width: 66, textAlign: 'right' }}>{fmtPct(r.returnPct)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, color, big }: { label: string; value: string; sub?: string; color?: string; big?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--c-tx6)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: big ? 21 : 17, fontWeight: 800, color: color || 'var(--c-tx1c)', lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: color || 'var(--c-tx6)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
