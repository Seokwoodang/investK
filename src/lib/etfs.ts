// 색인 대상 대표 ETF 목록 — 사이트맵 · /etf 허브 · 내부 링크의 단일 기준점.
// 여기 한 곳만 고치면 sitemap.ts와 허브 페이지가 같이 따라간다.
//
// 배경: 이 목록은 원래 sitemap.ts에만 있었고 사이트 어디에서도 /etf/{symbol}로 가는
// <a href> 링크가 없었다. 그 결과 12개 상세가 전부 '고아 페이지'가 되어 서치콘솔에서
// "발견됨 - 현재 색인이 생성되지 않음" 상태로 남았다(색인 4/16). 허브 페이지 /etf가
// 이 목록을 링크로 렌더해 크롤 경로를 만든다.

export interface EtfEntry {
  symbol: string;
  /** 실명(라이브 프로필 기준). 허브 카드 라벨·검색 노출용. */
  name: string;
  market: 'kr' | 'us';
  /** 한 줄 설명 — 허브 카드 본문(얇은 콘텐츠 방지 + 키워드). */
  theme: string;
}

export const ETFS: EtfEntry[] = [
  { symbol: '069500', name: 'KODEX 200', market: 'kr', theme: '코스피200 지수를 추종하는 국내 대표 시장지수 ETF' },
  { symbol: '102110', name: 'TIGER 200', market: 'kr', theme: '코스피200 추종 — 국내 대형주 전반에 분산' },
  { symbol: '133690', name: 'TIGER 미국나스닥100', market: 'kr', theme: '나스닥100을 원화로 거래하는 국내 상장 ETF' },
  { symbol: '360750', name: 'TIGER 미국S&P500', market: 'kr', theme: 'S&P500을 원화로 거래하는 국내 상장 ETF' },
  { symbol: '379800', name: 'KODEX 미국S&P500', market: 'kr', theme: 'S&P500 추종 국내 상장 ETF' },
  { symbol: '305720', name: 'KODEX 2차전지산업', market: 'kr', theme: '2차전지 밸류체인 종목에 집중 투자하는 테마 ETF' },
  { symbol: '091160', name: 'KODEX 반도체', market: 'kr', theme: '국내 반도체 업종에 집중 투자하는 섹터 ETF' },
  { symbol: '122630', name: 'KODEX 레버리지', market: 'kr', theme: '코스피200 일간 수익률의 2배를 추종하는 레버리지 ETF' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', market: 'us', theme: '세계에서 가장 오래되고 거래량이 많은 S&P500 ETF' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', market: 'us', theme: '나스닥100 추종 — 미국 기술주 비중이 높은 ETF' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', market: 'us', theme: '보수가 낮은 대표적인 S&P500 추종 ETF' },
  { symbol: 'SCHD', name: 'Schwab U.S. Dividend Equity ETF', market: 'us', theme: '미국 고배당 우량주 중심의 배당 성장 ETF' },
];

export const ETF_PATHS = ETFS.map((e) => `/etf/${e.symbol}`);
