import { ImageResponse } from 'next/og';

// 인스타 프로필 사진용 1080×1080 이미지(원형 크롭 대비 중앙 배치). 상승차트 브랜드 마크.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 배경 타일 없이 상승차트 마크만(원형 안에 크게). 청록 라인 + 면 그라데이션 + 화살촉.
// viewBox를 그림 영역(대략 x8~40, y11~41)에 맞춰 좁혀 중앙·확대. 정사각 유지.
const MARK = `<svg width="820" height="820" viewBox="4 6 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="area" x1="24" y1="8" x2="24" y2="42" gradientUnits="userSpaceOnUse"><stop stop-color="#35e0c8" stop-opacity="0.5"/><stop offset="1" stop-color="#35e0c8" stop-opacity="0"/></linearGradient></defs><path d="M8 32 L19 24 L27 28 L40 12 L40 41 L8 41 Z" fill="url(#area)"/><path d="M8 32 L19 24 L27 28 L40 12" stroke="#3ee9d0" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M31.5 11 L40 12 L39.4 20" stroke="#3ee9d0" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SRC = `data:image/svg+xml;utf8,${encodeURIComponent(MARK)}`;

export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(150deg, #16233a 0%, #0e1826 55%, #0a121d 100%)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img width="820" height="820" src={SRC} alt="" />
      </div>
    ),
    { width: 1080, height: 1080 },
  );
}
