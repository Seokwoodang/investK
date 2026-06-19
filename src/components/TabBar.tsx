import { useDashboard } from '../store/DashboardContext';
import { TAB_LABELS, type TabId } from '../types';

const tabStyle = (active: boolean): React.CSSProperties => ({
  cursor: 'pointer', border: 'none', padding: '10px 20px', borderRadius: 11,
  fontSize: 14, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 180ms',
  ...(active
    ? { background: 'linear-gradient(135deg,#00C7D9,#4078FF)', color: '#05080f', boxShadow: '0 6px 18px rgba(0,199,217,0.25)' }
    : { background: 'transparent', color: '#9AA6BC' }),
});

// coinsMerged: 뉴스처럼 코인을 국내/해외로 나눌 필요 없는 화면에서 코인 1개 탭으로 표시.
export function TabBar({ marginBottom, coinsMerged = false }: { marginBottom: number; coinsMerged?: boolean }) {
  const { state, actions } = useDashboard();
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
        display: 'flex', gap: 8, padding: 6, background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16,
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        marginBottom, width: 'fit-content', maxWidth: '100%', overflowX: 'auto',
      }}
    >
      {tabs.map((t) => (
        <button key={t.id} onClick={() => actions.setTab(t.id)} style={tabStyle(isActive(t.id))}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
