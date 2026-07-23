'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtPct, upColor } from '../../lib/format';
import { useDashboard } from '../../store/DashboardContext';
import { SourceNote, UpdateNote } from '../SourceNote';
import { TermTip, Popover } from '../GlossaryTip';
import { InlineSpinner } from '../Footer';
import { SubNav } from '../SubNav';
import { useViewportLayout } from '../DashboardChrome';
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
interface ValuePage {
  date: string;
  universe: number;
  total: number;
  offset: number;
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

const PAGE = 20; // 스크롤 시 서버에서 한 번에 받아오는 개수(네트워크 무한스크롤)
const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'graham', label: '그레이엄' },
  { key: 'buffett', label: '버핏형' },
];
const GRAHAM_DEF =
  '벤저민 그레이엄(가치투자의 아버지)의 "안전마진" 기준을 통과한 종목. 싸고 재무가 튼튼해 손실 위험이 작은 가치주예요. 조건: PER ≤ 15(이익 대비 저렴) · PBR ≤ 1.5(자산 대비 저렴) · PER×PBR ≤ 22.5(그레이엄 넘버) · 부채비율 < 100% · ROE ≥ 10%.';
const BUFFETT_DEF =
  '워런 버핏 스타일 — "훌륭한 회사를 적정가에". 꾸준히 돈을 잘 버는 우량기업 기준을 통과한 종목이에요. 조건: ROE ≥ 15%(높은 자본수익 = 경쟁우위 신호) · 순이익률 ≥ 10% · 부채비율 < 100%. 단, 싼지(밸류)는 별개라 PER이 높을 수도 있어요.';

const SORTS: { key: string; label: string }[] = [
  { key: 'score', label: '종합점수' },
  { key: 'value', label: '밸류' },
  { key: 'quality', label: '퀄리티' },
  { key: 'safety', label: '안정성' },
  { key: 'yield', label: '환원' },
  { key: 'roe', label: 'ROE' },
  { key: 'div', label: '배당' },
  { key: 'per', label: '저PER' },
  { key: 'pbr', label: '저PBR' },
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
function Badge({ text, color, bg, tip }: { text: string; color: string; bg: string; tip?: string }) {
  const chip = <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, color, background: bg, whiteSpace: 'nowrap' }}>{text}</span>;
  if (!tip) return chip;
  // portal 팝오버 — 다음 카드/overflow에 덮이거나 화면 밖으로 잘리지 않음(모바일 안전)
  return (
    <Popover width={270} content={<><span style={{ display: 'block', fontSize: 11, fontWeight: 700, color, marginBottom: 5 }}>{text}</span><span style={{ display: 'block', fontSize: 12, lineHeight: 1.55, color: 'var(--c-tx3)', fontWeight: 400 }}>{tip}</span></>}>
      {chip}
    </Popover>
  );
}

// 상세 페이지 갔다가 뒤로 와도 시장·정렬·필터·스크롤·로드한 목록을 복원하기 위한 세션 캐시(모듈 스코프, SPA 세션 동안 유지).
interface VsCache { market: Market; sortKey: string; filterKey: string; items: ScoredStock[]; total: number; meta: { date: string; universe: number } | null; scrollTop: number }
let vsCache: VsCache | null = null;

export function ValueStocks() {
  const { actions } = useDashboard();
  const { vw } = useViewportLayout();
  // 좁은 화면(모바일/태블릿): 리스트 내부 스크롤 박스를 없애고 페이지 전체가 스크롤되게 한다.
  //  (내부 스크롤은 경계에서 페이지로 안 넘어가 '스크롤이 갇히는' 문제 → 데스크톱에서만 사용)
  const narrow = vw < 768;
  const narrowRef = useRef(narrow); narrowRef.current = narrow;
  const [market, setMarket] = useState<Market>(vsCache?.market ?? 'kr');
  const [sortKey, setSortKey] = useState(vsCache?.sortKey ?? 'score');
  const [filterKey, setFilterKey] = useState(vsCache?.filterKey ?? 'all');
  const [items, setItems] = useState<ScoredStock[]>(vsCache?.items ?? []);
  const [total, setTotal] = useState(vsCache?.total ?? 0);
  const [meta, setMeta] = useState<{ date: string; universe: number } | null>(vsCache?.meta ?? null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);
  const reqId = useRef(0);
  const loadingRef = useRef(false); // 동기 가드(중복 로드 방지)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const skipInitial = useRef((vsCache?.items?.length ?? 0) > 0); // 복원된 첫 마운트는 재요청 생략

  // 서버에서 (정렬 + offset/limit) 한 페이지씩 받아온다. offset=0이면 새로(시장·정렬 변경), 아니면 이어붙임.
  const load = useCallback((offset: number) => {
    if (offset > 0 && loadingRef.current) return; // 이미 다음 페이지 로딩 중이면 무시
    loadingRef.current = true;
    const id = ++reqId.current;
    setLoading(true);
    if (offset === 0) setErr(false);
    fetch(`/api/value-screen?market=${market}&sort=${sortKey}&filter=${filterKey}&offset=${offset}&limit=${PAGE}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: ValuePage) => {
        if (id !== reqId.current) return; // 더 최신 요청이 있으면 무시
        setMeta({ date: j.date, universe: j.universe });
        setTotal(j.total ?? 0);
        setItems((prev) => (offset === 0 ? j.items : [...prev, ...j.items]));
      })
      .catch(() => {
        if (id === reqId.current && offset === 0) setErr(true);
      })
      .finally(() => {
        if (id === reqId.current) { loadingRef.current = false; setLoading(false); }
      });
  }, [market, sortKey, filterKey]);

  // 시장·정렬·필터 변경 → 처음부터 다시. 단, 뒤로가기로 복원된 첫 마운트는 건너뜀(목록·스크롤 유지).
  useEffect(() => {
    if (skipInitial.current) { skipInitial.current = false; return; }
    setItems([]);
    setTotal(0);
    load(0);
  }, [load]);

  // 현재 상태를 ref로 보관 → 언마운트(상세 이동) 시 캐시에 저장.
  const snapRef = useRef<Omit<VsCache, 'scrollTop'>>({ market, sortKey, filterKey, items, total, meta });
  snapRef.current = { market, sortKey, filterKey, items, total, meta };
  useEffect(() => {
    // 마운트: 복원된 스크롤 위치 적용(좁은 화면=페이지 스크롤, 넓은 화면=컨테이너 스크롤).
    if (vsCache) {
      const y = vsCache.scrollTop || 0;
      if (narrowRef.current) window.scrollTo(0, y);
      else if (containerRef.current) containerRef.current.scrollTop = y;
    }
    return () => {
      // 언마운트: 시장·정렬·필터·목록·스크롤 저장(뒤로 오면 그대로 복원).
      const y = narrowRef.current ? window.scrollY : (containerRef.current?.scrollTop ?? 0);
      vsCache = { ...snapRef.current, scrollTop: y };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasMore = items.length < total;
  // 최신 상태를 옵저버 콜백에서 쓰기 위한 ref.
  const moreRef = useRef(false); moreRef.current = hasMore;
  const countRef = useRef(0); countRef.current = items.length;

  // 바닥 센티넬이 보이면 다음 페이지 로드(컨테이너 내부 스크롤 기준).
  const listReady = items.length > 0;
  useEffect(() => {
    const target = sentinelRef.current;
    if (!target) return;
    // 좁은 화면은 뷰포트(root=null) 기준, 넓은 화면은 컨테이너 기준으로 바닥 감지.
    const root = narrow ? null : containerRef.current;
    if (!narrow && !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && moreRef.current && !loadingRef.current) load(countRef.current);
      },
      { root, rootMargin: '400px' },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [listReady, load, narrow]);

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
      {/* 종목 찾기 섹션 탭 — 전체 목록 ↔ 저평가 스크리너 */}
      <SubNav items={[{ href: '/stocks', label: '전체 종목' }, { href: '/value', label: '저평가 우량주' }]} />
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>저평가 우량주</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-tx5)' }}>
          버핏·그레이엄·그린블라트의 원칙을 4개 축으로 점수화해 랭킹합니다.
        </p>
        <UpdateNote text="매일 18:00(KST · 장 마감 후) 자동 갱신 — 그 사이엔 저장된 결과를 보여줍니다" style={{ marginTop: 8 }} />
      </div>

      <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: 'var(--c-w04)', border: '1px solid var(--c-w07)', borderRadius: 12, marginBottom: 20 }}>
        {seg('kr', '국내')}
        {seg('us', '해외')}
      </div>

      {/* 방법론 */}
      <div style={{ ...CARD, padding: 18, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--c-accyan)', marginBottom: 12 }}>점수 산정 (복합 점수 100점)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12, fontSize: 12.5, color: 'var(--c-tx4)', lineHeight: 1.55 }}>
          <div><b style={{ color: 'var(--c-tx2)' }}>밸류 30%</b> · 그레이엄·그린블라트 — 이익수익률(1/PER)·순자산수익률(1/PBR)</div>
          <div><b style={{ color: 'var(--c-tx2)' }}>퀄리티 35%</b> · 버핏·노비막스 — ROE·순이익률</div>
          <div><b style={{ color: 'var(--c-tx2)' }}>안정성 20%</b> · 그레이엄·버핏 — 부채비율↓·유동성</div>
          <div><b style={{ color: 'var(--c-tx2)' }}>환원·성장 15%</b> — 배당수익률·이익성장</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 10, marginTop: 12 }}>
          <div style={{ background: 'var(--c-w04)', borderRadius: 10, padding: '11px 13px' }}>
            <div style={{ marginBottom: 6 }}><Badge text="그레이엄" color="var(--c-up)" bg="color-mix(in srgb, var(--c-up) 18%, transparent)" /></div>
            <div style={{ fontSize: 11.5, color: 'var(--c-tx4)', lineHeight: 1.55 }}>{GRAHAM_DEF}</div>
          </div>
          <div style={{ background: 'var(--c-w04)', borderRadius: 10, padding: '11px 13px' }}>
            <div style={{ marginBottom: 6 }}><Badge text="버핏형" color="var(--c-accyanbr)" bg="var(--c-cy16)" /></div>
            <div style={{ fontSize: 11.5, color: 'var(--c-tx4)', lineHeight: 1.55 }}>{BUFFETT_DEF}</div>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--c-tx6)', marginTop: 10, lineHeight: 1.5 }}>
          {market === 'kr' ? '국내 시총 상위 ~1,000' : '해외(나스닥·뉴욕) 시총 상위 ~300'}종목 대상. 적자(PER≤0)·이상치(PER&gt;60)·과다부채는 제외. 각 지표를 같은 시장 내 백분위로 환산해 가중합.
          <b style={{ color: 'var(--c-tx4)' }}> 투자 권유가 아니라 참고용 정량 스크린입니다.</b>
        </div>
      </div>

      {/* 배지 필터 (항상 노출 — 결과가 0이어도 되돌릴 수 있게) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-tx5)' }}>필터</span>
        {FILTERS.map((f) => {
          const on = filterKey === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilterKey(f.key)}
              style={{
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 8,
                border: `1px solid ${on ? 'var(--c-cy45)' : 'var(--c-w08)'}`, background: on ? 'var(--c-cy16)' : 'var(--c-w04)', color: on ? 'var(--c-accyanbr)' : 'var(--c-tx5)',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {err && items.length === 0 && <div style={{ ...CARD, padding: 40, textAlign: 'center', color: 'var(--c-tx5)' }}>데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</div>}
      {!err && items.length === 0 && !loading && (
        <div style={{ ...CARD, padding: 40, textAlign: 'center', color: 'var(--c-tx5)' }}>
          {filterKey === 'graham' ? '그레이엄' : filterKey === 'buffett' ? '버핏형' : ''} 조건에 맞는 종목이 없습니다.
        </div>
      )}
      {!err && items.length === 0 && loading && (
        <div style={{ ...CARD, padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--c-tx5)' }}>
          <InlineSpinner />
          {market === 'kr' ? '국내' : '해외'} 종목 재무지표를 분석하는 중입니다… (최초 생성은 십수 초 걸릴 수 있어요)
        </div>
      )}

      {items.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--c-tx6)' }}>
              기준일 {meta?.date} · 평가 {(meta?.universe ?? 0).toLocaleString('ko-KR')}종목 중 상위 {total.toLocaleString('ko-KR')}개 · {items.length} 로딩됨
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
          <div
            ref={containerRef}
            className={narrow ? undefined : 'list-scroll'}
            // paddingTop 4: 호버 시 카드가 translateY(-2px)로 떠오르는데, 첫 카드가 스크롤 컨테이너 상단에 붙어 있으면 잘림(#2)
            // 좁은 화면: 내부 스크롤 없이 페이지에 흐르게(스크롤 갇힘 방지). 넓은 화면: 68vh 내부 스크롤(정렬 탭 고정).
            style={narrow
              ? { display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4, paddingTop: 4 }
              : { display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '68vh', overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', paddingRight: 4, paddingTop: 4 }}
          >
            {items.map((s, i) => (
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
                        {s.graham && <Badge text="그레이엄" color="var(--c-up)" bg="color-mix(in srgb, var(--c-up) 18%, transparent)" tip={GRAHAM_DEF} />}
                        {s.buffett && <Badge text="버핏형" color="var(--c-accyanbr)" bg="var(--c-cy16)" tip={BUFFETT_DEF} />}
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
            {/* 바닥 감지용 센티넬 */}
            <div ref={sentinelRef} style={{ height: 1 }} />
            {loading && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, fontSize: 12, color: 'var(--c-tx6)' }}><InlineSpinner size={13} />불러오는 중…</div>}
            {hasMore && !loading && (
              <button
                onClick={() => load(items.length)}
                style={{ cursor: 'pointer', fontFamily: 'inherit', margin: '4px auto 8px', padding: '8px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700, border: '1px solid var(--c-w10)', background: 'var(--c-w05)', color: 'var(--c-tx3)' }}
              >
                더 보기 ({items.length}/{total})
              </button>
            )}
            {!hasMore && !loading && <div style={{ textAlign: 'center', padding: 14, fontSize: 12, color: 'var(--c-tx6)' }}>전체 {total.toLocaleString('ko-KR')}개를 모두 봤습니다</div>}
          </div>
          <SourceNote
            text={market === 'kr' ? '재무 — 네이버 금융 재무제표(ROE·부채비율·이익률·EPS·BPS·배당) + 시세 · 점수는 자체 산식' : '재무 — Yahoo Finance(PER·PBR·ROE·부채·이익률·배당·컨센서스) · 점수는 자체 산식'}
            style={{ marginTop: 16 }}
          />
        </>
      )}
    </div>
  );
}
