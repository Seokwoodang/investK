// 섹터(업종) 분류 체계 — 서버·클라이언트 공용 순수 데이터.
//  · 서버: src/server/providers/sectors.ts 가 ETF 종가로 업종 흐름을 계산할 때 사용.
//  · 클라이언트: 관심 분야 피커(InterestPicker)와 뉴스 매칭(interestNews)에서 사용.
// 'server-only' 금지 — 브라우저 번들에 들어간다. 데이터만 두고 로직은 src/lib/sectors.ts 에.
//
// key: `${market}:${name}` — 반도체·헬스케어가 KR/US 양쪽에 있어 이름만으론 구분 불가.
// leaders[].ref: KR은 6자리 코드, US는 네이버 worldStock RIC(나스닥 .O / 뉴욕 .N).
// leaders[].aliases: US는 유니버스 종목명이 한글("엔비디아")이고 뉴스 제목도 한글 번역이라
//   영문 name만으론 매칭이 안 된다. 티커(NVDA)는 ref에서 자동 도출하므로 여기 적지 않는다.
// keywords: 종목명에 안 나오는 업종 신호어. 오탐을 줄이려 '수주'·'금리'처럼 범용적인 말은 뺐다.

export type SectorMarket = 'kr' | 'us' | 'coin';

export interface SectorLeader {
  name: string;
  ref: string;
  aliases?: string[];
}

export interface SectorDef {
  key: string;
  market: SectorMarket;
  name: string;
  // 코인 테마는 대리 ETF가 없어 etf/proxy가 없다 → 업종 흐름(가격) 행 없이 뉴스 매칭에만 쓰인다.
  etf?: string;
  proxy?: string;
  leaders: SectorLeader[];
  keywords: string[];
}

// 한국: 대표 섹터 ETF(KODEX·TIGER) + 대표 종목. 종가는 실제 펀드 가격.
const KR_DEFS: Omit<SectorDef, 'key' | 'market'>[] = [
  {
    name: '반도체', etf: '091160.KS', proxy: 'KODEX 반도체',
    leaders: [{ name: '삼성전자', ref: '005930' }, { name: 'SK하이닉스', ref: '000660' }, { name: '한미반도체', ref: '042700' }],
    keywords: ['HBM', 'D램', '디램', '낸드', '파운드리', '웨이퍼', '시스템반도체', '메모리반도체'],
  },
  {
    name: 'IT·전기전자', etf: '139260.KS', proxy: 'TIGER 200 IT',
    leaders: [{ name: '삼성전자', ref: '005930' }, { name: 'LG전자', ref: '066570' }, { name: '삼성전기', ref: '009150' }],
    keywords: ['디스플레이', 'OLED', 'MLCC', '전자부품', '가전'],
  },
  {
    name: '2차전지', etf: '305720.KS', proxy: 'KODEX 2차전지산업',
    leaders: [{ name: 'LG에너지솔루션', ref: '373220' }, { name: '삼성SDI', ref: '006400' }, { name: 'POSCO퓨처엠', ref: '003670' }],
    keywords: ['배터리', '양극재', '음극재', '전해액', '리튬', 'ESS'],
  },
  {
    name: '자동차', etf: '091180.KS', proxy: 'KODEX 자동차',
    leaders: [{ name: '현대차', ref: '005380' }, { name: '기아', ref: '000270' }, { name: '현대모비스', ref: '012330' }],
    keywords: ['완성차', '전기차', '자동차부품', '하이브리드차'],
  },
  {
    name: '바이오', etf: '244580.KS', proxy: 'KODEX 바이오',
    leaders: [{ name: '삼성바이오로직스', ref: '207940' }, { name: '셀트리온', ref: '068270' }, { name: '유한양행', ref: '000100' }],
    keywords: ['신약', '임상시험', '바이오시밀러', '제약', '식약처', '위탁생산'],
  },
  {
    name: '헬스케어', etf: '266420.KS', proxy: 'KODEX 헬스케어',
    leaders: [{ name: '삼성바이오로직스', ref: '207940' }, { name: '셀트리온', ref: '068270' }, { name: 'SK바이오팜', ref: '326030' }],
    keywords: ['의료기기', '진단키트', '의료AI', '건강보험'],
  },
  {
    name: '은행', etf: '091170.KS', proxy: 'KODEX 은행',
    leaders: [{ name: 'KB금융', ref: '105560' }, { name: '신한지주', ref: '055550' }, { name: '하나금융지주', ref: '086790' }],
    keywords: ['금융지주', '예대마진', '대출금리', '은행권'],
  },
  {
    name: '증권', etf: '102970.KS', proxy: 'KODEX 증권',
    leaders: [{ name: '미래에셋증권', ref: '006800' }, { name: '삼성증권', ref: '016360' }, { name: '키움증권', ref: '039490' }],
    keywords: ['증권사', '거래대금', '브로커리지', '기업공개'],
  },
  {
    name: '철강', etf: '117680.KS', proxy: 'KODEX 철강',
    leaders: [{ name: 'POSCO홀딩스', ref: '005490' }, { name: '현대제철', ref: '004020' }, { name: '고려아연', ref: '010130' }],
    keywords: ['철강재', '열연', '냉연', '후판', '제철'],
  },
  {
    name: '건설', etf: '117700.KS', proxy: 'KODEX 건설',
    leaders: [{ name: '현대건설', ref: '000720' }, { name: 'GS건설', ref: '006360' }, { name: 'DL이앤씨', ref: '375500' }],
    keywords: ['분양', '재건축', '건설사', '주택공급', '플랜트'],
  },
  {
    name: '조선', etf: '466920.KS', proxy: 'SOL 조선TOP3플러스',
    leaders: [{ name: 'HD한국조선해양', ref: '009540' }, { name: '한화오션', ref: '042660' }, { name: '삼성중공업', ref: '010140' }],
    keywords: ['LNG선', '컨테이너선', '조선소', '수주잔고', '선박'],
  },
  {
    name: '방산', etf: '449450.KS', proxy: 'PLUS K방산',
    leaders: [{ name: '한화에어로스페이스', ref: '012450' }, { name: '한국항공우주', ref: '047810' }, { name: 'LIG넥스원', ref: '079550' }],
    keywords: ['국방', '미사일', '방산수출', '무기체계', '항공우주'],
  },
];

// 미국: SPDR 섹터 ETF + 반도체(SMH) + 대표 종목. 종가는 실제 펀드 가격.
const US_DEFS: Omit<SectorDef, 'key' | 'market'>[] = [
  {
    name: '반도체', etf: 'SMH', proxy: 'VanEck 반도체',
    leaders: [
      { name: 'NVIDIA', ref: 'NVDA.O', aliases: ['엔비디아'] },
      { name: 'TSMC', ref: 'TSM.N', aliases: ['台積電', '대만반도체'] },
      { name: 'Broadcom', ref: 'AVGO.O', aliases: ['브로드컴'] },
    ],
    keywords: ['AI칩', 'GPU', 'HBM', '파운드리', '반도체'],
  },
  {
    name: '기술', etf: 'XLK', proxy: 'Tech Select',
    leaders: [
      { name: 'Apple', ref: 'AAPL.O', aliases: ['애플'] },
      { name: 'Microsoft', ref: 'MSFT.O', aliases: ['마이크로소프트'] },
      { name: 'Oracle', ref: 'ORCL.N', aliases: ['오라클'] },
    ],
    keywords: ['클라우드', '소프트웨어', '빅테크', '데이터센터'],
  },
  {
    name: '커뮤니케이션', etf: 'XLC', proxy: 'Comm. Services',
    leaders: [
      { name: 'Alphabet', ref: 'GOOGL.O', aliases: ['알파벳', '구글'] },
      { name: 'Meta', ref: 'META.O', aliases: ['메타'] },
      { name: 'Netflix', ref: 'NFLX.O', aliases: ['넷플릭스'] },
    ],
    keywords: ['광고매출', '스트리밍', '소셜미디어'],
  },
  {
    name: '임의소비재', etf: 'XLY', proxy: 'Consumer Disc.',
    leaders: [
      { name: 'Amazon', ref: 'AMZN.O', aliases: ['아마존'] },
      { name: 'Tesla', ref: 'TSLA.O', aliases: ['테슬라'] },
      { name: 'Home Depot', ref: 'HD.N', aliases: ['홈디포'] },
    ],
    keywords: ['이커머스', '소비지출', '리테일'],
  },
  {
    name: '필수소비재', etf: 'XLP', proxy: 'Consumer Staples',
    leaders: [
      { name: 'Procter & Gamble', ref: 'PG.N', aliases: ['프록터앤갬블', 'P&G'] },
      { name: 'Coca-Cola', ref: 'KO.N', aliases: ['코카콜라'] },
      { name: 'Costco', ref: 'COST.O', aliases: ['코스트코'] },
    ],
    keywords: ['생필품', '식음료'],
  },
  {
    name: '에너지', etf: 'XLE', proxy: 'Energy Select',
    leaders: [
      { name: 'Exxon Mobil', ref: 'XOM.N', aliases: ['엑슨모빌'] },
      { name: 'Chevron', ref: 'CVX.N', aliases: ['셰브론'] },
      { name: 'ConocoPhillips', ref: 'COP.N', aliases: ['코노코필립스'] },
    ],
    keywords: ['유가', '원유', '정유', 'OPEC', '천연가스'],
  },
  {
    name: '금융', etf: 'XLF', proxy: 'Financials',
    leaders: [
      { name: 'JPMorgan', ref: 'JPM.N', aliases: ['제이피모건', 'JP모건'] },
      { name: 'Bank of America', ref: 'BAC.N', aliases: ['뱅크오브아메리카'] },
      { name: 'Wells Fargo', ref: 'WFC.N', aliases: ['웰스파고'] },
    ],
    keywords: ['투자은행', '대형은행'],
  },
  {
    name: '헬스케어', etf: 'XLV', proxy: 'Health Care',
    leaders: [
      { name: 'Eli Lilly', ref: 'LLY.N', aliases: ['일라이릴리'] },
      { name: 'UnitedHealth', ref: 'UNH.N', aliases: ['유나이티드헬스'] },
      { name: 'J&J', ref: 'JNJ.N', aliases: ['존슨앤드존슨', '존슨앤존슨'] },
    ],
    keywords: ['비만치료제', 'FDA', '의료보험', '제약'],
  },
  {
    name: '산업재', etf: 'XLI', proxy: 'Industrials',
    leaders: [
      { name: 'Caterpillar', ref: 'CAT.N', aliases: ['캐터필러'] },
      { name: 'GE Aerospace', ref: 'GE.N', aliases: ['GE에어로스페이스'] },
      { name: 'RTX', ref: 'RTX.N', aliases: ['레이시온'] },
    ],
    keywords: ['항공우주', '기계장비', '인프라투자'],
  },
  {
    name: '소재', etf: 'XLB', proxy: 'Materials',
    leaders: [
      { name: 'Linde', ref: 'LIN.O', aliases: ['린데'] },
      { name: 'Sherwin-Williams', ref: 'SHW.N', aliases: ['셔윈윌리엄스'] },
      { name: 'Freeport-McMoRan', ref: 'FCX.N', aliases: ['프리포트'] },
    ],
    keywords: ['화학소재', '구리', '원자재'],
  },
  {
    name: '부동산', etf: 'XLRE', proxy: 'Real Estate',
    leaders: [
      { name: 'Prologis', ref: 'PLD.N', aliases: ['프로로지스'] },
      { name: 'American Tower', ref: 'AMT.N', aliases: ['아메리칸타워'] },
      { name: 'Equinix', ref: 'EQIX.O', aliases: ['에퀴닉스'] },
    ],
    keywords: ['리츠', 'REIT', '상업용부동산'],
  },
  {
    name: '유틸리티', etf: 'XLU', proxy: 'Utilities',
    leaders: [
      { name: 'NextEra', ref: 'NEE.N', aliases: ['넥스트에라'] },
      { name: 'Duke Energy', ref: 'DUK.N', aliases: ['듀크에너지'] },
      { name: 'Southern Co', ref: 'SO.N', aliases: ['서던컴퍼니'] },
    ],
    keywords: ['전력수요', '유틸리티', '원자력'],
  },
];

// 코인 테마: 대리 ETF가 없어 가격 흐름은 못 보여주고 뉴스 매칭 전용.
// leaders의 ref는 심볼(BTC 등) — 코인 유니버스 티커와 맞춘다.
const COIN_DEFS: Omit<SectorDef, 'key' | 'market'>[] = [
  {
    name: '비트코인',
    leaders: [{ name: '비트코인', ref: 'BTC', aliases: ['bitcoin'] }],
    keywords: ['비트코인', 'BTC', '반감기', '비트코인 ETF', '현물 ETF'],
  },
  {
    name: '이더리움',
    leaders: [{ name: '이더리움', ref: 'ETH', aliases: ['ethereum'] }],
    keywords: ['이더리움', 'ETH', '이더', '스테이킹', '레이어2'],
  },
  {
    name: '알트코인',
    leaders: [
      { name: '솔라나', ref: 'SOL', aliases: ['solana'] },
      { name: '리플', ref: 'XRP', aliases: ['ripple'] },
      { name: '에이다', ref: 'ADA', aliases: ['cardano'] },
    ],
    keywords: ['알트코인', '솔라나', '리플', '도지코인', '레이어1'],
  },
  {
    name: '디파이',
    leaders: [{ name: '유니스왑', ref: 'UNI', aliases: ['uniswap'] }],
    keywords: ['디파이', 'DeFi', '탈중앙화', '유동성 공급', '덱스'],
  },
  {
    name: '스테이블코인',
    leaders: [{ name: '테더', ref: 'USDT', aliases: ['tether'] }],
    keywords: ['스테이블코인', 'USDT', 'USDC', '테더', '페깅'],
  },
  {
    name: '규제·정책',
    leaders: [],
    keywords: ['가상자산', '코인 규제', '증권성', '거래소 인가', '자금세탁'],
  },
];

const withKey = (market: SectorMarket, defs: Omit<SectorDef, 'key' | 'market'>[]): SectorDef[] =>
  defs.map((d) => ({ ...d, key: `${market}:${d.name}`, market }));

export const SECTOR_DEFS: SectorDef[] = [
  ...withKey('kr', KR_DEFS),
  ...withKey('us', US_DEFS),
  ...withKey('coin', COIN_DEFS),
];
