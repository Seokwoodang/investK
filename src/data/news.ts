import type { News } from '../types';

// Hot-issue news per asset tab.
export const NEWS: News = {
  kr_stock: [
    { hot: true, title: 'HBM4 공급 협상 본격화 … 메모리 3사 가격 주도권 경쟁', summary: '주요 고객사와의 차세대 HBM 단가 협상이 시작되며 메모리 업종 전반의 마진 개선 기대가 확산되고 있다.', src: '한국경제', tags: ['삼성전자', 'SK하이닉스'] },
    { hot: true, title: '플랫폼 규제 법안 재논의 … 광고·커머스 수수료 영향 주목', summary: '국회에서 플랫폼 공정화 관련 법안이 재상정되며 광고·커머스 매출 비중이 높은 기업의 변동성이 커졌다.', src: '연합뉴스', tags: ['네이버', '카카오'] },
    { hot: false, title: '외국인 5거래일 연속 순매수 … 반도체 집중', summary: '외국인 투자자가 코스피에서 반도체 대형주를 중심으로 순매수를 이어가며 수급이 개선되는 모습이다.', src: '머니투데이', tags: ['삼성전자', 'SK하이닉스'] },
  ],
  us_stock: [
    { hot: true, title: 'AI 가속기 차세대 라인업 공개 임박 … 데이터센터 수요 재확인', summary: '차세대 AI 가속기 발표를 앞두고 하이퍼스케일러들의 자본지출 가이던스가 상향되며 수혜 기대가 커졌다.', src: 'Reuters', tags: ['엔비디아', '마이크로소프트'] },
    { hot: true, title: '美 CPI 둔화 시 빅테크 멀티플 재평가 가능성', summary: '소비자물가 둔화가 확인될 경우 금리 인하 기대가 강화되며 성장주 밸류에이션에 우호적이라는 분석이다.', src: 'Bloomberg', tags: ['애플', '엔비디아', '테슬라'] },
    { hot: false, title: 'EV 수요 둔화 우려 … 가격 인하 사이클 장기화', summary: '전기차 수요 둔화와 가격 경쟁 심화로 완성차 마진 압박이 이어질 것이라는 전망이 제기됐다.', src: 'CNBC', tags: ['테슬라'] },
  ],
  kr_coin: [
    { hot: true, title: '원화마켓 거래대금 급증 … 김치프리미엄 +2.1%로 확대', summary: '국내 거래소 거래대금이 급증하며 글로벌 대비 가격 괴리(프리미엄)가 빠르게 벌어지고 있다.', src: 'CoinDesk Korea', tags: ['비트코인', '이더리움'] },
    { hot: true, title: '국내 게임코인 상장 폐지 루머에 변동성 확대', summary: '특정 거래소의 유의종목 지정 가능성이 거론되며 게임 기반 토큰의 가격 변동성이 급격히 커졌다.', src: '디센터', tags: ['위믹스'] },
    { hot: false, title: '현물 ETF 자금 순유입 4주 연속 … 기관 수요 견조', summary: '글로벌 현물 ETF로의 자금 순유입이 이어지며 대형 코인의 하방을 지지하고 있다.', src: 'Block Media', tags: ['비트코인', '이더리움'] },
  ],
  global_coin: [
    { hot: true, title: 'L1 네트워크 활성지갑 사상 최고 … 수수료 수익 동반 증가', summary: '고성능 L1 체인의 온체인 활동이 급증하며 밸리데이터 수익과 토큰 수요가 함께 늘고 있다.', src: 'The Block', tags: ['솔라나'] },
    { hot: true, title: '오라클 신규 파트너십 확대 … 디파이 TVL 회복', summary: '주요 디파이 프로토콜과의 오라클 연동이 확대되며 관련 토큰의 펀더멘털 기대가 개선됐다.', src: 'Cointelegraph', tags: ['체인링크', '아발란체'] },
    { hot: false, title: '밈코인 거래량 변동성 … 단기 과열 신호', summary: '소셜 모멘텀에 기반한 밈 토큰의 거래량이 급등락하며 단기 과열·청산 리스크가 부각됐다.', src: 'Decrypt', tags: ['도지코인'] },
  ],
};
