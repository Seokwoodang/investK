import { cookies } from 'next/headers';
import { DashboardChrome } from '@/components/DashboardChrome';
import { getDashboardData } from '@/server/data';
import { COOKIE, getSessionUser } from '@/lib/auth';

// 공유 레이아웃: 데이터를 한 번 모아 셸에 주입. 자식 라우트(대시보드/데일리/종목/뉴스/상세)는
// 이 레이아웃 아래에서 화면만 교체되며 셸·프로바이더·소켓은 유지된다.
// 시장 보기 페이지는 비로그인 공개 → 로그인 여부를 셸에 전달해 헤더 로그인/로그아웃 표시.
export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const [data, authed] = await Promise.all([
    getDashboardData(),
    getSessionUser(cookies().get(COOKIE)?.value).then((u) => !!u),
  ]);
  return <DashboardChrome data={data} authed={authed}>{children}</DashboardChrome>;
}
