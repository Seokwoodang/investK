import 'server-only';
import { getSupabase } from './supabase';
import { getKrQuote, getKrQuotes } from './providers/kis';
import { getUpbitQuotes } from './providers/upbit';

// ── 모의투자 엔진 ──
// 씨드 1,000만원(원화 고정). 매매·재충전 규칙은 서버에서만 판정하고, 체결가도 서버에서 조회한다
// (클라가 보낸 가격을 절대 믿지 않음 → 시세 조작 불가). 총자산 랭킹이라 시드가 동일·비누적이면 공정.
// MVP 거래 대상: 국내주식 + 국내코인(둘 다 원화·실시간). 해외(환율 필요)는 이후 단계.

export const SEED = 10_000_000; // 시드 = 1,000만원
export type MockTab = 'kr_stock' | 'kr_coin';
export const MOCK_TABS: MockTab[] = ['kr_stock', 'kr_coin'];

// KST 기준 오늘 날짜(YYYY-MM-DD). 재충전 "하루 1회" 판정용.
export function kstToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export interface HoldingRow {
  tab: MockTab;
  code: string;
  name: string;
  qty: number;
  avgCost: number; // 평균 매입가(원)
  price: number; // 현재가(원)
  value: number; // 평가액(원)
  cost: number; // 매입원가(원)
  pnl: number; // 평가손익(원)
  pnlPct: number; // 손익률(%)
}

export interface AccountView {
  cash: number;
  holdings: HoldingRow[];
  holdingsValue: number;
  totalAsset: number;
  pnl: number;
  pnlPct: number;
  canReset: boolean;
  resets: number;
  seed: number;
  rank: number | null;
  players: number;
}

interface RawHolding { tab: MockTab; code: string; name: string; qty: number; avg_cost: number }

// ── 시세 조회(서버 전용) ──
// 단일 체결가(매매 시). 소스: 국내주식=KIS, 국내코인=업비트. 원화.
export async function getExecPrice(tab: MockTab, code: string): Promise<number> {
  if (tab === 'kr_stock') {
    const q = await getKrQuote(code);
    if (!(q.price > 0)) throw new Error('시세를 가져올 수 없습니다');
    return q.price;
  }
  const q = await getUpbitQuotes([code]);
  const price = q[code]?.price;
  if (!(price > 0)) throw new Error('시세를 가져올 수 없습니다');
  return price;
}

// 여러 종목 배치 시세(계좌 평가·랭킹용). tab별로 한 번에 묶어 상위 API 호출을 최소화.
async function priceMany(items: { tab: MockTab; code: string }[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const krCodes = [...new Set(items.filter((i) => i.tab === 'kr_stock').map((i) => i.code))];
  const coinCodes = [...new Set(items.filter((i) => i.tab === 'kr_coin').map((i) => i.code))];
  const empty: Record<string, { price: number }> = {};
  const [krQ, coinQ] = await Promise.all([
    krCodes.length ? getKrQuotes(krCodes).catch(() => empty) : Promise.resolve(empty),
    coinCodes.length ? getUpbitQuotes(coinCodes).catch(() => empty) : Promise.resolve(empty),
  ]);
  for (const c of krCodes) if (krQ[c]?.price > 0) out.set(`kr_stock:${c}`, krQ[c].price);
  for (const c of coinCodes) if (coinQ[c]?.price > 0) out.set(`kr_coin:${c}`, coinQ[c].price);
  return out;
}

// 계좌 보장(없으면 시드로 생성).
async function ensureAccount(user: string): Promise<{ cash: number; last_reset: string | null; resets: number }> {
  const sb = getSupabase();
  if (!sb) throw new Error('supabase 미설정');
  const { data } = await sb.from('mock_accounts').select('cash, last_reset, resets').eq('username', user).maybeSingle();
  if (data) return { cash: Number(data.cash), last_reset: data.last_reset as string | null, resets: Number(data.resets) };
  await sb.from('mock_accounts').insert({ username: user, cash: SEED });
  return { cash: SEED, last_reset: null, resets: 0 };
}

// 내 계좌 뷰(현재가로 평가 + 손익 + 재충전 가능 여부 + 순위).
export async function getAccount(user: string): Promise<AccountView> {
  const sb = getSupabase();
  if (!sb) throw new Error('supabase 미설정');
  const acct = await ensureAccount(user);
  const { data: rows } = await sb.from('mock_holdings').select('tab, code, name, qty, avg_cost').eq('username', user);
  const raw = (rows ?? []) as RawHolding[];
  const prices = await priceMany(raw.map((r) => ({ tab: r.tab, code: r.code })));

  const holdings: HoldingRow[] = raw.map((r) => {
    const price = prices.get(`${r.tab}:${r.code}`) ?? r.avg_cost; // 시세 실패 시 원가로(0 표시 방지)
    const value = r.qty * price;
    const cost = r.qty * r.avg_cost;
    return {
      tab: r.tab, code: r.code, name: r.name, qty: r.qty, avgCost: r.avg_cost,
      price, value, cost, pnl: value - cost, pnlPct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
    };
  }).sort((a, b) => b.value - a.value);

  const holdingsValue = holdings.reduce((s, h) => s + h.value, 0);
  const totalAsset = acct.cash + holdingsValue;
  const pnl = totalAsset - SEED;
  const canReset = totalAsset <= SEED && acct.last_reset !== kstToday();

  const { rank, players } = await myRank(user, totalAsset);

  return {
    cash: acct.cash, holdings, holdingsValue, totalAsset,
    pnl, pnlPct: (pnl / SEED) * 100,
    canReset, resets: acct.resets, seed: SEED, rank, players,
  };
}

// 매수/매도. side에 따라 현금·보유·평균단가 갱신 후 거래 로그 기록.
export async function trade(
  user: string,
  input: { tab: MockTab; code: string; name: string; side: 'buy' | 'sell'; qty: number },
): Promise<AccountView> {
  const sb = getSupabase();
  if (!sb) throw new Error('supabase 미설정');
  const { tab, code, name, side } = input;
  if (!MOCK_TABS.includes(tab)) throw new Error('지원하지 않는 종목');
  let qty = Number(input.qty);
  if (!(qty > 0)) throw new Error('수량을 확인하세요');
  if (tab === 'kr_stock') { qty = Math.floor(qty); if (qty < 1) throw new Error('1주 이상 입력하세요'); }

  const price = await getExecPrice(tab, code);
  const amount = Math.round(qty * price); // 체결 금액(원, 정수)

  const acct = await ensureAccount(user);
  const { data: h } = await sb.from('mock_holdings')
    .select('qty, avg_cost').eq('username', user).eq('tab', tab).eq('code', code).maybeSingle();
  const curQty = h ? Number(h.qty) : 0;
  const curAvg = h ? Number(h.avg_cost) : 0;

  if (side === 'buy') {
    if (amount > acct.cash) throw new Error('현금이 부족합니다');
    const newQty = curQty + qty;
    const newAvg = (curQty * curAvg + qty * price) / newQty;
    await sb.from('mock_holdings').upsert(
      { username: user, tab, code, name, qty: newQty, avg_cost: newAvg, updated_at: new Date().toISOString() },
      { onConflict: 'username,tab,code' },
    );
    await sb.from('mock_accounts').update({ cash: acct.cash - amount, updated_at: new Date().toISOString() }).eq('username', user);
  } else {
    if (qty > curQty + 1e-9) throw new Error('보유 수량이 부족합니다');
    const rest = curQty - qty;
    if (rest <= 1e-9) {
      await sb.from('mock_holdings').delete().eq('username', user).eq('tab', tab).eq('code', code);
    } else {
      await sb.from('mock_holdings').update({ qty: rest, updated_at: new Date().toISOString() })
        .eq('username', user).eq('tab', tab).eq('code', code);
    }
    await sb.from('mock_accounts').update({ cash: acct.cash + amount, updated_at: new Date().toISOString() }).eq('username', user);
  }

  await sb.from('mock_trades').insert({ username: user, tab, code, name, side, qty, price, amount });
  invalidateBoard();
  return getAccount(user);
}

// 재충전(리스타트): 총자산이 시드 이하 + 오늘 아직 안 했을 때만. 기존 자산 몰수 → 시드로 리셋.
export async function reset(user: string): Promise<AccountView> {
  const sb = getSupabase();
  if (!sb) throw new Error('supabase 미설정');
  const acct = await ensureAccount(user);
  const today = kstToday();
  if (acct.last_reset === today) throw new Error('오늘은 이미 재충전했습니다. 내일 다시 도전하세요');

  // 총자산 재계산(현재가) — 시드 초과면 재충전 불가(수익 중엔 리셋 의미 없음).
  const { data: rows } = await sb.from('mock_holdings').select('tab, code, qty').eq('username', user);
  const raw = (rows ?? []) as { tab: MockTab; code: string; qty: number }[];
  const prices = await priceMany(raw.map((r) => ({ tab: r.tab, code: r.code })));
  const holdingsValue = raw.reduce((s, r) => s + r.qty * (prices.get(`${r.tab}:${r.code}`) ?? 0), 0);
  const totalAsset = acct.cash + holdingsValue;
  if (totalAsset > SEED) throw new Error('총자산이 시드(1,000만원)를 넘어 재충전할 수 없습니다');

  await sb.from('mock_holdings').delete().eq('username', user);
  await sb.from('mock_accounts').update({
    cash: SEED, last_reset: today, resets: acct.resets + 1, updated_at: new Date().toISOString(),
  }).eq('username', user);
  await sb.from('mock_trades').insert({ username: user, tab: '-', code: '-', name: '재충전(리스타트)', side: 'reset', amount: SEED });
  invalidateBoard();
  return getAccount(user);
}

// ── 랭킹(총자산) ──
export interface BoardRow { rank: number; name: string; totalAsset: number; pnlPct: number; isMe?: boolean }

let boardCache: { at: number; rows: { username: string; totalAsset: number }[] } | null = null;
const BOARD_TTL = 60_000; // 60초 캐시(전 종목 배치 시세 호출 절감)
function invalidateBoard() { boardCache = null; }

// 전 유저 총자산 산정(배치 시세 1회). 60초 캐시.
async function computeBoard(): Promise<{ username: string; totalAsset: number }[]> {
  if (boardCache && Date.now() - boardCache.at < BOARD_TTL) return boardCache.rows;
  const sb = getSupabase();
  if (!sb) return [];
  const [{ data: accts }, { data: hs }] = await Promise.all([
    sb.from('mock_accounts').select('username, cash'),
    sb.from('mock_holdings').select('username, tab, code, qty'),
  ]);
  const holdings = (hs ?? []) as { username: string; tab: MockTab; code: string; qty: number }[];
  const prices = await priceMany(holdings.map((h) => ({ tab: h.tab, code: h.code })));
  const total = new Map<string, number>();
  for (const a of (accts ?? []) as { username: string; cash: number }[]) total.set(a.username, Number(a.cash));
  for (const h of holdings) {
    const p = prices.get(`${h.tab}:${h.code}`) ?? 0;
    total.set(h.username, (total.get(h.username) ?? 0) + h.qty * p);
  }
  const rows = [...total.entries()].map(([username, totalAsset]) => ({ username, totalAsset }))
    .sort((a, b) => b.totalAsset - a.totalAsset);
  boardCache = { at: Date.now(), rows };
  return rows;
}

async function myRank(user: string, totalAsset: number): Promise<{ rank: number | null; players: number }> {
  const rows = await computeBoard();
  const players = rows.length;
  const idx = rows.findIndex((r) => r.username === user);
  // 방금 매매로 캐시가 stale일 수 있어 내 값은 인자로 받은 최신 총자산으로 순위 재산정.
  if (idx < 0) return { rank: null, players };
  const rank = rows.filter((r) => r.username !== user && r.totalAsset > totalAsset).length + 1;
  return { rank, players };
}

// 리더보드 상위 + 닉네임. 로그인 유저 표시용.
export async function leaderboard(me: string, limit = 50): Promise<BoardRow[]> {
  const rows = await computeBoard();
  const top = rows.slice(0, limit);
  const sb = getSupabase();
  const names = new Map<string, string>();
  if (sb && top.length) {
    const { data } = await sb.from('app_users').select('username, display_name').in('username', top.map((r) => r.username));
    for (const u of (data ?? []) as { username: string; display_name: string | null }[]) {
      if (u.display_name) names.set(u.username, u.display_name);
    }
  }
  return top.map((r, i) => ({
    rank: i + 1,
    name: names.get(r.username) || '익명',
    totalAsset: r.totalAsset,
    pnlPct: ((r.totalAsset - SEED) / SEED) * 100,
    isMe: r.username === me,
  }));
}
