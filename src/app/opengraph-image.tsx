import { ImageResponse } from 'next/og';

// 카톡·트위터 등 링크 공유 시 뜨는 대표 이미지(1200×630). 동적 생성이라 별도 이미지 파일 불필요.
// 기본 폰트가 한글 글리프를 확실히 렌더하지 못할 수 있어 영문 브랜딩으로 구성(깨짐 방지).
export const runtime = 'edge';
export const alt = 'InvestKang — Investment Dashboard';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

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
        <div style={{ fontSize: 34, fontWeight: 700, color: '#38e0c8', letterSpacing: '0.04em' }}>InvestKang</div>
        <div style={{ fontSize: 76, fontWeight: 800, marginTop: 20, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
          Investment Dashboard
        </div>
        <div style={{ fontSize: 30, marginTop: 28, color: '#9fb0c8', lineHeight: 1.4, maxWidth: 900 }}>
          Market gauges · Sector flow · Value picks · Economic calendar — at a glance.
        </div>
        <div style={{ fontSize: 22, marginTop: 40, color: '#5f708a' }}>Reference only · not investment advice</div>
      </div>
    ),
    { ...size },
  );
}
