// 공유 썸네일(오픈그래프 이미지) 공용 상수.
//
// 왜 필요한가: Next는 페이지가 `openGraph`를 직접 정의하면 루트에서 상속되던
// opengraph-image 파일 규칙을 함께 얹어주지 않는다. 그 결과 openGraph를 정의한
// 페이지(/news·/stocks·/value·/etf·/glossary·/today·/review …)는 전부 og:image가
// 없었고, 카카오톡·네이버·슬랙에 링크를 붙여도 썸네일이 뜨지 않았다.
// openGraph를 정의하는 페이지는 반드시 이 상수를 images에 넣는다.
//
// 경로는 src/app/opengraph-image.tsx가 생성하는 라우트(1200×630 PNG).
// metadataBase가 layout에 설정돼 있어 상대경로가 절대 URL로 해석된다.
export const OG_IMAGE = [
  { url: '/opengraph-image', width: 1200, height: 630, alt: 'InvestK — 투자 대시보드' },
];
