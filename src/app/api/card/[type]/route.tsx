import { ImageResponse } from 'next/og';
import { getCardData, type CardData, type Move } from '@/server/cardData';

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

const col = (chg: number) => (chg > 0 ? UP : chg < 0 ? DOWN : SUB);
const tint = (chg: number) => (chg > 0 ? UP_T : chg < 0 ? DOWN_T : 'rgba(255,255,255,0.08)');
const arrow = (chg: number) => (chg > 0 ? '▲' : chg < 0 ? '▼' : '·');
const absPct = (chg: number) => `${Math.abs(chg).toFixed(2)}%`;
const chipPct = (chg: number) => `${arrow(chg)} ${absPct(chg)}`;

// ── 공통 크롬 ──
function Header({ right }: { right: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, background: TEAL, borderRadius: 16, fontSize: 30, fontWeight: 900, color: BG }}>K</div>
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

export async function GET(_req: Request, { params }: { params: { type: string } }) {
  const render = RENDERERS[params.type];
  if (!render) return new Response('unknown card type', { status: 404 });
  const d = await getCardData();
  return new ImageResponse(render(d), { width: 1080, height: 1350, fonts: await fonts() });
}
