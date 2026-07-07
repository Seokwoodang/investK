import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DashboardChrome } from '@/components/DashboardChrome';
import { getDashboardData } from '@/server/data';
import { COOKIE, getSessionUser } from '@/lib/auth';
import { getSupabase } from '@/server/supabase';
import { env } from '@/server/env';

// 공유 레이아웃: 데이터를 한 번 모아 셸에 주입. 자식 라우트(대시보드/데일리/종목/뉴스/상세)는
// 이 레이아웃 아래에서 화면만 교체되며 셸·프로바이더·소켓은 유지된다.
// 시장 보기 페이지는 비로그인 공개 → 로그인 여부를 셸에 전달해 헤더 로그인/로그아웃 표시.
export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const [data, user] = await Promise.all([
    getDashboardData(),
    getSessionUser(cookies().get(COOKIE)?.value),
  ]);

  // 승인 폐기 반영: 로그인 세션이라도 DB status가 approved가 아니면(관리자가 거절·삭제한 계정)
  // 다음 페이지 로드 때 죽은 쿠키를 지우고 로그인 화면으로 내보낸다.
  //  - 행이 없음(=삭제) 또는 status != approved → 차단
  //  - DB 쿼리 오류(일시적) → 실사용자 오차단 방지 위해 통과(fail-open)
  let uid: string | null = null; // GA User-ID로 쓸 불투명 식별자(이름 아님)
  if (user) {
    const sb = getSupabase();
    if (sb) {
      const { data: row, error } = await sb.from('app_users').select('status, uid').eq('username', user).maybeSingle();
      if (!error && (!row || (row.status as string) !== 'approved')) {
        redirect('/api/auth/logout');
      }
      if (row?.uid) uid = row.uid as string;
    }
  }

  const authed = !!user;
  const isAdmin = !!user && user === env.ADMIN_USER; // 관리자만 헤더에 '회원관리' 노출
  return <DashboardChrome data={data} authed={authed} isAdmin={isAdmin} uid={uid}>{children}</DashboardChrome>;
}
