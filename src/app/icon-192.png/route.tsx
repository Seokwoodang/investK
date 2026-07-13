import { ImageResponse } from 'next/og';

// PWA manifest용 192×192 PNG 아이콘. (512 버전과 동일 마크, 크기만 축소)
export const runtime = 'edge';

const SIZE = 192;
const MARK = `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="b" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="#16233a"/><stop offset="1" stop-color="#0c1523"/></linearGradient>
<linearGradient id="a" x1="24" y1="10" x2="24" y2="40" gradientUnits="userSpaceOnUse"><stop stop-color="#35e0c8" stop-opacity="0.42"/><stop offset="1" stop-color="#35e0c8" stop-opacity="0"/></linearGradient>
</defs>
<rect width="48" height="48" fill="url(#b)"/>
<path d="M9 31 L19 25 L27 28 L39 14 L39 39 L9 39 Z" fill="url(#a)"/>
<path d="M9 31 L19 25 L27 28 L39 14" stroke="#38e6cd" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<path d="M31.5 13.5 L39 14 L38.5 21.5" stroke="#38e6cd" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;

export function GET() {
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img width={SIZE} height={SIZE} src={`data:image/svg+xml;utf8,${encodeURIComponent(MARK)}`} alt="" />
    ),
    { width: SIZE, height: SIZE },
  );
}
