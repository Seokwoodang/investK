'use client';

import { useEffect, useState } from 'react';
import { fmtPct, upColor } from '../../lib/format';
import { useDashboard } from '../../store/DashboardContext';
import { SourceNote } from '../SourceNote';
import { TermTip } from '../GlossaryTip';
import type { Currency, TabId } from '../../types';

type Market = 'kr' | 'us';

interface ScoredStock {
  code: string;
  name: string;
  price: number;
  cur: Currency;
  marketCapText: string;
  per: number | null;
  fwdPer: number | null;
  pbr: number | null;
  roe: number | null;
  netMargin: number | null;
  debtRatio: number | null;
  divYield: number | null;
  target: number | null;
  upside: number | null;
  recommMean: number | null;
  valueScore: number;
  qualityScore: number;
  safetyScore: number;
  yieldScore: number;
  score: number;
  graham: boolean;
  buffett: boolean;
}
interface ValueScreen {
  market: Market;
  date: string;
  universe: number;
  items: ScoredStock[];
}

const CARD: React.CSSProperties = { background: 'var(--c-w03)', border: '1px solid var(--c-w07)', borderRadius: 16 };

function scoreHue(s: number): string {
  if (s >= 70) return 'var(--c-up)';
  if (s >= 50) return 'var(--c-accyan)';
  return 'var(--c-tx5)';
}
function num(n: number | null, suffix = '', digits = 2): string {
  return n == null ? '—' : `${n.toLocaleString('ko-KR', { maximumFractionDigits: digits })}${suffix}`;
}

const PAGE = 10; // 무한스크롤 한 번에 늘어나는 개수
const SORTS: { key: string; label: string; val: (s: ScoredStock) => number; asc?: boolean }[] = [
  { key: 'score', label: '종합점수', val: (s) => s.score },
  { key: 'value', label: '밸류', val: (s) => s.valueScore },
  { key: 'quality', label: '퀄리티', val: (s) => s.qualityScore },
  { key: 'safety', label: '안정성', val: (s) => s.safetyScore },
  { key: 'yield', label: '환원', val: (s) => s.yieldScore },
  { key: 'roe', label: 'ROE', val: (s) => s.roe ?? -1 },
  { key: 'div', label: '배당', val: (s) => s.divYield ?? -1 },
  { key: 'per', label: '저PER', val: (s) => (s.per == null ? Infinity : s.per), asc: true },
  { key: 'pbr', label: '저PBR', val: (s) => (s.pbr == null ? Infinity : s.pbr), asc: true },
];

function ScoreBar({ label, value, term }: { label: string; value: number; term?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 58 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--c-tx6)', marginBottom: 3 }}>
        <span><TermTip term={term ?? label}>{label}</TermTip></span>
        <span style={{ fontWeight: 700, color: 'var(--c-tx3)' }}>{value}</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: 'var(--c-w06)', overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: scoreHue(value), borderRadius: 3 }} />
      </div>
    </div>
  );
}
function Metric({ label, value, color, tip }: { label: string; value: string; color?: string; tip?: string }) {
  return (
    <div style={{ minWidth: 60 }}>
      <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginBottom: 2 }}><TermTip term={tip ?? label}>{label}</TermTip></div>
      <div style={{ fontSize: 13, fontWeight: 700, color: color ?? 'var(--c-tx2)' }}>{value}</div>
    </div>
  );
}
function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, color, background: bg, whiteSpace: 'nowrap' }}>{text}</span>;
}

export function ValueStocks() {
  const { actions } = useDashboard();
  const [market, setMarket] = useState<Market>('kr');
  const [cache, setCache] = useState<Partial<Record<Market, ValueScreen>>>({});
  const [err, setErr] = useState<Market | null>(null);
  const [sortKey, setSortKey] = useState('score');
  const [limit, setLimit] = useState(PAGE);
  const data = cache[market];

  const sortDef = SORTS.find((x) => x.key === sortKey) ?? SORTS[0];
  const sorted = data ? [...data.items].sort((a, b) => (sortDef.asc ? sortDef.val(a) - sortDef.val(b) : sortDef.val(b) - sortDef.val(a))) : [];
  const visible = sorted.slice(0, limit);

  // 시장·정렬 바뀌면 처음부터.
  useEffect(() => setLimit(PAGE), [market, sortKey]);

  // 무한스크롤: 바닥 근처면 더 보여준다.
  useEffect(() => {
    const onScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 600) setLimit((l) => l + PAGE);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (cache[market]) return;
    let cancelled = false;
    setErr(null);
    fetch(`/api/value-screen?market=${market}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: ValueScreen) => {
        if (!cancelled) setCache((c) => ({ ...c, [market]: j }));
      })
      .catch(() => {
        if (!cancelled) setErr(market);
      });
    return () => {
      cancelled = true;
    };
  }, [market, cache]);

  const seg = (m: Market, label: string) => (
    <button
      onClick={() => setMarket(m)}
      style={{
        cursor: 'pointer', fontFamily: 'inherit', padding: '7px 18px', borderRadius: 9, fontSize: 14, fontWeight: 700,
        border: 'none', background: market === m ? 'var(--c-accyan)' : 'transparent', color: market === m ? 'var(--c-bg)' : 'var(--c-tx4)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>저평가 우량주</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-tx5)' }}>
          버핏·그레이엄·그린블라트의 원칙을 4개 축으로 점수화해 랭킹합니다.
        </p>
      </div>

      <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: 'var(--c-w04)', border: '1px solid var(--c-w07)', borderRadius: 12, marginBottom: 20 }}>
        {seg('kr', '국내')}
        {seg('us', '해외')}
      </div>

      {/* 방법론 */}
      <div style={{ ...CARD, padding: 18, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--c-accyan)', marginBottom: 12 }}>점수 산정 (복합 점수 100점)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: 12.5, color: 'var(--c-tx4)', lineHeight: 1.55 }}>
          <div><b style={{ color: 'var(--c-tx2)' }}>밸류 30%</b> · 그레이엄·그린블라트 — 이익수익률(1/PER)·순자산수익률(1/PBR)</div>
          <div><b style={{ color: 'var(--c-tx2)' }}>퀄리티 35%</b> · 버핏·노비막스 — ROE·순이익률</div>
          <div><b style={{ color: 'var(--c-tx2)' }}>안정성 20%</b> · 그레이엄·버핏 — 부채비율↓·유동성</div>
          <div><b style={{ color: 'var(--c-tx2)' }}>환원·성장 15%</b> — 배당수익률·이익성장</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12, fontSize: 11.5, color: 'var(--c-tx5)' }}>
          <span><Badge text="그레이엄" color="var(--c-up)" bg="color-mix(in srgb, var(--c-up) 18%, transparent)" /> PER≤15·PBR≤1.5·PER×PBR≤22.5·저부채·ROE≥10</span>
          <span><Badge text="버핏형" color="var(--c-accyanbr)" bg="var(--c-cy16)" /> ROE≥15·순이익률≥10·저부채</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--c-tx6)', marginTop: 10, lineHeight: 1.5 }}>
          {market === 'kr' ? '국내 시총 상위 ~1,000' : '해외(나스닥·뉴욕) 시총 상위 ~300'}종목 대상. 적자(PER≤0)·이상치(PER&gt;60)·과다부채는 제외. 각 지표를 같은 시장 내 백분위로 환산해 가중합.
          <b style={{ color: 'var(--c-tx4)' }}> 투자 권유가 아니라 참고용 정량 스크린입니다.</b>
        </div>
      </div>

      {err === market && <div style={{ ...CARD, padding: 40, textAlign: 'center', color: 'var(--c-tx5)' }}>데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</div>}
      {!data && err !== market && (
        <div style={{ ...CARD, padding: 40, textAlign: 'center', color: 'var(--c-tx5)' }}>
          {market === 'kr' ? '국내' : '해외'} 종목 재무지표를 분석하는 중입니다… (최초 생성은 십수 초 걸릴 수 있어요)
        </div>
      )}

      {data && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--c-tx6)' }}>
              기준일 {data.date} · 평가 {data.universe.toLocaleString('ko-KR')}종목 중 상위 {data.items.length}개
            </div>
            <div className="no-scrollbar" style={{ display: 'flex', gap: 6, overflowX: 'auto', maxWidth: '100%' }}>
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSortKey(s.key)}
                  style={{
                    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    border: `1px solid ${sortKey === s.key ? 'var(--c-cy45)' : 'var(--c-w08)'}`,
                    background: sortKey === s.key ? 'var(--c-cy16)' : 'var(--c-w04)',
                    color: sortKey === s.key ? 'var(--c-accyanbr)' : 'var(--c-tx5)',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visible.map((s, i) => (
              <button
                key={s.code}
                className="card-hover"
                onClick={() => actions.openStock(s.code, (market === 'kr' ? 'kr_stock' : 'us_stock') as TabId)}
                style={{ ...CARD, textAlign: 'left', cursor: 'pointer', display: 'block', width: '100%', padding: 16 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 210, flex: '1 1 210px' }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-tx6)', minWidth: 26 }}>{i + 1}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-tx1b)' }}>{s.name}</span>
                        {s.graham && <Badge text="그레이엄" color="var(--c-up)" bg="color-mix(in srgb, var(--c-up) 18%, transparent)" />}
                        {s.buffett && <Badge text="버핏형" color="var(--c-accyanbr)" bg="var(--c-cy16)" />}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginTop: 2 }}>{s.code} · {s.marketCapText}</div>
                    </div>
                    <div style={{ marginLeft: 'auto', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: scoreHue(s.score), lineHeight: 1 }}>{s.score}</div>
                      <div style={{ fontSize: 10, color: 'var(--c-tx6)', marginTop: 2 }}>종합</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flex: '1 1 280px' }}>
                    <ScoreBar label="밸류" value={s.valueScore} />
                    <ScoreBar label="퀄리티" value={s.qualityScore} />
                    <ScoreBar label="안정성" value={s.safetyScore} />
                    <ScoreBar label="환원" value={s.yieldScore} term="주주환원" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--c-w05)' }}>
                  <Metric label="PER" value={num(s.per, '배')} />
                  <Metric label="PBR" value={num(s.pbr, '배')} />
                  <Metric label="ROE" value={num(s.roe, '%', 1)} color={s.roe != null && s.roe >= 15 ? 'var(--c-up)' : undefined} />
                  <Metric label="순이익률" value={num(s.netMargin, '%', 1)} />
                  <Metric label="부채비율" value={num(s.debtRatio, '%', 0)} color={s.debtRatio != null && s.debtRatio < 100 ? 'var(--c-up)' : undefined} />
                  <Metric label="배당" value={num(s.divYield, '%', 1)} tip="배당수익률" color={s.divYield != null && s.divYield >= 3 ? 'var(--c-up)' : undefined} />
                  {s.upside != null && <Metric label="목표가 괴리" value={fmtPct(s.upside)} tip="목표주가" color={upColor(s.upside)} />}
                </div>
              </button>
            ))}
          </div>
          {limit < sorted.length && (
            <div style={{ textAlign: 'center', padding: 14, fontSize: 12, color: 'var(--c-tx6)' }}>
              아래로 스크롤하면 더 보입니다 · {visible.length}/{sorted.length}
            </div>
          )}
          <SourceNote
            text={market === 'kr' ? '재무 — 네이버 금융 재무제표(ROE·부채비율·이익률·EPS·BPS·배당) + 시세 · 점수는 자체 산식' : '재무 — Yahoo Finance(PER·PBR·ROE·부채·이익률·배당·컨센서스) · 점수는 자체 산식'}
            style={{ marginTop: 16 }}
          />
        </>
      )}
    </div>
  );
}
