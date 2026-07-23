import { NextResponse } from 'next/server';
import { getSupabase } from '@/server/supabase';
import { has } from '@/server/env';
import { getUniverse } from '@/server/data';
import { getDisclosures } from '@/server/providers/dart';
import { getFundamentals } from '@/server/providers/naverFundamentals';
import { getUsFundamentals } from '@/server/providers/yahoo';
import { sendPush, cleanupPushSent } from '@/server/push';
import { getBriefing } from '@/server/briefing';
import { getCachedRankedNews } from '@/server/aiNews';
import { NEWS_TABS } from '@/server/news';
import type { Stock, Stocks, TabId } from '@/types';

// 알림 판정 크론(GitHub Actions에서 ~20분 간격 호출).
//  ① 급등락(swing): 알림 설정 종목의 당일 등락률 ±5% 이상 → 하루 1회
//  ② 목표가 도달(target): 현재가 ≥ 컨센서스 목표가 → 하루 1회
//  ③ 위험도(risk): 위험도 high 진입 시 1회
//  ④ 새 공시: 내 보유 국내 종목의 DART 주요 공시(수주·실적 등) → 공시당 1회
// 판정 대상 = 푸시 구독자(push_subs에 기기가 있는 사용자)만. dedupe는 push_sent가 담당.
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const kstDate = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const isKrCode = (s: string) => /^\d{6}$/.test(s);
const SWING_PCT = 5;

interface Holding { id?: string; ticker?: string }

export async function GET(req: Request) {
  // fail-closed: CRON_SECRET 미설정 배포에서도 절대 공개되지 않게(설정 누락 = 전부 거부).
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sb = getSupabase();
  if (!sb || !has.push()) return NextResponse.json({ error: 'not configured' }, { status: 503 });

  // 1) 구독자 목록(기기 있는 사용자만 — 없는 사용자는 판정 자체를 스킵해 비용 절약)
  const { data: subRows } = await sb.from('push_subs').select('username');
  const users = [...new Set((subRows ?? []).map((r) => r.username as string))];
  if (!users.length) return NextResponse.json({ ok: true, users: 0, sent: 0 });

  // 2) 사용자별 알림 설정 + 보유 종목
  const [{ data: alertRows }, { data: pfRows }] = await Promise.all([
    sb.from('user_alerts').select('username, alerts').in('username', users),
    sb.from('portfolios').select('username, holdings').in('username', users),
  ]);
  const alertsBy = new Map<string, Record<string, string[]>>();
  (alertRows ?? []).forEach((r) => alertsBy.set(r.username as string, (r.alerts as Record<string, string[]>) ?? {}));
  const holdingsBy = new Map<string, Holding[]>();
  (pfRows ?? []).forEach((r) => holdingsBy.set(r.username as string, ((r.holdings as Holding[]) ?? [])));

  // 3) 시세·위험도 맵(유니버스 1회 로드, 전 사용자 공용)
  const universe: Stocks = await getUniverse();
  const byId = new Map<string, Stock>();
  (Object.keys(universe) as TabId[]).forEach((t) => universe[t].forEach((s) => byId.set(s.id, s)));

  const today = kstDate();
  let sent = 0;
  const fundCache = new Map<string, number | null>(); // 목표가 캐시(종목당 1회 조회)

  async function targetOf(s: Stock): Promise<number | null> {
    const key = s.id;
    if (fundCache.has(key)) return fundCache.get(key)!;
    let t: number | null = null;
    try {
      if (isKrCode(s.id)) t = (await getFundamentals(s.id))?.targetPrice ?? null;
      else if (s.cur === '$' && /^[A-Z.]+$/.test(s.ticker)) t = (await getUsFundamentals(s.ticker))?.target ?? null;
    } catch { /* 목표가 없으면 스킵 */ }
    fundCache.set(key, t);
    return t;
  }

  // 카테고리(_cats) 켜져 있으면 카테고리×보유종목 전체에 적용, 없으면(레거시) per-stock 맵 사용.
  const catsOf = (u: string): string[] => {
    const st = (alertsBy.get(u) ?? {}) as Record<string, unknown>;
    return Array.isArray(st._cats)
      ? (st._cats as string[])
      : [...new Set(Object.entries(st).filter(([k]) => k !== '_cats').flatMap(([, v]) => (Array.isArray(v) ? (v as string[]) : [])))];
  };
  const usesCats = (u: string) => Array.isArray((alertsBy.get(u) ?? {} as Record<string, unknown>)._cats);

  // 4) 사용자별 판정(종목 기반: swing/target/risk)
  for (const user of users) {
    const st = (alertsBy.get(user) ?? {}) as Record<string, string[]>;
    const cats = catsOf(user);
    const targets: { s: Stock; keys: string[] }[] = usesCats(user)
      ? (holdingsBy.get(user) ?? [])
          .map((h) => byId.get(h.id ?? '') || byId.get(h.ticker ?? ''))
          .filter((s): s is Stock => !!s)
          .map((s) => ({ s, keys: cats }))
      : Object.entries(st)
          .filter(([id]) => id !== '_cats')
          .map(([id, keys]) => ({ s: byId.get(id) as Stock | undefined, keys }))
          .filter((t): t is { s: Stock; keys: string[] } => !!t.s);

    for (const { s, keys } of targets) {
      const id = s.id;
      const url = `/instrument/${encodeURIComponent(id)}`;

      if (keys.includes('swing') && Math.abs(s.pct) >= SWING_PCT) {
        const dir = s.pct > 0 ? '급등' : '급락';
        const ok = await sendPush(user, {
          title: `${s.name} ${s.pct > 0 ? '+' : ''}${s.pct.toFixed(1)}% ${dir}`,
          body: `당일 변동률이 ±${SWING_PCT}%를 넘었습니다. 현재가 ${s.cur}${s.price.toLocaleString()}`,
          url, tag: `swing-${id}`,
        }, `swing:${id}:${today}`);
        if (ok) sent++;
      }

      if (keys.includes('target')) {
        const target = await targetOf(s);
        if (target != null && target > 0 && s.price >= target) {
          const ok = await sendPush(user, {
            title: `${s.name} 목표가 도달`,
            body: `현재가 ${s.cur}${s.price.toLocaleString()} ≥ 컨센서스 목표가 ${s.cur}${target.toLocaleString()}`,
            url, tag: `target-${id}`,
          }, `target:${id}:${today}`);
          if (ok) sent++;
        }
      }

      if (keys.includes('risk') && s.risk === 'high') {
        const ok = await sendPush(user, {
          title: `${s.name} 위험도 높음`,
          body: '변동성·수급 기준 위험도가 높음 단계입니다. 포지션 점검을 권장합니다.',
          url, tag: `risk-${id}`,
        }, `risk:${id}:high`); // 등급 진입당 1회(매일 반복 안 함)
        if (ok) sent++;
      }
    }
  }

  // 5) 새 공시(보유 국내 종목) — 전 사용자 코드 합쳐 1회 조회 후 사용자별 매칭
  let discSent = 0;
  if (has.dart()) {
    const codesBy = new Map<string, Set<string>>();
    for (const user of users) {
      if (usesCats(user) && !catsOf(user).includes('disc')) continue; // 카테고리 모델: 공시 끔이면 스킵
      const set = new Set<string>();
      (holdingsBy.get(user) ?? []).forEach((h) => {
        const t = h.ticker ?? h.id ?? '';
        if (isKrCode(t)) set.add(t);
      });
      if (set.size) codesBy.set(user, set);
    }
    const allCodes = [...new Set([...codesBy.values()].flatMap((s) => [...s]))];
    if (allCodes.length) {
      const discs = await getDisclosures(allCodes, 2, 5); // 최근 2일 = 크론 간격 대비 충분
      for (const [user, codes] of codesBy) {
        for (const d of discs) {
          if (!codes.has(d.code)) continue;
          const rcp = d.url.match(/rcpNo=(\d+)/)?.[1] ?? `${d.code}:${d.date}:${d.title}`;
          const name = byId.get(d.code)?.name ?? d.code;
          const ok = await sendPush(user, {
            title: `${name} 새 공시 · ${d.kind}`,
            body: d.title,
            url: d.url, tag: `disc-${d.code}`,
          }, `disc:${rcp}`);
          if (ok) { sent++; discSent++; }
        }
      }
    }
  }

  // 6) 글로벌 카테고리 — 대시보드 브리핑 / 주요 뉴스(구독자 중 켠 사람에게, 새 콘텐츠 1회씩).
  const briefUsers = users.filter((u) => catsOf(u).includes('brief'));
  const newsUsers = users.filter((u) => catsOf(u).includes('news'));

  if (briefUsers.length) {
    try {
      const b = await getBriefing(today);
      if (b?.headline) {
        const dk = `brief:${today}:${b._slot}`; // 슬롯(am/pm/ny)당 1회
        for (const u of briefUsers) if (await sendPush(u, { title: '오늘의 브리핑', body: b.headline, url: '/', tag: 'brief' }, dk)) sent++;
      }
    } catch { /* 브리핑 없으면 스킵 */ }
  }

  if (newsUsers.length) {
    try {
      let top = '';
      for (const tab of NEWS_TABS) {
        const ranked = await getCachedRankedNews(`page:${tab}`);
        const hit = (ranked ?? []).find((n) => n.importance === '상');
        if (hit) { top = hit.title; break; }
      }
      if (top) {
        const dk = `news:${today}:${top.slice(0, 40)}`; // 같은 제목 하루 1회
        for (const u of newsUsers) if (await sendPush(u, { title: '주요 뉴스', body: top, url: '/news', tag: 'news' }, dk)) sent++;
      }
    } catch { /* 뉴스 없으면 스킵 */ }
  }

  await cleanupPushSent();
  return NextResponse.json({ ok: true, users: users.length, sent, discSent });
}
