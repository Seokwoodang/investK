# InvestKang

개인용 일일 투자 모니터링 대시보드. 국내·해외 주식과 코인의 **실시세·차트·뉴스·경제일정**을 한 화면에서 보고, AI가 뉴스의 호재/악재를 판별해 정리합니다.

> 모든 수치는 실제 데이터입니다(키가 없을 때만 목 데이터로 폴백). 단위는 억/만 없이 전체 자릿수로 표기.
> 분석·점수·요약은 AI 기반 **참고 정보이며 투자 자문이 아닙니다.**

## 주요 기능

- **자산군 4종 전 종목** — 국내주식·해외주식·국내코인·해외코인 전체 유니버스 실시세(거래대금순)
- **실시간 시세** — 코인(업비트·바이낸스 WebSocket), 국내주식(KIS WebSocket→SSE), 해외주식(약 15분 지연)
- **캔들 차트** — 일/주/월(코인은 1시간 포함) 봉 선택, 가격·날짜 축. 데이터: KIS / 업비트 / 바이낸스
- **AI 뉴스 큐레이션** — 언론사 RSS(한국경제·연합뉴스·CNBC·토큰포스트·블록미디어)를 Claude가 읽고 **호재/악재 · 중요도 · 영향 종목 · 왜 중요한지**를 판별해 정렬
- **경제 캘린더** — Nasdaq 경제지표 일정(직전치·예상치·해석)
- **데일리 브리핑 / AI 차트분석 / AI 관점** — Claude 생성 (캐시)
- **시장 상태** — 코스피·뉴욕 개장/마감 실시간(서머타임 자동)

## 기술 스택

- **Next.js 14 (App Router) + TypeScript**, 배포 **Vercel**
- **Supabase** — AI 결과 캐시(`ai_cache`)·KIS 토큰(`kv_store`)
- **Anthropic Claude** — 뉴스 판별(Haiku), 브리핑·차트분석·관점(Sonnet)

## 데이터 출처

| 영역 | 출처 |
|---|---|
| 국내주식 시세/유니버스 | 네이버 금융 + KIS 실시간 |
| 해외주식 | 네이버 금융(15분 지연) |
| 코인 | 업비트(원화)·바이낸스(달러) |
| 차트(캔들) | KIS / 업비트 / 바이낸스 |
| 환율 | Frankfurter(ECB) |
| 달러인덱스(DXY) | Yahoo Finance |
| 지수 | KIS |
| 경제 캘린더 | Nasdaq |
| 뉴스 | 국내주식=한경·연합 / 해외=CNBC / 코인=토큰포스트·블록미디어 + Claude 판별 |

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # 키 채우기(없으면 해당 영역 목 데이터)
npm run dev                  # http://localhost:3000
```

### 환경변수 (`.env.local`)

```
ANTHROPIC_API_KEY=          # Claude (뉴스 판별·AI 생성)
ANTHROPIC_MODEL=claude-sonnet-4-6
NEXT_PUBLIC_SUPABASE_URL=   # Supabase
SUPABASE_SERVICE_ROLE_KEY=
KIS_APP_KEY=                # 한국투자증권 Open API (국내주식 실시간·차트·지수)
KIS_APP_SECRET=
# CRON_SECRET=              # 뉴스 갱신 cron 보호(배포 시)
```

> 모든 키는 서버 전용입니다. `.env.local`은 git에 올라가지 않습니다.

## 아키텍처 — 캐시 & 갱신

AI 호출은 **요청 경로에서 분리**되어 있습니다. 사용자는 항상 Supabase에 저장된 결과를 즉시 읽고, 생성은 백그라운드에서 일어납니다. 비용은 트래픽과 무관하게 거의 고정입니다(접속자가 많아도 AI 재호출이 늘지 않음).

- **뉴스**: GitHub Actions가 **매시간** `/api/cron/news` 호출 → 서버가 RSS 수집 + Claude 판별 → Supabase 저장. (Vercel Hobby는 시간당 cron 불가라 GitHub Actions 사용. 1시간 staleness 백업 포함)
- **KIS 토큰**: Vercel cron 매일 06:00(KST) 발급 → Supabase 저장(24h 유효, 1일 1회).
- **브리핑·차트분석·AI 관점**: 종목/날짜별로 처음 열릴 때 생성 후 캐시.
- **시세·캔들·유니버스**: DB에 저장하지 않고 매번 가져옴(영역별 짧은 캐시).

## 배포

GitHub repo가 Vercel에 연결돼 있어 **`main` push 시 자동 배포**됩니다. Vercel 프로젝트에 위 환경변수 + `CRON_SECRET`을 설정하세요.

> ⚠️ 국내주식 실시간 틱(KIS WebSocket)은 상시 서버가 필요해 Vercel 서버리스에선 스냅샷 시세로 동작합니다. 실시간 틱까지 필요하면 상시 서버(Railway/Render 등)에 배포하세요.
