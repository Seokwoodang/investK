import Link from 'next/link';

// 법적 고지 페이지(개인정보처리방침·이용약관) 공용 셸. 헤더 로고 + 본문 + 간단 푸터.
export function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', maxWidth: 780, margin: '0 auto', padding: '28px 20px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="InvestK" width={28} height={28} style={{ borderRadius: 8 }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-tx2)' }}>InvestK</span>
        </Link>
        <Link href="/" style={{ fontSize: 13, color: 'var(--c-tx5)', textDecoration: 'none' }}>← 홈</Link>
      </div>

      <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: 'var(--c-tx1)' }}>{title}</h1>
      <div style={{ fontSize: 12, color: 'var(--c-tx6)', marginBottom: 28 }}>시행일 {updated}</div>

      <div style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--c-tx3)' }}>{children}</div>

      <div style={{ marginTop: 44, paddingTop: 18, borderTop: '1px solid var(--c-w06)', fontSize: 12.5, color: 'var(--c-tx6)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Link href="/privacy" style={{ color: 'var(--c-tx5)', textDecoration: 'none' }}>개인정보처리방침</Link>
        <Link href="/terms" style={{ color: 'var(--c-tx5)', textDecoration: 'none' }}>이용약관</Link>
        <span>운영: 트루 · 문의 chazloofficial@gmail.com</span>
      </div>
    </div>
  );
}

// 섹션 헤더/문단 헬퍼.
export function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ margin: '30px 0 10px', fontSize: 16, fontWeight: 700, color: 'var(--c-tx1b)' }}>{children}</h2>;
}
export function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: '0 0 10px' }}>{children}</p>;
}
export function LI({ children }: { children: React.ReactNode }) {
  return <li style={{ margin: '0 0 6px' }}>{children}</li>;
}
