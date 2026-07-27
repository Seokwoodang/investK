import { ImageResponse } from 'next/og';
import {
  getCardData, getNewsCardData, getValueCardData, getCalendarCardData, getTermCardData, getBreakingCardData, getWeekReviewData,
  getStockCardData,
  type CardData, type Move, type NewsCardData, type NewsItem,
  type ValueCardData, type ValueStock, type CalCardData, type CalEvent, type TermCardData, type BreakingData,
  type WeekReviewData, type WeekIndexRow, type StockPickData,
} from '@/server/cardData';

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
// 뉴스 지역 강조색: 국내=틸(브랜드), 미국=바이올렛. 썸네일에서 색만 봐도 국장/미장 구분.
const US_ACC = '#9B8CFF', US_ACC_T = 'rgba(155,140,255,0.14)', US_ACC_T2 = 'rgba(155,140,255,0.16)';
const accOf = (region?: string) => (region === '미국' ? US_ACC : TEAL);
const accTOf = (region?: string) => (region === '미국' ? US_ACC_T : TEAL_T);
const accT2Of = (region?: string) => (region === '미국' ? US_ACC_T2 : TEAL_T2);

// 실제 브랜드 로고(상승차트 마크, /icon.svg와 동일). data-URI로 인라인.
const LOGO_SVG = `<svg width="56" height="56" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="#101a29"/><stop offset="1" stop-color="#0a121d"/></linearGradient><linearGradient id="area" x1="24" y1="10" x2="24" y2="40" gradientUnits="userSpaceOnUse"><stop stop-color="#35e0c8" stop-opacity="0.42"/><stop offset="1" stop-color="#35e0c8" stop-opacity="0"/></linearGradient></defs><rect width="48" height="48" rx="12" fill="url(#bg)"/><rect x="0.5" y="0.5" width="47" height="47" rx="11.5" stroke="#35e0c8" stroke-opacity="0.35"/><path d="M9 31 L19 25 L27 28 L39 14 L39 39 L9 39 Z" fill="url(#area)"/><path d="M9 31 L19 25 L27 28 L39 14" stroke="#38e6cd" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M31.5 13.5 L39 14 L38.5 21.5" stroke="#38e6cd" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
const LOGO_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(LOGO_SVG)}`;

const col = (chg: number) => (chg > 0 ? UP : chg < 0 ? DOWN : SUB);
const tint = (chg: number) => (chg > 0 ? UP_T : chg < 0 ? DOWN_T : 'rgba(255,255,255,0.08)');
const arrow = (chg: number) => (chg > 0 ? '▲' : chg < 0 ? '▼' : '·');
const absPct = (chg: number) => `${Math.abs(chg).toFixed(2)}%`;
const chipPct = (chg: number) => `${arrow(chg)} ${absPct(chg)}`;

// ── 공통 크롬 ──
// 큰 로고·계정명·페이지표시(n/4)는 제거(인스타가 자체 표시). 대신 퍼가기 방지용으로
// 우측 상단에 은은한 도메인 워터마크만 둔다(인스타 밖으로 유출 시 출처 식별).
function Header(_props: { right: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
      <div style={{ display: 'flex', fontSize: 25, fontWeight: 800, color: 'rgba(139,151,168,0.55)', letterSpacing: '-0.01em' }}>investk.app</div>
    </div>
  );
}
void LOGO_SRC; // (미사용) 로고 마크는 프로필사진(/api/pfp)에서만 사용.
// 하단 꼬리말: 인스타가 캐러셀 위치를 표시하므로 진행 점은 제거하고 우측 텍스트만.
function Footer({ right }: { right: string }) {
  const disc = right.includes('·');
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
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
          <div style={{ display: 'flex', alignItems: 'baseline', fontSize: 210, fontWeight: 900, color: col(h.chg), letterSpacing: '-0.05em', lineHeight: 1 }}>
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
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
      <Footer right="@investk" />
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
      <Footer right="@investk" />
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
      <Footer right="@investk" />
    </Frame>
  );
}

// ── 카드 5 · 마무리 ──
function Outro(d: CardData) {
  const krC = d.kospi.chg, usC = (d.sp500.chg + d.nasdaq.chg) / 2;
  const word = (c: number, up: string, dn: string, fl: string) => (c > 0.3 ? up : c < -0.3 ? dn : fl);
  return (
    <Frame>
      <Header right="" />
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: TEAL, borderRadius: 20, padding: 34, fontSize: 36, fontWeight: 900, color: BG }}>전체 지표는 프로필 링크에서 ↑</div>
          <div style={{ display: 'flex', justifyContent: 'center', fontSize: 27, fontWeight: 700, color: SUB }}>매일 아침, 프로필 링크에서</div>
        </div>
      </div>
      <Footer right="참고용 지표 · 투자 권유 아님 · @investk" />
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
  const acc = accOf(nd.regionLabel);
  const region = nd.regionLabel; // '국내' | '미국' | ''
  return (
    <Frame>
      <Header right="" />
      {/* 지역 배너: 썸네일에서 색·큰 글자만으로 국장/미장 즉시 구분 */}
      {region ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', background: acc, borderRadius: 18, padding: '18px 34px', fontSize: 54, fontWeight: 900, color: BG, letterSpacing: '-0.02em' }}>{region} 증시</div>
          <div style={{ display: 'flex', alignItems: 'center', background: accT2Of(region), borderRadius: 14, padding: '14px 24px', fontSize: 30, fontWeight: 800, color: acc }}>{nd.slotLabel || '뉴스'}</div>
        </div>
      ) : (
        <div style={{ display: 'flex' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: TEAL_T2, borderRadius: 999, padding: '12px 26px', fontSize: 26, fontWeight: 800, color: TEAL }}>오늘 꼭 알아야 할 뉴스 {items.length}</div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 32 }}>
        <div style={{ display: 'flex', fontSize: 84, fontWeight: 900, color: TXT, letterSpacing: '-0.04em', lineHeight: 1.2 }}>{top ? top.title : '오늘의 주요 뉴스'}</div>
        <div style={{ display: 'flex', fontSize: 38, fontWeight: 700, color: SUB, letterSpacing: '-0.02em' }}>넘기면서 30초면 충분해요</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 24, background: SURF, borderRadius: 20, padding: '28px 34px' }}>
              <div style={{ display: 'flex', fontSize: 30, fontWeight: 900, color: acc, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</div>
              <div style={{ display: 'flex', fontSize: 29, fontWeight: 700, color: TXT, lineHeight: 1.3 }}>{it.title}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', background: acc, borderRadius: 999, padding: '16px 32px', fontSize: 27, fontWeight: 900, color: BG }}>넘겨서 요약 보기 →</div>
      </div>
    </Frame>
  );
}

// 뉴스 항목 카드 — 카테고리 칩 + 제목 + 팩트 불릿 3 + '왜 중요해?'
function NewsCard({ item, idx, total, region }: { item: NewsItem; idx: number; total: number; region?: string }) {
  const acc = accOf(region);
  return (
    <Frame>
      <Header right={`${idx + 1} / ${total}`} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 38 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', background: impTint(item.impact), borderRadius: 999, padding: '10px 24px', fontSize: 25, fontWeight: 800, color: impColor(item.impact) }}>{item.category}</div>
          {region ? <div style={{ display: 'flex', alignItems: 'center', background: accT2Of(region), borderRadius: 999, padding: '10px 22px', fontSize: 24, fontWeight: 800, color: acc }}>{region}</div> : null}
          <div style={{ display: 'flex', fontSize: 25, fontWeight: 700, color: SUB }}>NEWS {String(idx + 1).padStart(2, '0')}</div>
        </div>
        <div style={{ display: 'flex', fontSize: 68, fontWeight: 900, color: TXT, letterSpacing: '-0.04em', lineHeight: 1.28 }}>{item.title}</div>
        {item.bullets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, background: SURF, borderRadius: 28, padding: '44px 48px' }}>
            {item.bullets.map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', width: 10, height: 10, background: acc, borderRadius: 5, marginTop: 16, flexShrink: 0 }} />
                <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, color: '#D3DAE3', lineHeight: 1.5 }}>{b}</div>
              </div>
            ))}
          </div>
        )}
        {item.why && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, background: accTOf(region), borderRadius: 24, padding: '34px 40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: acc, borderRadius: 12, padding: '10px 20px', fontSize: 24, fontWeight: 900, color: BG, flexShrink: 0 }}>왜 중요해?</div>
            <div style={{ display: 'flex', fontSize: 29, fontWeight: 700, color: TXT, lineHeight: 1.45 }}>{item.why}</div>
          </div>
        )}
      </div>
      <Footer right="@investk" />
    </Frame>
  );
}

// 뉴스 마무리 — 대비 한 줄 + 내일 안내 + CTA
function NewsOutro(nd: NewsCardData) {
  const w = nd.wrap;
  const acc = accOf(nd.regionLabel);
  const line1 = w ? w.a : '오늘의 뉴스,';
  const line2 = w ? w.b : '3분이면 정리 끝';
  const c1 = w ? UP : TXT;
  const c2 = w ? DOWN : acc;
  const rl = nd.regionLabel ? `${nd.regionLabel} 뉴스 한 줄 정리` : '오늘 뉴스 한 줄 정리';
  return (
    <Frame>
      <Header right="" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 44 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: accT2Of(nd.regionLabel), borderRadius: 999, padding: '12px 26px', fontSize: 26, fontWeight: 800, color: acc }}>{rl}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 80, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.28 }}>
            <div style={{ display: 'flex', color: c1 }}>{line1}</div>
            <div style={{ display: 'flex', color: c2 }}>{line2}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: SURF, borderRadius: 28, padding: '40px 48px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', fontSize: 25, fontWeight: 800, color: acc }}>매일 이 시간</div>
            <div style={{ display: 'flex', fontSize: 40, fontWeight: 900, color: TXT, letterSpacing: '-0.02em' }}>국내·미국 뉴스로 돌아와요</div>
            <div style={{ display: 'flex', fontSize: 26, fontWeight: 600, color: SUB }}>하루 4번 · 국장/미장 개장·마감</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: acc, borderRadius: 20, padding: 34, fontSize: 36, fontWeight: 900, color: BG }}>전체 뉴스는 프로필 링크에서 ↑</div>
          <div style={{ display: 'flex', justifyContent: 'center', fontSize: 27, fontWeight: 700, color: SUB }}>놓치기 싫으면 팔로우 + 저장</div>
        </div>
      </div>
      <Footer right="참고용 정보 · 투자 권유 아님 · @investk" />
    </Frame>
  );
}

// ══════════════ 공용 조각 ══════════════
function Badge({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex' }}>
      <div style={{ display: 'flex', alignItems: 'center', background: TEAL_T2, borderRadius: 999, padding: '12px 26px', fontSize: 26, fontWeight: 800, color: TEAL }}>{text}</div>
    </div>
  );
}
function CtaBar({ text, sub }: { text: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: TEAL, borderRadius: 20, padding: 34, fontSize: 36, fontWeight: 900, color: BG }}>{text}</div>
      {sub ? <div style={{ display: 'flex', justifyContent: 'center', fontSize: 27, fontWeight: 700, color: SUB }}>{sub}</div> : null}
    </div>
  );
}
function CoverCta({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', background: TEAL, borderRadius: 999, padding: '16px 32px', fontSize: 27, fontWeight: 900, color: BG }}>{text}</div>
    </div>
  );
}

// ══════════════ ① 저평가 우량주 TOP5 ══════════════
function ValueCover(vd: ValueCardData) {
  const label = vd.market === 'kr' ? '국내' : '해외';
  return (
    <Frame>
      <Header right={vd.dateLabel} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 32 }}>
        <Badge text="이번 주 저평가 우량주" />
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 100, fontWeight: 900, color: TXT, letterSpacing: '-0.04em', lineHeight: 1.18 }}>
          <div style={{ display: 'flex' }}>지표로 고른</div>
          <div style={{ display: 'flex' }}>{label} <span style={{ color: TEAL }}>&nbsp;TOP 5</span></div>
        </div>
        <div style={{ display: 'flex', fontSize: 38, fontWeight: 700, color: SUB, letterSpacing: '-0.02em' }}>PER · PBR · ROE · 배당, 숫자로만 골랐습니다</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {vd.items.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: SURF, borderRadius: 18, padding: '24px 34px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                <div style={{ display: 'flex', fontSize: 28, fontWeight: 900, color: TEAL }}>{s.rank}</div>
                <div style={{ display: 'flex', fontSize: 29, fontWeight: 800, color: TXT }}>{s.name}</div>
              </div>
              {s.upside !== '—' ? <div style={{ display: 'flex', fontSize: 27, fontWeight: 800, color: UP }}>상승여력 {s.upside}</div> : <div style={{ display: 'flex', fontSize: 27, fontWeight: 800, color: TEAL }}>{s.score}점</div>}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', fontSize: 23, fontWeight: 600, color: DISC }}>지표 기준 자동 선별 · 종목 추천 아님</div>
      </div>
      <CoverCta text="1위부터 보기 →" />
    </Frame>
  );
}
function ValueStockCard({ s, total }: { s: ValueStock; total: number }) {
  return (
    <Frame>
      <Header right="이번 주 TOP 5" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 34 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', fontSize: 30, fontWeight: 900, color: TEAL }}>{s.rank}</div>
              {s.badge ? <div style={{ display: 'flex', alignItems: 'center', background: TEAL_T2, borderRadius: 999, padding: '8px 20px', fontSize: 23, fontWeight: 800, color: TEAL }}>{s.badge}</div> : null}
            </div>
            <div style={{ display: 'flex', fontSize: 84, fontWeight: 900, color: TXT, letterSpacing: '-0.04em', lineHeight: 1.1 }}>{s.name}</div>
            <div style={{ display: 'flex', fontSize: 27, fontWeight: 600, color: SUB }}>{s.priceLine}</div>
          </div>
          {s.upside !== '—' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <div style={{ display: 'flex', fontSize: 25, fontWeight: 700, color: SUB }}>상승여력</div>
              <div style={{ display: 'flex', fontSize: 76, fontWeight: 900, color: UP, lineHeight: 1, letterSpacing: '-0.03em' }}>{s.upside}</div>
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'row', gap: 16 }}>
          {[{ k: 'PER', v: s.per }, { k: 'PBR', v: s.pbr }, { k: 'ROE', v: s.roe }, { k: '배당수익률', v: s.div }].map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 12, background: SURF, borderRadius: 20, padding: '30px 24px' }}>
              <div style={{ display: 'flex', fontSize: 23, fontWeight: 700, color: SUB }}>{m.k}</div>
              <div style={{ display: 'flex', fontSize: 44, fontWeight: 900, color: TXT, letterSpacing: '-0.02em' }}>{m.v}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, background: SURF, borderRadius: 24, padding: '38px 44px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: SUB }}>InvestK 종합 점수</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ display: 'flex', fontSize: 56, fontWeight: 900, color: TEAL, lineHeight: 1 }}>{s.score}</div>
              <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, color: SUB }}>/ 100</div>
            </div>
          </div>
          <div style={{ display: 'flex', width: '100%', height: 14, background: 'rgba(255,255,255,0.08)', borderRadius: 7 }}>
            <div style={{ display: 'flex', height: 14, background: TEAL, borderRadius: 7, width: `${s.score}%` }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, background: TEAL_T, borderRadius: 24, padding: '32px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: TEAL, borderRadius: 12, padding: '10px 20px', fontSize: 24, fontWeight: 900, color: BG, flexShrink: 0 }}>한줄평</div>
          <div style={{ display: 'flex', fontSize: 29, fontWeight: 700, color: TXT, lineHeight: 1.45 }}>{s.comment}</div>
        </div>
      </div>
      <Footer right="@investk" />
    </Frame>
  );
}
function ValueOutro(vd: ValueCardData) {
  const nextLabel = vd.market === 'kr' ? '해외' : '국내';
  return (
    <Frame>
      <Header right="" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 44 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Badge text="매주 월요일" />
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 84, fontWeight: 900, color: TXT, letterSpacing: '-0.04em', lineHeight: 1.25 }}>
            <div style={{ display: 'flex' }}>싸게 사는 게</div>
            <div style={{ display: 'flex' }}><span style={{ color: TEAL }}>절반</span>입니다</div>
          </div>
          <div style={{ display: 'flex', fontSize: 33, fontWeight: 600, color: SUB, lineHeight: 1.5 }}>전체 순위와 세부 지표는 앱에서 무료로 볼 수 있어요.</div>
        </div>
        <CtaBar text="전체 순위는 프로필 링크에서 ↑" sub={`다음 주 월요일, ${nextLabel} TOP 5로 돌아옵니다`} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '30px 38px' }}>
          <div style={{ display: 'flex', fontSize: 24, fontWeight: 800, color: SUB }}>꼭 읽어주세요</div>
          <div style={{ display: 'flex', fontSize: 25, fontWeight: 600, color: SUB, lineHeight: 1.5 }}>공개된 재무 지표 기준의 자동 선별 결과이며, 특정 종목의 매수·매도 추천이 아닙니다. 투자 판단과 책임은 본인에게 있습니다.</div>
        </div>
      </div>
      <Footer right="참고용 지표 · 투자 권유 아님 · @investk" />
    </Frame>
  );
}
function renderValue(type: string, vd: ValueCardData): React.ReactElement | null {
  if (type === 'value-cover') return <ValueCover {...vd} />;
  if (type === 'value-outro') return <ValueOutro {...vd} />;
  const m = /^value-(\d+)$/.exec(type);
  if (m) {
    const s = vd.items[parseInt(m[1], 10)];
    if (!s) return null;
    return <ValueStockCard s={s} total={vd.items.length} />;
  }
  return null;
}

// ══════════════ ② 주간 경제 캘린더 ══════════════
function CalRow({ e }: { e: CalEvent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 26, background: e.high ? 'rgba(255,77,94,0.10)' : SURF, borderRadius: 20, padding: '26px 34px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 96, flexShrink: 0 }}>
        <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, color: SUB }}>{e.dow}</div>
        <div style={{ display: 'flex', fontSize: 40, fontWeight: 900, color: TXT, lineHeight: 1.15 }}>{e.day}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', fontSize: 31, fontWeight: 800, color: TXT, letterSpacing: '-0.01em' }}>{e.name}</div>
          {e.high ? <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,77,94,0.16)', borderRadius: 999, padding: '5px 16px', fontSize: 21, fontWeight: 800, color: UP, flexShrink: 0 }}>고영향</div> : null}
        </div>
        {e.desc ? <div style={{ display: 'flex', fontSize: 24, fontWeight: 600, color: SUB }}>{e.desc}</div> : null}
      </div>
      <div style={{ display: 'flex', fontSize: 27, fontWeight: 800, color: SUB, flexShrink: 0 }}>{e.time}</div>
    </div>
  );
}
function CalCover(cd: CalCardData) {
  return (
    <Frame>
      <Header right={cd.dateLabel} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 34 }}>
        <Badge text="저장해두고 보세요" />
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 96, fontWeight: 900, color: TXT, letterSpacing: '-0.04em', lineHeight: 1.2 }}>
          <div style={{ display: 'flex' }}>이번 주</div>
          <div style={{ display: 'flex' }}>시장 <span style={{ color: TEAL }}>&nbsp;캘린더</span></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, color: SUB }}>{cd.range}</div>
          {cd.highCount > 0 ? <div style={{ display: 'flex', alignItems: 'center', background: UP_T, borderRadius: 999, padding: '10px 24px', fontSize: 26, fontWeight: 800, color: UP }}>고영향 {cd.highCount}개</div> : null}
        </div>
        {cd.highlight ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, background: SURF, borderRadius: 28, padding: '44px 48px', marginTop: 16 }}>
            <div style={{ display: 'flex', fontSize: 25, fontWeight: 800, color: UP }}>이번 주 하이라이트</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(255,77,94,0.12)', borderRadius: 18, padding: '20px 28px', flexShrink: 0 }}>
                <div style={{ display: 'flex', fontSize: 24, fontWeight: 700, color: '#FF9AA5' }}>{cd.highlight.dow}</div>
                <div style={{ display: 'flex', fontSize: 50, fontWeight: 900, color: TXT, lineHeight: 1.1 }}>{cd.highlight.day.split('.')[1]}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', fontSize: 42, fontWeight: 900, color: TXT, letterSpacing: '-0.02em' }}>{cd.highlight.name}</div>
                {cd.highlight.desc ? <div style={{ display: 'flex', fontSize: 27, fontWeight: 600, color: SUB }}>{cd.highlight.desc}</div> : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <CoverCta text="이번 주 일정 보기 →" />
    </Frame>
  );
}
function CalHalf({ cd, half }: { cd: CalCardData; half: 'first' | 'second' }) {
  const events = half === 'first' ? cd.firstHalf : cd.secondHalf;
  const en = half === 'first' ? 'MON – WED' : 'THU – SUN';
  const ko = half === 'first' ? '월 · 화 · 수' : '목 · 금 · 주말';
  return (
    <Frame>
      <Header right={half === 'first' ? '주 전반' : '주 후반'} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 48 }}>
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 800, color: TEAL }}>{en}</div>
        <div style={{ display: 'flex', fontSize: 64, fontWeight: 900, color: TXT, letterSpacing: '-0.04em' }}>{ko}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 16 }}>
        {events.length ? events.map((e, i) => <CalRow key={i} e={e} />) : <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, color: SUB }}>예정된 주요 일정이 없어요.</div>}
        {half === 'second' && cd.tip ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, background: TEAL_T, borderRadius: 24, padding: '32px 40px', marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: TEAL, borderRadius: 12, padding: '10px 20px', fontSize: 24, fontWeight: 900, color: BG, flexShrink: 0 }}>팁</div>
            <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, color: TXT, lineHeight: 1.45 }}>{cd.tip}</div>
          </div>
        ) : null}
      </div>
      <Footer right="@investk" />
    </Frame>
  );
}
function CalOutro(cd: CalCardData) {
  return (
    <Frame>
      <Header right="" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 44 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Badge text="이번 주 한 줄 요약" />
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 88, fontWeight: 900, color: TXT, letterSpacing: '-0.04em', lineHeight: 1.25 }}>
            <div style={{ display: 'flex' }}>이번 주 고비는</div>
            <div style={{ display: 'flex' }}><span style={{ color: UP }}>{cd.highlight ? cd.highlight.dowFull : '주중'}</span>입니다</div>
          </div>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 600, color: SUB, lineHeight: 1.5 }}>{cd.highlight ? `${cd.highlight.name} 결과에 한 주 방향이 갈려요.` : '개별 종목 이슈에 집중하기 좋은 한 주예요.'}</div>
        </div>
        <CtaBar text="매일 브리핑은 프로필 링크에서 ↑" sub="결과 나오면 아침 브리핑으로 바로 정리해드려요" />
      </div>
      <Footer right="참고용 지표 · 투자 권유 아님 · @investk" />
    </Frame>
  );
}
function renderCalendar(type: string, cd: CalCardData): React.ReactElement | null {
  if (type === 'cal-cover') return <CalCover {...cd} />;
  if (type === 'cal-1') return <CalHalf cd={cd} half="first" />;
  if (type === 'cal-2') return <CalHalf cd={cd} half="second" />;
  if (type === 'cal-outro') return <CalOutro {...cd} />;
  return null;
}

// ══════════════ ③ 투자 용어 1분 ══════════════
function termCoverSize(term: string): number {
  const isLatin = /^[A-Za-z0-9]+$/.test(term);
  if (isLatin) return term.length <= 3 ? 320 : term.length <= 4 ? 250 : 200;
  return Math.min(230, Math.floor(880 / (term.length + 1)));
}
function TermCover(td: TermCardData) {
  return (
    <Frame>
      <Header right="매주 수요일" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 8 }}>
        <Badge text="1분 투자 상식" />
        <div style={{ display: 'flex', fontSize: termCoverSize(td.term), fontWeight: 900, color: TEAL, letterSpacing: '-0.05em', lineHeight: 1.05 }}>{td.term}<span style={{ color: TXT }}>?</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 52, fontWeight: 800, color: TXT, letterSpacing: '-0.02em', lineHeight: 1.4, marginTop: 12 }}>
          {(td.coverSub ?? []).slice(0, 2).map((l, i) => <div key={i} style={{ display: 'flex' }}>{l}</div>)}
        </div>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, color: SUB, marginTop: 20 }}>뉴스에 매일 나오는데 아직 모른다면, 1분만 쓰세요</div>
      </div>
      <CoverCta text="1분 시작 →" />
    </Frame>
  );
}
function TermDef(td: TermCardData) {
  return (
    <Frame>
      <Header right="1 / 3" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 40 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 800, color: TEAL }}>{td.fullName}</div>
          <div style={{ display: 'flex', fontSize: 84, fontWeight: 900, color: TXT, letterSpacing: '-0.04em' }}>{td.term}이 뭐냐면요</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: 44, fontWeight: 700, color: '#D3DAE3', letterSpacing: '-0.02em', lineHeight: 1.55 }}>
          {(td.defLines ?? []).slice(0, 4).map((l, i) => (
            <div key={i} style={{ display: 'flex', flexWrap: 'wrap' }}>{l.t}{l.hl ? <span style={{ color: TEAL }}>&nbsp;{l.hl}&nbsp;</span> : null}{l.t2 ?? ''}</div>
          ))}
        </div>
        {td.formula ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, background: SURF, borderRadius: 28, padding: '40px 48px' }}>
            <div style={{ display: 'flex', fontSize: 24, fontWeight: 800, color: SUB }}>공식</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <div style={{ display: 'flex', fontSize: 52, fontWeight: 900, color: TEAL }}>{td.term}</div>
              <div style={{ display: 'flex', fontSize: 44, fontWeight: 800, color: SUB }}>=</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, color: TXT }}>{td.formula.a}</div>
                <div style={{ display: 'flex', width: 300, height: 3, background: 'rgba(255,255,255,0.3)' }} />
                <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, color: TXT }}>{td.formula.b}</div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <Footer right="@investk" />
    </Frame>
  );
}
function TermExample(td: TermCardData) {
  return (
    <Frame>
      <Header right="2 / 3" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 40 }}>
        <div style={{ display: 'flex', fontSize: 76, fontWeight: 900, color: TXT, letterSpacing: '-0.04em' }}>실제 숫자로 볼까요</div>
        {td.example ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, background: SURF, borderRadius: 28, padding: '44px 48px' }}>
            <div style={{ display: 'flex', fontSize: 26, fontWeight: 800, color: TEAL }}>{td.example.ticker}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', fontSize: 44, fontWeight: 800, color: TXT }}>{td.example.a}</div>
              <div style={{ display: 'flex', fontSize: 36, fontWeight: 700, color: SUB }}>÷</div>
              <div style={{ display: 'flex', fontSize: 44, fontWeight: 800, color: TXT }}>{td.example.b}</div>
              <div style={{ display: 'flex', fontSize: 36, fontWeight: 700, color: SUB }}>=</div>
              <div style={{ display: 'flex', fontSize: 60, fontWeight: 900, color: TEAL }}>{td.example.result}</div>
            </div>
            {td.example.note ? <div style={{ display: 'flex', fontSize: 25, fontWeight: 600, color: SUB }}>{td.example.note}</div> : null}
          </div>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'row', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, background: TEAL_T, borderRadius: 24, padding: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', background: TEAL, borderRadius: 999, padding: '8px 20px', fontSize: 24, fontWeight: 900, color: BG, alignSelf: 'flex-start' }}>{td.low.title}</div>
            <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, color: TXT, lineHeight: 1.5 }}>{td.low.sub}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, background: 'rgba(255,180,84,0.10)', borderRadius: 24, padding: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', background: FEAR, borderRadius: 999, padding: '8px 20px', fontSize: 24, fontWeight: 900, color: BG, alignSelf: 'flex-start' }}>{td.high.title}</div>
            <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, color: TXT, lineHeight: 1.5 }}>{td.high.sub}</div>
          </div>
        </div>
      </div>
      <Footer right="@investk" />
    </Frame>
  );
}
function TermTips(td: TermCardData) {
  return (
    <Frame>
      <Header right="3 / 3" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 36 }}>
        <div style={{ display: 'flex', fontSize: 76, fontWeight: 900, color: TXT, letterSpacing: '-0.04em' }}>이렇게 써먹으세요</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {(td.tips ?? []).slice(0, 2).map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 24, background: SURF, borderRadius: 24, padding: '38px 44px' }}>
              <div style={{ display: 'flex', fontSize: 34, fontWeight: 900, color: TEAL, flexShrink: 0 }}>{i + 1}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', fontSize: 33, fontWeight: 800, color: TXT }}>{t.title}</div>
                <div style={{ display: 'flex', fontSize: 26, fontWeight: 600, color: SUB, lineHeight: 1.5 }}>{t.sub}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, background: 'rgba(255,77,94,0.10)', borderRadius: 24, padding: '34px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,77,94,0.9)', borderRadius: 12, padding: '10px 20px', fontSize: 24, fontWeight: 900, color: TXT, flexShrink: 0 }}>흔한 오해</div>
          <div style={{ display: 'flex', fontSize: 29, fontWeight: 700, color: TXT, lineHeight: 1.5 }}>{td.misconception}</div>
        </div>
      </div>
      <Footer right="@investk" />
    </Frame>
  );
}
function TermOutro(td: TermCardData) {
  return (
    <Frame>
      <Header right="" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 44 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Badge text="오늘의 1분, 끝" />
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 84, fontWeight: 900, color: TXT, letterSpacing: '-0.04em', lineHeight: 1.3 }}>
            <div style={{ display: 'flex' }}>이제 {td.term} 보이면</div>
            <div style={{ display: 'flex' }}><span style={{ color: TEAL }}>아는 척</span> 가능</div>
          </div>
          <div style={{ display: 'flex', fontSize: 32, fontWeight: 600, color: SUB, lineHeight: 1.5 }}>다음 주 수요일엔 {td.nextTerm}을 정리해드려요. 궁금한 용어는 댓글로 남겨주세요.</div>
        </div>
        <CtaBar text="전 종목 지표는 프로필 링크에서 ↑" sub="저장해두면 다음에 또 볼 수 있어요" />
      </div>
      <Footer right="참고용 정보 · 투자 권유 아님 · @investk" />
    </Frame>
  );
}
function renderTerm(type: string, td: TermCardData): React.ReactElement | null {
  if (type === 'term-cover') return <TermCover {...td} />;
  if (type === 'term-def') return <TermDef {...td} />;
  if (type === 'term-example') return <TermExample {...td} />;
  if (type === 'term-tips') return <TermTips {...td} />;
  if (type === 'term-outro') return <TermOutro {...td} />;
  return null;
}

// ══════════════ 급변동 속보 ══════════════
function BreakingCard(d: BreakingData) {
  return (
    <Frame>
      <Header right={d.time} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 30 }}>
        <div style={{ display: 'flex' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,77,94,0.16)', borderRadius: 999, padding: '12px 30px', fontSize: 30, fontWeight: 900, color: UP }}>● 속보</div>
        </div>
        <div style={{ display: 'flex', fontSize: 96, fontWeight: 900, color: TXT, letterSpacing: '-0.04em', lineHeight: 1.15 }}>{d.headline}</div>
        <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: SUB, letterSpacing: '-0.02em', lineHeight: 1.4 }}>{d.sub}</div>
        <div style={{ display: 'flex', flexDirection: 'row', gap: 14, marginTop: 44 }}>
          {d.tiles.map((t, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, background: SURF, borderRadius: 20, padding: 28 }}>
              <div style={{ display: 'flex', fontSize: 23, fontWeight: 700, color: SUB }}>{t.label}</div>
              <div style={{ display: 'flex', fontSize: 34, fontWeight: 900, color: col(t.chg) }}>{t.txt ?? chipPct(t.chg)}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', fontSize: 22, fontWeight: 600, color: DISC }}>참고용 지표 · 투자 권유 아님</div>
        <div style={{ display: 'flex', alignItems: 'center', background: TEAL, borderRadius: 999, padding: '16px 32px', fontSize: 27, fontWeight: 900, color: BG }}>실시간 지표는 프로필 링크에서 ↑</div>
      </div>
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
    return <NewsCard item={item} idx={idx} total={Math.min(nd.items.length, 3)} region={nd.regionLabel} />;
  }
  return null;
}

// ══════════════ 주간 마켓 리뷰 (주말용) ══════════════
const weekWord = (chg: number) => (Math.abs(chg) >= 3 ? (chg > 0 ? '급등' : '급락') : chg > 0 ? '상승' : chg < 0 ? '하락' : '보합');
function WeekRow({ r, spark }: { r: WeekIndexRow; spark?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, background: SURF, borderRadius: 20, padding: '30px 40px' }}>
      <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, color: TXT, letterSpacing: '-0.02em', flex: 1 }}>{r.name}</div>
      {spark ? <Spark chg={r.chg} /> : null}
      <Chip chg={r.chg} size={40} />
    </div>
  );
}
function WeekCover(wd: WeekReviewData) {
  const h = wd.hero;
  const signed = `${h.chg > 0 ? '+' : h.chg < 0 ? '−' : ''}${Math.abs(h.chg).toFixed(2)}`;
  return (
    <Frame>
      <Header right={wd.range} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 30 }}>
        <div style={{ display: 'flex' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: TEAL_T2, borderRadius: 999, padding: '12px 26px', fontSize: 26, fontWeight: 800, color: TEAL }}>이번 주 마켓 리뷰</div>
        </div>
        <div style={{ display: 'flex', fontSize: 96, fontWeight: 900, color: TXT, letterSpacing: '-0.04em', lineHeight: 1.15, marginTop: 12 }}>{h.name}, 한 주 동안</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', fontSize: 200, fontWeight: 900, color: col(h.chg), letterSpacing: '-0.05em', lineHeight: 1 }}>
            {signed}<span style={{ fontSize: 106, fontWeight: 900 }}>%</span>
          </div>
          <div style={{ display: 'flex', fontSize: 72, fontWeight: 900, color: TXT, letterSpacing: '-0.03em' }}>{weekWord(h.chg)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'row', gap: 14, marginTop: 56 }}>
          {wd.indices.map((t, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, background: SURF, borderRadius: 20, padding: 26 }}>
              <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, color: SUB }}>{t.name}</div>
              <div style={{ display: 'flex', fontSize: 33, fontWeight: 900, color: col(t.chg) }}>{chipPct(t.chg)}</div>
            </div>
          ))}
        </div>
      </div>
      <CoverCta text="한 주 정리 보기 →" />
    </Frame>
  );
}
function WeekDetail(wd: WeekReviewData) {
  return (
    <Frame>
      <Header right="주간 등락" />
      <Eyebrow en="WEEKLY REVIEW" ko="지수 주간 성적표" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 16 }}>
        {wd.indices.map((r, i) => <WeekRow key={i} r={r} spark />)}
        <WeekRow r={{ name: '비트코인', chg: wd.btc }} spark />
      </div>
      <Footer right="@investk" />
    </Frame>
  );
}
function WeekOutro(wd: WeekReviewData) {
  const b = wd.best, w = wd.worst;
  return (
    <Frame>
      <Header right="" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 40 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Badge text="이번 주 한 줄 요약" />
          <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, color: TXT, letterSpacing: '-0.02em', lineHeight: 1.4 }}>{wd.summary}</div>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, background: SURF, borderRadius: 24, padding: '34px 38px' }}>
            <div style={{ display: 'flex', fontSize: 24, fontWeight: 800, color: UP }}>최고 성과</div>
            <div style={{ display: 'flex', fontSize: 40, fontWeight: 900, color: TXT }}>{b.name}</div>
            <div style={{ display: 'flex', fontSize: 34, fontWeight: 900, color: col(b.chg) }}>{chipPct(b.chg)}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, background: SURF, borderRadius: 24, padding: '34px 38px' }}>
            <div style={{ display: 'flex', fontSize: 24, fontWeight: 800, color: DOWN }}>부진</div>
            <div style={{ display: 'flex', fontSize: 40, fontWeight: 900, color: TXT }}>{w.name}</div>
            <div style={{ display: 'flex', fontSize: 34, fontWeight: 900, color: col(w.chg) }}>{chipPct(w.chg)}</div>
          </div>
        </div>
        <CtaBar text="다음 주 브리핑은 프로필 링크에서 ↑" sub="월요일 아침, 새로운 한 주도 30초로 정리해드려요" />
      </div>
      <Footer right="참고용 지표 · 투자 권유 아님 · @investk" />
    </Frame>
  );
}
function renderWeek(type: string, wd: WeekReviewData): React.ReactElement | null {
  if (type === 'week-cover') return <WeekCover {...wd} />;
  if (type === 'week-detail') return <WeekDetail {...wd} />;
  if (type === 'week-outro') return <WeekOutro {...wd} />;
  return null;
}

// ══════════════ 게시 일정 카드 (모든 캐러셀 마무리 직전에 삽입) ══════════════
// Satori라 이모지·국기 사용 불가 → 국내=틸/미국=바이올렛 색점으로 지역 구분.
function SchedRow({ dot, name, sub, time }: { dot?: string; name: string; sub?: string; time: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, background: SURF, borderRadius: 20, padding: '26px 34px' }}>
      {dot ? <div style={{ display: 'flex', width: 18, height: 18, borderRadius: 6, background: dot, flexShrink: 0 }} /> : <div style={{ display: 'flex', width: 18, flexShrink: 0 }} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        <div style={{ display: 'flex', fontSize: 33, fontWeight: 800, color: TXT, letterSpacing: '-0.01em' }}>{name}</div>
        {sub ? <div style={{ display: 'flex', fontSize: 22, fontWeight: 600, color: SUB }}>{sub}</div> : null}
      </div>
      <div style={{ display: 'flex', fontSize: 31, fontWeight: 900, color: TEAL }}>{time}</div>
    </div>
  );
}
function ScheduleCard() {
  return (
    <Frame>
      <Header right="" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 48 }}>
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 800, color: TEAL }}>POSTING SCHEDULE</div>
        <div style={{ display: 'flex', fontSize: 68, fontWeight: 900, color: TXT, letterSpacing: '-0.04em' }}>매일 이 시간에 올려요</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 13 }}>
        <SchedRow dot={TEAL} name="국내 뉴스" sub="개장 전 · 마감" time="08:00 · 15:30" />
        <SchedRow dot={US_ACC} name="미국 뉴스" sub="마감 · 개장 전" time="05:00 · 21:30" />
        <SchedRow name="아침 시장 브리핑" sub="평일" time="06:30" />
        <SchedRow name="데일리 릴스" sub="평일" time="12:30" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: TEAL_T, borderRadius: 20, padding: '26px 34px' }}>
          <div style={{ display: 'flex', fontSize: 24, fontWeight: 800, color: TEAL }}>요일 특집</div>
          <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, color: TXT, letterSpacing: '-0.01em' }}>월 저평가주 · 수 투자용어 · 토 주간리뷰 · 일 경제캘린더</div>
        </div>
      </div>
      <CtaBar text="알림 켜두면 안 놓쳐요 ↑" sub="팔로우하고 이 시간마다 챙기세요" />
    </Frame>
  );
}

// ══════════════ 화제의 종목 (일간) ══════════════
// 추천이 아니라 '왜 움직였나' 해설. 투자의견·목표주가 강조 금지(컨센서스는 출처 명시).
const nOrDash = (v: number | null, unit = '', digits = 1) => (v == null ? '—' : `${v.toFixed(digits)}${unit}`);

function StockMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, background: SURF, borderRadius: 20, padding: 26 }}>
      <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, color: SUB }}>{label}</div>
      <div style={{ display: 'flex', fontSize: 34, fontWeight: 900, color: TXT }}>{value}</div>
    </div>
  );
}

function StockCover(d: StockPickData) {
  const signed = `${d.pct > 0 ? '+' : d.pct < 0 ? '−' : ''}${Math.abs(d.pct).toFixed(2)}`;
  const word = Math.abs(d.pct) >= 15 ? (d.dir === 'up' ? '급등' : '급락') : d.dir === 'up' ? '상승' : '하락';
  return (
    <Frame>
      <Header right={d.dateLabel} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 26 }}>
        <div style={{ display: 'flex' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: TEAL_T2, borderRadius: 999, padding: '12px 26px', fontSize: 26, fontWeight: 800, color: TEAL }}>오늘 화제의 종목</div>
        </div>
        <div style={{ display: 'flex', fontSize: 92, fontWeight: 900, color: TXT, letterSpacing: '-0.04em', lineHeight: 1.15 }}>{d.name}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', fontSize: 190, fontWeight: 900, color: col(d.pct), letterSpacing: '-0.05em', lineHeight: 1 }}>
            {signed}<span style={{ fontSize: 100, fontWeight: 900 }}>%</span>
          </div>
          <div style={{ display: 'flex', fontSize: 68, fontWeight: 900, color: TXT, letterSpacing: '-0.03em' }}>{word}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'row', gap: 14, marginTop: 40 }}>
          <StockMetric label="현재가" value={d.priceText} />
          <StockMetric label="거래대금" value={d.volText} />
          {/* 시총은 종목에 따라 안 잡힐 수 있어 '—' 대신 칸 자체를 뺀다. */}
          {d.marketCapText ? <StockMetric label="시가총액" value={d.marketCapText} /> : null}
        </div>
      </div>
      <CoverCta text="왜 움직였는지 보기 →" />
    </Frame>
  );
}

// 왜 움직였나 — 지어내지 않고 실제 기사 헤드라인·공시로만.
function StockWhy(d: StockPickData) {
  const has = d.news.length > 0 || d.disc.length > 0;
  return (
    <Frame>
      <Header right={d.name} />
      <Eyebrow en="WHY IT MOVED" ko="왜 움직였나" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 14 }}>
        {d.disc.map((x, i) => (
          <div key={`d${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 18, background: TEAL_T, borderRadius: 22, padding: '28px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: TEAL, borderRadius: 10, padding: '8px 16px', fontSize: 21, fontWeight: 900, color: BG, flexShrink: 0 }}>{x.kind}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, color: TXT, lineHeight: 1.4 }}>{x.title}</div>
              <div style={{ display: 'flex', fontSize: 21, fontWeight: 600, color: SUB }}>공시 · {x.date}</div>
            </div>
          </div>
        ))}
        {d.news.map((n, i) => (
          <div key={`n${i}`} style={{ display: 'flex', flexDirection: 'column', gap: 8, background: SURF, borderRadius: 22, padding: '28px 32px' }}>
            <div style={{ display: 'flex', fontSize: 29, fontWeight: 700, color: TXT, lineHeight: 1.4 }}>{n.title}</div>
            <div style={{ display: 'flex', fontSize: 21, fontWeight: 600, color: SUB }}>{n.src}{n.date ? ` · ${n.date}` : ''}</div>
          </div>
        ))}
        {!has && (
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, color: SUB, lineHeight: 1.5 }}>
            뚜렷한 뉴스·공시 없이 수급으로 움직였어요. 이런 날일수록 이유 없는 추격은 위험해요.
          </div>
        )}
      </div>
      <Footer right="출처 표기 · 기사 원문 확인 권장" />
    </Frame>
  );
}

// 52주 밴드 내 현재 위치 바.
function Band52({ d }: { d: StockPickData }) {
  if (d.pos52 == null) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, background: SURF, borderRadius: 24, padding: '32px 36px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ display: 'flex', fontSize: 24, fontWeight: 800, color: SUB }}>52주 최저</div>
        <div style={{ display: 'flex', fontSize: 24, fontWeight: 800, color: TEAL }}>지금 {Math.round(d.pos52)}% 지점</div>
        <div style={{ display: 'flex', fontSize: 24, fontWeight: 800, color: SUB }}>52주 최고</div>
      </div>
      <div style={{ display: 'flex', width: '100%', height: 16, background: 'rgba(255,255,255,0.10)', borderRadius: 8 }}>
        <div style={{ display: 'flex', width: `${Math.max(2, Math.min(100, d.pos52))}%`, height: 16, background: TEAL, borderRadius: 8 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', fontSize: 27, fontWeight: 900, color: TXT }}>{d.lo52 != null ? Math.round(d.lo52).toLocaleString('ko-KR') : '—'}</div>
        <div style={{ display: 'flex', fontSize: 27, fontWeight: 900, color: TXT }}>{d.hi52 != null ? Math.round(d.hi52).toLocaleString('ko-KR') : '—'}</div>
      </div>
    </div>
  );
}

function StockNumbers(d: StockPickData) {
  return (
    <Frame>
      <Header right={d.name} />
      <Eyebrow en="KEY NUMBERS" ko="숫자로 보면" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 16 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <StockMetric label="PER" value={nOrDash(d.per, '배')} />
          <StockMetric label="PBR" value={nOrDash(d.pbr, '배', 2)} />
          <StockMetric label="ROE" value={nOrDash(d.roe, '%')} />
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <StockMetric label="영업이익률" value={nOrDash(d.netMargin, '%')} />
          <StockMetric label="부채비율" value={nOrDash(d.debtRatio, '%', 0)} />
          <StockMetric label="배당수익률" value={nOrDash(d.divYield, '%', 2)} />
        </div>
        <Band52 d={d} />
      </div>
      <Footer right="지표 — 네이버 금융 · 참고용" />
    </Frame>
  );
}

// 연도별 매출·이익 막대. 값이 2년 미만이면 이 카드는 건너뛴다(렌더 null).
function StockTrend(d: StockPickData) {
  const rows = d.trend.filter((t) => t.revenue != null || t.profit != null);
  if (rows.length < 2) return null;
  const max = Math.max(...rows.map((t) => Math.abs(t.revenue ?? 0)), 1);
  return (
    <Frame>
      <Header right={d.name} />
      <Eyebrow en="TRACK RECORD" ko="실적은 어땠나" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 20 }}>
        {rows.map((t, i) => {
          const w = Math.max(3, (Math.abs(t.revenue ?? 0) / max) * 100);
          const profitPos = (t.profit ?? 0) >= 0;
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10, background: SURF, borderRadius: 20, padding: '24px 30px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', fontSize: 30, fontWeight: 900, color: TXT }}>{t.year}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
                  <div style={{ display: 'flex', fontSize: 24, fontWeight: 700, color: SUB }}>매출 {t.revenue != null ? Math.round(t.revenue).toLocaleString('ko-KR') : '—'}</div>
                  <div style={{ display: 'flex', fontSize: 26, fontWeight: 900, color: t.profit == null ? SUB : profitPos ? UP : DOWN }}>
                    이익 {t.profit != null ? Math.round(t.profit).toLocaleString('ko-KR') : '—'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', width: '100%', height: 12, background: 'rgba(255,255,255,0.08)', borderRadius: 6 }}>
                <div style={{ display: 'flex', width: `${w}%`, height: 12, background: TEAL, borderRadius: 6 }} />
              </div>
            </div>
          );
        })}
        <div style={{ display: 'flex', fontSize: 22, fontWeight: 600, color: DISC }}>단위: {d.revUnit} · 막대는 매출 상대 크기</div>
      </div>
      <Footer right="재무 — 네이버 금융 · 연간 기준" />
    </Frame>
  );
}

function StockOutro(d: StockPickData) {
  // 목표주가는 '증권사 컨센서스'로 출처를 분명히 하고, 없으면 아예 표시하지 않는다.
  const hasCons = d.target != null && d.numAnalysts != null && d.numAnalysts > 0;
  return (
    <Frame>
      <Header right="" />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 36 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <Badge text="정리" />
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 78, fontWeight: 900, color: TXT, letterSpacing: '-0.04em', lineHeight: 1.25 }}>
            <div style={{ display: 'flex' }}>{d.name},</div>
            <div style={{ display: 'flex' }}>오늘 <span style={{ color: col(d.pct) }}>&nbsp;{d.pct > 0 ? '+' : '−'}{Math.abs(d.pct).toFixed(2)}%</span></div>
          </div>
        </div>
        {hasCons && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: SURF, borderRadius: 24, padding: '30px 36px' }}>
            <div style={{ display: 'flex', fontSize: 23, fontWeight: 800, color: SUB }}>증권사 컨센서스 (애널리스트 {d.numAnalysts}명 평균)</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <div style={{ display: 'flex', fontSize: 40, fontWeight: 900, color: TXT }}>목표주가 {Math.round(d.target!).toLocaleString('ko-KR')}원</div>
            </div>
            <div style={{ display: 'flex', fontSize: 22, fontWeight: 600, color: DISC }}>예측이 아니라 증권사 전망치의 평균입니다.</div>
          </div>
        )}
        <CtaBar text="종목 상세는 프로필 링크에서 ↑" sub="매일 시장 브리핑 · 국내·미국 뉴스도 함께" />
      </div>
      <Footer right="종목 추천 아님 · 투자 판단은 본인 책임 · @investk" />
    </Frame>
  );
}

function renderStock(type: string, d: StockPickData): React.ReactElement | null {
  if (type === 'stock-cover') return <StockCover {...d} />;
  if (type === 'stock-why') return <StockWhy {...d} />;
  if (type === 'stock-numbers') return <StockNumbers {...d} />;
  if (type === 'stock-trend') return <StockTrend {...d} />;
  if (type === 'stock-outro') return <StockOutro {...d} />;
  return null;
}

export async function GET(_req: Request, { params }: { params: { type: string } }) {
  const t = params.type;
  const qs = new URL(_req.url).searchParams;
  const slot = qs.get('slot') === 'am' ? 'am' : 'pm';
  const rg = qs.get('region');
  const region = rg === 'kr' || rg === 'us' ? rg : 'all';
  const img = (el: React.ReactElement | null) => (el ? new ImageResponse(el, { width: 1080, height: 1350, fonts: fontsPromise }) : new Response('no card', { status: 404 }));
  const fontsPromise = await fonts();
  if (t.startsWith('news')) return img(renderNews(t, await getNewsCardData(slot, region)));
  if (t.startsWith('value')) return img(renderValue(t, await getValueCardData()));
  if (t.startsWith('cal')) return img(renderCalendar(t, await getCalendarCardData()));
  if (t.startsWith('term')) return img(renderTerm(t, await getTermCardData()));
  if (t.startsWith('week')) return img(renderWeek(t, await getWeekReviewData()));
  if (t.startsWith('stock-')) { const s = await getStockCardData(); return img(s ? renderStock(t, s) : null); }
  if (t === 'sched') return img(<ScheduleCard />);
  if (t === 'breaking') { const b = await getBreakingCardData(); return img(b ? <BreakingCard {...b} /> : null); }
  const render = RENDERERS[t];
  if (!render) return new Response('unknown card type', { status: 404 });
  return img(render(await getCardData()));
}
