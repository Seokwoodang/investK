# 파라메타 인베스트 — Investment Monitoring Dashboard

매일 보는 개인용 투자 모니터링 대시보드. **Next.js(App Router) + TypeScript**, 배포는 **Vercel + Supabase**.

대시보드(매크로·경제 캘린더), 데일리 팩트 브리핑, 4개 자산군(국내/해외 주식·코인) 종목 리스트,
종목 상세(캔들 차트·관련 뉴스·AI 관점·정량 위험도), 핫이슈 뉴스 피드. 관심종목/알림은 로컬에 저장.

> 분석·점수·요약은 AI/데모 데이터 기반 **참고 정보이며 투자 자문이 아닙니다.**

## 핵심 설계: UI ↔ 데이터 소스 분리

모든 외부 연동은 **서버에서** 처리하고(키 숨김·CORS·캐싱·스케줄), 화면은 목 데이터를 직접
import하지 않습니다. 서버 컴포넌트가 데이터를 모아 클라이언트 셸에 내려주고, 화면은 `useData()`로
읽습니다. **키가 하나도 없어도 목 데이터로 폴백**해 즉시 실행되며, 키를 넣을 때마다 해당 영역이
실데이터로 켜집니다.

```
브라우저(클라이언트 셸, 상호작용)
   ▲  data (props)
서버 컴포넌트  src/app/page.tsx
   ▲  getDashboardData()
서버 데이터 계층  src/server/  ── 프로바이더 어댑터(키 있으면 실연동, 없으면 목 폴백)
```

## 실행

```bash
npm install
cp .env.example .env.local   # 키는 채우는 만큼만 켜짐 (다 비워도 동작)
npm run dev                  # http://localhost:3000
npm run build                # 프로덕션 빌드
npm run typecheck            # 타입 체크
```

## 연동 현황 (키 주입 시 자동 활성화)

| 영역 | 소스 | 상태 |
|---|---|---|
| 국내주식 시세 | 한국투자증권 KIS Open API | 어댑터 구현됨 (`KIS_APP_KEY/SECRET` 필요) |
| 해외주식 | Finnhub / Twelve Data | 자리만(TODO) |
| 코인(국내/해외) | 업비트 / CoinGecko·바이낸스 | 자리만(TODO) |
| 환율·지수 | (선정 예정) | 자리만(TODO) |
| 뉴스 | 네이버 검색 API | 자리만(TODO) |
| 경제 캘린더 | (선정 예정) | 자리만(TODO) |
| AI 분석 | Claude(Anthropic) + Supabase 캐시 | seam 구현됨, 키 없으면 템플릿 폴백 |

데이터 갱신 주기는 `src/server/env.ts`의 `REVALIDATE`에서 영역별로 조정합니다.

## AI 분석 캐싱

`POST /api/ai/analysis` → `(종목·기간·날짜)`를 키로 **Supabase `ai_cache` 테이블**을 먼저 조회,
없을 때만 Claude를 호출해 저장하고, 같은 요청은 재분석 없이 캐시를 반환합니다.
Anthropic 키가 없으면 결정적 템플릿 문구로 폴백합니다. (테이블 DDL은 `src/server/supabase.ts` 주석 참고.)

## 구조

```
src/
  app/
    layout.tsx · page.tsx(server) · globals.css
    api/ai/analysis/route.ts        # AI 캐시 seam
  components/
    DashboardShell.tsx(client) · Header · TabBar · GlossaryTip · CandleChart · EventModal · Footer
    screens/  Dashboard · Daily · Stocks · News · Detail
  store/DashboardContext.tsx        # UI 상태 + 서버 데이터(useData) + 로컬 영속화
  lib/    format · chart · calendar · glossary · useViewport · constants
  data/   목(mock) 데이터 — 서버 폴백 소스 + 정적 용어집
  server/
    env.ts · supabase.ts · ai.ts · data.ts
    providers/kis.ts                # 한국투자증권 어댑터
  types.ts
```

## 다음 단계

1. Supabase 프로젝트 생성 → `ai_cache` 테이블 + 환경변수.
2. 한국투자증권 계좌/앱키 → 국내주식 실시세 연동.
3. 해외주식·코인·환율·뉴스·캘린더 프로바이더 순차 연동 (`src/server/data.ts`의 TODO).
4. Anthropic 키 → 데일리 브리핑/차트 분석 실제 생성.
5. (선택) 관심종목/알림 Supabase 동기화 + 가격 도달 알림.
