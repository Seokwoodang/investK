'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { fmtPct, upColor } from '../../lib/format';
import { usePortfolio, usdKrwFromFx, useResolvedPrices, valuePortfolio } from '../../lib/portfolio';
import { useDashboard } from '../../store/DashboardContext';
import { SourceNote } from '../SourceNote';

const CARD: React.CSSProperties = {
  background: 'var(--c-w04)', border: '1px solid var(--c-w08)', borderRadius: 20,
  backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
};

interface ReportData {
  overview: string;
  performance: string;
  diagnosis: string;
  marketContext: string;
  checkpoints: string[];
}

const krw = (v: number) => '₩' + Math.round(v).toLocaleString('ko-KR');

export function Report() {
  const { data } = useDashboard();
  const { holdings } = usePortfolio();

  const usdkrw = useMemo(() => usdKrwFromFx(data.macro.fx), [data.macro.fx]);
  const extra = useResolvedPrices(holdings, data.stocks);
  const val = useMemo(() => valuePortfolio(holdings, data.stocks, usdkrw, extra), [holdings, data.stocks, usdkrw, extra]);
  const { rows, totalKrw, totalPlKrw, totalPlPct, groupWeights } = val;

  const sorted = useMemo(() => [...rows].sort((a, b) => b.plPct - a.plPct), [rows]);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  // 현재 시장 맥락 요약(AI 입력 + 화면 표시).
  const fxText = data.macro.fx.map((r) => `${r.pair} ${r.val}(${r.chg > 0 ? '+' : ''}${r.chg}%)`).join(', ');
  const idxText = data.macro.indices.map((r) => `${r.name} ${r.val}(${r.chg > 0 ? '+' : ''}${r.chg}%)`).join(', ');
  const upcoming = data.macro.events.filter((e) => e.tag === '고영향').slice(0, 5);
  const eventsText = upcoming.map((e) => `${e.date} ${e.name}`).join(', ');

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const generate = () => {
    if (!rows.length) return;
    setLoading(true);
    setReport(null);
    const lines = [...rows].sort((a, b) => b.valueKrw - a.valueKrw).map((r) => ({
      name: r.name, group: r.group, weight: totalKrw > 0 ? (r.valueKrw / totalKrw) * 100 : 0, plPct: r.plPct, risk: r.risk,
    }));
    fetch('/api/ai/report', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines, totalValueKrw: totalKrw, totalPlPct, groupWeights, fx: fxText, indices: idxText, events: eventsText }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.overview) setReport(j as ReportData); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const Section = ({ title, color, children }: { title: string; color: string; children: React.ReactNode }) => (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--c-tx2)' }}>{children}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>내 투자 보고서</h1>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-tx5)' }}>{today} 기준 · 내 보유 포트폴리오와 현재 시장을 종합한 리포트입니다.</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ ...CARD, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: 'var(--c-tx5)', marginBottom: 14 }}>보유 종목이 없습니다. 먼저 보유 종목을 등록해주세요.</div>
          <Link href="/portfolio" style={{ textDecoration: 'none', fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 9, background: 'var(--c-cy18)', color: 'var(--c-accyanbr)' }}>내 자산에서 추가하기 →</Link>
        </div>
      ) : (
        <>
          {/* 요약 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 16 }}>
            <div style={{ ...CARD, padding: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 6 }}>총 평가액</div>
              <div style={{ fontSize: 23, fontWeight: 800 }}>{krw(totalKrw)}</div>
            </div>
            <div style={{ ...CARD, padding: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 6 }}>총 평가손익</div>
              <div style={{ fontSize: 23, fontWeight: 800, color: upColor(totalPlPct) }}>{totalPlKrw >= 0 ? '+' : '-'}{krw(Math.abs(totalPlKrw)).slice(1)} ({fmtPct(totalPlPct)})</div>
            </div>
            <div style={{ ...CARD, padding: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 6 }}>보유 종목</div>
              <div style={{ fontSize: 23, fontWeight: 800 }}>{rows.length}<span style={{ fontSize: 14, color: 'var(--c-tx5)', fontWeight: 600 }}> 종목</span></div>
            </div>
            <div style={{ ...CARD, padding: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 8 }}>자산군 비중</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {groupWeights.map((g) => (
                  <div key={g.group} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--c-tx4)' }}>{g.group}</span>
                    <span style={{ color: 'var(--c-tx2)', fontWeight: 600 }}>{g.weight.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 성과 + 시장 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 16 }}>
            <div style={{ ...CARD, padding: 22 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-accyan)', marginBottom: 14 }}>성과</div>
              {best && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                  <span style={{ color: 'var(--c-tx4)' }}>수익률 상위 · {best.name}</span>
                  <span style={{ fontWeight: 700, color: upColor(best.plPct) }}>{fmtPct(best.plPct)}</span>
                </div>
              )}
              {worst && worst !== best && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--c-tx4)' }}>수익률 하위 · {worst.name}</span>
                  <span style={{ fontWeight: 700, color: upColor(worst.plPct) }}>{fmtPct(worst.plPct)}</span>
                </div>
              )}
            </div>
            <div style={{ ...CARD, padding: 22 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-accyan)', marginBottom: 14 }}>현재 시장</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--c-tx3)' }}>
                <div>환율 · {fxText}</div>
                <div style={{ marginTop: 4 }}>지수 · {idxText}</div>
                {upcoming.length > 0 && <div style={{ marginTop: 4, color: 'var(--c-tx5)' }}>예정 · {upcoming.map((e) => e.name).join(', ')}</div>}
              </div>
            </div>
          </div>

          {/* AI 보고서 */}
          <div style={{ ...CARD, padding: 24, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: report || loading ? 18 : 0, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 6, background: 'var(--c-cy18)', color: 'var(--c-accyanbr)' }}>AI 보고서</span>
                <span style={{ fontSize: 13, color: 'var(--c-tx5)' }}>포트폴리오 + 시장 맥락 종합</span>
              </div>
              <button
                onClick={generate}
                disabled={loading}
                style={{ cursor: loading ? 'default' : 'pointer', border: 'none', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', background: 'var(--c-cy18)', color: 'var(--c-accyanbr)', opacity: loading ? 0.6 : 1 }}
              >
                {loading ? '작성 중…' : report ? '다시 작성' : '보고서 생성'}
              </button>
            </div>
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: 'var(--c-tx5)', fontSize: 14 }}>
                <span className="skeleton-pulse" style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--c-accyanbr)' }} />
                보유 포트폴리오와 시장을 종합해 보고서를 작성하는 중입니다…
              </div>
            )}
            {report && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <Section title="총평" color="var(--c-accyan)">{report.overview}</Section>
                <Section title="성과 분석" color="var(--c-accyan)">{report.performance}</Section>
                <Section title="진단 (집중도·위험·분산)" color="var(--c-warn)">{report.diagnosis}</Section>
                <Section title="시장 환경" color="var(--c-acblue)">{report.marketContext}</Section>
                {report.checkpoints?.length > 0 && (
                  <div style={{ background: 'linear-gradient(135deg, var(--c-cy07), var(--c-bl05))', border: '1px solid var(--c-cy18)', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-accyanbr)', marginBottom: 8 }}>다음 점검 포인트</div>
                    <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {report.checkpoints.map((c, i) => <li key={i} style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--c-tx2)' }}>{c}</li>)}
                    </ul>
                  </div>
                )}
                <SourceNote text="AI 생성 — Claude (Anthropic) · 보유종목·시세·매크로를 종합한 참고용이며 투자 자문이 아닙니다." />
              </div>
            )}
          </div>
        </>
      )}

      <SourceNote text="보유종목 — 내 계정(Supabase) · 시세 — 네이버 금융·업비트·바이낸스 · 환율 frankfurter · 일정 Nasdaq" style={{ marginTop: 4 }} />
    </div>
  );
}
