'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardSkeleton } from '@/components/DashboardSkeleton';
import { track } from '@/lib/ga';

type Mode = 'login' | 'signup';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(''); // 회원가입 신청 완료 안내
  const [busy, setBusy] = useState(false);
  const [entering, setEntering] = useState(false); // 로그인 성공 확정 후에만 대시보드 스켈레톤 표시(요청 대기 중엔 폼 유지)

  const switchMode = (m: Mode) => {
    setMode(m);
    setErr('');
    setDone('');
    setPw('');
    if (m === 'login') setNote('');
  };

  const submitLogin = async () => {
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, pw }),
    });
    if (r.ok) {
      track('login_success');
      setEntering(true); // 성공 확정 → 이제부터 스켈레톤(진입 연출)
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next && next.startsWith('/') ? next : '/');
      return true; // entering 유지 — 대시보드 커밋될 때까지 스켈레톤
    }
    const j = await r.json().catch(() => ({}));
    setErr(j.error || '로그인에 실패했습니다.');
    setBusy(false);
    return false;
  };

  const submitSignup = async () => {
    track('signup_submit');
    const r = await fetch('/api/auth/signup', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, pw, note }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      track('signup_success');
      setMode('login');
      setPw('');
      setNote('');
      setDone('가입이 완료됐습니다. 바로 로그인하세요.');
    } else {
      setErr(j.error || '가입에 실패했습니다.');
    }
    setBusy(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setDone('');
    try {
      if (mode === 'login') await submitLogin();
      else await submitSignup();
    } catch {
      setErr('네트워크 오류가 발생했습니다.');
      setBusy(false);
    }
  };

  // 로그인 '성공 확정' 후에만 스켈레톤(진입 연출). 요청 대기 중(busy)엔 폼을 유지해,
  // 실패 시 스켈레톤이 잠깐 떴다 사라지는 '진입했다 튕김' 플래시가 없다.
  if (entering) return <DashboardSkeleton />;

  const input: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: 'var(--c-w04)', border: '1px solid var(--c-w10)',
    borderRadius: 10, padding: '12px 14px', color: 'var(--c-tx1d)', fontSize: 15, fontFamily: 'inherit', outline: 'none',
  };
  const isSignup = mode === 'signup';

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
        <p style={{ margin: '0 0 22px', fontSize: 13, color: 'var(--c-tx5)' }}>
          {isSignup ? '가입 신청 후 관리자 승인을 받아야 이용할 수 있습니다.' : '로그인 후 이용할 수 있습니다.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input style={input} placeholder="아이디" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" autoFocus />
          <input style={input} placeholder="비밀번호" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={isSignup ? 'new-password' : 'current-password'} />
          {isSignup && (
            <input style={input} placeholder="이름/소개 (승인 참고용)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          )}
        </div>

        {err && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--c-down)' }}>{err}</div>}
        {done && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--c-accyanbr)' }}>{done}</div>}

        <button
          type="submit"
          disabled={busy}
          style={{
            width: '100%', marginTop: 18, cursor: busy ? 'default' : 'pointer', border: 'none', borderRadius: 10,
            padding: '12px 16px', fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
            background: 'var(--c-cy18)', color: 'var(--c-accyanbr)', opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? '처리 중…' : isSignup ? '가입 신청' : '로그인'}
        </button>

        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: 'var(--c-tx5)' }}>
          {isSignup ? '이미 계정이 있으신가요? ' : '계정이 없으신가요? '}
          <button
            type="button"
            onClick={() => switchMode(isSignup ? 'login' : 'signup')}
            style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: 'var(--c-accyanbr)' }}
          >
            {isSignup ? '로그인' : '회원가입'}
          </button>
        </div>
      </form>
    </div>
  );
}
