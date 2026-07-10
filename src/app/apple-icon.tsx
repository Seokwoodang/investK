import { ImageResponse } from 'next/og';

// iOS 홈 화면 추가 시 쓰는 아이콘(180×180 PNG). icon.svg와 동일한 상승차트 마크를 확대 렌더.
export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

const MARK = `<svg width="180" height="180" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="#101a29"/><stop offset="1" stop-color="#0a121d"/></linearGradient>
<linearGradient id="area" x1="24" y1="10" x2="24" y2="40" gradientUnits="userSpaceOnUse"><stop stop-color="#35e0c8" stop-opacity="0.42"/><stop offset="1" stop-color="#35e0c8" stop-opacity="0"/></linearGradient>
</defs>
<rect width="48" height="48" fill="url(#bg)"/>
<path d="M9 31 L19 25 L27 28 L39 14 L39 39 L9 39 Z" fill="url(#area)"/>
<path d="M9 31 L19 25 L27 28 L39 14" stroke="#38e6cd" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<path d="M31.5 13.5 L39 14 L38.5 21.5" stroke="#38e6cd" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <img width="180" height="180" src={`data:image/svg+xml;utf8,${encodeURIComponent(MARK)}`} alt="" />
    ),
    { ...size },
  );
}
