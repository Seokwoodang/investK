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

export default function AdminPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/users', { cache: 'no-store' });
    if (r.status === 403) { setForbidden(true); return; }
    const j = await r.json().catch(() => ({}));
    setRows((j.users as Row[]) ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

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

      <section>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-tx3)', margin: '0 0 10px' }}>전체 계정</h2>
        <div style={{ background: 'var(--c-w03)', border: '1px solid var(--c-w08)', borderRadius: 14, overflow: 'hidden' }}>
          {others.length === 0 ? (
            <div style={{ padding: 20, color: 'var(--c-tx5)', fontSize: 14 }}>없음</div>
          ) : (
            others.map((r) => <RowCard key={r.username} r={r} />)
          )}
        </div>
      </section>
    </div>
  );
}
