'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';

export default function LoginPage() {
  const router = useRouter();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, pw }),
      });
      if (r.ok) {
        // SPA 소프트 전환(풀 리로드 없음). 로그인 화면은 busy=true 동안 아래에서 대시보드 스켈레톤을
        // 그리고, router.replace로 '/'가 준비되면 자연스럽게 교체된다(언로드될 때까지 스켈레톤 유지).
        const next = new URLSearchParams(window.location.search).get('next');
        router.replace(next && next.startsWith('/') ? next : '/');
        return; // busy 유지 — 대시보드가 커밋될 때까지 스켈레톤 표시
      }
      const j = await r.json().catch(() => ({}));
      setErr(j.error || '로그인에 실패했습니다.');
      setBusy(false);
    } catch {
      setErr('네트워크 오류가 발생했습니다.');
      setBusy(false);
    }
  };

  // 로그인 성공 후 전환 중에는 폼 대신 대시보드 스켈레톤을 보여준다(멈춤·풀리로드 없이 매끄럽게).
  if (busy && !err) return <DashboardSkeleton />;

  const input: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: 'var(--c-w04)', border: '1px solid var(--c-w10)',
    borderRadius: 10, padding: '12px 14px', color: 'var(--c-tx1d)', fontSize: 15, fontFamily: 'inherit', outline: 'none',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form
        onSubmit={submit}
        style={{
          width: '100%', maxWidth: 360, background: 'var(--c-w04)', border: '1px solid var(--c-w08)',
          borderRadius: 20, padding: 32, backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg, var(--c-accyan), var(--c-blue))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 11, height: 11, borderRadius: 3, background: 'var(--c-bg)' }} />
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--c-tx1)' }}>InvestKang</span>
        </div>
        <p style={{ margin: '0 0 22px', fontSize: 13, color: 'var(--c-tx5)' }}>로그인 후 이용할 수 있습니다.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input style={input} placeholder="아이디" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" autoFocus />
          <input style={input} placeholder="비밀번호" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        </div>

        {err && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--c-down)' }}>{err}</div>}

        <button
          type="submit"
          disabled={busy}
          style={{
            width: '100%', marginTop: 18, cursor: busy ? 'default' : 'pointer', border: 'none', borderRadius: 10,
            padding: '12px 16px', fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
            background: 'var(--c-cy18)', color: 'var(--c-accyanbr)', opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? '확인 중…' : '로그인'}
        </button>
      </form>
    </div>
  );
}
