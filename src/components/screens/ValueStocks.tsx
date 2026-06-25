'use client';

import { useEffect, useState } from 'react';
import { fmtPct, upColor } from '../../lib/format';
import { useDashboard } from '../../store/DashboardContext';
import { SourceNote } from '../SourceNote';

interface ScoredStock {
  code: string;
  name: string;
  price: number;
  marketCapText: string;
  per: number | null;
  fwdPer: number | null;
  pbr: number | null;
  roe: number | null;
  divYield: number | null;
  dps: number | null;
  targetPrice: number | null;
  upside: number | null;
  recommMean: number | null;
  valueScore: number;
  qualityScore: number;
  returnScore: number;
  score: number;
}
interface ValueScreen {
  date: string;
  generatedAt: string;
  universe: number;
  items: ScoredStock[];
}

const CARD: React.CSSProperties = {
  background: 'var(--c-w03)',
  border: '1px solid var(--c-w07)',
  borderRadius: 16,
};

// 종합점수(0-100, 높을수록 좋음) 색: 높음=초록 / 중간=시안 / 낮음=흐림.
function scoreHue(s: number): string {
  if (s >= 70) return 'var(--c-up)';
  if (s >= 50) return 'var(--c-accyan)';
  return 'var(--c-tx5)';
}

function num(n: number | null, suffix = '', digits = 2): string {
  return n == null ? '—' : `${n.toLocaleString('ko-KR', { maximumFractionDigits: digits })}${suffix}`;
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ flex: 1, minWidth: 70 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--c-tx6)', marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700, color: 'var(--c-tx3)' }}>{value}</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: 'var(--c-w06)', overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: scoreHue(value), borderRadius: 3 }} />
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ minWidth: 64 }}>
      <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: color ?? 'var(--c-tx2)' }}>{value}</div>
    </div>
  );
}

export function ValueStocks() {
  const { actions } = useDashboard();
  const [data, setData] = useState<ValueScreen | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/value-screen')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: ValueScreen) => {
        if (!cancelled) setData(j);
      })
      .catch(() => {
        if (!cancelled) setErr(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>저평가 우량주</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-tx5)' }}>
          싸고(밸류) · 잘 벌고(퀄리티) · 주주에게 돌려주는(환원) 종목을 정량 점수로 랭킹합니다.
        </p>
      </div>

      {/* 방법론 안내 */}
      <div style={{ ...CARD, padding: 18, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--c-accyan)', marginBottom: 12 }}>
          점수 산정 방식 (복합 점수)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, fontSize: 12.5, color: 'var(--c-tx4)', lineHeight: 1.55 }}>
          <div><b style={{ color: 'var(--c-tx2)' }}>밸류 40%</b> — 이익수익률(1/PER), 순자산수익률(1/PBR)이 높을수록(=쌀수록) 고점.</div>
          <div><b style={{ color: 'var(--c-tx2)' }}>퀄리티 40%</b> — ROE(=PBR/PER), 이익 성장(추정EPS) 높을수록 고점.</div>
          <div><b style={{ color: 'var(--c-tx2)' }}>환원 20%</b> — 배당수익률 높을수록 고점.</div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--c-tx6)', marginTop: 12, lineHeight: 1.5 }}>
          시총 상위 약 1,000종목 대상. 적자(PER≤0)·이상치(PER&gt;80)는 밸류 함정으로 보고 제외. 각 지표를 유니버스 내 백분위(0~100)로 환산해 가중합 → 종합 100점 만점.
          <b style={{ color: 'var(--c-tx4)' }}> 투자 권유가 아니라 참고용 정량 스크린입니다.</b>
        </div>
      </div>

      {err && (
        <div style={{ ...CARD, padding: 40, textAlign: 'center', color: 'var(--c-tx5)' }}>스크린 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</div>
      )}

      {!data && !err && (
        <div style={{ ...CARD, padding: 40, textAlign: 'center', color: 'var(--c-tx5)' }}>
          종목 재무지표를 분석하는 중입니다… (최초 생성은 십수 초 걸릴 수 있어요)
        </div>
      )}

      {data && (
        <>
          <div style={{ fontSize: 12, color: 'var(--c-tx6)', marginBottom: 12 }}>
            기준일 {data.date} · 평가 {data.universe.toLocaleString('ko-KR')}종목 중 상위 {data.items.length}개
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.items.map((s, i) => (
              <button
                key={s.code}
                className="card-hover"
                onClick={() => actions.openStock(s.code, 'kr_stock')}
                style={{ ...CARD, textAlign: 'left', cursor: 'pointer', display: 'block', width: '100%', padding: 16 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  {/* 순위 + 이름 + 종합점수 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 200, flex: '1 1 200px' }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-tx6)', minWidth: 28 }}>{i + 1}</span>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-tx1b)' }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--c-tx6)' }}>{s.code} · {s.marketCapText}</div>
                    </div>
                    <div style={{ marginLeft: 'auto', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: scoreHue(s.score), lineHeight: 1 }}>{s.score}</div>
                      <div style={{ fontSize: 10, color: 'var(--c-tx6)', marginTop: 2 }}>종합</div>
                    </div>
                  </div>
                  {/* 세부 점수 */}
                  <div style={{ display: 'flex', gap: 12, flex: '1 1 240px' }}>
                    <ScoreBar label="밸류" value={s.valueScore} />
                    <ScoreBar label="퀄리티" value={s.qualityScore} />
                    <ScoreBar label="환원" value={s.returnScore} />
                  </div>
                </div>
                {/* 핵심 지표 */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--c-w05)' }}>
                  <Metric label="PER" value={num(s.per, '배')} />
                  <Metric label="PBR" value={num(s.pbr, '배')} />
                  <Metric label="ROE" value={num(s.roe, '%', 1)} color={s.roe != null && s.roe >= 10 ? 'var(--c-up)' : undefined} />
                  <Metric label="배당" value={num(s.divYield, '%', 1)} color={s.divYield != null && s.divYield >= 3 ? 'var(--c-up)' : undefined} />
                  <Metric label="목표가 괴리" value={s.upside == null ? '—' : fmtPct(s.upside)} color={s.upside != null ? upColor(s.upside) : undefined} />
                </div>
              </button>
            ))}
          </div>
          <SourceNote text="재무지표 — 네이버 금융 (PER·PBR·EPS·BPS·배당·컨센서스) · 점수는 자체 정량 산식" style={{ marginTop: 16 }} />
        </>
      )}
    </div>
  );
}
