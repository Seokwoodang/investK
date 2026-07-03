'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtPct, fmtPrice, upColor } from '../../lib/format';
import { parseHoldingsText, resolveStock, usdKrwFromFx, usePortfolio, useResolvedPrices, valuePortfolio } from '../../lib/portfolio';
import { useDashboard } from '../../store/DashboardContext';
import { TAB_MAP, type Currency, type TabId } from '../../types';
import { SourceNote, UpdateNote } from '../SourceNote';
import { GlossaryTip, TermTip } from '../GlossaryTip';
import { InlineSpinner } from '../Footer';

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
interface SellSignal { level: 'high' | 'mid' | 'info'; text: string; who: string; principle: string; detail: string; formula: string }
interface SellFundamental {
  code: string; name: string; signals: SellSignal[];
  per: number | null; pbr: number | null; roe: number | null; debtRatio: number | null; target: number | null; upside: number | null;
  recentHigh: number | null; // 캔들 실제 고점(트레일링용)
}
interface SellConfig { stopLoss: number; takeProfit: number; maxWeight: number; trailing: number; enabled: Record<string, boolean> }

const SELL_CFG_KEY = 'sell_cfg';
// 선택 가능한 매도 공식(전략). 켜면 그 공식의 신호만 본다. (stock=주식 전용 — 캔들/재무 필요)
const FORMULAS: { key: string; name: string; who: string; desc: string; stock?: boolean; tip: string }[] = [
  { key: 'oneill', name: '오닐 (CAN SLIM)', who: '윌리엄 오닐', desc: '고정 손절·익절 라인', tip: '윌리엄 오닐의 투자법. 손실은 정해둔 선(예 -8%)에서 칼같이 끊고, 오른 종목은 +20~25%에서 차익실현하는 "규칙대로 사고팔기" 방식이에요. 내가 정한 숫자 기준입니다.' },
  { key: 'trend', name: '추세 (이동평균)', who: '추세추종', desc: '장기 이동평균선 이탈', stock: true, tip: '"이동평균선"은 최근 며칠 종가의 평균을 이은 선이에요. 주가가 이 선(예 120일선) 아래로 떨어지면 상승 추세가 꺾였다고 보고 매도를 검토합니다. 종목 가격 자체가 주는 신호예요.' },
  { key: 'atr', name: '변동성 손절 (ATR)', who: '샹들리에 이그짓', desc: '고점−3×ATR · 변동성 자동', stock: true, tip: '종목마다 평소 출렁이는 폭(ATR)이 다른데, 그 변동성에 맞춰 손절선을 자동으로 잡는 방식이에요(고점 − 3×ATR). 많이 흔들리는 종목은 손절선을 넓게, 안정적인 종목은 좁게 잡아 노이즈에 안 털립니다.' },
  { key: 'trail', name: '트레일링 스톱', who: '추세추종', desc: '실제 고점 대비 하락', stock: true, tip: '주가가 고점을 찍은 뒤 정해둔 % 만큼 떨어지면 파는 방법. 오를 때는 끝까지 따라가다가, 고점 대비 일정폭 빠지면 수익을 지키며 매도합니다.' },
  { key: 'graham', name: '그레이엄 (가치)', who: '벤저민 그레이엄', desc: '목표가 도달 = 고평가', stock: true, tip: '"가치투자의 아버지" 벤저민 그레이엄 방식. 주가가 적정가치(증권가 평균 목표가)에 도달하면 더 오를 여유(안전마진)가 줄었다고 보고 매도를 고려합니다.' },
  { key: 'quality', name: '피셔·버핏 (퀄리티)', who: '필립 피셔·버핏', desc: '재무 악화 = 보유근거 소멸', stock: true, tip: '필립 피셔·워런 버핏 방식. 회사 자체가 나빠지면(ROE·이익률 하락, 부채 급증) "내가 산 이유"가 사라졌다고 보고 매도를 검토합니다. 단순 주가 등락이 아니라 기업의 질을 봐요.' },
  { key: 'weight', name: '비중 리밸런싱', who: '분산 투자', desc: '단일 종목 비중 상한', tip: '한 종목이 내 전체 자산에서 너무 큰 비중을 차지하면 그 종목 하나에 위험이 쏠려요. 비중이 상한(예 25%)을 넘으면 일부를 덜어 분산하라는 신호입니다.' },
];
const DEFAULT_CFG: SellConfig = { stopLoss: -20, takeProfit: 50, maxWeight: 25, trailing: 20, enabled: { oneill: true, graham: true, quality: true, weight: true, trend: false, atr: false, trail: false } };
const PRESETS: { label: string; cfg: Partial<SellConfig> }[] = [
  { label: '오닐 공격형 (-8% / +20%)', cfg: { stopLoss: -8, takeProfit: 20 } },
  { label: '보수·장기 (-20% / +50%)', cfg: { stopLoss: -20, takeProfit: 50 } },
];
const VERDICT: Record<'hold' | 'watch' | 'review', { label: string; color: string }> = {
  review: { label: '점검 필요', color: 'var(--c-down)' },
  watch: { label: '관찰', color: 'var(--c-warn)' },
  hold: { label: '보유 유지', color: 'var(--c-up)' },
};
const RANK = { review: 0, watch: 1, hold: 2 };
const sigColor = (l: SellSignal['level']) => (l === 'high' ? 'var(--c-down)' : l === 'mid' ? 'var(--c-warn)' : 'var(--c-tx4)');

// 사용자 조절형 신호(오닐 손절·익절, 비중, 트레일링) — 켜진 공식만, 클라에서 즉시 계산.
function clientSignals(plPct: number, price: number, weight: number, cfg: SellConfig, recentHigh: number): SellSignal[] {
  const out: SellSignal[] = [];
  const pl = Math.round(plPct);
  const en = cfg.enabled;
  if (en.oneill) {
    if (plPct <= cfg.stopLoss) out.push({ formula: 'oneill', level: 'high', text: `손절 라인(${cfg.stopLoss}%) 도달 — 현재 ${pl}%`, who: '윌리엄 오닐 · 리버모어', principle: '고정 손절 (1원칙)', detail: '오닐의 첫 원칙: 미리 정한 손실선에서 예외 없이 매도해 큰 손실을 막는다. "손실은 짧게, 수익은 길게"(리버모어). 내가 정한 규율형 매도선이에요(시장 신호가 아니라 규칙).' });
    if (plPct >= cfg.takeProfit) out.push({ formula: 'oneill', level: 'mid', text: `평단 대비 +${pl}% — 목표 수익(${cfg.takeProfit}%) 도달`, who: '윌리엄 오닐', principle: '목표 수익 실현', detail: '오닐은 주도주를 +20~25%에서 차익실현(돌파 후 3주 내 급등주는 8주 홀드). 되돌림을 피하려는 규칙.' });
  }
  if (en.weight && weight > cfg.maxWeight) out.push({ formula: 'weight', level: 'mid', text: `비중 ${Math.round(weight)}% 과다 (상한 ${cfg.maxWeight}%)`, who: '분산 투자', principle: '비중 상한', detail: '한 종목 비중이 과하면 그 종목 리스크가 포트폴리오 전체를 흔든다. 일부 덜어 분산(리밸런싱).' });
  if (en.trail && recentHigh > 0 && price < recentHigh) {
    const dd = (price / recentHigh - 1) * 100;
    if (dd <= -cfg.trailing) out.push({ formula: 'trail', level: 'high', text: `트레일링 스톱 — 고점 대비 ${dd.toFixed(0)}% (기준 -${cfg.trailing}%)`, who: '추세추종 · 리버모어', principle: '트레일링 스톱', detail: '실제 고점(최근 약 1년 캔들) 대비 일정 % 하락하면 매도해 수익을 보호하면서 추세는 끝까지 탑니다.' });
  }
  return out;
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

  // 원화 환산용 USD/KRW + 유니버스에 없는 종목(미국 ETF 등)은 네이버 즉석 시세로 보강.
  const usdkrw = useMemo(() => usdKrwFromFx(data.macro.fx), [data.macro.fx]);
  const extra = useResolvedPrices(holdings, data.stocks);
  const { rows, totalKrw, totalPlKrw, totalPlPct, groupWeights } = useMemo(
    () => valuePortfolio(holdings, data.stocks, usdkrw, extra),
    [holdings, data.stocks, usdkrw, extra],
  );

  // ── 입력(검색→수량·평단) ──
  const [q, setQ] = useState('');
  const [qty, setQty] = useState('');
  const [avg, setAvg] = useState('');
  type Pick = { id: string; name: string; ticker: string; cur?: Currency; tab?: TabId };
  const [picked, setPicked] = useState<Pick | null>(null);

  const localMatches = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return flat.filter((s) => s.name.toLowerCase().includes(query) || s.ticker.toLowerCase().includes(query)).slice(0, 6);
  }, [q, flat]);

  // 유니버스에 없으면 네이버 자동완성으로 원격 후보 보강(미국 ETF·소형주 등).
  const [remote, setRemote] = useState<{ ticker: string; name: string; cur: Currency; tab: string; group: string }[]>([]);
  useEffect(() => {
    const query = q.trim();
    if (picked || !query) { setRemote([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/resolve?q=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((j) => { if (!cancelled) setRemote(j.items || []); })
        .catch(() => {});
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, picked]);

  const localTickers = new Set(localMatches.map((s) => s.ticker.toUpperCase()));
  const dropdown: (Pick & { sub: string })[] = [
    ...localMatches.map((s) => ({ id: s.id, name: s.name, ticker: s.ticker, sub: `${TAB_MAP[s.tab]} · ${s.ticker}` })),
    ...remote.filter((r) => !localTickers.has(r.ticker.toUpperCase())).map((r) => ({ id: 'ext:' + r.ticker, name: r.name, ticker: r.ticker, cur: r.cur, tab: r.tab as TabId, sub: `${r.group} · ${r.ticker}` })),
  ].slice(0, 8);

  const addManual = () => {
    const nQty = Number(qty.replace(/[,\s]/g, ''));
    const nAvg = Number(avg.replace(/[,\s]/g, ''));
    if (!Number.isFinite(nQty) || !Number.isFinite(nAvg) || nQty <= 0) return;
    if (picked) {
      const u = byId.get(picked.id);
      if (u) upsert({ id: u.id, name: u.name, ticker: u.ticker, qty: nQty, avg: nAvg, cur: u.cur, tab: u.tab as TabId });
      else upsert({ id: picked.id, name: picked.name, ticker: picked.ticker, qty: nQty, avg: nAvg, cur: picked.cur ?? '₩', tab: picked.tab }); // 원격 후보 → useResolvedPrices가 현재가 보강
    } else {
      const hit = resolveStock(data.stocks, q);
      if (hit) upsert({ id: hit.stock.id, name: hit.stock.name, ticker: hit.stock.ticker, qty: nQty, avg: nAvg, cur: hit.stock.cur, tab: hit.tab });
      else if (q.trim()) upsert({ id: 'manual:' + q.trim(), name: q.trim(), ticker: q.trim(), qty: nQty, avg: nAvg, cur: '₩', manualPrice: nAvg });
    }
    setQ(''); setQty(''); setAvg(''); setPicked(null); setRemote([]);
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
  const [evalErr, setEvalErr] = useState(false); // 실패를 무통보로 넘기지 않기 위한 표시
  const runEval = () => {
    if (!rows.length) return;
    setLoading(true);
    setEvalData(null);
    setEvalErr(false);
    const lines = [...rows].sort((a, b) => b.valueKrw - a.valueKrw).map((r) => ({
      name: r.name, group: r.group, weight: totalKrw > 0 ? (r.valueKrw / totalKrw) * 100 : 0, plPct: r.plPct, risk: r.risk,
    }));
    fetch('/api/ai/portfolio', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines, totalValueKrw: totalKrw, groupWeights }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.summary) setEvalData(j as Evaluation); else setEvalErr(true); })
      .catch(() => setEvalErr(true))
      .finally(() => setLoading(false));
  };

  // ── 매도 점검 ── 펀더멘털(목표가·퀄리티)은 서버, 임계값(손절·익절·비중·트레일링)은 클라에서 즉시 계산.
  const [sellFund, setSellFund] = useState<SellFundamental[] | null>(null);
  const [sellLoading, setSellLoading] = useState(false);
  const [cfg, setCfg] = useState<SellConfig>(DEFAULT_CFG);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [aiSell, setAiSell] = useState<{ summary: string; perStock: { name: string; comment: string }[] } | null>(null);
  const [aiSellLoading, setAiSellLoading] = useState(false);
  const rowsRef = useRef(rows); rowsRef.current = rows;
  const sig = holdings.map((h) => `${h.id}:${h.qty}:${h.avg}`).join('|');
  const ready = holdings.length > 0 && totalKrw > 0;

  // 설정 로드(localStorage). 트레일링 고점은 서버(kv)에 저장돼 응답에 담겨 온다.
  useEffect(() => {
    try { const c = JSON.parse(localStorage.getItem(SELL_CFG_KEY) || 'null'); if (c) setCfg({ ...DEFAULT_CFG, ...c }); } catch { /* ignore */ }
  }, []);
  const saveCfg = (c: SellConfig) => { setCfg(c); try { localStorage.setItem(SELL_CFG_KEY, JSON.stringify(c)); } catch { /* ignore */ } };

  // 캔들 기반 공식(추세·ATR·트레일링)이 켜졌을 때만 서버가 캔들을 받는다.
  const needTech = !!(cfg.enabled.trend || cfg.enabled.atr || cfg.enabled.trail);

  // 서버 신호 fetch (목표가·퀄리티는 항상, 추세·ATR·트레일링용 캔들은 needTech일 때만)
  useEffect(() => {
    if (!holdings.length) { setSellFund(null); return; }
    if (!ready) return;
    let cancelled = false; setSellLoading(true);
    const payload = rowsRef.current.map((r) => ({ code: r.id, tab: r.tab, name: r.name, price: r.price, cur: r.cur }));
    fetch('/api/sell-check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ holdings: payload, tech: needTech }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setSellFund((j?.results as SellFundamental[]) ?? []); })
      .catch(() => { if (!cancelled) setSellFund([]); })
      .finally(() => { if (!cancelled) setSellLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, ready, needTech]);

  // 클라 신호(켜진 공식) + 서버 신호(켜진 공식만 필터) 병합 → 종목별 판정.
  const fundByCode = new Map((sellFund ?? []).map((f) => [f.code, f]));
  const sellRows = ready
    ? [...rows].map((r) => {
        const weight = totalKrw > 0 ? (r.valueKrw / totalKrw) * 100 : 0;
        const f = fundByCode.get(r.id);
        const serverSig = (f?.signals ?? []).filter((s) => cfg.enabled[s.formula]);
        const signals = [...clientSignals(r.plPct, r.price, weight, cfg, f?.recentHigh ?? 0), ...serverSig];
        const verdict: 'hold' | 'watch' | 'review' = signals.some((s) => s.level === 'high') ? 'review' : signals.length ? 'watch' : 'hold';
        return { r, f, signals, verdict };
      }).sort((a, b) => RANK[a.verdict] - RANK[b.verdict])
    : [];
  const sellCounts = sellRows.reduce((acc, s) => ((acc[s.verdict] = (acc[s.verdict] || 0) + 1), acc), {} as Record<string, number>);
  const activePreset = PRESETS.find((p) => p.cfg.stopLoss === cfg.stopLoss && p.cfg.takeProfit === cfg.takeProfit)?.label;

  // AI 매도 총평 — 판정은 규칙(위), AI는 신호 종합 설명만.
  const [aiSellErr, setAiSellErr] = useState(false);
  const runSellAi = () => {
    if (!sellRows.length) return;
    setAiSellLoading(true); setAiSell(null); setAiSellErr(false);
    const items = sellRows.map(({ r, f, signals, verdict }) => ({
      name: r.name, verdict, plPct: r.plPct, signals: signals.map((s) => s.text),
      per: f?.per ?? null, roe: f?.roe ?? null, debtRatio: f?.debtRatio ?? null,
    }));
    fetch('/api/ai/sell', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.summary) setAiSell(j); else setAiSellErr(true); })
      .catch(() => setAiSellErr(true))
      .finally(() => setAiSellLoading(false));
  };

  const krw = (v: number) => '₩' + Math.round(v).toLocaleString('ko-KR');

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>내 자산</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-tx5)' }}>보유 종목을 직접 입력하거나 CSV로 붙여넣으면 평가손익·비중과 AI 포트폴리오 평가를 보여줍니다. (증권사 무관)</p>
        <UpdateNote text="보유 평가액은 페이지 로드 시점 시세 기준 · 매도 점검 재무는 하루 1회 갱신" style={{ marginTop: 8 }} />
      </div>

      {/* 입력 */}
      <div style={{ ...CARD, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--c-accyan)', marginBottom: 12 }}>보유 종목 추가</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ position: 'relative', flex: '2 1 220px', minWidth: 200 }}>
            <input style={{ ...inputStyle, width: '100%' }} placeholder="종목명 또는 티커" value={picked ? picked.name : q}
              onChange={(e) => { setQ(e.target.value); setPicked(null); }} />
            {!picked && dropdown.length > 0 && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20, background: 'var(--c-panel)', border: '1px solid var(--c-w12)', borderRadius: 12, padding: 6, boxShadow: '0 18px 48px var(--c-shadow)', maxHeight: 260, overflowY: 'auto' }}>
                {dropdown.map((m) => (
                  <div key={m.id} onClick={() => { setPicked({ id: m.id, name: m.name, ticker: m.ticker, cur: m.cur, tab: m.tab }); setQ(m.name); setRemote([]); }}
                    className="gsearch-result" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: 'pointer' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-tx1)' }}>{m.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--c-tx6)' }}>{m.sub}</span>
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

          {/* 매도 점검 */}
          <div style={{ ...CARD, padding: 24, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 6, background: 'var(--c-am16)', color: 'var(--c-warn)' }}>매도 점검</span>
              <span style={{ fontSize: 13, color: 'var(--c-tx5)' }}>대가들의 매도 원칙으로 점검 · 신호를 누르면 근거 설명</span>
              {sellFund && (
                <>
                  <button onClick={runSellAi} disabled={aiSellLoading || !sellRows.length} style={{ ...btn(true), marginLeft: 'auto', fontSize: 12, padding: '6px 12px' }}>
                    {aiSellLoading && <InlineSpinner size={12} color="currentColor" />} {aiSellLoading ? 'AI 총평 생성 중…' : aiSell ? 'AI 총평 다시' : 'AI 매도 총평'}
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--c-tx5)' }}>
                    점검필요 <b style={{ color: 'var(--c-down)' }}>{sellCounts.review || 0}</b> · 관찰 <b style={{ color: 'var(--c-warn)' }}>{sellCounts.watch || 0}</b> · 보유 <b style={{ color: 'var(--c-up)' }}>{sellCounts.hold || 0}</b>
                  </span>
                </>
              )}
            </div>

            {/* 공식(전략) 선택 */}
            <div style={{ background: 'var(--c-w04)', border: '1px solid var(--c-w07)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-tx5)', marginBottom: 10 }}>적용할 매도 공식 — 켜고 끄면 그 공식 기준으로만 판정</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(212px, 1fr))', gap: 8 }}>
                {FORMULAS.map((fm) => {
                  const on = !!cfg.enabled[fm.key];
                  return (
                    <button key={fm.key} onClick={() => saveCfg({ ...cfg, enabled: { ...cfg.enabled, [fm.key]: !on } })}
                      style={{ cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: `1px solid ${on ? 'var(--c-cy45)' : 'var(--c-w08)'}`, background: on ? 'var(--c-cy16)' : 'var(--c-w05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, border: `1px solid ${on ? 'var(--c-accyanbr)' : 'var(--c-w10)'}`, background: on ? 'var(--c-accyanbr)' : 'transparent', color: 'var(--c-bg)', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on ? '✓' : ''}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: on ? 'var(--c-tx1b)' : 'var(--c-tx3)' }}>{fm.name}</span>
                        <span onClick={(e) => e.stopPropagation()} role="presentation" style={{ display: 'inline-flex' }}>
                          <GlossaryTip hit={{ term: fm.name, def: fm.tip }} zIndex={90} />
                        </span>
                        {fm.stock && <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--c-tx6)', border: '1px solid var(--c-w08)', borderRadius: 4, padding: '1px 4px' }}>주식</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginTop: 4, paddingLeft: 22 }}>{fm.who} · {fm.desc}</div>
                    </button>
                  );
                })}
              </div>
              {(cfg.enabled.oneill || cfg.enabled.weight || cfg.enabled.trail) && (
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: 'var(--c-tx4)', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--c-w06)' }}>
                  {cfg.enabled.oneill && (
                    <>
                      {PRESETS.map((p) => {
                        const on = activePreset === p.label;
                        return <button key={p.label} onClick={() => saveCfg({ ...cfg, ...p.cfg })} style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 7, border: `1px solid ${on ? 'var(--c-cy45)' : 'var(--c-w08)'}`, background: on ? 'var(--c-cy16)' : 'var(--c-w05)', color: on ? 'var(--c-accyanbr)' : 'var(--c-tx5)' }}>{p.label}</button>;
                      })}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>손절 <input type="number" value={cfg.stopLoss} onChange={(e) => saveCfg({ ...cfg, stopLoss: Number(e.target.value) })} style={{ ...inputStyle, width: 62, padding: '5px 8px' }} /> %</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>익절 +<input type="number" value={cfg.takeProfit} onChange={(e) => saveCfg({ ...cfg, takeProfit: Number(e.target.value) })} style={{ ...inputStyle, width: 62, padding: '5px 8px' }} /> %</label>
                    </>
                  )}
                  {cfg.enabled.weight && <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>비중 상한 <input type="number" value={cfg.maxWeight} onChange={(e) => saveCfg({ ...cfg, maxWeight: Number(e.target.value) })} style={{ ...inputStyle, width: 62, padding: '5px 8px' }} /> %</label>}
                  {cfg.enabled.trail && <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>트레일링 고점 -<input type="number" value={cfg.trailing} onChange={(e) => saveCfg({ ...cfg, trailing: Number(e.target.value) })} style={{ ...inputStyle, width: 58, padding: '5px 8px' }} /> %</label>}
                </div>
              )}
            </div>

            {!sellFund && sellLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', color: 'var(--c-tx5)', fontSize: 14 }}>
                <InlineSpinner color="var(--c-warn)" />
                보유 종목의 매도 신호를 점검하는 중입니다…
              </div>
            )}

            {sellFund && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sellRows.map(({ r, f, signals, verdict }) => {
                  const v = VERDICT[verdict];
                  return (
                    <div key={r.id} style={{ background: 'var(--c-w04)', border: '1px solid var(--c-w07)', borderRadius: 12, padding: 14, borderLeft: `3px solid ${v.color}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-tx1)' }}>{r.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6, color: v.color, background: 'color-mix(in srgb, ' + v.color + ' 16%, transparent)' }}>{v.label}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: upColor(r.plPct) }}>{fmtPct(r.plPct)}</span>
                        <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 11, color: 'var(--c-tx6)', flexWrap: 'wrap' }}>
                          {f?.per != null && <span><TermTip term="PER">PER</TermTip> {f.per.toFixed(1)}</span>}
                          {f?.roe != null && <span><TermTip term="ROE">ROE</TermTip> {f.roe.toFixed(0)}%</span>}
                          {f?.debtRatio != null && <span><TermTip term="부채비율">부채</TermTip> {f.debtRatio.toFixed(0)}%</span>}
                          {f?.upside != null && <span style={{ color: upColor(f.upside) }}><TermTip term="목표주가">목표가</TermTip> {fmtPct(f.upside)}</span>}
                        </span>
                      </div>
                      {signals.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                          {signals.map((sg, i) => {
                            const key = `${r.id}:${i}`;
                            const open = expanded === key;
                            return (
                              <div key={i}>
                                <button onClick={() => setExpanded(open ? null : key)}
                                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', background: 'transparent', border: 'none', padding: '4px 0' }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: sigColor(sg.level), flexShrink: 0 }} />
                                  <span style={{ fontSize: 12.5, fontWeight: 600, color: sigColor(sg.level) }}>{sg.text}</span>
                                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--c-tx6)', whiteSpace: 'nowrap' }}>{sg.who} {open ? '▴' : '▾'}</span>
                                </button>
                                {open && (
                                  <div style={{ margin: '4px 0 6px 14px', padding: 12, background: 'var(--c-w05)', borderRadius: 10, border: '1px solid var(--c-w07)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-tx2)', marginBottom: 4 }}>{sg.principle} · {sg.who}</div>
                                    <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--c-tx4)' }}>{sg.detail}</div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--c-tx5)' }}>특이 매도 신호 없음 — 보유 유지 관점.</div>
                      )}
                    </div>
                  );
                })}
                {aiSellErr && !aiSellLoading && (
                  <div style={{ marginTop: 4, padding: '12px 16px', borderRadius: 12, background: 'var(--c-rd06)', border: '1px solid var(--c-rd20)', fontSize: 13, color: 'var(--c-tx3)' }}>
                    AI 총평 생성에 실패했습니다. 잠시 후 다시 시도해주세요.
                  </div>
                )}
                {(aiSellLoading || aiSell) && (
                  <div style={{ marginTop: 4, padding: 16, borderRadius: 12, background: 'linear-gradient(135deg, var(--c-cy07), var(--c-bl05))', border: '1px solid var(--c-cy18)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: aiSell ? 10 : 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 6, background: 'var(--c-cy18)', color: 'var(--c-accyanbr)' }}>AI 매도 총평</span>
                      <span style={{ fontSize: 11, color: 'var(--c-tx6)' }}>판정은 규칙, 해석은 AI</span>
                    </div>
                    {aiSellLoading && !aiSell && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--c-tx5)' }}><InlineSpinner size={13} />신호를 종합하는 중입니다…</div>}
                    {aiSell && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: 'var(--c-tx1)' }}>{aiSell.summary}</p>
                        {aiSell.perStock?.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {aiSell.perStock.map((p, i) => (
                              <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.6 }}>
                                <span style={{ fontWeight: 700, color: 'var(--c-tx2)', minWidth: 90, flexShrink: 0 }}>{p.name}</span>
                                <span style={{ color: 'var(--c-tx4)' }}>{p.comment}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <SourceNote text="매도 점검 — 대가 원칙 기반(오닐·피셔·버핏·그레이엄·리버모어). 신호 클릭 시 근거 설명. AI 총평은 규칙 판정을 해석할 뿐 매매 지시가 아닙니다." />
              </div>
            )}
          </div>

          {/* AI 평가 */}
          <div style={{ ...CARD, padding: 24, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: evalData || loading ? 16 : 0, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 6, background: 'var(--c-cy18)', color: 'var(--c-accyanbr)' }}>AI 평가</span>
                <span style={{ fontSize: 13, color: 'var(--c-tx5)' }}>집중도 · 위험 · 종목 코멘트 · 리밸런싱 제안</span>
              </div>
              <button style={btn(true)} onClick={runEval} disabled={loading}>{loading && <InlineSpinner size={12} color="currentColor" />} {loading ? '평가 중…' : evalData ? '다시 평가' : 'AI 평가 받기'}</button>
            </div>
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: 'var(--c-tx5)', fontSize: 14 }}>
                <InlineSpinner />
                포트폴리오를 분석하는 중입니다…
              </div>
            )}
            {evalErr && !loading && (
              <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--c-rd06)', border: '1px solid var(--c-rd20)', fontSize: 13, color: 'var(--c-tx3)' }}>
                AI 평가 생성에 실패했습니다. 잠시 후 다시 시도해주세요.
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

      <SourceNote text="보유종목 — 직접 입력/CSV · 내 계정(Supabase)에 저장 · 시세 — 네이버 금융 · 업비트 · 바이낸스 · 환율 frankfurter" style={{ marginTop: 4 }} />
    </div>
  );
}
