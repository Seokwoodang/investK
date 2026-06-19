import { useEffect, useState } from 'react';

// Tracks viewport width for responsive layout (debounced 60ms on resize),
// mirroring the prototype's `vw` state.
// Start from a fixed default so the server render and the first client render
// agree (no hydration mismatch); the real width is measured after mount.
const SSR_DEFAULT_WIDTH = 1280;

export function useViewport(): number {
  const [vw, setVw] = useState<number>(SSR_DEFAULT_WIDTH);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => setVw(window.innerWidth), 60);
    };
    window.addEventListener('resize', onResize);
    setVw(window.innerWidth);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return vw;
}

// Responsive layout values derived from viewport width.
export interface Layout {
  padX: string;
  navGap: string;
  macroCols2: string;
  newsCols: string;
  assetCols: string;
  aiCols: string;
  briefCols: string;
  showVol: boolean;
  showRisk: boolean;
  showStatus: boolean;
  showBrand: boolean;
  showGSearch: boolean;
  rowCols: string;
  detailHeadDir: 'row' | 'column';
  detailHeadAlign: 'flex-end' | 'flex-start';
  detailPriceAlign: 'right' | 'left';
}

export function useLayout(vw: number): Layout {
  const showVol = vw >= 680;
  const showRisk = vw >= 440;
  const cols = ['36px', '1.7fr'];
  if (showVol) cols.push('1.1fr');
  cols.push('1.2fr', '1fr');
  if (showRisk) cols.push('86px');
  return {
    padX: (vw < 640 ? 16 : vw < 960 ? 28 : 48) + 'px',
    navGap: vw < 640 ? '16px' : '28px',
    macroCols2: vw < 700 ? '1fr' : '1fr 1fr',
    newsCols: vw < 700 ? '1fr' : vw < 1040 ? '1fr 1fr' : 'repeat(3, 1fr)',
    assetCols: vw < 560 ? '1fr' : vw < 900 ? '1fr 1fr' : 'repeat(4, 1fr)',
    aiCols: vw < 820 ? '1fr' : 'repeat(3, 1fr)',
    briefCols: vw < 800 ? '1fr' : '1fr 1fr',
    showVol,
    showRisk,
    showStatus: vw >= 760,
    showBrand: vw >= 420,
    showGSearch: vw >= 620,
    rowCols: cols.join(' '),
    detailHeadDir: vw < 680 ? 'column' : 'row',
    detailHeadAlign: vw < 680 ? 'flex-start' : 'flex-end',
    detailPriceAlign: vw < 680 ? 'left' : 'right',
  };
}
