import { DashboardSkeleton } from '@/components/DashboardSkeleton';

// 라우트 전환/첫 로드 시 (dash) 레이아웃 데이터 로딩 동안 보여줄 스켈레톤.
export default function Loading() {
  return <DashboardSkeleton />;
}
