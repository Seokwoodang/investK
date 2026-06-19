import type { MacroEvent } from '../types';

export interface CalChip {
  name: string;
  bg: string;
  color: string;
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

const chipBg = (t: string) => (t === '고영향' ? 'rgba(246,104,94,0.16)' : 'rgba(245,181,68,0.16)');
const chipCol = (t: string) => (t === '고영향' ? '#f6968d' : '#f5c46a');

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
    const dayColor = today ? '#00C7D9' : wd === 0 ? '#e88a82' : wd === 6 ? '#73BFF9' : '#C4CDDC';
    const chips = (showLabels ? evs.slice(0, 2) : []).map((e) => ({ name: e.name, bg: chipBg(e.tag), color: chipCol(e.tag) }));
    const moreN = evs.length - chips.length;
    cells.push({
      show: true, day, today, dayColor,
      cellBorder: today ? 'rgba(0,199,217,0.45)' : 'rgba(255,255,255,0.05)',
      cellBg: today ? 'rgba(0,199,217,0.10)' : 'rgba(255,255,255,0.02)',
      minHeight: minH,
      hasDot: evs.length > 0, dotColor: hasHigh ? '#f6685e' : '#f5b544',
      showLabels, chips, hasMore: showLabels && moreN > 0, moreText: '+' + moreN + '건',
    });
  }
  while (cells.length % 7 !== 0) cells.push(emptyCell());

  const weeks: CalWeek[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push({ days: cells.slice(i, i + 7) });
  return weeks;
}
