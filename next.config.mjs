/** @type {import('next').NextConfig} */
const nextConfig = {
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
