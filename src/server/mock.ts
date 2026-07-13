import 'server-only';
import { getSupabase } from './supabase';
import { getKrQuote, getKrQuotes } from './providers/kis';
import { getUpbitQuotes } from './providers/upbit';

// ── 모의투자 엔진 (2트랙: 분기 시즌 + 장기) ──
// 씨드 1,000만원(원화 고정). 매매·재충전 규칙·체결가 모두 서버에서만 판정(시세 조작 불가).
// 두 계좌 종류(account_type):
//   · season   : 분기(YYYY-Qn)마다 랭킹 경쟁 → 분기 바뀌면 최종 기록 보관 + 1,000만으로 리셋
//   · longterm : 리셋 없는 영속 계좌(장기 투자 연습)
// MVP 거래 대상: 국내주식 + 국내코인(둘 다 원화·실시간).

export const SEED = 10_000_000;
export type MockTab = 'kr_stock' | 'kr_coin';
export const MOCK_TABS: MockTab[] = ['kr_stock', 'kr_coin'];
export type AcctKind = 'season' | 'longterm';
export const ACCT_KINDS: AcctKind[] = ['season', 'longterm'];

// KST 오늘(YYYY-MM-DD).
export function kstToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}
// 현재 분기 키(KST) — 예: 2026-Q3.
export function seasonKey(): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric' }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = Number(parts.find((p) => p.type === 'month')!.value);
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

export interface HoldingRow {
  tab: MockTab; code: string; name: string; qty: number; avgCost: number;
  price: number; value: number; cost: number; pnl: number; pnlPct: number;
}
export interface AccountView {
  kind: AcctKind; season: string | null;
  cash: number; holdings: HoldingRow[]; holdingsValue: number; totalAsset: number;
  pnl: number; pnlPct: number; canReset: boolean; resets: number; seed: number;
  rank: number | null; players: number;
}
export interface BoardRow { rank: number; name: string; totalAsset: number; pnlPct: number; isMe?: boolean }
export interface AllocSeg { name: string; value: number; pct: number; tab: MockTab | 'cash' }
export interface SnapPoint { date: string; total: number }
export interface SeasonRecord { season: string; finalAsset: number; returnPct: number; rank: number | null; players: number | null }

interface RawHolding { tab: MockTab; code: string; name: string; qty: number; avg_cost: number }

// ── 시세 조회(서버 전용) ──
// KIS 단일시세가 순간 제한으로 0/실패를 뱉는 경우가 있어 짧게 재시도한다.
export async function getExecPrice(tab: MockTab, code: string): Promise<number> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      let price = 0;
      if (tab === 'kr_stock') price = (await getKrQuote(code)).price;
      else price = (await getUpbitQuotes([code]))[code]?.price ?? 0;
      if (price > 0) return price;
    } catch (e) { last = e; }
    if (i < 2) await sleep(400);
  }
  console.error('[mock getExecPrice]', tab, code, (last as Error)?.message ?? 'price<=0');
  throw new Error('시세를 가져올 수 없습니다. 잠시 후 다시 시도해 주세요');
}

// 여러 종목 배치 시세(계좌 평가·랭킹용).
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

// 시즌 계좌 1개를 롤오버(분기 바뀜): 최종 기록 보관 + 자산 몰수 + 1,000만 리셋.
async function rolloverOne(user: string, old: { cash: number; season: string | null; resets: number }): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { data: rows } = await sb.from('mock_holdings').select('tab, code, qty').eq('username', user).eq('account_type', 'season');
  const raw = (rows ?? []) as { tab: MockTab; code: string; qty: number }[];
  const prices = await priceMany(raw.map((r) => ({ tab: r.tab, code: r.code })));
  const hv = raw.reduce((s, r) => s + r.qty * (prices.get(`${r.tab}:${r.code}`) ?? 0), 0);
  const total = Number(old.cash) + hv;
  if (old.season) {
    await sb.from('mock_season_records').upsert(
      { username: user, season: old.season, final_asset: Math.round(total), return_pct: (total / SEED - 1) * 100, resets: Number(old.resets) },
      { onConflict: 'username,season', ignoreDuplicates: true }, // 크론이 rank까지 채워 이미 넣었으면 보존
    );
  }
  await sb.from('mock_holdings').delete().eq('username', user).eq('account_type', 'season');
  await sb.from('mock_accounts').update({ cash: SEED, season: seasonKey(), resets: 0, last_reset: null, updated_at: new Date().toISOString() })
    .eq('username', user).eq('account_type', 'season');
}

// 계좌 보장(없으면 시드로 생성). 시즌 계좌가 지난 분기면 롤오버.
async function ensureAccount(user: string, kind: AcctKind): Promise<{ cash: number; last_reset: string | null; resets: number; season: string | null }> {
  const sb = getSupabase();
  if (!sb) throw new Error('supabase 미설정');
  const { data } = await sb.from('mock_accounts').select('cash, last_reset, resets, season').eq('username', user).eq('account_type', kind).maybeSingle();
  if (data) {
    if (kind === 'season' && data.season !== seasonKey()) {
      await rolloverOne(user, { cash: Number(data.cash), season: data.season as string | null, resets: Number(data.resets) });
      return { cash: SEED, last_reset: null, resets: 0, season: seasonKey() };
    }
    return { cash: Number(data.cash), last_reset: data.last_reset as string | null, resets: Number(data.resets), season: data.season as string | null };
  }
  const season = kind === 'season' ? seasonKey() : null;
  await sb.from('mock_accounts').insert({ username: user, account_type: kind, cash: SEED, season });
  return { cash: SEED, last_reset: null, resets: 0, season };
}

// 내 계좌 뷰(현재가 평가 + 손익 + 순위) + 오늘 스냅샷 upsert(그래프 데이터 즉시 확보).
export async function getAccount(user: string, kind: AcctKind): Promise<AccountView> {
  const sb = getSupabase();
  if (!sb) throw new Error('supabase 미설정');
  const acct = await ensureAccount(user, kind);
  const { data: rows } = await sb.from('mock_holdings').select('tab, code, name, qty, avg_cost').eq('username', user).eq('account_type', kind);
  const raw = (rows ?? []) as RawHolding[];
  const prices = await priceMany(raw.map((r) => ({ tab: r.tab, code: r.code })));

  const holdings: HoldingRow[] = raw.map((r) => {
    const price = prices.get(`${r.tab}:${r.code}`) ?? r.avg_cost;
    const value = r.qty * price;
    const cost = r.qty * r.avg_cost;
    return { tab: r.tab, code: r.code, name: r.name, qty: r.qty, avgCost: r.avg_cost, price, value, cost, pnl: value - cost, pnlPct: cost > 0 ? ((value - cost) / cost) * 100 : 0 };
  }).sort((a, b) => b.value - a.value);

  const holdingsValue = holdings.reduce((s, h) => s + h.value, 0);
  const totalAsset = acct.cash + holdingsValue;
  const pnl = totalAsset - SEED;
  const canReset = totalAsset <= SEED && acct.last_reset !== kstToday();
  const { rank, players } = await myRank(user, kind, totalAsset);

  // 오늘 스냅샷 upsert — 크론과 별개로 방문 시점 값을 남겨 선 그래프가 첫날부터 보이게.
  await sb.from('mock_snapshots').upsert(
    { username: user, account_type: kind, season: acct.season, date: kstToday(), total_asset: Math.round(totalAsset) },
    { onConflict: 'username,account_type,date' },
  );

  return { kind, season: acct.season, cash: acct.cash, holdings, holdingsValue, totalAsset, pnl, pnlPct: (pnl / SEED) * 100, canReset, resets: acct.resets, seed: SEED, rank, players };
}

// 매수/매도.
export async function trade(
  user: string, kind: AcctKind,
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
  const amount = Math.round(qty * price);
  const acct = await ensureAccount(user, kind);
  const { data: h } = await sb.from('mock_holdings').select('qty, avg_cost').eq('username', user).eq('account_type', kind).eq('tab', tab).eq('code', code).maybeSingle();
  const curQty = h ? Number(h.qty) : 0;
  const curAvg = h ? Number(h.avg_cost) : 0;

  if (side === 'buy') {
    if (amount > acct.cash) throw new Error('현금이 부족합니다');
    const newQty = curQty + qty;
    const newAvg = (curQty * curAvg + qty * price) / newQty;
    await sb.from('mock_holdings').upsert(
      { username: user, account_type: kind, tab, code, name, qty: newQty, avg_cost: newAvg, updated_at: new Date().toISOString() },
      { onConflict: 'username,account_type,tab,code' },
    );
    await sb.from('mock_accounts').update({ cash: acct.cash - amount, updated_at: new Date().toISOString() }).eq('username', user).eq('account_type', kind);
  } else {
    if (qty > curQty + 1e-9) throw new Error('보유 수량이 부족합니다');
    const rest = curQty - qty;
    if (rest <= 1e-9) await sb.from('mock_holdings').delete().eq('username', user).eq('account_type', kind).eq('tab', tab).eq('code', code);
    else await sb.from('mock_holdings').update({ qty: rest, updated_at: new Date().toISOString() }).eq('username', user).eq('account_type', kind).eq('tab', tab).eq('code', code);
    await sb.from('mock_accounts').update({ cash: acct.cash + amount, updated_at: new Date().toISOString() }).eq('username', user).eq('account_type', kind);
  }

  await sb.from('mock_trades').insert({ username: user, account_type: kind, tab, code, name, side, qty, price, amount });
  invalidateBoard();
  return getAccount(user, kind);
}

// 재충전(리스타트): 총자산 ≤ 시드 + 오늘 미실행일 때만. 기존 자산 몰수 → 시드로.
export async function reset(user: string, kind: AcctKind): Promise<AccountView> {
  const sb = getSupabase();
  if (!sb) throw new Error('supabase 미설정');
  const acct = await ensureAccount(user, kind);
  const today = kstToday();
  if (acct.last_reset === today) throw new Error('오늘은 이미 재충전했습니다. 내일 다시 도전하세요');
  const { data: rows } = await sb.from('mock_holdings').select('tab, code, qty').eq('username', user).eq('account_type', kind);
  const raw = (rows ?? []) as { tab: MockTab; code: string; qty: number }[];
  const prices = await priceMany(raw.map((r) => ({ tab: r.tab, code: r.code })));
  const holdingsValue = raw.reduce((s, r) => s + r.qty * (prices.get(`${r.tab}:${r.code}`) ?? 0), 0);
  if (acct.cash + holdingsValue > SEED) throw new Error('총자산이 시드(1,000만원)를 넘어 재충전할 수 없습니다');

  await sb.from('mock_holdings').delete().eq('username', user).eq('account_type', kind);
  await sb.from('mock_accounts').update({ cash: SEED, last_reset: today, resets: acct.resets + 1, updated_at: new Date().toISOString() }).eq('username', user).eq('account_type', kind);
  await sb.from('mock_trades').insert({ username: user, account_type: kind, tab: '-', code: '-', name: '재충전(리스타트)', side: 'reset', amount: SEED });
  invalidateBoard();
  return getAccount(user, kind);
}

// ── 랭킹(총자산) — kind별 ──
let boardCache: Record<AcctKind, { at: number; rows: { username: string; totalAsset: number }[] } | undefined> = { season: undefined, longterm: undefined };
const BOARD_TTL = 60_000;
function invalidateBoard() { boardCache = { season: undefined, longterm: undefined }; }

async function computeBoard(kind: AcctKind): Promise<{ username: string; totalAsset: number }[]> {
  const cached = boardCache[kind];
  if (cached && Date.now() - cached.at < BOARD_TTL) return cached.rows;
  const sb = getSupabase();
  if (!sb) return [];
  // season은 현재 분기 계좌만.
  let acctQ = sb.from('mock_accounts').select('username, cash, season').eq('account_type', kind);
  if (kind === 'season') acctQ = acctQ.eq('season', seasonKey());
  const [{ data: accts }, { data: hs }] = await Promise.all([
    acctQ,
    sb.from('mock_holdings').select('username, tab, code, qty').eq('account_type', kind),
  ]);
  const acctUsers = new Set((accts ?? []).map((a) => a.username as string));
  const holdings = ((hs ?? []) as { username: string; tab: MockTab; code: string; qty: number }[]).filter((h) => acctUsers.has(h.username));
  const prices = await priceMany(holdings.map((h) => ({ tab: h.tab, code: h.code })));
  const total = new Map<string, number>();
  for (const a of (accts ?? []) as { username: string; cash: number }[]) total.set(a.username, Number(a.cash));
  for (const h of holdings) total.set(h.username, (total.get(h.username) ?? 0) + h.qty * (prices.get(`${h.tab}:${h.code}`) ?? 0));
  const rows = [...total.entries()].map(([username, totalAsset]) => ({ username, totalAsset })).sort((a, b) => b.totalAsset - a.totalAsset);
  boardCache[kind] = { at: Date.now(), rows };
  return rows;
}

async function myRank(user: string, kind: AcctKind, totalAsset: number): Promise<{ rank: number | null; players: number }> {
  const rows = await computeBoard(kind);
  const players = rows.length;
  if (rows.findIndex((r) => r.username === user) < 0) return { rank: null, players };
  const rank = rows.filter((r) => r.username !== user && r.totalAsset > totalAsset).length + 1;
  return { rank, players };
}

export async function leaderboard(me: string, kind: AcctKind, limit = 50): Promise<BoardRow[]> {
  const rows = await computeBoard(kind);
  const top = rows.slice(0, limit);
  const sb = getSupabase();
  const names = new Map<string, string>();
  if (sb && top.length) {
    const { data } = await sb.from('app_users').select('username, display_name').in('username', top.map((r) => r.username));
    for (const u of (data ?? []) as { username: string; display_name: string | null }[]) if (u.display_name) names.set(u.username, u.display_name);
  }
  return top.map((r, i) => ({ rank: i + 1, name: names.get(r.username) || '익명', totalAsset: r.totalAsset, pnlPct: ((r.totalAsset - SEED) / SEED) * 100, isMe: r.username === me }));
}

// ── 히스토리(선 그래프 + 자산 비중 + 시즌 기록) ──
export async function history(user: string, kind: AcctKind): Promise<{ snapshots: SnapPoint[]; allocation: AllocSeg[]; seasonRecords: SeasonRecord[] }> {
  const sb = getSupabase();
  if (!sb) return { snapshots: [], allocation: [], seasonRecords: [] };
  const acct = await ensureAccount(user, kind);

  // 스냅샷: season은 현재 분기만, longterm은 최근 180일.
  let snapQ = sb.from('mock_snapshots').select('date, total_asset').eq('username', user).eq('account_type', kind).order('date', { ascending: true });
  if (kind === 'season') snapQ = snapQ.eq('season', acct.season);
  else snapQ = snapQ.limit(180);
  const { data: snaps } = await snapQ;
  const snapshots: SnapPoint[] = (snaps ?? []).map((s) => ({ date: s.date as string, total: Number(s.total_asset) }));

  // 자산 비중: 현재 보유 평가액 + 현금.
  const { data: rows } = await sb.from('mock_holdings').select('tab, code, name, qty').eq('username', user).eq('account_type', kind);
  const raw = (rows ?? []) as { tab: MockTab; code: string; name: string; qty: number }[];
  const prices = await priceMany(raw.map((r) => ({ tab: r.tab, code: r.code })));
  const segs: AllocSeg[] = raw.map((r) => ({ name: r.name, tab: r.tab, value: r.qty * (prices.get(`${r.tab}:${r.code}`) ?? 0), pct: 0 }));
  segs.push({ name: '현금', tab: 'cash', value: acct.cash, pct: 0 });
  const total = segs.reduce((s, x) => s + x.value, 0) || 1;
  for (const s of segs) s.pct = (s.value / total) * 100;
  segs.sort((a, b) => b.value - a.value);

  // 시즌 기록(season 종류만).
  let seasonRecords: SeasonRecord[] = [];
  if (kind === 'season') {
    const { data: recs } = await sb.from('mock_season_records').select('season, final_asset, return_pct, rank, players').eq('username', user).order('season', { ascending: false });
    seasonRecords = (recs ?? []).map((r) => ({ season: r.season as string, finalAsset: Number(r.final_asset), returnPct: Number(r.return_pct), rank: r.rank as number | null, players: r.players as number | null }));
  }
  return { snapshots, allocation: segs.filter((s) => s.value > 0), seasonRecords };
}

// ── 크론: 전 계좌 일별 스냅샷 + 분기 롤오버(rank 포함) ──
export async function snapshotAll(): Promise<{ snapshots: number; rolled: number }> {
  const sb = getSupabase();
  if (!sb) return { snapshots: 0, rolled: 0 };
  const today = kstToday();
  const curSeason = seasonKey();
  const [{ data: accts }, { data: hs }] = await Promise.all([
    sb.from('mock_accounts').select('username, account_type, season, cash, resets'),
    sb.from('mock_holdings').select('username, account_type, tab, code, qty'),
  ]);
  const A = (accts ?? []) as { username: string; account_type: AcctKind; season: string | null; cash: number; resets: number }[];
  const H = (hs ?? []) as { username: string; account_type: AcctKind; tab: MockTab; code: string; qty: number }[];
  const prices = await priceMany(H.map((h) => ({ tab: h.tab, code: h.code })));
  const totals = new Map<string, number>();
  for (const a of A) totals.set(`${a.username}|${a.account_type}`, Number(a.cash));
  for (const h of H) { const k = `${h.username}|${h.account_type}`; totals.set(k, (totals.get(k) ?? 0) + h.qty * (prices.get(`${h.tab}:${h.code}`) ?? 0)); }

  // 1) 오늘 스냅샷 전부
  const snapRows = A.map((a) => ({ username: a.username, account_type: a.account_type, season: a.season, date: today, total_asset: Math.round(totals.get(`${a.username}|${a.account_type}`) ?? 0) }));
  if (snapRows.length) await sb.from('mock_snapshots').upsert(snapRows, { onConflict: 'username,account_type,date' });

  // 2) 분기 롤오버 (season 계좌 중 season != 현재)
  const stale = A.filter((a) => a.account_type === 'season' && a.season !== curSeason);
  const byOld: Record<string, typeof stale> = {};
  for (const a of stale) (byOld[a.season ?? '?'] ??= []).push(a);
  let rolled = 0;
  for (const [oldSeason, group] of Object.entries(byOld)) {
    const ranked = group.map((a) => ({ ...a, total: totals.get(`${a.username}|season`) ?? 0 })).sort((x, y) => y.total - x.total);
    const players = ranked.length;
    for (let i = 0; i < ranked.length; i++) {
      const a = ranked[i];
      await sb.from('mock_season_records').upsert(
        { username: a.username, season: oldSeason, final_asset: Math.round(a.total), return_pct: (a.total / SEED - 1) * 100, rank: i + 1, players, resets: Number(a.resets) },
        { onConflict: 'username,season' },
      );
    }
    const users = group.map((a) => a.username);
    await sb.from('mock_holdings').delete().eq('account_type', 'season').in('username', users);
    await sb.from('mock_accounts').update({ cash: SEED, season: curSeason, resets: 0, last_reset: null, updated_at: new Date().toISOString() }).eq('account_type', 'season').in('username', users);
    rolled += group.length;
  }
  invalidateBoard();
  return { snapshots: snapRows.length, rolled };
}
