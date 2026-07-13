'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fmtPct, fmtPrice, upColor } from '../../lib/format';
import { useDashboard } from '../../store/DashboardContext';
import { track } from '../../lib/ga';
import type { TabId } from '../../types';
import { InlineSpinner } from '../Footer';

// 모의투자 — 씨드 1,000만원(원화). 국내주식·국내코인 실시간 매매 + 총자산 랭킹.
// 체결가는 서버가 조회(POST /api/mock/trade)하므로 여기 표시가격은 참고용(예상)일 뿐이다.

const CARD: React.CSSProperties = {
  background: 'var(--c-w04)', border: '1px solid var(--c-w08)', borderRadius: 20,
  backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
};
const inputStyle: React.CSSProperties = {
  background: 'var(--c-w04)', border: '1px solid var(--c-w10)', borderRadius: 9, padding: '9px 12px',
  color: 'var(--c-tx1d)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', width: '100%',
};
const btn = (kind: 'buy' | 'sell' | 'ghost' | 'primary', disabled?: boolean): React.CSSProperties => ({
  cursor: disabled ? 'not-allowed' : 'pointer', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 800,
  fontFamily: 'inherit', whiteSpace: 'nowrap', border: 'none', opacity: disabled ? 0.45 : 1, flex: 1,
  background: kind === 'buy' ? 'var(--c-up)' : kind === 'sell' ? 'var(--c-down)' : kind === 'primary' ? 'var(--c-cy18)' : 'var(--c-w05)',
  color: kind === 'ghost' ? 'var(--c-tx4)' : kind === 'primary' ? 'var(--c-accyanbr)' : '#fff',
});

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');

type MockTab = 'kr_stock' | 'kr_coin';
interface Holding { tab: MockTab; code: string; name: string; qty: number; avgCost: number; price: number; value: number; cost: number; pnl: number; pnlPct: number }
interface Account {
  cash: number; holdings: Holding[]; holdingsValue: number; totalAsset: number;
  pnl: number; pnlPct: number; canReset: boolean; resets: number; seed: number; rank: number | null; players: number;
}
interface BoardRow { rank: number; name: string; totalAsset: number; pnlPct: number; isMe?: boolean }
interface Pick { tab: MockTab; code: string; name: string; price: number }

const TABS: { id: MockTab; label: string }[] = [
  { id: 'kr_stock', label: '국내주식' },
  { id: 'kr_coin', label: '국내코인' },
];

export function MockTrade() {
  const { data, universeReady } = useDashboard();
  const [acct, setAcct] = useState<Account | null>(null);
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const [tab, setTab] = useState<MockTab>('kr_stock');
  const [query, setQuery] = useState('');
  const [pick, setPick] = useState<Pick | null>(null);
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);

  const loadAccount = useCallback(async () => {
    const r = await fetch('/api/mock', { cache: 'no-store' });
    if (r.ok) setAcct(await r.json());
  }, []);
  const loadBoard = useCallback(async () => {
    const r = await fetch('/api/mock/leaderboard', { cache: 'no-store' });
    if (r.ok) setBoard((await r.json()).rows ?? []);
  }, []);

  useEffect(() => {
    (async () => { await Promise.all([loadAccount(), loadBoard()]); setLoading(false); })();
  }, [loadAccount, loadBoard]);

  // 종목 검색(현재 탭 유니버스). 이름/코드 부분일치, 거래대금 순 상위 20.
  const matches = useMemo(() => {
    const list = data.stocks[tab as TabId] ?? [];
    const q = query.trim().toLowerCase();
    const filtered = q ? list.filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)) : list;
    return filtered.slice(0, 20);
  }, [data.stocks, tab, query]);

  const heldQty = useMemo(() => {
    if (!pick || !acct) return 0;
    return acct.holdings.find((h) => h.tab === pick.tab && h.code === pick.code)?.qty ?? 0;
  }, [pick, acct]);

  const estCost = pick && Number(qty) > 0 ? Number(qty) * pick.price : 0;
  const maxBuy = pick && acct && pick.price > 0
    ? (tab === 'kr_stock' ? Math.floor(acct.cash / pick.price) : Math.floor((acct.cash / pick.price) * 1e4) / 1e4)
    : 0;

  async function submitTrade(side: 'buy' | 'sell') {
    if (!pick || !(Number(qty) > 0) || busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/mock/trade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab: pick.tab, code: pick.code, name: pick.name, side, qty: Number(qty) }),
      });
      const j = await r.json();
      if (!r.ok) { setMsg({ t: j.error || '체결 실패', ok: false }); return; }
      setAcct(j); setQty('');
      setMsg({ t: `${pick.name} ${side === 'buy' ? '매수' : '매도'} 체결`, ok: true });
      track('mock_trade', { side, tab: pick.tab });
      loadBoard();
    } catch { setMsg({ t: '네트워크 오류', ok: false }); }
    finally { setBusy(false); }
  }

  async function doReset() {
    if (busy) return;
    if (!confirm('현재 자산을 모두 몰수하고 1,000만원으로 다시 시작합니다.\n오늘 하루 1회만 가능합니다. 진행할까요?')) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/mock/reset', { method: 'POST' });
      const j = await r.json();
      if (!r.ok) { setMsg({ t: j.error || '재충전 실패', ok: false }); return; }
      setAcct(j); setPick(null); setQty('');
      setMsg({ t: '1,000만원으로 다시 시작했습니다. 행운을 빌어요!', ok: true });
      track('mock_reset', {});
      loadBoard();
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

  const pnlColor = upColor(acct.pnl);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* 소개 */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-tx1c)', margin: '0 0 4px' }}>모의투자 🎮</h1>
        <p style={{ fontSize: 13, color: 'var(--c-tx6)', margin: 0, lineHeight: 1.6 }}>
          가상의 <b style={{ color: 'var(--c-tx4)' }}>1,000만원</b>으로 국내주식·코인을 실전 시세로 매매하고 수익률을 겨뤄보세요.
          망하면 <b style={{ color: 'var(--c-tx4)' }}>하루 한 번</b> 다시 시작할 수 있어요. (실제 투자 아님)
        </p>
      </div>

      {/* 계좌 요약 */}
      <div style={{ ...CARD, padding: '18px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
          <Stat label="총자산" value={won(acct.totalAsset)} big />
          <Stat label="수익률" value={fmtPct(acct.pnlPct)} sub={won(acct.pnl)} color={pnlColor} big />
          <Stat label="현금" value={won(acct.cash)} />
          <Stat label="순위" value={acct.rank ? `${acct.rank}위` : '—'} sub={acct.players ? `총 ${acct.players}명` : undefined} />
        </div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={doReset} disabled={!acct.canReset || busy} style={{ ...btn('primary', !acct.canReset || busy), flex: 'none', padding: '9px 16px', fontSize: 13 }}>
            🔄 재충전 (1,000만원으로 재시작)
          </button>
          <span style={{ fontSize: 12, color: 'var(--c-tx6)' }}>
            {acct.canReset
              ? '총자산이 시드 이하일 때만 가능 · 오늘 사용 가능'
              : acct.totalAsset > acct.seed
                ? '수익 중이라 재충전이 필요 없어요'
                : '오늘은 이미 재충전했어요 · 내일 다시 도전'}
            {acct.resets > 0 ? ` · 누적 ${acct.resets}회` : ''}
          </span>
        </div>
        {msg && (
          <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: msg.ok ? 'var(--c-up)' : 'var(--c-down)' }}>{msg.t}</div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
        {/* 매매 패널 */}
        <div style={{ ...CARD, padding: '18px 20px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-tx1c)', margin: '0 0 14px' }}>매수 · 매도</h2>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {TABS.map((t) => (
              <button key={t.id} onClick={() => { setTab(t.id); setPick(null); setQuery(''); }}
                style={{ flex: 1, cursor: 'pointer', borderRadius: 9, padding: '8px 0', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                  border: tab === t.id ? '1px solid var(--c-cy18)' : '1px solid var(--c-w10)',
                  background: tab === t.id ? 'var(--c-cy14)' : 'var(--c-w04)', color: tab === t.id ? 'var(--c-accyanbr)' : 'var(--c-tx6)' }}>
                {t.label}
              </button>
            ))}
          </div>

          {!pick ? (
            <>
              <input style={inputStyle} placeholder={tab === 'kr_stock' ? '종목명·코드 검색 (예: 삼성전자, 005930)' : '코인 검색 (예: 비트코인, BTC)'}
                value={query} onChange={(e) => setQuery(e.target.value)} />
              {!universeReady && <div style={{ fontSize: 12, color: 'var(--c-tx6)', marginTop: 8 }}><InlineSpinner /> 전체 종목 불러오는 중…</div>}
              <div style={{ marginTop: 10, maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {matches.map((s) => (
                  <button key={s.id} onClick={() => setPick({ tab, code: s.id, name: s.name, price: s.price })}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, cursor: 'pointer',
                      background: 'transparent', border: '1px solid transparent', borderRadius: 8, padding: '9px 10px', textAlign: 'left', fontFamily: 'inherit' }}
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
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-tx1c)' }}>{pick.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--c-tx6)' }}>현재가 {fmtPrice(pick.price, '₩')} · 보유 {heldQty > 0 ? heldQty.toLocaleString('ko-KR') : 0}{tab === 'kr_stock' ? '주' : ''}</div>
                </div>
                <button onClick={() => { setPick(null); setQty(''); }} style={{ cursor: 'pointer', background: 'var(--c-w05)', border: '1px solid var(--c-w10)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--c-tx6)', fontFamily: 'inherit' }}>다른 종목</button>
              </div>
              <label style={{ fontSize: 12, color: 'var(--c-tx6)', display: 'block', marginBottom: 6 }}>수량 {tab === 'kr_coin' && '(소수 가능)'}</label>
              <input style={inputStyle} type="number" inputMode="decimal" min={0} placeholder="0" value={qty} onChange={(e) => setQty(e.target.value)} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--c-tx6)', margin: '8px 0 4px' }}>
                <span>예상 금액 <b style={{ color: 'var(--c-tx4)' }}>{estCost > 0 ? won(estCost) : '—'}</b></span>
                <button onClick={() => setQty(String(maxBuy))} style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'var(--c-accyanbr)', fontSize: 12, fontFamily: 'inherit', padding: 0 }}>최대 {maxBuy.toLocaleString('ko-KR')} 매수</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => submitTrade('buy')} disabled={busy || !(Number(qty) > 0)} style={btn('buy', busy || !(Number(qty) > 0))}>매수</button>
                <button onClick={() => submitTrade('sell')} disabled={busy || !(Number(qty) > 0) || heldQty <= 0} style={btn('sell', busy || !(Number(qty) > 0) || heldQty <= 0)}>매도</button>
              </div>
              {heldQty > 0 && <button onClick={() => setQty(String(heldQty))} style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'var(--c-tx6)', fontSize: 12, fontFamily: 'inherit', marginTop: 8, padding: 0 }}>보유 전량({heldQty.toLocaleString('ko-KR')}) 매도</button>}
              <p style={{ fontSize: 11, color: 'var(--c-tx6)', marginTop: 12, lineHeight: 1.5 }}>체결가는 주문 시점 서버 실시간 시세로 확정돼요(표시가와 소폭 다를 수 있음).</p>
            </>
          )}
        </div>

        {/* 보유 종목 */}
        <div style={{ ...CARD, padding: '18px 20px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-tx1c)', margin: '0 0 14px' }}>보유 종목</h2>
          {acct.holdings.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--c-tx6)', padding: '20px 0', textAlign: 'center' }}>아직 보유 종목이 없어요.<br />왼쪽에서 첫 매수를 해보세요.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {acct.holdings.map((h) => (
                <button key={`${h.tab}:${h.code}`}
                  onClick={() => { setTab(h.tab); setPick({ tab: h.tab, code: h.code, name: h.name, price: h.price }); setQty(''); }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, cursor: 'pointer',
                    background: 'var(--c-w04)', border: '1px solid var(--c-w08)', borderRadius: 10, padding: '10px 12px', textAlign: 'left', fontFamily: 'inherit' }}>
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
      </div>

      {/* 랭킹 */}
      <div style={{ ...CARD, padding: '18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-tx1c)', margin: 0 }}>🏆 수익 랭킹</h2>
          <span style={{ fontSize: 12, color: 'var(--c-tx6)' }}>총자산 기준 · 60초마다 갱신</span>
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
  );
}

function Stat({ label, value, sub, color, big }: { label: string; value: string; sub?: string; color?: string; big?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--c-tx6)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: big ? 22 : 17, fontWeight: 800, color: color || 'var(--c-tx1c)', lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: color || 'var(--c-tx6)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
