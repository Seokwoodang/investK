'use client';

import { useCallback, useEffect, useState } from 'react';

interface Row {
  username: string;
  status: 'pending' | 'approved' | 'rejected';
  note: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<Row['status'], string> = { pending: '대기중', approved: '승인됨', rejected: '거절됨' };
const STATUS_COLOR: Record<Row['status'], string> = { pending: 'var(--c-warnchip)', approved: 'var(--c-accyanbr)', rejected: 'var(--c-downchip)' };

interface Agg { calls: number; inTok: number; outTok: number }
interface Usage {
  totals: { today: Agg; month: Agg };
  byUser: { username: string; today: Agg; month: Agg }[];
  byKind: { kind: string; calls: number; inTok: number; outTok: number }[];
  capped?: boolean;
}
const KIND_LABEL: Record<string, string> = { report: '개인 보고서', kanalyst: 'K-리서치', briefing: '데일리 브리핑', analysis: '종목 분석', news: '뉴스 랭킹' };
const nf = (n: number) => n.toLocaleString('ko-KR');
const ktok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)); // 토큰 축약

export default function AdminPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/users', { cache: 'no-store' });
    if (r.status === 403) { setForbidden(true); return; }
    const j = await r.json().catch(() => ({}));
    setRows((j.users as Row[]) ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/admin/usage', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && j.totals) setUsage(j as Usage); })
      .catch(() => {});
  }, []);

  const act = async (username: string, action: 'approve' | 'reject' | 'delete') => {
    if (action === 'delete' && !confirm(`${username} 계정을 삭제할까요?`)) return;
    setBusy(username);
    await fetch('/api/admin/users', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, action }),
    }).catch(() => {});
    await load();
    setBusy(null);
  };

  if (forbidden) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ color: 'var(--c-tx3)', fontSize: 15 }}>접근 권한이 없습니다.</div>
      </div>
    );
  }

  const pending = (rows ?? []).filter((r) => r.status === 'pending');
  const others = (rows ?? []).filter((r) => r.status !== 'pending');

  const btn = (bg: string, col: string): React.CSSProperties => ({
    cursor: 'pointer', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700,
    fontFamily: 'inherit', background: bg, color: col,
  });

  const RowCard = ({ r }: { r: Row }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--c-w05)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-tx1b)' }}>{r.username}</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: STATUS_COLOR[r.status] }}>{STATUS_LABEL[r.status]}</span>
        </div>
        {r.note && <div style={{ fontSize: 13, color: 'var(--c-tx3)', marginTop: 4 }}>{r.note}</div>}
        <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginTop: 4 }}>{new Date(r.created_at).toLocaleString('ko-KR')}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, opacity: busy === r.username ? 0.5 : 1 }}>
        {r.status !== 'approved' && <button style={btn('var(--c-cy18)', 'var(--c-accyanbr)')} onClick={() => act(r.username, 'approve')}>승인</button>}
        {r.status === 'pending' && <button style={btn('var(--c-rd16)', 'var(--c-downchip)')} onClick={() => act(r.username, 'reject')}>거절</button>}
        {r.status !== 'pending' && <button style={btn('var(--c-w06)', 'var(--c-tx4)')} onClick={() => act(r.username, 'delete')}>삭제</button>}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', maxWidth: 640, margin: '0 auto', padding: '40px 20px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--c-tx1)' }}>회원 관리</h1>
        <a href="/" style={{ fontSize: 13, color: 'var(--c-tx4)', textDecoration: 'none' }}>← 대시보드</a>
      </div>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-tx3)', margin: '0 0 10px' }}>
          가입 대기 {pending.length > 0 && <span style={{ color: 'var(--c-warnchip)' }}>({pending.length})</span>}
        </h2>
        <div style={{ background: 'var(--c-w03)', border: '1px solid var(--c-w08)', borderRadius: 14, overflow: 'hidden' }}>
          {rows == null ? (
            <div style={{ padding: 20, color: 'var(--c-tx5)', fontSize: 14 }}>불러오는 중…</div>
          ) : pending.length === 0 ? (
            <div style={{ padding: 20, color: 'var(--c-tx5)', fontSize: 14 }}>대기 중인 신청이 없습니다.</div>
          ) : (
            pending.map((r) => <RowCard key={r.username} r={r} />)
          )}
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-tx3)', margin: '0 0 10px' }}>전체 계정</h2>
        <div style={{ background: 'var(--c-w03)', border: '1px solid var(--c-w08)', borderRadius: 14, overflow: 'hidden' }}>
          {others.length === 0 ? (
            <div style={{ padding: 20, color: 'var(--c-tx5)', fontSize: 14 }}>없음</div>
          ) : (
            others.map((r) => <RowCard key={r.username} r={r} />)
          )}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-tx3)', margin: '0 0 10px' }}>AI 사용량</h2>
        {usage == null ? (
          <div style={{ background: 'var(--c-w03)', border: '1px solid var(--c-w08)', borderRadius: 14, padding: 20, color: 'var(--c-tx5)', fontSize: 14 }}>불러오는 중…</div>
        ) : (
          <>
            {/* 합계 — 오늘 / 최근 30일 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              {([['오늘', usage.totals.today], ['최근 30일', usage.totals.month]] as const).map(([label, a]) => (
                <div key={label} style={{ background: 'var(--c-w03)', border: '1px solid var(--c-w08)', borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ fontSize: 12, color: 'var(--c-tx5)', marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-tx1b)' }}>{nf(a.calls)}<span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-tx5)', marginLeft: 4 }}>회 생성</span></div>
                  <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginTop: 5 }}>입력 {ktok(a.inTok)} · 출력 {ktok(a.outTok)} 토큰</div>
                </div>
              ))}
            </div>

            {/* 기능별(30일) */}
            {usage.byKind.length > 0 && (
              <div style={{ background: 'var(--c-w03)', border: '1px solid var(--c-w08)', borderRadius: 14, padding: '6px 16px', marginBottom: 12 }}>
                {usage.byKind.map((k, i) => (
                  <div key={k.kind} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < usage.byKind.length - 1 ? '1px solid var(--c-w05)' : 'none' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-tx2)' }}>{KIND_LABEL[k.kind] ?? k.kind}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: 'var(--c-tx3)' }}>{nf(k.calls)}회</span>
                    <span style={{ fontSize: 11, color: 'var(--c-tx6)', width: 120, textAlign: 'right' }}>{ktok(k.inTok + k.outTok)} 토큰</span>
                  </div>
                ))}
              </div>
            )}

            {/* 계정별 */}
            <div style={{ background: 'var(--c-w03)', border: '1px solid var(--c-w08)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--c-w08)', fontSize: 11, fontWeight: 700, color: 'var(--c-tx6)' }}>
                <span style={{ flex: 1 }}>계정</span>
                <span style={{ width: 64, textAlign: 'right' }}>오늘</span>
                <span style={{ width: 64, textAlign: 'right' }}>30일</span>
                <span style={{ width: 96, textAlign: 'right' }}>30일 토큰</span>
              </div>
              {usage.byUser.length === 0 ? (
                <div style={{ padding: 20, color: 'var(--c-tx5)', fontSize: 14 }}>아직 사용 기록이 없습니다.</div>
              ) : (
                usage.byUser.map((u, i) => (
                  <div key={u.username} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: i < usage.byUser.length - 1 ? '1px solid var(--c-w05)' : 'none' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: 'var(--c-tx1b)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.username}</span>
                    <span style={{ width: 64, textAlign: 'right', fontSize: 13, fontWeight: 700, color: u.today.calls > 0 ? 'var(--c-accyanbr)' : 'var(--c-tx5)' }}>{nf(u.today.calls)}</span>
                    <span style={{ width: 64, textAlign: 'right', fontSize: 13, color: 'var(--c-tx3)' }}>{nf(u.month.calls)}</span>
                    <span style={{ width: 96, textAlign: 'right', fontSize: 11, color: 'var(--c-tx6)' }}>{ktok(u.month.inTok + u.month.outTok)}</span>
                  </div>
                ))
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--c-tx6)', marginTop: 10 }}>실제 Claude 생성만 집계(캐시 적중 제외) · 토큰은 입력+출력 · 정확한 요금은 Anthropic 콘솔 기준{usage.capped ? ' · 30일 로그 10,000건 상한 도달(일부 누락 가능)' : ''}</div>
          </>
        )}
      </section>
    </div>
  );
}
