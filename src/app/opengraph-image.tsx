import { ImageResponse } from 'next/og';

// 카톡·트위터 등 링크 공유 시 뜨는 대표 이미지(1200×630). 동적 생성이라 별도 이미지 파일 불필요.
// 파비콘/헤더와 동일한 상승차트 로고 + 영문 브랜딩(한글 폰트 깨짐 방지).
export const runtime = 'edge';
export const alt = 'InvestKang — Investment Dashboard';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// icon.svg와 동일한 로고 마크(데이터 URI로 임베드).
const LOGO = `<svg width="132" height="132" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="b" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="#16233a"/><stop offset="1" stop-color="#0c1523"/></linearGradient>
<linearGradient id="a" x1="24" y1="10" x2="24" y2="40" gradientUnits="userSpaceOnUse"><stop stop-color="#35e0c8" stop-opacity="0.42"/><stop offset="1" stop-color="#35e0c8" stop-opacity="0"/></linearGradient>
</defs>
<rect width="48" height="48" rx="12" fill="url(#b)"/>
<rect x="0.6" y="0.6" width="46.8" height="46.8" rx="11.4" fill="none" stroke="#35e0c8" stroke-opacity="0.30"/>
<path d="M9 31 L19 25 L27 28 L39 14 L39 39 L9 39 Z" fill="url(#a)"/>
<path d="M9 31 L19 25 L27 28 L39 14" stroke="#38e6cd" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<path d="M31.5 13.5 L39 14 L38.5 21.5" stroke="#38e6cd" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: 'linear-gradient(135deg, #0a0e17 0%, #0f1826 55%, #0a1420 100%)',
          color: '#e7ecf5',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img width="132" height="132" src={`data:image/svg+xml;utf8,${encodeURIComponent(LOGO)}`} alt="" />
          <div style={{ fontSize: 40, fontWeight: 700, color: '#38e0c8', letterSpacing: '0.02em' }}>InvestKang</div>
        </div>
        <div style={{ fontSize: 76, fontWeight: 800, marginTop: 34, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
          Investment Dashboard
        </div>
        <div style={{ fontSize: 30, marginTop: 26, color: '#9fb0c8', lineHeight: 1.4, maxWidth: 940 }}>
          Market gauges · Sector flow · Value picks · Economic calendar — at a glance.
        </div>
        <div style={{ fontSize: 22, marginTop: 40, color: '#5f708a' }}>Reference only · not investment advice</div>
      </div>
    ),
    { ...size },
  );
}
