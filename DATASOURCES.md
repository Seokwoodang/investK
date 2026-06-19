# 데이터 출처 (Data Sources)

모든 외부 연동은 서버 환경변수 뒤에 있고, 키가 없으면 목(mock) 데이터로 자동 폴백합니다.
샌드박스(개발)에서는 self-signed 프록시 때문에 서버 fetch가 막힐 수 있어 `.env.local`에
`NODE_TLS_REJECT_UNAUTHORIZED=0`을 둡니다(프로덕션 금지).

| 영역 | 목록(전 종목) | 시세 | 실시간 | 키 |
|---|---|---|---|---|
| **국내주식** | 네이버 금융 `m.stock.naver.com/api/stocks/marketValue/{KOSPI,KOSDAQ}` (약 4,290) | 위와 동일(현재가·등락·거래량) | KIS 소켓 `H0STCNT0`(보이는 종목, 장중) | 네이버 ✗ / KIS ✓ |
| **해외주식** | 큐레이션 6종목(전 종목 미연동) | KIS `HHDFS00000300` **지연 ~15분** | KIS `HDFSCNT0`(유료 신청 시) — 미구현 | KIS ✓ |
| **국내코인** | 업비트 `api.upbit.com/v1/market/all`(KRW, 약 264) | 업비트 `/v1/ticker` | 업비트 ws `wss://api.upbit.com/websocket/v1` | ✗ |
| **해외코인** | 바이낸스 `api.binance.com/api/v3/ticker/24hr`(USDT, 약 579) | 위와 동일 | 바이낸스 ws `wss://stream.binance.com:9443` | ✗ |
| **환율** | — | frankfurter.app (ECB, USD/KRW·EUR/KRW·USD/JPY) | 일 1회 고시 | ✗ |
| **지수** | 코스피/코스닥, S&P500/나스닥 | KIS 국내업종 `FHPUP02100000` / 해외지수 `FHKST03030100` | REST | KIS ✓ |
| **DXY(달러인덱스)** | — | 목값(무료 소스 없음) | — | — |
| **차트(캔들)** | — | 국내주식 KIS `FHKST03010100` / 해외주식 KIS `FHKST03030100` / 코인 업비트·바이낸스 캔들(브라우저 직접) | — | KIS ✓ / 코인 ✗ |
| **AI 분석** | 차트분석·AI관점·데일리브리핑 | Claude(Anthropic) 생성 + Supabase 캐시 | — | Anthropic ✓ |
| **경제 캘린더** | 목 데이터(미연동) | — | — | — |
| **뉴스** | 목 데이터(미연동). 캘린더 모달 링크는 네이버 뉴스 검색 | — | — | — |
| **캐시/저장** | — | Supabase Postgres (`ai_cache`, `kv_store`) | — | Supabase ✓ |

## 통화/시장 구분
- **국내코인(업비트, ₩)** vs **해외코인(바이낸스, $)** — 같은 코인이라도 거래소·통화가 달라 가격이 다름(국내=김치프리미엄).
- **국내주식(₩, KRX)** vs **해외주식($, NASDAQ)** — 별개 시장.

## 실시간 정책
- 코인: 24시간 소켓(브라우저 직접).
- 국내주식: 장중(09:00~15:30 KST) KIS 소켓, 보이는 종목만.
- 해외주식: **지연시세(약 15분)** — 화면에 "지연" 표기. 실시간 소켓은 KIS 해외 실시간 유료 신청 필요.
- 실시간 구독은 항상 "현재 보이는 종목 + 상세 종목"만(한도·부하 회피).

## 갱신 주기
`src/server/env.ts`의 `REVALIDATE`에서 영역별로 조정(시세 45s, 환율·지수 180s 등).
