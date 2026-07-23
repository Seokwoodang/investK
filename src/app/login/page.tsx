'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Footer } from '@/components/Footer';

// 로그인은 카카오 전용. (아이디/비번 체계는 폐지 — 다계정 남용 방지)
export default function LoginPage() {
  const [err, setErr] = useState('');
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('error') === 'kakao') {
      setErr('카카오 로그인에 실패했어요. 잠시 후 다시 시도해주세요.');
    }
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 상단바 — 로고 클릭 시 대시보드로(로그인 없이도 시장 보기 가능) */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', maxWidth: 1280, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="InvestK" width={30} height={30} style={{ borderRadius: 9 }} />
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-tx1)' }}>InvestK</span>
        </Link>
        <Link href="/" style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-tx4)', textDecoration: 'none', padding: '8px 14px', borderRadius: 999, border: '1px solid var(--c-w10)', background: 'var(--c-w05)' }}>← 대시보드</Link>
      </header>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div
          style={{
            width: '100%', maxWidth: 360, background: 'var(--c-w04)', border: '1px solid var(--c-w08)',
            borderRadius: 20, padding: 32, backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="InvestK" width={30} height={30} style={{ borderRadius: 9 }} />
            <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--c-tx1)' }}>InvestK</span>
          </div>
          <p style={{ margin: '0 0 22px', fontSize: 13, color: 'var(--c-tx5)', lineHeight: 1.6 }}>
            카카오로 간편하게 시작하세요. 시장 보기는 로그인 없이도 가능해요.
          </p>

          {err && (
            <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: 'var(--c-rd06)', border: '1px solid var(--c-rd20)', fontSize: 13, color: 'var(--c-tx3)' }}>{err}</div>
          )}

          <a
            href="/api/auth/kakao"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', boxSizing: 'border-box', padding: '14px 16px', borderRadius: 10,
              background: '#FEE500', color: '#191600', fontSize: 15, fontWeight: 800, textDecoration: 'none',
            }}
          >
            <span style={{ fontSize: 16 }}>💬</span> 카카오로 로그인
          </a>

          <p style={{ margin: '16px 0 0', textAlign: 'center', fontSize: 12, color: 'var(--c-tx6)', lineHeight: 1.6 }}>
            카카오 계정으로 로그인·가입됩니다.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 20px 8px', width: '100%', boxSizing: 'border-box' }}>
        <Footer />
      </div>
    </div>
  );
}
