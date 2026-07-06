import type { MacroEvent } from '../types';

export interface CalChip {
  name: string;
  bg: string;
  color: string;
  border?: string; // 내 보유·관심 종목 실적이면 강조 테두리
}

export interface CalCell {
  show: boolean;
  day: number | '';
  today: boolean;
  dayColor: string;
  cellBorder: string;
  cellBg: string;
  minHeight: string;
  hasDot: boolean;
  dotColor: string;
  showLabels: boolean;
  chips: CalChip[];
  hasMore: boolean;
  moreText: string;
}

export interface CalWeek {
  days: CalCell[];
}

const chipBg = (t: string) => (t === '고영향' ? 'var(--c-rd16)' : t === '실적' ? 'var(--c-cy16)' : 'var(--c-am16)');
const chipCol = (t: string) => (t === '고영향' ? 'var(--c-downchip)' : t === '실적' ? 'var(--c-accyanbr)' : 'var(--c-warnchip)');

// 임의 (year, month) 달의 그리드를 만든다. today가 그 달에 속할 때만 오늘 칸을 강조.
export function buildCalendar(
  events: MacroEvent[],
  vw: number,
  year: number,
  month: number,
  today: { y: number; m: number; d: number } | null,
): CalWeek[] {
  const todayDay = today && today.y === year && today.m === month ? today.d : -1;
  const startDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const showLabels = vw >= 720;
  const minH = showLabels ? '86px' : '46px';

  const byDate: Record<number, MacroEvent[]> = {};
  events.forEach((e) => {
    const d = parseInt(e.date.slice(8, 10), 10);
    (byDate[d] = byDate[d] || []).push(e);
  });

  const emptyCell = (): CalCell => ({
    show: false, day: '', today: false, dayColor: '', cellBorder: 'transparent', cellBg: 'transparent',
    minHeight: minH, hasDot: false, dotColor: '', showLabels: false, chips: [], hasMore: false, moreText: '',
  });

  const cells: CalCell[] = [];
  for (let i = 0; i < startDay; i++) cells.push(emptyCell());
  for (let day = 1; day <= daysInMonth; day++) {
    const evs = byDate[day] || [];
    const wd = (startDay + day - 1) % 7;
    const today = day === todayDay;
    const hasHigh = evs.some((e) => e.tag === '고영향');
    const hasMid = evs.some((e) => e.tag === '중간');
    const hasMine = evs.some((e) => e.mine); // 내 보유·관심 종목 실적이 있는 날
    const dayColor = today ? 'var(--c-accyan)' : wd === 0 ? 'var(--c-rdsun)' : wd === 6 ? 'var(--c-acblue)' : 'var(--c-tx3)';
    // 내 종목 실적이 먼저 보이게 정렬 후 칩 2개 노출. mine 칩엔 강조 테두리.
    const sorted = showLabels ? [...evs].sort((a, b) => Number(!!b.mine) - Number(!!a.mine)) : evs;
    const chips = (showLabels ? sorted.slice(0, 2) : []).map((e) => ({
      name: e.name, bg: chipBg(e.tag), color: chipCol(e.tag), border: e.mine ? 'var(--c-cy45)' : undefined,
    }));
    const moreN = evs.length - chips.length;
    cells.push({
      show: true, day, today, dayColor,
      // 오늘 > 내 종목 실적 > 기본 순으로 셀 테두리 강조(라벨 없는 좁은 화면에서도 보이게)
      cellBorder: today ? 'var(--c-cy45)' : hasMine ? 'var(--c-cy30)' : 'var(--c-w05)',
      cellBg: today ? 'var(--c-cy10)' : 'var(--c-w02)',
      minHeight: minH,
      // 점 색 우선순위: 고영향(빨강) > 중간(앰버) > 실적만 있는 날(시안)
      hasDot: evs.length > 0, dotColor: hasHigh ? 'var(--c-down)' : hasMid ? 'var(--c-warn)' : 'var(--c-accyan)',
      showLabels, chips, hasMore: showLabels && moreN > 0, moreText: '+' + moreN + '건',
    });
  }
  while (cells.length % 7 !== 0) cells.push(emptyCell());

  const weeks: CalWeek[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push({ days: cells.slice(i, i + 7) });
  return weeks;
}
