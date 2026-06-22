'use client';

import { useMemo, useState } from 'react';
import { fmtPct, fmtPrice, upColor } from '../../lib/format';
import { parseHoldingsText, resolveStock, usePortfolio } from '../../lib/portfolio';
import { useDashboard } from '../../store/DashboardContext';
import { TAB_MAP, type TabId } from '../../types';
import { SourceNote } from '../SourceNote';

const CARD: React.CSSProperties = {
  background: 'var(--c-w04)', border: '1px solid var(--c-w08)', borderRadius: 20,
  backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
};
const inputStyle: React.CSSProperties = {
  background: 'var(--c-w04)', border: '1px solid var(--c-w10)', borderRadius: 9, padding: '9px 12px',
  color: 'var(--c-tx1d)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
};
const btn = (primary?: boolean): React.CSSProperties => ({
  cursor: 'pointer', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
  whiteSpace: 'nowrap', border: primary ? 'none' : '1px solid var(--c-w10)',
  background: primary ? 'var(--c-cy18)' : 'var(--c-w05)', color: primary ? 'var(--c-accyanbr)' : 'var(--c-tx4)',
});

interface Evaluation {
  summary: string;
  concentration: string;
  risk: string;
  perStock: { name: string; comment: string }[];
  rebalance: string[];
}

export function Portfolio() {
  const { data } = useDashboard();
  const { holdings, upsert, remove, clear, setAll } = usePortfolio();

  // 유니버스(전 자산군) 평탄화 + id 인덱스 — 보유종목 현재가/통화/자산군 매칭용.
  const flat = useMemo(
    () => (Object.keys(data.stocks) as TabId[]).flatMap((tb) => data.stocks[tb].map((s) => ({ ...s, tab: tb }))),
    [data.stocks],
  );
  const byId = useMemo(() => new Map(flat.map((s) => [s.id, s])), [flat]);

  // 원화 환산용 USD/KRW.
  const usdkrw = useMemo(() => {
    const r = data.macro.fx.find((f) => f.pair === 'USD/KRW');
    const n = r ? Number(r.val.replace(/[^0-9.]/g, '')) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 1350;
  }, [data.macro.fx]);

  // 보유종목별 평가 계산.
  const rows = useMemo(() => {
    return holdings.map((h) => {
      const u = byId.get(h.id);
      const price = u ? u.price : h.manualPrice ?? h.avg;
      const cur = u ? u.cur : h.cur;
      const tab = (u ? u.tab : h.tab) as TabId | undefined;
      const value = h.qty * price;
      const cost = h.qty * h.avg;
      const toKrw = (v: number) => (cur === '$' ? v * usdkrw : v);
      const plPct = h.avg > 0 ? ((price - h.avg) / h.avg) * 100 : 0;
      return {
        ...h, price, cur, tab, value, cost, valueKrw: toKrw(value), costKrw: toKrw(cost),
        pl: value - cost, plPct, group: tab ? TAB_MAP[tab] : '기타', matched: !!u,
        risk: u?.risk,
      };
    });
  }, [holdings, byId, usdkrw]);

  const totalKrw = rows.reduce((s, r) => s + r.valueKrw, 0);
  const costTotalKrw = rows.reduce((s, r) => s + r.costKrw, 0);
  const totalPlKrw = totalKrw - costTotalKrw;
  const totalPlPct = costTotalKrw > 0 ? (totalPlKrw / costTotalKrw) * 100 : 0;

  const groupWeights = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.group, (m.get(r.group) || 0) + r.valueKrw));
    return [...m.entries()].map(([group, v]) => ({ group, weight: totalKrw > 0 ? (v / totalKrw) * 100 : 0 })).sort((a, b) => b.weight - a.weight);
  }, [rows, totalKrw]);

  // ── 입력(검색→수량·평단) ──
  const [q, setQ] = useState('');
  const [qty, setQty] = useState('');
  const [avg, setAvg] = useState('');
  const matches = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return flat.filter((s) => s.name.toLowerCase().includes(query) || s.ticker.toLowerCase().includes(query)).slice(0, 6);
  }, [q, flat]);
  const [picked, setPicked] = useState<{ id: string; name: string; ticker: string } | null>(null);

  const addManual = () => {
    const nQty = Number(qty.replace(/[,\s]/g, ''));
    const nAvg = Number(avg.replace(/[,\s]/g, ''));
    if (!Number.isFinite(nQty) || !Number.isFinite(nAvg) || nQty <= 0) return;
    const hit = picked ? { stock: byId.get(picked.id), tab: byId.get(picked.id)?.tab } : resolveStock(data.stocks, q);
    if (picked && byId.get(picked.id)) {
      const u = byId.get(picked.id)!;
      upsert({ id: u.id, name: u.name, ticker: u.ticker, qty: nQty, avg: nAvg, cur: u.cur, tab: u.tab as TabId });
    } else if (hit && 'stock' in hit && hit.stock) {
      const s = hit.stock;
      upsert({ id: s.id, name: s.name, ticker: s.ticker, qty: nQty, avg: nAvg, cur: s.cur, tab: hit.tab as TabId });
    } else if (q.trim()) {
      upsert({ id: 'manual:' + q.trim(), name: q.trim(), ticker: q.trim(), qty: nQty, avg: nAvg, cur: '₩', manualPrice: nAvg });
    }
    setQ(''); setQty(''); setAvg(''); setPicked(null);
  };

  // ── CSV/붙여넣기 ──
  const [csv, setCsv] = useState('');
  const [csvMsg, setCsvMsg] = useState('');
  const importCsv = () => {
    const { matched, unmatched } = parseHoldingsText(csv, data.stocks);
    if (!matched.length) { setCsvMsg('인식된 줄이 없어요. "종목명, 수량, 평단" 형식인지 확인해주세요.'); return; }
    // 기존 + 신규 병합(같은 id 대체).
    const map = new Map(holdings.map((h) => [h.id, h]));
    matched.forEach((m) => map.set(m.id, m));
    setAll([...map.values()]);
    setCsv('');
    setCsvMsg(`${matched.length}개 추가됨${unmatched.length ? ` · 미매칭 ${unmatched.length}개(수동 보관): ${unmatched.slice(0, 3).join(', ')}${unmatched.length > 3 ? '…' : ''}` : ''}`);
  };

  // ── AI 평가 ──
  const [evalData, setEvalData] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(false);
  const runEval = () => {
    if (!rows.length) return;
    setLoading(true);
    setEvalData(null);
    const lines = [...rows].sort((a, b) => b.valueKrw - a.valueKrw).map((r) => ({
      name: r.name, group: r.group, weight: totalKrw > 0 ? (r.valueKrw / totalKrw) * 100 : 0, plPct: r.plPct, risk: r.risk,
    }));
    fetch('/api/ai/portfolio', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines, totalValueKrw: totalKrw, groupWeights }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.summary) setEvalData(j as Evaluation); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const krw = (v: number) => '₩' + Math.round(v).toLocaleString('ko-KR');

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>내 자산</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-tx5)' }}>보유 종목을 직접 입력하거나 CSV로 붙여넣으면 평가손익·비중과 AI 포트폴리오 평가를 보여줍니다. (증권사 무관)</p>
      </div>

      {/* 입력 */}
      <div style={{ ...CARD, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--c-accyan)', marginBottom: 12 }}>보유 종목 추가</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ position: 'relative', flex: '2 1 220px', minWidth: 200 }}>
            <input style={{ ...inputStyle, width: '100%' }} placeholder="종목명 또는 티커" value={picked ? picked.name : q}
              onChange={(e) => { setQ(e.target.value); setPicked(null); }} />
            {!picked && matches.length > 0 && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20, background: 'var(--c-panel)', border: '1px solid var(--c-w12)', borderRadius: 12, padding: 6, boxShadow: '0 18px 48px var(--c-shadow)', maxHeight: 260, overflowY: 'auto' }}>
                {matches.map((m) => (
                  <div key={m.id} onClick={() => { setPicked({ id: m.id, name: m.name, ticker: m.ticker }); setQ(m.name); }}
                    className="gsearch-result" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: 'pointer' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-tx1)' }}>{m.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--c-tx6)' }}>{TAB_MAP[m.tab]} · {m.ticker}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <input style={{ ...inputStyle, flex: '1 1 100px', minWidth: 90 }} placeholder="수량" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
          <input style={{ ...inputStyle, flex: '1 1 120px', minWidth: 100 }} placeholder="평균단가" inputMode="decimal" value={avg} onChange={(e) => setAvg(e.target.value)} />
          <button style={btn(true)} onClick={addManual}>추가</button>
        </div>

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--c-w07)' }}>
          <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 8 }}>또는 CSV/표 붙여넣기 — 한 줄에 <b style={{ color: 'var(--c-tx3)' }}>종목명, 수량, 평단</b></div>

          {/* 미래에셋 m.Stock에서 가져오는 법 (펼치기) */}
          <details style={{ marginBottom: 10, background: 'var(--c-w04)', border: '1px solid var(--c-w08)', borderRadius: 12, padding: '10px 14px' }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--c-accyan)', listStyle: 'none' }}>📒 미래에셋 m.Stock에서 보유종목 가져오는 법</summary>
            <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.7, color: 'var(--c-tx3)' }}>
              <div style={{ fontWeight: 700, color: 'var(--c-tx2)', marginBottom: 4 }}>① 주식 (미래에셋)</div>
              <ul style={{ margin: '0 0 12px', paddingLeft: 18 }}>
                <li><b style={{ color: 'var(--c-tx2)' }}>PC HTS(카이로스) — 가장 깔끔</b>: 잔고/보유종목 화면 → 우클릭/저장으로 <b style={{ color: 'var(--c-tx2)' }}>엑셀·CSV 내보내기</b> → 그 표에서 <b style={{ color: 'var(--c-tx2)' }}>종목명·수량·평단 3열만</b> 아래 칸에 붙여넣기</li>
                <li><b style={{ color: 'var(--c-tx2)' }}>모바일 m.Stock 앱</b>: [계좌/자산] → [잔고·보유종목]에서 <b style={{ color: 'var(--c-tx2)' }}>종목명·보유수량·매입평균가</b>를 보고 한 줄씩 <code style={{ color: 'var(--c-accyanbr)' }}>종목명, 수량, 평단</code> 직접 입력 (모바일은 내보내기가 마땅치 않음)</li>
              </ul>
              <div style={{ fontWeight: 700, color: 'var(--c-tx2)', marginBottom: 4 }}>② 코인 (거래소 앱 — 미래에셋엔 없음)</div>
              <ul style={{ margin: '0 0 12px', paddingLeft: 18 }}>
                <li>업비트 등 <b style={{ color: 'var(--c-tx2)' }}>원화 거래소</b> 보유분 → <b style={{ color: 'var(--c-tx2)' }}>한글 이름</b>으로: <code style={{ color: 'var(--c-accyanbr)' }}>비트코인, 0.3, 95000000</code></li>
                <li>바이낸스 등 <b style={{ color: 'var(--c-tx2)' }}>달러 거래소</b> 보유분 → <b style={{ color: 'var(--c-tx2)' }}>티커</b>로: <code style={{ color: 'var(--c-accyanbr)' }}>BTC, 0.3, 68000</code></li>
              </ul>
              <div style={{ color: 'var(--c-tx5)' }}>· 해외주식은 티커로 입력(예: <code style={{ color: 'var(--c-accyanbr)' }}>AAPL, 3, 220</code>) · 숫자 콤마(72,000)·엑셀 탭 복사 모두 인식 · 목록에 없는 종목은 “수동”으로 들어가 현재가 없이 평단만 반영</div>
            </div>
          </details>

          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'삼성전자, 10, 72000\n비트코인, 0.3, 95000000\nAAPL, 3, 220'} rows={3}
            style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 13 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            <button style={btn()} onClick={importCsv}>불러오기</button>
            {csvMsg && <span style={{ fontSize: 12, color: 'var(--c-tx5)' }}>{csvMsg}</span>}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ ...CARD, padding: 40, textAlign: 'center', color: 'var(--c-tx5)', fontSize: 14 }}>
          아직 보유 종목이 없습니다. 위에서 추가해보세요.
        </div>
      ) : (
        <>
          {/* 요약 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 16 }}>
            <div style={{ ...CARD, padding: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 6 }}>총 평가액 (원 환산)</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{krw(totalKrw)}</div>
            </div>
            <div style={{ ...CARD, padding: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 6 }}>총 평가손익</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: upColor(totalPlPct) }}>{totalPlKrw >= 0 ? '+' : '-'}{krw(Math.abs(totalPlKrw)).slice(1)}원 ({fmtPct(totalPlPct)})</div>
            </div>
            <div style={{ ...CARD, padding: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 8 }}>자산군 비중</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {groupWeights.map((g) => (
                  <div key={g.group} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--c-tx4)' }}>{g.group}</span>
                    <span style={{ color: 'var(--c-tx2)', fontWeight: 600 }}>{g.weight.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 보유 목록 */}
          <div style={{ ...CARD, padding: '6px 18px', marginBottom: 16 }}>
            {[...rows].sort((a, b) => b.valueKrw - a.valueKrw).map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: '1px solid var(--c-w05)', flexWrap: 'wrap' }}>
                <div style={{ flex: '2 1 160px', minWidth: 140 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-tx1)' }}>{r.name} {!r.matched && <span style={{ fontSize: 10, color: 'var(--c-warn)' }}>· 수동</span>}</div>
                  <div style={{ fontSize: 11, color: 'var(--c-tx6)' }}>{r.group} · {r.qty}주 · 평단 {fmtPrice(r.avg, r.cur)}</div>
                </div>
                <div style={{ flex: '1 1 100px', textAlign: 'right' }}>
                  <div style={{ fontSize: 13, color: 'var(--c-tx2)' }}>{fmtPrice(r.price, r.cur)}</div>
                  <div style={{ fontSize: 11, color: 'var(--c-tx6)' }}>{totalKrw > 0 ? ((r.valueKrw / totalKrw) * 100).toFixed(0) : 0}%</div>
                </div>
                <div style={{ flex: '1 1 110px', textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{krw(r.valueKrw)}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: upColor(r.plPct) }}>{fmtPct(r.plPct)}</div>
                </div>
                <button onClick={() => remove(r.id)} title="삭제" style={{ cursor: 'pointer', background: 'transparent', border: 'none', color: 'var(--c-tx6)', fontSize: 18, lineHeight: 1, fontFamily: 'inherit', padding: 4 }}>×</button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 0' }}>
              <button onClick={clear} style={{ cursor: 'pointer', background: 'transparent', border: 'none', color: 'var(--c-tx6)', fontSize: 12, fontFamily: 'inherit' }}>전체 비우기</button>
            </div>
          </div>

          {/* AI 평가 */}
          <div style={{ ...CARD, padding: 24, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: evalData || loading ? 16 : 0, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 6, background: 'var(--c-cy18)', color: 'var(--c-accyanbr)' }}>AI 평가</span>
                <span style={{ fontSize: 13, color: 'var(--c-tx5)' }}>집중도 · 위험 · 종목 코멘트 · 리밸런싱 제안</span>
              </div>
              <button style={btn(true)} onClick={runEval} disabled={loading}>{loading ? '평가 중…' : evalData ? '다시 평가' : 'AI 평가 받기'}</button>
            </div>
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: 'var(--c-tx5)', fontSize: 14 }}>
                <span className="skeleton-pulse" style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--c-accyanbr)' }} />
                포트폴리오를 분석하는 중입니다…
              </div>
            )}
            {evalData && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: 'var(--c-tx1)' }}>{evalData.summary}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <div style={{ background: 'var(--c-w04)', borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-accyan)', marginBottom: 6 }}>집중도</div>
                    <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--c-tx2)' }}>{evalData.concentration}</div>
                  </div>
                  <div style={{ background: 'var(--c-w04)', borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-warn)', marginBottom: 6 }}>위험</div>
                    <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--c-tx2)' }}>{evalData.risk}</div>
                  </div>
                </div>
                {evalData.perStock?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-tx4)', marginBottom: 8 }}>종목별 코멘트</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {evalData.perStock.map((p, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.6 }}>
                          <span style={{ fontWeight: 700, color: 'var(--c-tx2)', minWidth: 90, flexShrink: 0 }}>{p.name}</span>
                          <span style={{ color: 'var(--c-tx4)' }}>{p.comment}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {evalData.rebalance?.length > 0 && (
                  <div style={{ background: 'linear-gradient(135deg, var(--c-cy07), var(--c-bl05))', border: '1px solid var(--c-cy18)', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-accyanbr)', marginBottom: 8 }}>리밸런싱 제안</div>
                    <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {evalData.rebalance.map((s, i) => <li key={i} style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--c-tx2)' }}>{s}</li>)}
                    </ul>
                  </div>
                )}
                <SourceNote text="AI 생성 — Claude (Anthropic) · 보유종목·시세를 종합한 참고용 평가이며 투자 자문이 아닙니다." />
              </div>
            )}
          </div>
        </>
      )}

      <SourceNote text="보유종목 — 직접 입력/CSV(브라우저에만 저장) · 시세 — 네이버 금융 · 업비트 · 바이낸스 · 환율 frankfurter" style={{ marginTop: 4 }} />
    </div>
  );
}
