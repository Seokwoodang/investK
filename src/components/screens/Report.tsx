'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { fmtPct, upColor } from '../../lib/format';
import { usePortfolio, usdKrwFromFx, useResolvedPrices, valuePortfolio } from '../../lib/portfolio';
import { useDashboard } from '../../store/DashboardContext';
import { SourceNote, UpdateNote } from '../SourceNote';
import { InlineSpinner } from '../Footer';

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
interface Line { name: string; group: string; weight: number; plPct: number; risk?: string }
interface HistEntry {
  id: number;
  created_at: string;
  total_value_krw: number | null;
  total_pl_pct: number | null;
  lines: Line[];
  report: ReportData;
}

const krw = (v: number) => '₩' + Math.round(v).toLocaleString('ko-KR');
const fmtDT = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function Report() {
  const { data } = useDashboard();
  const { holdings } = usePortfolio();

  const usdkrw = useMemo(() => usdKrwFromFx(data.macro.fx), [data.macro.fx]);
  const extra = useResolvedPrices(holdings, data.stocks);
  const val = useMemo(() => valuePortfolio(holdings, data.stocks, usdkrw, extra), [holdings, data.stocks, usdkrw, extra]);
  const { rows, totalKrw, totalPlPct, groupWeights } = val;

  const liveLines: Line[] = useMemo(
    () => [...rows].sort((a, b) => b.valueKrw - a.valueKrw).map((r) => ({
      name: r.name, group: r.group, weight: totalKrw > 0 ? (r.valueKrw / totalKrw) * 100 : 0, plPct: r.plPct, risk: r.risk,
    })),
    [rows, totalKrw],
  );

  // 현재 시장 맥락(AI 입력 + 표시). 등락률은 소수 2자리로 반올림(날것 부동소수 방지).
  const fxText = data.macro.fx.map((r) => `${r.pair} ${r.val}(${r.chg > 0 ? '+' : ''}${r.chg.toFixed(2)}%)`).join(', ');
  const idxText = data.macro.indices.map((r) => `${r.name} ${r.val}(${r.chg > 0 ? '+' : ''}${r.chg.toFixed(2)}%)`).join(', ');
  const upcoming = data.macro.events.filter((e) => e.tag === '고영향').slice(0, 5);
  const eventsText = upcoming.map((e) => `${e.date} ${e.name}`).join(', ');

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // ── 기록(생성할 때마다 보관) ──
  const [history, setHistory] = useState<HistEntry[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  useEffect(() => {
    fetch('/api/report-history')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => setHistory(j.items || []))
      .catch(() => {});
  }, []);
  const selected = selectedId != null ? history.find((h) => h.id === selectedId) ?? null : null;

  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const generate = () => {
    if (!rows.length) return;
    setLoading(true);
    setReport(null);
    setSelectedId(null);
    const lines = liveLines;
    fetch('/api/ai/report', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines, totalValueKrw: totalKrw, totalPlPct, groupWeights, fx: fxText, indices: idxText, events: eventsText }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.overview) return;
        setReport(j as ReportData);
        // 기록 저장(생성할 때마다).
        fetch('/api/report-history', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ totalValueKrw: totalKrw, totalPlPct, lines, report: j }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((saved) => {
            if (saved?.id) setHistory((h) => [{ id: saved.id, created_at: saved.created_at, total_value_krw: totalKrw, total_pl_pct: totalPlPct, lines, report: j as ReportData }, ...h]);
          })
          .catch(() => {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  // 표시 대상: 과거 기록 선택 시 그 스냅샷, 아니면 현재(라이브).
  const disp = selected
    ? { totalKrw: selected.total_value_krw ?? 0, totalPlPct: selected.total_pl_pct ?? 0, lines: selected.lines, report: selected.report, atLabel: fmtDT(selected.created_at), isPast: true }
    : { totalKrw, totalPlPct, lines: liveLines, report, atLabel: today, isPast: false };
  const dispGroups = useMemo(() => {
    const m = new Map<string, number>();
    disp.lines.forEach((l) => m.set(l.group, (m.get(l.group) || 0) + l.weight));
    return [...m.entries()].map(([group, weight]) => ({ group, weight })).sort((a, b) => b.weight - a.weight);
  }, [disp.lines]);
  const dispSorted = [...disp.lines].sort((a, b) => b.plPct - a.plPct);
  const dBest = dispSorted[0];
  const dWorst = dispSorted[dispSorted.length - 1];
  const dispPlKrw = disp.totalKrw - (disp.totalPlPct <= -100 ? 0 : disp.totalKrw / (1 + disp.totalPlPct / 100));

  const showBody = disp.isPast || rows.length > 0;

  const Section = ({ title, color, children }: { title: string; color: string; children: React.ReactNode }) => (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--c-tx2)' }}>{children}</div>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>내 투자 보고서</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-tx5)' }}>
          {disp.isPast ? `${disp.atLabel} 기록 (과거 보고서)` : `${today} 기준 · 내 보유 포트폴리오와 현재 시장을 종합한 리포트`}
        </p>
        <UpdateNote text="버튼을 누른 시점의 데이터로 작성되어 기록에 저장됩니다(자동 갱신 아님)" style={{ marginTop: 8 }} />
      </div>

      {!showBody ? (
        <div style={{ ...CARD, padding: 40, textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 14, color: 'var(--c-tx5)', marginBottom: 14 }}>보유 종목이 없습니다. 먼저 보유 종목을 등록해주세요.</div>
          <Link href="/portfolio" style={{ textDecoration: 'none', fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 9, background: 'var(--c-cy18)', color: 'var(--c-accyanbr)' }}>내 자산에서 추가하기 →</Link>
        </div>
      ) : (
        <>
          {/* 요약 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 16 }}>
            <div style={{ ...CARD, padding: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 6 }}>총 평가액</div>
              <div style={{ fontSize: 23, fontWeight: 800 }}>{krw(disp.totalKrw)}</div>
            </div>
            <div style={{ ...CARD, padding: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 6 }}>총 평가손익</div>
              <div style={{ fontSize: 23, fontWeight: 800, color: upColor(disp.totalPlPct) }}>{dispPlKrw >= 0 ? '+' : '-'}{krw(Math.abs(dispPlKrw)).slice(1)} ({fmtPct(disp.totalPlPct)})</div>
            </div>
            <div style={{ ...CARD, padding: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 6 }}>보유 종목</div>
              <div style={{ fontSize: 23, fontWeight: 800 }}>{disp.lines.length}<span style={{ fontSize: 14, color: 'var(--c-tx5)', fontWeight: 600 }}> 종목</span></div>
            </div>
            <div style={{ ...CARD, padding: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 8 }}>자산군 비중</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {dispGroups.map((g) => (
                  <div key={g.group} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--c-tx4)' }}>{g.group}</span>
                    <span style={{ color: 'var(--c-tx2)', fontWeight: 600 }}>{g.weight.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 성과 + (라이브일 때만) 현재 시장 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 16 }}>
            <div style={{ ...CARD, padding: 22 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-accyan)', marginBottom: 14 }}>성과</div>
              {dBest && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                  <span style={{ color: 'var(--c-tx4)' }}>수익률 상위 · {dBest.name}</span>
                  <span style={{ fontWeight: 700, color: upColor(dBest.plPct) }}>{fmtPct(dBest.plPct)}</span>
                </div>
              )}
              {dWorst && dWorst !== dBest && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--c-tx4)' }}>수익률 하위 · {dWorst.name}</span>
                  <span style={{ fontWeight: 700, color: upColor(dWorst.plPct) }}>{fmtPct(dWorst.plPct)}</span>
                </div>
              )}
            </div>
            {!disp.isPast && (
              <div style={{ ...CARD, padding: 22 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-accyan)', marginBottom: 14 }}>현재 시장</div>
                <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--c-tx3)' }}>
                  <div>환율 · {fxText}</div>
                  <div style={{ marginTop: 4 }}>지수 · {idxText}</div>
                  {upcoming.length > 0 && <div style={{ marginTop: 4, color: 'var(--c-tx5)' }}>예정 · {upcoming.map((e) => e.name).join(', ')}</div>}
                </div>
              </div>
            )}
          </div>

          {/* 보유 종목 상세 (비중순) */}
          {disp.lines.length > 0 && (
            <div style={{ ...CARD, padding: '8px 22px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-accyan)', padding: '12px 0 6px' }}>보유 종목 ({disp.lines.length})</div>
              {[...disp.lines].sort((a, b) => b.weight - a.weight).map((l, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: '1px solid var(--c-w05)' }}>
                  <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--c-tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--c-tx6)', whiteSpace: 'nowrap' }}>{l.group}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-tx3)', width: 52, textAlign: 'right' }}>{l.weight.toFixed(0)}%</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: upColor(l.plPct), width: 72, textAlign: 'right' }}>{fmtPct(l.plPct)}</span>
                </div>
              ))}
            </div>
          )}

          {/* AI 보고서 */}
          <div style={{ ...CARD, padding: 24, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: disp.report || loading ? 18 : 0, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 6, background: 'var(--c-cy18)', color: 'var(--c-accyanbr)' }}>AI 보고서</span>
                <span style={{ fontSize: 13, color: 'var(--c-tx5)' }}>{disp.isPast ? `${disp.atLabel} 작성` : '포트폴리오 + 시장 맥락 종합'}</span>
              </div>
              {disp.isPast ? (
                <button onClick={() => setSelectedId(null)} style={{ cursor: 'pointer', border: '1px solid var(--c-w10)', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', background: 'var(--c-w05)', color: 'var(--c-tx4)' }}>현재 포트폴리오로 →</button>
              ) : (
                <button onClick={generate} disabled={loading} style={{ cursor: loading ? 'default' : 'pointer', border: 'none', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', background: 'var(--c-cy18)', color: 'var(--c-accyanbr)', opacity: loading ? 0.6 : 1 }}>
                  {loading && <InlineSpinner size={12} color="currentColor" />} {loading ? '작성 중…' : report ? '다시 작성' : '보고서 생성'}
                </button>
              )}
            </div>
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: 'var(--c-tx5)', fontSize: 14 }}>
                <InlineSpinner />
                보유 포트폴리오와 시장을 종합해 보고서를 작성하는 중입니다…
              </div>
            )}
            {disp.report && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <Section title="총평" color="var(--c-accyan)">{disp.report.overview}</Section>
                <Section title="성과 분석" color="var(--c-accyan)">{disp.report.performance}</Section>
                <Section title="진단 (집중도·위험·분산)" color="var(--c-warn)">{disp.report.diagnosis}</Section>
                <Section title="시장 환경" color="var(--c-acblue)">{disp.report.marketContext}</Section>
                {disp.report.checkpoints?.length > 0 && (
                  <div style={{ background: 'linear-gradient(135deg, var(--c-cy07), var(--c-bl05))', border: '1px solid var(--c-cy18)', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-accyanbr)', marginBottom: 8 }}>다음 점검 포인트</div>
                    <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {disp.report.checkpoints.map((c, i) => <li key={i} style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--c-tx2)' }}>{c}</li>)}
                    </ul>
                  </div>
                )}
                <SourceNote text="AI 생성 — Claude (Anthropic) · 보유종목·시세·매크로를 종합한 참고용이며 투자 자문이 아닙니다." />
              </div>
            )}
            {!disp.report && !loading && !disp.isPast && (
              <div style={{ fontSize: 13, color: 'var(--c-tx5)', paddingTop: 4 }}>“보고서 생성”을 누르면 현재 포트폴리오 기준 보고서를 만들고 기록에 저장합니다.</div>
            )}
          </div>
        </>
      )}

      {/* 지난 보고서 기록 */}
      {history.length > 0 && (
        <div style={{ ...CARD, padding: '8px 18px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-tx4)', padding: '10px 0' }}>지난 보고서 ({history.length})</div>
          {history.map((h) => {
            const active = h.id === selectedId;
            return (
              <div
                key={h.id}
                onClick={() => setSelectedId(active ? null : h.id)}
                className="event-row"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 8px', margin: '0 -8px', borderRadius: 10, borderBottom: '1px solid var(--c-w05)', cursor: 'pointer', background: active ? 'var(--c-cy08)' : 'transparent' }}
              >
                <div style={{ flex: '1 1 160px', minWidth: 140 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--c-accyanbr)' : 'var(--c-tx2)' }}>{fmtDT(h.created_at)}</div>
                  <div style={{ fontSize: 11, color: 'var(--c-tx6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h.lines.length}종목 · {h.lines.slice(0, 3).map((l) => l.name).join(', ')}{h.lines.length > 3 ? '…' : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{h.total_value_krw != null ? krw(h.total_value_krw) : '—'}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: upColor(h.total_pl_pct ?? 0) }}>{h.total_pl_pct != null ? fmtPct(h.total_pl_pct) : ''}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SourceNote text="보유종목·보고서 기록 — 내 계정(Supabase) · 시세 — 네이버 금융·업비트·바이낸스 · 환율 frankfurter · 일정 Nasdaq" style={{ marginTop: 4 }} />
    </div>
  );
}
