import { ImageResponse } from 'next/og';
import { getCardData, getNewsCardData, type CardData, type Move, type NewsCardData, type NewsItem } from '@/server/cardData';

// 인스타 카드뉴스 5장(1080×1350, 4:5). 다크 테마. 디자인 핸드오프 시안을 Satori로 포팅.
//  type ∈ cover|kr|global|crypto|outro. 데이터는 getCardData()가 실시장값으로 조립.
//  한국어·▲▼는 Pretendard OTF(600/700/800/900)를 런타임에 받아 넣는다.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FONT = 'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static';
async function fonts() {
  const load = (f: string) => fetch(`${FONT}/${f}`, { next: { revalidate: 86400 } }).then((r) => r.arrayBuffer());
  const [w6, w7, w8, w9] = await Promise.all([
    load('Pretendard-SemiBold.otf'), load('Pretendard-Bold.otf'), load('Pretendard-ExtraBold.otf'), load('Pretendard-Black.otf'),
  ]);
  return [
    { name: 'Pretendard', data: w6, weight: 600 as const, style: 'normal' as const },
    { name: 'Pretendard', data: w7, weight: 700 as const, style: 'normal' as const },
    { name: 'Pretendard', data: w8, weight: 800 as const, style: 'normal' as const },
    { name: 'Pretendard', data: w9, weight: 900 as const, style: 'normal' as const },
  ];
}

// ── 색 토큰 ──
const BG = '#0A121E', SURF = '#16202E', TXT = '#FFFFFF', SUB = '#8B97A8', TEAL = '#38e0c8', DISC = '#5A6478';
const UP = '#FF4D5E', DOWN = '#4D8DFF', FEAR = '#FFB454';
const UP_T = 'rgba(255,77,94,0.14)', DOWN_T = 'rgba(77,141,255,0.14)', TEAL_T = 'rgba(56,224,200,0.10)', TEAL_T2 = 'rgba(56,224,200,0.12)';

// 실제 브랜드 로고(상승차트 마크, /icon.svg와 동일). data-URI로 인라인.
const LOGO_SVG = `<svg width="56" height="56" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="#101a29"/><stop offset="1" stop-color="#0a121d"/></linearGradient><linearGradient id="area" x1="24" y1="10" x2="24" y2="40" gradientUnits="userSpaceOnUse"><stop stop-color="#35e0c8" stop-opacity="0.42"/><stop offset="1" stop-color="#35e0c8" stop-opacity="0"/></linearGradient></defs><rect width="48" height="48" rx="12" fill="url(#bg)"/><rect x="0.5" y="0.5" width="47" height="47" rx="11.5" stroke="#35e0c8" stroke-opacity="0.35"/><path d="M9 31 L19 25 L27 28 L39 14 L39 39 L9 39 Z" fill="url(#area)"/><path d="M9 31 L19 25 L27 28 L39 14" stroke="#38e6cd" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M31.5 13.5 L39 14 L38.5 21.5" stroke="#38e6cd" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
const LOGO_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(LOGO_SVG)}`;

const col = (chg: number) => (chg > 0 ? UP : chg < 0 ? DOWN : SUB);
const tint = (chg: number) => (chg > 0 ? UP_T : chg < 0 ? DOWN_T : 'rgba(255,255,255,0.08)');
const arrow = (chg: number) => (chg > 0 ? '▲' : chg < 0 ? '▼' : '·');
const absPct = (chg: number) => `${Math.abs(chg).toFixed(2)}%`;
const chipPct = (chg: number) => `${arrow(chg)} ${absPct(chg)}`;

// ── 공통 크롬 ──
function Header({ right }: { right: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img width="56" height="56" src={LOGO_SRC} alt="" />
        <div style={{ display: 'flex', fontSize: 32, fontWeight: 800, color: TXT, letterSpacing: '-0.02em' }}>InvestK</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', background: SURF, borderRadius: 999, padding: '14px 28px', fontSize: 25, fontWeight: 700, color: SUB }}>{right}</div>
    </div>
  );
}
function Footer({ active, right }: { active: number; right: string }) {
  const disc = right.includes('·');
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: 'flex', width: i === active ? 40 : 8, height: 8, background: i === active ? TEAL : 'rgba(255,255,255,0.18)', borderRadius: 4 }} />
        ))}
      </div>
      <div style={{ display: 'flex', fontSize: disc ? 22 : 24, fontWeight: disc ? 600 : 700, color: disc ? DISC : SUB }}>{right}</div>
    </div>
  );
}
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, background: BG, padding: 64, boxSizing: 'border-box', fontFamily: 'Pretendard' }}>{children}</div>
  );
}
function Eyebrow({ en, ko }: { en: string; ko: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 48 }}>
      <div style={{ display: 'flex', fontSize: 26, fontWeight: 800, color: TEAL }}>{en}</div>
      <div style={{ display: 'flex', fontSize: 76, fontWeight: 900, color: TXT, letterSpacing: '-0.04em' }}>{ko}</div>
    </div>
  );
}
function OneLiner({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, background: TEAL_T, borderRadius: 24, padding: '30px 40px', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: TEAL, borderRadius: 12, padding: '10px 20px', fontSize: 24, fontWeight: 900, color: BG, flexShrink: 0 }}>한줄평</div>
      <div style={{ display: 'flex', fontSize: 31, fontWeight: 700, color: TXT, lineHeight: 1.45 }}>{text}</div>
    </div>
  );
}
function Chip({ chg, size = 42 }: { chg: number; size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', background: tint(chg), borderRadius: 16, padding: '14px 26px', fontSize: size, fontWeight: 900, color: col(chg) }}>{chipPct(chg)}</div>
  );
}
// 방향성 스파크바 7개(마지막 바만 등락색). 상승=오름세, 하락=내림세 형태.
function Spark({ chg }: { chg: number }) {
  const base = chg >= 0 ? [16, 24, 20, 30, 26, 34, 52] : [52, 34, 26, 30, 20, 24, 16];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
      {base.map((h, i) => (
        <div key={i} style={{ display: 'flex', width: 12, height: h, background: i === 6 ? col(chg) : 'rgba(255,255,255,0.14)', borderRadius: 4 }} />
      ))}
    </div>
  );
}

// ── 카드 1 · 커버 ──
function Cover(d: CardData) {
  const h = d.hero, o = d.heroOther;
  const word = Math.abs(h.chg) >= 3 ? (h.chg > 0 ? '급등' : '급락') : h.chg > 0 ? '상승' : h.chg < 0 ? '하락' : '보합';
  const signed = `${h.chg > 0 ? '+' : h.chg < 0 ? '−' : ''}${Math.abs(h.chg).toFixed(2)}`;
  const tiles: { label: string; chg: number; txt?: string }[] = [
    { label: '코스피', chg: d.kospi.chg },
    { label: '나스닥', chg: d.nasdaq.chg },
    { label: '코인', chg: d.coinGlobalAvg },
    { label: '환율', chg: d.usdkrw.chg, txt: `${arrow(d.usdkrw.chg)} ${absPct(d.usdkrw.chg)}` },
  ];
  return (
    <Frame>
      <Header right={d.dateLabel} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 30 }}>
        <div style={{ display: 'flex' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: TEAL_T2, borderRadius: 999, padding: '12px 26px', fontSize: 26, fontWeight: 800, color: TEAL }}>오늘의 시장 브리핑</div>
        </div>
        <div style={{ display: 'flex', fontSize: 96, fontWeight: 900, color: TXT, letterSpacing: '-0.04em', lineHeight: 1.15, marginTop: 12 }}>{h.name}, 하루 만에</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
          <div style={{ display: 'flex', fontSize: 210, fontWeight: 900, color: col(h.chg), letterSpacing: '-0.05em', lineHeight: 1 }}>
            {signed}<span style={{ fontSize: 110, fontWeight: 900 }}>%</span>
          </div>
          <div style={{ display: 'flex', fontSize: 72, fontWeight: 900, color: TXT, letterSpacing: '-0.03em' }}>{word}</div>
        </div>
        {o && (
          <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, color: SUB, letterSpacing: '-0.02em', marginTop: 8 }}>
            반면 <span style={{ color: col(o.chg), fontWeight: 900 }}>&nbsp;{o.name} {o.chg > 0 ? '+' : '−'}{absPct(o.chg)}&nbsp;</span> {o.chg > 0 ? '상승' : '하락'}, 무슨 일?
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'row', gap: 14, marginTop: 56 }}>
          {tiles.map((t, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, background: SURF, borderRadius: 20, padding: 28 }}>
              <div style={{ display: 'flex', fontSize: 23, fontWeight: 700, color: SUB }}>{t.label}</div>
              <div style={{ display: 'flex', fontSize: 34, fontWeight: 900, color: col(t.chg) }}>{t.txt ?? chipPct(t.chg)}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', width: 40, height: 8, background: TEAL, borderRadius: 4 }} />
          {[1, 2, 3, 4].map((i) => <div key={i} style={{ display: 'flex', width: 8, height: 8, background: 'rgba(255,255,255,0.18)', borderRadius: 4 }} />)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', background: TEAL, borderRadius: 999, padding: '16px 32px', fontSize: 27, fontWeight: 900, color: BG }}>넘겨서 30초 정리 →</div>
      </div>
    </Frame>
  );
}

// 지수 행(값 + 칩 [+ 스파크])
function Row({ label, m, spark, sublabel, warnTint }: { label: string; m: Move; spark?: boolean; sublabel?: string; warnTint?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: warnTint ? 'rgba(255,77,94,0.10)' : SURF, borderRadius: 28, padding: spark ? '36px 44px' : '32px 44px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spark ? 12 : 10 }}>
        <div style={{ display: 'flex', fontSize: sublabel ? 26 : 27, fontWeight: 700, color: warnTint ? '#FF9AA5' : SUB }}>{sublabel ?? label}</div>
        <div style={{ display: 'flex', fontSize: 54, fontWeight: 900, color: TXT, letterSpacing: '-0.03em' }}>{m.val}</div>
      </div>
      {spark ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 16 }}>
          <Chip chg={m.chg} />
          <Spark chg={m.chg} />
        </div>
      ) : (
        <Chip chg={m.chg} size={40} />
      )}
    </div>
  );
}

// ── 카드 2 · 국내 증시 ──
function Kr(d: CardData) {
  return (
    <Frame>
      <Header right="1 / 4" />
      <Eyebrow en="KOREA" ko="국내 증시" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 30 }}>
        <Row label="코스피" m={d.kospi} spark />
        <Row label="코스닥" m={d.kosdaq} spark />
        <Row label="원/달러 환율" m={d.usdkrw} spark />
        <OneLiner text={d.lineKr} />
      </div>
      <Footer active={1} right="@investk" />
    </Frame>
  );
}

// ── 카드 3 · 해외 증시 ──
function Global(d: CardData) {
  return (
    <Frame>
      <Header right="2 / 4" />
      <Eyebrow en="GLOBAL" ko="해외 증시" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 26 }}>
        <Row label="S&P 500" m={d.sp500} />
        <Row label="나스닥" m={d.nasdaq} />
        <Row label="다우존스" m={d.dow} />
        <Row label="VIX" m={d.vix} sublabel="VIX 공포지수 · 변동성 지표" warnTint={d.vix.chg > 0} />
        <OneLiner text={d.lineGlobal} />
      </div>
      <Footer active={2} right="@investk" />
    </Frame>
  );
}

// ── 카드 4 · 코인·심리 ──
function fngInfo(v: number): { label: string; color: string; bucket: number } {
  if (v < 20) return { label: '극단적 공포', color: UP, bucket: 1 };
  if (v < 40) return { label: '공포', color: FEAR, bucket: 2 };
  if (v < 60) return { label: '중립', color: SUB, bucket: 3 };
  if (v < 80) return { label: '탐욕', color: TEAL, bucket: 4 };
  return { label: '극단적 탐욕', color: '#22C55E', bucket: 5 };
}
function Crypto(d: CardData) {
  const f = d.fng != null ? fngInfo(d.fng) : null;
  const segColors = ['#FF4D5E', '#FFB454', '#E8C84D', '#7BD88F', '#22C55E'];
  return (
    <Frame>
      <Header right="3 / 4" />
      <Eyebrow en="CRYPTO" ko="코인 · 시장 심리" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 30 }}>
        <div style={{ display: 'flex', flexDirection: 'row', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 14, background: SURF, borderRadius: 28, padding: 36 }}>
            <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: SUB }}>해외 코인 평균</div>
            <div style={{ display: 'flex', fontSize: 68, fontWeight: 900, color: col(d.coinGlobalAvg), letterSpacing: '-0.03em' }}>{chipPct(d.coinGlobalAvg)}</div>
            <div style={{ display: 'flex', fontSize: 25, fontWeight: 600, color: SUB }}>{d.btcPrice ? `BTC ${d.btcPrice}` : '전 종목 평균'}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 14, background: SURF, borderRadius: 28, padding: 36 }}>
            <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: SUB }}>국내 코인 평균</div>
            <div style={{ display: 'flex', fontSize: 68, fontWeight: 900, color: col(d.coinKrAvg), letterSpacing: '-0.03em' }}>{chipPct(d.coinKrAvg)}</div>
            <div style={{ display: 'flex', fontSize: 25, fontWeight: 600, color: SUB }}>업비트 기준</div>
          </div>
        </div>
        {d.kimchi && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: SURF, borderRadius: 28, padding: '34px 44px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: SUB }}>김치프리미엄</div>
              <div style={{ display: 'flex', fontSize: 25, fontWeight: 600, color: SUB }}>국내·해외 가격차 (BTC 기준)</div>
            </div>
            <div style={{ display: 'flex', fontSize: 64, fontWeight: 900, color: TXT, letterSpacing: '-0.03em' }}>{d.kimchi}</div>
          </div>
        )}
        {f && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, background: SURF, borderRadius: 28, padding: '36px 44px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: SUB }}>크립토 공포 · 탐욕지수</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <div style={{ display: 'flex', fontSize: 64, fontWeight: 900, color: f.color, lineHeight: 1 }}>{d.fng}</div>
                <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,180,84,0.16)', borderRadius: 999, padding: '8px 20px', fontSize: 26, fontWeight: 900, color: f.color }}>{f.label}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'row', gap: 6 }}>
                {segColors.map((c, i) => (
                  <div key={i} style={{ display: 'flex', flex: 19, height: 14, background: i < f.bucket ? c : 'rgba(255,255,255,0.12)', borderRadius: 7 }} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, color: SUB }}>극단적 공포</div>
                <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, color: SUB }}>극단적 탐욕</div>
              </div>
            </div>
          </div>
        )}
        <OneLiner text={d.lineCrypto} />
      </div>
      <Footer active={3} right="@investk" />
    </Frame>
  );
}

// ── 카드 5 · 마무리 ──
function Outro(d: CardData) {
  const krC = d.kospi.chg, usC = (d.sp500.chg + d.nasdaq.chg) / 2;
  const word = (c: number, up: string, dn: string, fl: string) => (c > 0.3 ? up : c < -0.3 ? dn : fl);
  return (
    <Frame>
      <Header right="끝" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 44 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: TEAL_T2, borderRadius: 999, padding: '12px 26px', fontSize: 26, fontWeight: 800, color: TEAL }}>오늘 한 줄 정리</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 84, fontWeight: 900, color: TXT, letterSpacing: '-0.04em', lineHeight: 1.25 }}>
            <div style={{ display: 'flex' }}>국내는 <span style={{ color: col(krC) }}>&nbsp;{word(krC, '뜨겁고', '주춤했고', '잠잠하고')}&nbsp;</span></div>
            <div style={{ display: 'flex' }}>미국은 <span style={{ color: col(usC) }}>&nbsp;{word(usC, '순항 중', '숨 고르기', '관망세')}</span></div>
          </div>
        </div>
        {d.event && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: SURF, borderRadius: 28, padding: '36px 44px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minWidth: 0, marginRight: 28 }}>
              <div style={{ display: 'flex', fontSize: 25, fontWeight: 800, color: TEAL }}>주목할 일정</div>
              <div style={{ display: 'flex', fontSize: 42, fontWeight: 900, color: TXT, letterSpacing: '-0.02em' }}>{d.event.name}</div>
              {d.event.sub && <div style={{ display: 'flex', fontSize: 26, fontWeight: 600, color: SUB, lineHeight: 1.35 }}>{d.event.sub}</div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: '24px 32px', flexShrink: 0 }}>
              <div style={{ display: 'flex', fontSize: 24, fontWeight: 700, color: SUB }}>{d.event.month}</div>
              <div style={{ display: 'flex', fontSize: 52, fontWeight: 900, color: TXT, lineHeight: 1.1 }}>{d.event.day}</div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: TEAL, borderRadius: 20, padding: 34, fontSize: 36, fontWeight: 900, color: BG }}>전체 지표 보러가기 → investk.app</div>
          <div style={{ display: 'flex', justifyContent: 'center', fontSize: 27, fontWeight: 700, color: SUB }}>매일 아침, 프로필 링크에서</div>
        </div>
      </div>
      <Footer active={4} right="참고용 지표 · 투자 권유 아님 · @investk" />
    </Frame>
  );
}

const RENDERERS: Record<string, (d: CardData) => React.ReactElement> = {
  cover: Cover, kr: Kr, global: Global, crypto: Crypto, outro: Outro,
};

// ══════════════ 뉴스 캐러셀 ══════════════
const impColor = (im: string) => (im === '호재' ? UP : im === '악재' ? DOWN : SUB);
const impTint = (im: string) => (im === '호재' ? UP_T : im === '악재' ? DOWN_T : 'rgba(255,255,255,0.08)');

// 뉴스 커버 — 배지 + 대표 헤드라인 + 3건 티저 리스트
function NewsCover(nd: NewsCardData) {
  const items = nd.items.slice(0, 3);
  const top = items[0];
  return (
    <Frame>
      <Header right={`${nd.dateLabel} · 저녁`} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 36 }}>
        <div style={{ display: 'flex' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: TEAL_T2, borderRadius: 999, padding: '12px 26px', fontSize: 26, fontWeight: 800, color: TEAL }}>오늘 꼭 알아야 할 뉴스 {items.length}</div>
        </div>
        <div style={{ display: 'flex', fontSize: 86, fontWeight: 900, color: TXT, letterSpacing: '-0.04em', lineHeight: 1.2 }}>{top ? top.title : '오늘의 주요 뉴스'}</div>
        <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: SUB, letterSpacing: '-0.02em' }}>넘기면서 30초면 충분해요</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 24 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 24, background: SURF, borderRadius: 20, padding: '28px 34px' }}>
              <div style={{ display: 'flex', fontSize: 30, fontWeight: 900, color: TEAL, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</div>
              <div style={{ display: 'flex', fontSize: 29, fontWeight: 700, color: TXT, lineHeight: 1.3 }}>{it.title}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', width: 40, height: 8, background: TEAL, borderRadius: 4 }} />
          {[1, 2, 3, 4].map((i) => <div key={i} style={{ display: 'flex', width: 8, height: 8, background: 'rgba(255,255,255,0.18)', borderRadius: 4 }} />)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', background: TEAL, borderRadius: 999, padding: '16px 32px', fontSize: 27, fontWeight: 900, color: BG }}>넘겨서 요약 보기 →</div>
      </div>
    </Frame>
  );
}

// 뉴스 항목 카드 — 카테고리 칩 + 제목 + 팩트 불릿 3 + '왜 중요해?'
function NewsCard({ item, idx, total }: { item: NewsItem; idx: number; total: number }) {
  return (
    <Frame>
      <Header right={`${idx + 1} / ${total}`} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 38 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', background: impTint(item.impact), borderRadius: 999, padding: '10px 24px', fontSize: 25, fontWeight: 800, color: impColor(item.impact) }}>{item.category}</div>
          <div style={{ display: 'flex', fontSize: 25, fontWeight: 700, color: SUB }}>NEWS {String(idx + 1).padStart(2, '0')}</div>
        </div>
        <div style={{ display: 'flex', fontSize: 68, fontWeight: 900, color: TXT, letterSpacing: '-0.04em', lineHeight: 1.28 }}>{item.title}</div>
        {item.bullets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, background: SURF, borderRadius: 28, padding: '44px 48px' }}>
            {item.bullets.map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', width: 10, height: 10, background: TEAL, borderRadius: 5, marginTop: 16, flexShrink: 0 }} />
                <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, color: '#D3DAE3', lineHeight: 1.5 }}>{b}</div>
              </div>
            ))}
          </div>
        )}
        {item.why && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, background: TEAL_T, borderRadius: 24, padding: '34px 40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: TEAL, borderRadius: 12, padding: '10px 20px', fontSize: 24, fontWeight: 900, color: BG, flexShrink: 0 }}>왜 중요해?</div>
            <div style={{ display: 'flex', fontSize: 29, fontWeight: 700, color: TXT, lineHeight: 1.45 }}>{item.why}</div>
          </div>
        )}
      </div>
      <Footer active={idx + 1} right="@investk" />
    </Frame>
  );
}

// 뉴스 마무리 — 대비 한 줄 + 내일 안내 + CTA
function NewsOutro(nd: NewsCardData) {
  const w = nd.wrap;
  const line1 = w ? w.a : '오늘의 뉴스,';
  const line2 = w ? w.b : '3분이면 정리 끝';
  const c1 = w ? UP : TXT;
  const c2 = w ? DOWN : TEAL;
  return (
    <Frame>
      <Header right="끝" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 44 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: TEAL_T2, borderRadius: 999, padding: '12px 26px', fontSize: 26, fontWeight: 800, color: TEAL }}>오늘 뉴스 한 줄 정리</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 80, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.28 }}>
            <div style={{ display: 'flex', color: c1 }}>{line1}</div>
            <div style={{ display: 'flex', color: c2 }}>{line2}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: SURF, borderRadius: 28, padding: '40px 48px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', fontSize: 25, fontWeight: 800, color: TEAL }}>내일 아침 6시 반</div>
            <div style={{ display: 'flex', fontSize: 40, fontWeight: 900, color: TXT, letterSpacing: '-0.02em' }}>시장 지표 브리핑으로 돌아와요</div>
            <div style={{ display: 'flex', fontSize: 26, fontWeight: 600, color: SUB }}>매일 아침 지표 · 저녁 뉴스</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: TEAL, borderRadius: 20, padding: 34, fontSize: 36, fontWeight: 900, color: BG }}>전체 뉴스 보러가기 → investk.app</div>
          <div style={{ display: 'flex', justifyContent: 'center', fontSize: 27, fontWeight: 700, color: SUB }}>놓치기 싫으면 팔로우 + 저장</div>
        </div>
      </div>
      <Footer active={4} right="참고용 정보 · 투자 권유 아님 · @investk" />
    </Frame>
  );
}

function renderNews(type: string, nd: NewsCardData): React.ReactElement | null {
  if (type === 'news-cover') return <NewsCover {...nd} />;
  if (type === 'news-outro') return <NewsOutro {...nd} />;
  const m = /^news-(\d+)$/.exec(type);
  if (m) {
    const idx = parseInt(m[1], 10);
    const item = nd.items[idx];
    if (!item) return null;
    return <NewsCard item={item} idx={idx} total={Math.min(nd.items.length, 3)} />;
  }
  return null;
}

export async function GET(_req: Request, { params }: { params: { type: string } }) {
  if (params.type.startsWith('news')) {
    const nd = await getNewsCardData();
    const el = renderNews(params.type, nd);
    if (!el) return new Response('no news card', { status: 404 });
    return new ImageResponse(el, { width: 1080, height: 1350, fonts: await fonts() });
  }
  const render = RENDERERS[params.type];
  if (!render) return new Response('unknown card type', { status: 404 });
  const d = await getCardData();
  return new ImageResponse(render(d), { width: 1080, height: 1350, fonts: await fonts() });
}
