'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 페이지 상단 세그먼트 탭(라우트 연결형) — 형제 페이지를 한 섹션처럼 묶는다.
// 예: 종목(/stocks) ↔ 저평가 우량주(/value), 내 자산(/portfolio) ↔ AI 보고서(/report).
// 별도 상태 없이 URL이 소스 오브 트루스(각 페이지 SEO·북마크 유지).
export function SubNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: 'var(--c-w04)', border: '1px solid var(--c-w07)', borderRadius: 12, marginBottom: 18 }}>
      {items.map((it) => {
        const active = pathname === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            style={{
              textDecoration: 'none', padding: '7px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700,
              whiteSpace: 'nowrap', transition: 'all 160ms',
              background: active ? 'var(--c-cy18)' : 'transparent',
              color: active ? 'var(--c-accyanbr)' : 'var(--c-tx4)',
            }}
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
