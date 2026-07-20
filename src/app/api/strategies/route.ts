import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE, getSessionUser } from '@/lib/auth';
import { getSupabase } from '@/server/supabase';
import { loadBacktestCache } from '@/server/backtest/cache';
import { runBacktest, type BacktestConfig, type StrategyId, type Rebalance } from '@/server/backtest/engine';

// 로그인 사용자의 백테스트 전략 저장/목록/삭제. 공유는 클라이언트에서 config를 URL 쿼리로 인라인 인코딩하므로
// 여기엔 공개 조회 엔드포인트가 없다(링크가 DB에 의존하지 않아 영구히 동작). 미들웨어가 인증을 이미 강제.
//  · GET: 내 저장 목록 + "저장 후 포워드 성과"(saved_at→오늘 재실행: 전략 vs 시장). 과최적화 방지 지표.
//  · POST: 현재 설정 저장(saved_at = 오늘 KST).
//  · DELETE ?id=: 내 전략 삭제.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const START_CAPITAL = 10_000_000;
const STRATS: StrategyId[] = ['momentum', 'ma_trend', 'low_vol', 'buy_hold'];
const clamp = (v: number, lo: number, hi: number, dflt: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);
const kstDate = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export interface StoredConfig {
  strategy: StrategyId;
  topN: number;
  lookbackDays: number;
  maWindow: number;
  rebalance: Rebalance;
  costBps: number;
  years: number;
  contribMode?: 'lumpsum' | 'dca';
  seed?: number;
  contribAmount?: number;
  contribEvery?: Rebalance;
}

// 사용자 입력 config를 백테스트와 동일 범위로 정제(경계값 클램프).
function sanitize(raw: Record<string, unknown>): StoredConfig {
  const dca = raw.contribMode === 'dca';
  return {
    strategy: STRATS.includes(raw.strategy as StrategyId) ? (raw.strategy as StrategyId) : 'momentum',
    topN: clamp(Number(raw.topN), 1, 50, 20),
    lookbackDays: clamp(Number(raw.lookbackDays), 20, 500, 120),
    maWindow: clamp(Number(raw.maWindow), 20, 300, 120),
    rebalance: raw.rebalance === 'M' ? 'M' : 'Q',
    costBps: clamp(Number(raw.costBps), 0, 100, 20),
    years: clamp(Number(raw.years), 1, 15, 10),
    contribMode: dca ? 'dca' : 'lumpsum',
    seed: clamp(Number(raw.seed), 0, 1_000_000_000, dca ? 0 : 10_000_000),
    contribAmount: clamp(Number(raw.contribAmount), 10_000, 100_000_000, 500_000),
    contribEvery: raw.contribEvery === 'Q' ? 'Q' : 'M',
  };
}

async function currentUser(): Promise<string | null> {
  return getSessionUser(cookies().get(COOKIE)?.value);
}

interface Forward { days: number; ret: number | null; benchRet: number | null }

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ strategies: [] });

  const { data, error } = await sb
    .from('saved_strategies')
    .select('id, name, config, saved_at, created_at')
    .eq('username', user)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as { id: string; name: string; config: StoredConfig; saved_at: string; created_at: string }[];

  // 저장 후 포워드 성과: 각 전략을 saved_at→오늘 구간으로 재실행(캐시 1회 로드 후 인메모리 실행).
  // 캐시가 없거나 실패해도 목록 자체는 반환(성과만 null).
  const today = kstDate();
  const forwards: Record<string, Forward> = {};
  try {
    const cache = await loadBacktestCache();
    if (cache && cache.snapshots.length) {
      for (const r of rows) {
        const from = String(r.saved_at).slice(0, 10);
        if (from >= today) { forwards[r.id] = { days: 0, ret: null, benchRet: null }; continue; }
        const sc = sanitize(r.config as unknown as Record<string, unknown>);
        const cfg: BacktestConfig = { ...sc, startCapital: sc.seed ?? START_CAPITAL, from, to: today };
        try {
          const res = runBacktest(cfg, cache.priceMap, cache.snapshots);
          forwards[r.id] = { days: res.metrics.days, ret: res.metrics.totalReturn, benchRet: res.benchMetrics.totalReturn };
        } catch {
          forwards[r.id] = { days: 0, ret: null, benchRet: null };
        }
      }
    }
  } catch { /* 캐시 실패 시 성과 생략 */ }

  return NextResponse.json({
    strategies: rows.map((r) => ({ id: r.id, name: r.name, config: sanitize(r.config as unknown as Record<string, unknown>), savedAt: String(r.saved_at).slice(0, 10), forward: forwards[r.id] ?? null })),
  });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'supabase 미설정' }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { name?: unknown; config?: unknown };
  const name = (typeof b.name === 'string' ? b.name : '').trim().slice(0, 60) || '내 전략';
  if (!b.config || typeof b.config !== 'object') return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const config = sanitize(b.config as Record<string, unknown>);

  // 사용자당 저장 개수 상한(폭주 방지).
  const { count } = await sb.from('saved_strategies').select('id', { count: 'exact', head: true }).eq('username', user);
  if ((count ?? 0) >= 50) return NextResponse.json({ error: '저장 개수 상한(50개)에 도달했어요. 기존 전략을 지우고 다시 시도해 주세요.' }, { status: 409 });

  const { data, error } = await sb
    .from('saved_strategies')
    .insert({ username: user, name, config, saved_at: kstDate() })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id });
}

export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'supabase 미설정' }, { status: 503 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });
  const { error } = await sb.from('saved_strategies').delete().eq('id', id).eq('username', user);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
