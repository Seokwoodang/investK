// 섹터 분류 체계 위의 헬퍼 — 서버·클라이언트 공용. 데이터는 src/data/sectors.ts.
import type { SectorPhase } from '@/types';
import { SECTOR_DEFS, type SectorDef, type SectorMarket } from '@/data/sectors';

export type { SectorDef, SectorLeader, SectorMarket } from '@/data/sectors';

export const sectorsOf = (market: SectorMarket): SectorDef[] => SECTOR_DEFS.filter((d) => d.market === market);

export const sectorByKey = (key: string): SectorDef | null => SECTOR_DEFS.find((d) => d.key === key) ?? null;

// 서버 화이트리스트용 — 클라이언트가 보낸 문자열이 실제 섹터 키인지. 자유 문자열 저장 금지.
export const isSectorKey = (v: unknown): v is string => typeof v === 'string' && SECTOR_DEFS.some((d) => d.key === v);

export function parseSectorKey(key: string): { market: SectorMarket; name: string } | null {
  const i = key.indexOf(':');
  if (i < 0) return null;
  const market = key.slice(0, i);
  if (market !== 'kr' && market !== 'us') return null;
  return { market, name: key.slice(i + 1) };
}

// US 대표종목 ref는 네이버 RIC(NVDA.O)이지만 유니버스 티커는 순수 심볼(NVDA)이다.
export const bareRef = (ref: string): string => ref.split('.')[0];

// 섹터 상태 칩 스타일 — 추세 확정(올라/내려)은 초록/빨강, 전환(반등/꺾임)은 주황, 횡보는 회색.
export const PHASE_META: Record<SectorPhase, { label: string; arrow: string; c: string; bg: string }> = {
  up: { label: '올라가는중', arrow: '↗', c: 'var(--c-upbr)', bg: 'var(--c-gn22)' },
  down: { label: '내려가는중', arrow: '↘', c: 'var(--c-downbr)', bg: 'var(--c-rd22)' },
  rebound: { label: '반등중', arrow: '↗', c: 'var(--c-warnchip)', bg: 'var(--c-am16)' },
  rollover: { label: '꺾이는중', arrow: '↘', c: 'var(--c-warnchip)', bg: 'var(--c-am16)' },
  flat: { label: '횡보중', arrow: '→', c: 'var(--c-tx4b)', bg: 'var(--c-gy18)' },
};
