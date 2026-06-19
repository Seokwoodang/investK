'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export interface RtQuote {
  price: number;
  pct: number;
}
type RtMap = Record<string, RtQuote>;

interface Ctx {
  quotes: RtMap;
  subscribeStocks: (codes: string[]) => void;
  subscribeCoins: (upbit: Record<string, string>, binance: Record<string, string>) => void;
  subscribeUs: (symbolToId: Record<string, string>) => void;
}
const RealtimeCtx = createContext<Ctx>({ quotes: {}, subscribeStocks: () => {}, subscribeCoins: () => {}, subscribeUs: () => {} });

// 실시간(전부 "보이는 종목만" 구독 — 한도/부하 회피):
//  · 코인 = 브라우저에서 업비트/바이낸스 공개 ws 직접 연결.
//  · 주식 = 서버 KIS ws → /api/realtime/stocks (SSE) 중계.
// 틱은 800ms로 모아 quotes(종목 id 키)에 반영.
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [quotes, setQuotes] = useState<RtMap>({});
  const pending = useRef<RtMap>({});
  const [stockKey, setStockKey] = useState('');
  const [coinKey, setCoinKey] = useState(''); // JSON {up:{market:id}, bn:{symbol:id}}
  const [usKey, setUsKey] = useState(''); // JSON {symbol:id} — 해외주식 지연시세 폴링

  useEffect(() => {
    const t = setInterval(() => {
      if (Object.keys(pending.current).length === 0) return;
      // pending을 먼저 캡처+초기화한 뒤 setQuotes에 전달 — 지연 실행되는 함수형 업데이터가
      // 비워진 pending을 보지 않도록(이게 코인 틱이 반영 안 되던 원인).
      const batch = pending.current;
      pending.current = {};
      setQuotes((q) => ({ ...q, ...batch }));
    }, 800);
    return () => clearInterval(t);
  }, []);

  // 코인 ws (보이는 코인만)
  useEffect(() => {
    if (!coinKey) return;
    const { up, bn } = JSON.parse(coinKey) as { up: Record<string, string>; bn: Record<string, string> };
    const upMarkets = Object.keys(up);
    const bnSymbols = Object.keys(bn);
    let closed = false;
    let ws: WebSocket | null = null;
    let bw: WebSocket | null = null;
    const timer = setTimeout(() => {
      if (upMarkets.length) {
        ws = new WebSocket('wss://api.upbit.com/websocket/v1');
        ws.onopen = () => ws?.send(JSON.stringify([{ ticket: 'invest' }, { type: 'ticker', codes: upMarkets }]));
        ws.onmessage = async (ev) => {
          try {
            const text = ev.data instanceof Blob ? await ev.data.text() : (ev.data as string);
            const m = JSON.parse(text) as { code: string; trade_price: number; signed_change_rate: number };
            const id = up[m.code];
            if (id) pending.current[id] = { price: m.trade_price, pct: m.signed_change_rate * 100 };
          } catch {
            /* ignore */
          }
        };
      }
      if (bnSymbols.length) {
        const streams = bnSymbols.map((s) => s.toLowerCase() + '@ticker').join('/');
        bw = new WebSocket('wss://stream.binance.com:9443/stream?streams=' + streams);
        bw.onmessage = (ev) => {
          try {
            const { data: d } = JSON.parse(ev.data as string) as { data: { s: string; c: string; P: string } };
            const id = bn[d.s];
            if (id) pending.current[id] = { price: Number(d.c), pct: Number(d.P) };
          } catch {
            /* ignore */
          }
        };
      }
    }, 400);
    return () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
      bw?.close();
      void closed;
    };
  }, [coinKey]);

  // 주식 SSE (KIS 중계, 보이는 종목만)
  useEffect(() => {
    if (!stockKey) return;
    let es: EventSource | null = null;
    const timer = setTimeout(() => {
      es = new EventSource('/api/realtime/stocks?codes=' + stockKey);
      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as { snapshot?: RtMap; code?: string; price?: number; pct?: number };
          if (msg.snapshot) Object.assign(pending.current, msg.snapshot);
          else if (msg.code && typeof msg.price === 'number') pending.current[msg.code] = { price: msg.price, pct: msg.pct ?? 0 };
        } catch {
          /* ignore */
        }
      };
    }, 400);
    return () => {
      clearTimeout(timer);
      es?.close();
    };
  }, [stockKey]);

  // 해외주식 지연시세: 30초마다 KIS REST 폴링(소켓 아님, ~15분 지연). pending에 병합.
  useEffect(() => {
    if (!usKey) return;
    const map = JSON.parse(usKey) as Record<string, string>;
    const symbols = Object.keys(map);
    if (!symbols.length) return;
    let stop = false;
    const poll = async () => {
      try {
        const r = await fetch('/api/quotes/us', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ symbols }) });
        const j = (await r.json()) as { quotes: Record<string, { price: number; pct: number }> };
        if (stop) return;
        Object.entries(j.quotes || {}).forEach(([sym, q]) => {
          const id = map[sym];
          if (id) pending.current[id] = { price: q.price, pct: q.pct };
        });
      } catch {
        /* ignore */
      }
    };
    poll();
    const t = setInterval(poll, 30000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [usKey]);

  const subscribeStocks = useCallback((codes: string[]) => {
    const key = Array.from(new Set(codes)).sort().join(',');
    setStockKey((p) => (p === key ? p : key));
  }, []);

  const subscribeCoins = useCallback((upbit: Record<string, string>, binance: Record<string, string>) => {
    const norm = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
    const key = JSON.stringify({ up: norm(upbit), bn: norm(binance) });
    setCoinKey((p) => (p === key ? p : key));
  }, []);

  const subscribeUs = useCallback((symbolToId: Record<string, string>) => {
    const norm = Object.fromEntries(Object.entries(symbolToId).sort(([a], [b]) => a.localeCompare(b)));
    const key = JSON.stringify(norm);
    setUsKey((p) => (p === key ? p : key));
  }, []);

  return (
    <RealtimeCtx.Provider value={{ quotes, subscribeStocks, subscribeCoins, subscribeUs }}>{children}</RealtimeCtx.Provider>
  );
}

export function useRealtime(): RtMap {
  return useContext(RealtimeCtx).quotes;
}
export function useSubscribeStocks(): (codes: string[]) => void {
  return useContext(RealtimeCtx).subscribeStocks;
}
export function useSubscribeCoins(): (upbit: Record<string, string>, binance: Record<string, string>) => void {
  return useContext(RealtimeCtx).subscribeCoins;
}
export function useSubscribeUs(): (symbolToId: Record<string, string>) => void {
  return useContext(RealtimeCtx).subscribeUs;
}
