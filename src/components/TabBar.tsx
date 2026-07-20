import { useDashboard } from '../store/DashboardContext';
import { useViewportLayout } from './DashboardChrome';
import { TAB_LABELS, type TabId } from '../types';

const tabStyle = (active: boolean, narrow: boolean): React.CSSProperties => ({
  cursor: 'pointer', border: 'none', padding: narrow ? '10px 4px' : '10px 20px', borderRadius: 11,
  fontSize: narrow ? 13 : 14, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'background 180ms, color 180ms',
  // 모바일: 그리드 셀(1fr)이 폭을 균등 분배 → 텍스트 중앙정렬·넘치면 말줄임(잘림 방지)
  ...(narrow ? { minWidth: 0, textAlign: 'center' as const, overflow: 'hidden', textOverflow: 'ellipsis' } : {}),
  ...(active
    ? { background: 'linear-gradient(135deg,var(--c-accyan),var(--c-blue))', color: 'var(--c-bg)', boxShadow: '0 6px 18px var(--c-cy25)' }
    : { background: 'transparent', color: 'var(--c-tx4)' }),
});

// coinsMerged: 뉴스처럼 코인을 국내/해외로 나눌 필요 없는 화면에서 코인 1개 탭으로 표시.
export function TabBar({ marginBottom, coinsMerged = false }: { marginBottom: number; coinsMerged?: boolean }) {
  const { state, actions } = useDashboard();
  const { vw } = useViewportLayout();
  const narrow = vw < 480; // 좁은 화면에선 탭을 폭 꽉 채워 균등 분배
  const tabs: { id: TabId; label: string }[] = coinsMerged
    ? [
        { id: 'kr_stock', label: '국내주식' },
        { id: 'us_stock', label: '해외주식' },
        { id: 'global_coin', label: '코인' },
      ]
    : TAB_LABELS;
  const isActive = (id: TabId) =>
    coinsMerged && id === 'global_coin'
      ? state.activeTab === 'global_coin' || state.activeTab === 'kr_coin'
      : state.activeTab === id;
  return (
    <div
      style={{
        display: narrow ? 'grid' : 'flex',
        gridTemplateColumns: narrow ? `repeat(${tabs.length}, 1fr)` : undefined,
        gap: narrow ? 4 : 8, padding: 6, background: 'var(--c-w03)',
        border: '1px solid var(--c-w07)', borderRadius: 16,
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        marginBottom, width: narrow ? '100%' : 'fit-content', maxWidth: '100%', overflowX: narrow ? 'visible' : 'auto',
      }}
    >
      {tabs.map((t) => (
        <button key={t.id} onClick={() => actions.setTab(t.id)} style={tabStyle(isActive(t.id), narrow)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
