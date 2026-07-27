// '화제의 종목(미국)' 후보 유니버스.
//
// 왜 고정 목록인가: 네이버 US 유니버스는 가격은 주지만 **일간 등락률이 사실상 비어 있다**
// (전 종목의 1.2%만 pct≠0, 메가캡은 전부 0.00%). 그 소수마저 신주인수권('BUI RT WI')·
// 초소형주라 그대로 쓰면 잡주 소개가 된다. 그래서 유동성이 검증된 대형주·인기주를 고정
// 후보로 두고 등락률만 Yahoo에서 받아온다 — 잡주가 구조적으로 못 들어온다.
//
// 종목명(한글)은 런타임에 네이버 유니버스에서 찾아 쓰고, 없으면 티커를 그대로 표시한다.
// 추가/삭제는 이 배열만 고치면 된다.

export const US_MOVER_CANDIDATES: string[] = [
  // 메가캡·빅테크
  'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AVGO', 'ORCL', 'NFLX',
  // 반도체
  'AMD', 'MU', 'QCOM', 'INTC', 'TXN', 'ARM', 'ASML', 'TSM', 'AMAT', 'LRCX', 'KLAC', 'SMCI', 'MRVL', 'ON',
  // 소프트웨어·플랫폼
  'CRM', 'ADBE', 'NOW', 'PLTR', 'SNOW', 'UBER', 'ABNB', 'SHOP', 'SPOT', 'DASH',
  // 금융·결제
  'JPM', 'BAC', 'WFC', 'GS', 'MS', 'V', 'MA', 'PYPL', 'AXP', 'BLK', 'SCHW',
  // 코인 연관(서학개미 관심)
  'COIN', 'MSTR', 'HOOD', 'RIOT', 'MARA',
  // 소비재·리테일
  'WMT', 'COST', 'HD', 'MCD', 'NKE', 'SBUX', 'TGT', 'LOW', 'PG', 'KO', 'PEP',
  // 헬스케어
  'LLY', 'UNH', 'JNJ', 'MRK', 'ABBV', 'PFE', 'TMO', 'ISRG', 'NVO', 'AMGN',
  // 산업·방산·항공
  'CAT', 'GE', 'RTX', 'BA', 'LMT', 'HON', 'DE', 'UPS',
  // 에너지·소재·유틸
  'XOM', 'CVX', 'COP', 'SLB', 'LIN', 'FCX', 'NEM', 'NEE', 'DUK', 'SO',
  // 전기차·모빌리티
  'RIVN', 'LCID', 'NIO', 'GM', 'F',
  // 통신·미디어·기타 인기주
  'DIS', 'T', 'VZ', 'TMUS', 'CMCSA', 'PANW', 'CRWD', 'DDOG', 'ANET', 'DELL',
];
