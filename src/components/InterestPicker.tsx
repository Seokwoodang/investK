'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MAX_INTERESTS, MAX_INTEREST_STOCKS, type InterestStockRef } from '../lib/interests';
import { sectorsOf } from '../lib/sectors';
import { useDashboard } from '../store/DashboardContext';
import type { Currency, Stock, TabId } from '../types';

// 관심사(분야 + 종목) 선택 모달.
//  · 분야: 국내 주식 12 / 해외 주식 12 / 코인 6 칩 다중 선택.
//  · 종목: 유니버스 검색 + 네이버 자동완성 폴백(포트폴리오 화면의 콤보박스와 같은 방식).
// 설정 전용 라우트를 새로 만들지 않고 인라인 모달로 둔다.

const GROUPS: { label: string; defs: ReturnType<typeof sectorsOf> }[] = [
  { label: '국내 주식', defs: sectorsOf('kr') },
  { label: '해외 주식', defs: sectorsOf('us') },
  { label: '코인', defs: sectorsOf('coin') },
];

const TAB_LABEL: Record<string, string> = {
  kr_stock: '국내주식', us_stock: '해외주식', kr_coin: '국내코인', global_coin: '해외코인',
};

export function InterestPicker({
  initialSectors,
  initialStocks,
  onSave,
  onClose,
}: {
  initialSectors: string[];
  initialStocks: InterestStockRef[];
  onSave: (v: { sectors: string[]; stocks: InterestStockRef[] }) => void;
  onClose: () => void;
}) {
  const { data } = useDashboard();
  const [sel, setSel] = useState<string[]>(initialSectors);
  const [stocks, setStocks] = useState<InterestStockRef[]>(initialStocks);
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState<{ ticker: string; name: string; cur: Currency; tab: string; group: string }[]>([]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 유니버스 전 탭 평탄화 — 종목 검색용.
  const flat = useMemo(() => {
    const out: { s: Stock; tab: TabId }[] = [];
    for (const [tab, arr] of Object.entries(data.stocks ?? {}) as [TabId, Stock[]][]) {
      for (const s of arr ?? []) out.push({ s, tab });
    }
    return out;
  }, [data.stocks]);

  const localMatches = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return flat
      .filter(({ s }) => s.name.toLowerCase().includes(query) || s.ticker.toLowerCase().includes(query))
      .slice(0, 6);
  }, [q, flat]);

  // 유니버스에 없으면 네이버 자동완성으로 보강(미국 소형주·ETF 등).
  useEffect(() => {
    const query = q.trim();
    if (!query) { setRemote([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/resolve?q=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((j) => { if (!cancelled) setRemote(j.items || []); })
        .catch(() => {});
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  const have = new Set(stocks.map((s) => s.id));
  const localTickers = new Set(localMatches.map(({ s }) => s.ticker.toUpperCase()));
  const dropdown: (InterestStockRef & { sub: string })[] = [
    ...localMatches.map(({ s, tab }) => ({ id: s.id, name: s.name, ticker: s.ticker, tab, sub: `${TAB_LABEL[tab] ?? tab} · ${s.ticker}` })),
    ...remote
      .filter((r) => !localTickers.has(r.ticker.toUpperCase()))
      .map((r) => ({ id: 'ext:' + r.ticker, name: r.name, ticker: r.ticker, tab: r.tab, sub: `${r.group} · ${r.ticker}` })),
  ].filter((x) => !have.has(x.id)).slice(0, 8);

  const stockFull = stocks.length >= MAX_INTEREST_STOCKS;
  const addStock = (x: InterestStockRef) => {
    if (stockFull) return;
    setStocks((p) => [...p, { id: x.id, name: x.name, ticker: x.ticker, tab: x.tab }]);
    setQ(''); setRemote([]);
  };

  const full = sel.length >= MAX_INTERESTS;
  const toggle = (key: string) =>
    setSel((s) => (s.includes(key) ? s.filter((k) => k !== key) : full ? s : [...s, key]));

  const chip = (key: string, label: string) => {
    const on = sel.includes(key);
    const disabled = !on && full;
    return (
      <button
        key={key}
        onClick={() => toggle(key)}
        disabled={disabled}
        style={{
          cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
          padding: '9px 15px', borderRadius: 999, transition: 'all 140ms',
          background: on ? 'var(--c-cy16)' : 'var(--c-w04)',
          border: `1px solid ${on ? 'var(--c-accyan)' : 'var(--c-w08)'}`,
          color: on ? 'var(--c-accyanbr)' : disabled ? 'var(--c-tx6)' : 'var(--c-tx3)',
          opacity: disabled ? 0.45 : 1,
        }}
      >
        {on ? '✓ ' : ''}{label}
      </button>
    );
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100, background: 'var(--c-overlay)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 4vw, 24px)',
        overflow: 'hidden',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 580, maxHeight: 'min(92dvh, 820px)', background: 'var(--c-panel97)',
          border: '1px solid var(--c-w10)', borderRadius: 24, boxShadow: '0 24px 80px var(--c-shadow)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px clamp(16px, 4vw, 26px)', borderBottom: '1px solid var(--c-w08)', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--c-tx1)' }}>관심 설정</h3>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{ marginLeft: 'auto', cursor: 'pointer', background: 'var(--c-w06)', border: 'none', borderRadius: 9, width: 32, height: 32, color: 'var(--c-tx3)', fontSize: 18, lineHeight: 1, fontFamily: 'inherit' }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '18px clamp(16px, 4vw, 26px)', flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {/* ── 관심 종목 ── */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--c-accyan)' }}>관심 종목</div>
            <span style={{ fontSize: 11.5, color: stockFull ? 'var(--c-warn)' : 'var(--c-tx6)' }}>{stocks.length}/{MAX_INTEREST_STOCKS}</span>
          </div>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={stockFull ? '최대 개수에 도달했어요' : '종목명 또는 티커 검색 (삼성전자, NVDA, 비트코인…)'}
              disabled={stockFull}
              style={{
                width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13.5,
                padding: '11px 14px', borderRadius: 11, background: 'var(--c-w04)',
                border: '1px solid var(--c-w08)', color: 'var(--c-tx2)', outline: 'none',
              }}
            />
            {dropdown.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 5, background: 'var(--c-panel97)', border: '1px solid var(--c-w10)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 12px 32px var(--c-shadow)' }}>
                {dropdown.map((x) => (
                  <button
                    key={x.id}
                    onClick={() => addStock(x)}
                    className="gsearch-result"
                    style={{ display: 'flex', alignItems: 'baseline', gap: 8, width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', padding: '10px 14px', background: 'transparent', border: 'none' }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-tx2)' }}>{x.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--c-tx6)' }}>{x.sub}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {stocks.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 22 }}>
              {stocks.map((s) => (
                <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, padding: '7px 8px 7px 13px', borderRadius: 999, background: 'var(--c-cy16)', color: 'var(--c-accyanbr)' }}>
                  {s.name}
                  <button
                    onClick={() => setStocks((p) => p.filter((x) => x.id !== s.id))}
                    aria-label={`${s.name} 제거`}
                    style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: 'inherit', fontFamily: 'inherit', fontSize: 14, lineHeight: 1, padding: '0 2px', opacity: 0.7 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--c-tx6)', marginBottom: 22 }}>
              보유·☆관심 종목은 처음에 자동으로 담겨요. 검색해서 더 추가할 수 있어요.
            </div>
          )}

          {/* ── 관심 분야 ── */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--c-accyan)' }}>관심 분야</div>
            <span style={{ fontSize: 11.5, color: full ? 'var(--c-warn)' : 'var(--c-tx6)' }}>{sel.length}/{MAX_INTERESTS}</span>
          </div>
          {GROUPS.map((g) => (
            <div key={g.label} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-tx5)', marginBottom: 8 }}>{g.label}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {g.defs.map((d) => chip(d.key, d.name))}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 12, color: 'var(--c-tx6)', lineHeight: 1.6 }}>
            코인 테마는 뉴스만 모아드려요(업종 가격 흐름은 국내·해외 주식만).
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '14px clamp(16px, 4vw, 26px)', borderTop: '1px solid var(--c-w08)', flexShrink: 0 }}>
          <button
            onClick={() => { setSel([]); setStocks([]); }}
            style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: '10px 16px', borderRadius: 11, background: 'transparent', border: '1px solid var(--c-w08)', color: 'var(--c-tx5)' }}
          >
            전체 해제
          </button>
          <button
            onClick={() => { onSave({ sectors: sel, stocks }); onClose(); }}
            style={{ marginLeft: 'auto', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, padding: '10px 22px', borderRadius: 11, background: 'var(--c-cy18)', border: 'none', color: 'var(--c-accyanbr)' }}
          >
            저장
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
