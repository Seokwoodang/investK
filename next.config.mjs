/** @type {import('next').NextConfig} */
const nextConfig = {
  // 배포 식별용 — Vercel이 빌드마다 주입하는 커밋 SHA를 클라이언트에 노출(Footer에 표시).
  //  빌드 타임에 인라인되므로 배포마다 자동 갱신 → "지금 어떤 버전이 떴는지" 확인 가능.
  env: {
    NEXT_PUBLIC_COMMIT_SHA: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7),
  },
  // 실시간 ws/인터벌이 dev에서 StrictMode 이중 마운트로 꼬이는 것을 방지(프로덕션은 1회).
  reactStrictMode: false,
  // (dash) 레이아웃이 no-store(바이낸스 2.4MB·KIS 토큰) 때문에 '동적'이라, 기본 staleTime 0이면
  // 페이지 이동마다 레이아웃을 재요청해 새로고침처럼 보인다. 방문한 라우트를 클라이언트가
  // 일정 시간 캐시해 이동 시 재요청 없이 즉시 전환되게 한다.
  experimental: {
    staleTimes: { dynamic: 300, static: 300 },
  },
};

export default nextConfig;
