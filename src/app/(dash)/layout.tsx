import { DashboardChrome } from '@/components/DashboardChrome';
import { getDashboardData } from '@/server/data';

// 공유 레이아웃: 데이터를 한 번 모아 셸에 주입. 자식 라우트(대시보드/데일리/종목/뉴스/상세)는
// 이 레이아웃 아래에서 화면만 교체되며 셸·프로바이더·소켓은 유지된다.
export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const data = await getDashboardData();
  return <DashboardChrome data={data}>{children}</DashboardChrome>;
}
