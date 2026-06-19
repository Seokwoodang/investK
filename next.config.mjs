/** @type {import('next').NextConfig} */
const nextConfig = {
  // 실시간 ws/인터벌이 dev에서 StrictMode 이중 마운트로 꼬이는 것을 방지(프로덕션은 1회).
  reactStrictMode: false,
};

export default nextConfig;
