import { ImageResponse } from 'next/og';
import { getBriefing } from '@/server/briefing';

// 인스타 카드뉴스용 이미지 생성(1080×1350 세로). 브랜드 셸은 고정, 콘텐츠 블록만 타입별로.
//  /api/card/brief → 오늘의 브리핑(한 줄 + 3줄 팩트). (다른 타입은 순차 추가)
// 한국어는 Satori 기본 폰트에 없으므로 Pretendard(OTF)를 런타임에 받아 넣는다(하루 캐시).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FONT = 'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static';
async function fonts() {
  const [bold, reg] = await Promise.all([
    fetch(`${FONT}/Pretendard-Bold.otf`, { next: { revalidate: 86400 } }).then((r) => r.arrayBuffer()),
    fetch(`${FONT}/Pretendard-Regular.otf`, { next: { revalidate: 86400 } }).then((r) => r.arrayBuffer()),
  ]);
  return [
    { name: 'Pretendard', data: bold, weight: 700 as const, style: 'normal' as const },
    { name: 'Pretendard', data: reg, weight: 400 as const, style: 'normal' as const },
  ];
}

const LOGO = `<svg width="60" height="60" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="b" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="#16233a"/><stop offset="1" stop-color="#0c1523"/></linearGradient><linearGradient id="a" x1="24" y1="10" x2="24" y2="40" gradientUnits="userSpaceOnUse"><stop stop-color="#35e0c8" stop-opacity="0.42"/><stop offset="1" stop-color="#35e0c8" stop-opacity="0"/></linearGradient></defs><rect width="48" height="48" rx="12" fill="url(#b)"/><rect x="0.6" y="0.6" width="46.8" height="46.8" rx="11.4" fill="none" stroke="#35e0c8" stroke-opacity="0.30"/><path d="M9 31 L19 25 L27 28 L39 14 L39 39 L9 39 Z" fill="url(#a)"/><path d="M9 31 L19 25 L27 28 L39 14" stroke="#38e6cd" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M31.5 13.5 L39 14 L38.5 21.5" stroke="#38e6cd" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
const logoSrc = `data:image/svg+xml;utf8,${encodeURIComponent(LOGO)}`;

const kstDate = () => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/\.$/, '');
const kstYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// 카드 공통 셸: 로고·헤더·꼬리말은 항상 동일, children이 콘텐츠 블록.
function Shell({ badge, children }: { badge: string; children: React.ReactNode }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '72px 64px', background: 'linear-gradient(150deg, #0a0e17 0%, #0f1826 55%, #0a1420 100%)', color: '#e7ecf5', fontFamily: 'Pretendard' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img width="60" height="60" src={logoSrc} alt="" />
          <div style={{ fontSize: 38, fontWeight: 700, color: '#38e0c8', marginLeft: 16, letterSpacing: '-0.01em' }}>InvestK</div>
        </div>
        <div style={{ fontSize: 26, color: '#7c8ba3' }}>{kstDate()}</div>
      </div>
      <div style={{ display: 'flex', marginTop: 40 }}>
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: '#0a1420', background: '#38e0c8', padding: '10px 22px', borderRadius: 12 }}>{badge}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginTop: 36 }}>{children}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, fontSize: 22, color: '#5f708a' }}>
        <div style={{ display: 'flex' }}>참고용 지표 · 투자 권유 아님</div>
        <div style={{ display: 'flex', color: '#38e0c8', fontWeight: 700 }}>investk.app</div>
      </div>
    </div>
  );
}

const TAG_COLOR: Record<string, string> = { 지수: '#5aa0ff', 코인: '#f0b23c', 환율: '#35e0c8' };

async function briefCard() {
  const b = await getBriefing(kstYmd());
  const facts = (b.facts ?? []).slice(0, 3);
  return (
    <Shell badge="오늘의 브리핑">
      <div style={{ display: 'flex', fontSize: 60, fontWeight: 700, lineHeight: 1.22, letterSpacing: '-0.02em' }}>{b.headline || '오늘의 시장 브리핑'}</div>
      <div style={{ display: 'flex', height: 2, background: '#1c2740', margin: '52px 0 48px' }} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {facts.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', marginTop: i ? 26 : 0 }}>
            <div style={{ display: 'flex', fontSize: 24, fontWeight: 700, color: '#0a1420', background: TAG_COLOR[f.k] ?? '#8aa', padding: '7px 16px', borderRadius: 10, marginRight: 20 }}>{f.k}</div>
            <div style={{ display: 'flex', flex: 1, fontSize: 30, lineHeight: 1.4, color: '#cdd7e6' }}>{f.t}</div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

export async function GET(_req: Request, { params }: { params: { type: string } }) {
  let node: React.ReactNode;
  if (params.type === 'brief') node = await briefCard();
  else return new Response('unknown card type', { status: 404 });
  return new ImageResponse(node, { width: 1080, height: 1350, fonts: await fonts() });
}
