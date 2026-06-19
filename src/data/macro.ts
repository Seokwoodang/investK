import type { Macro } from '../types';

// Mock macro data. All numbers are illustrative.
export const MACRO: Macro = {
  fx: [
    { pair: 'USD/KRW', val: '1,384.20', chg: -0.32 },
    { pair: 'EUR/KRW', val: '1,498.10', chg: 0.11 },
    { pair: 'USD/JPY', val: '157.40', chg: 0.24 },
    { pair: 'DXY', val: '104.82', chg: -0.18 },
  ],
  indices: [
    { name: 'S&P 500', val: '5,431.6', chg: 0.58 },
    { name: '나스닥', val: '17,210.3', chg: 0.91 },
    { name: '코스피', val: '2,705.4', chg: -0.21 },
    { name: '코스닥', val: '862.1', chg: -0.44 },
  ],
  events: [
    { date: '2026-06-12', time: '21:15', name: 'ECB 통화정책회의', tag: '고영향', rel: { title: 'ECB, 금리 동결 전망 우세 … 하반기 인하 시그널에 시장 촉각', src: 'Reuters' } },
    { date: '2026-06-15', time: '21:30', name: '美 5월 CPI 발표', tag: '고영향', rel: { title: '5월 소비자물가 둔화 기대 … 헤드라인 3%대 초반 전망', src: 'Bloomberg' } },
    { date: '2026-06-15', time: '장중', name: '삼성전자 컨퍼런스콜', tag: '중간', rel: { title: '2분기 가이던스·HBM 양산 진척 점검 포인트', src: '한국경제' } },
    { date: '2026-06-16', time: '08:00', name: '한국 5월 수출입 동향', tag: '중간', rel: { title: '반도체 수출 회복세 지속 여부가 관건', src: '연합뉴스' } },
    { date: '2026-06-18', time: '03:00', name: 'FOMC 기준금리 결정', tag: '고영향', rel: { title: '점도표 통한 연내 인하 횟수 신호에 시장 촉각', src: 'CNBC' } },
    { date: '2026-06-19', time: '12:00', name: 'BOJ 금융정책회의', tag: '중간', rel: { title: '엔화 약세 속 정책 정상화 속도에 주목', src: 'Nikkei' } },
    { date: '2026-06-22', time: '06:00', name: 'BTC 분기 옵션 만기', tag: '중간', rel: { title: '대규모 옵션 만기 앞두고 변동성 확대 가능성', src: 'CoinDesk' } },
    { date: '2026-06-25', time: '21:30', name: '美 1분기 GDP 확정치', tag: '고영향', rel: { title: '성장률 상향 여부와 소비 지표 동반 확인', src: 'WSJ' } },
    { date: '2026-06-26', time: '21:30', name: '美 PCE 물가지수', tag: '고영향', rel: { title: '연준 선호 물가지표 … 디스인플레이션 추세 확인', src: 'Bloomberg' } },
    { date: '2026-06-30', time: '장중', name: '반기 결산 · 리밸런싱', tag: '중간', rel: { title: '지수 리밸런싱發 수급 변동에 유의', src: '인포스탁' } },
  ],
};
