'use client';

import { useEffect, useState } from 'react';
import { SRC_NEWS } from '../../lib/sources';
import { useDashboard } from '../../store/DashboardContext';
import { useViewportLayout } from '../DashboardChrome';
import { TabBar } from '../TabBar';
import { SourceNote } from '../SourceNote';

interface NewsItem {
  title: string;
  summary: string;
  src: string;
  url: string;
  tags: string[];
  impact?: '호재' | '악재' | '중립';
  importance?: '상' | '중' | '하';
  why?: string;
  target?: string;
}

const IMPACT_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  호재: { bg: 'rgba(52,211,154,0.22)', color: '#5ee7b0', border: 'rgba(52,211,154,0.5)' },
  악재: { bg: 'rgba(246,104,94,0.22)', color: '#ff8a80', border: 'rgba(246,104,94,0.5)' },
  중립: { bg: 'rgba(154,166,188,0.18)', color: '#aab4c6', border: 'rgba(154,166,188,0.4)' },
};

// 호재/악재 + 영향 종목을 크게 강조하는 헤더.
function ImpactHeader({ impact, target, importance }: { impact?: string; importance?: string; target?: string }) {
  if (!impact && !target) return null;
  const st = IMPACT_STYLE[impact || '중립'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
      {impact && (
        <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.02em', padding: '5px 14px', borderRadius: 9, background: st.bg, border: `1px solid ${st.border}`, color: st.color }}>{impact}</span>
      )}
      {target && <span style={{ fontSize: 15, fontWeight: 800, color: st.color }}>{target}</span>}
      {importance && (
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: '#9AA6BC' }}>중요도 {importance}</span>
      )}
    </div>
  );
}

export function News() {
  const { layout } = useViewportLayout();
  const { state } = useDashboard();
  const { activeTab } = state;
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [aiRanked, setAiRanked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const INITIAL = 9;

  useEffect(() => {
    // 뉴스 탭은 서버가 미리 만들어 둔 캐시를 즉시 받는다(서버가 탭별 소스를 알아서 처리). items 미전송.
    // 코인 뉴스는 국내/해외 구분이 무의미(둘 다 블록미디어) → global_coin 하나로 통일.
    const fetchTab = activeTab === 'kr_coin' ? 'global_coin' : activeTab;
    let cancelled = false;
    setNews(null);
    setExpanded(false);
    fetch('/api/news', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tab: fetchTab }),
    })
      .then((r) => (r.ok ? r.json() : { news: [] }))
      .then((j) => {
        if (!cancelled) {
          setNews(j.news ?? []);
          setAiRanked(Boolean(j.ranked));
        }
      })
      .catch(() => {
        if (!cancelled) setNews([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>뉴스</h1>
          {aiRanked && (
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap', background: 'rgba(0,199,217,0.16)', color: '#5fd9e6' }}>AI 판별 · 중요도순</span>
          )}
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: '#7E8AA0' }}>
          {aiRanked
            ? '언론사 경제·증권·코인 뉴스를 AI가 호재·악재와 중요도로 판별해 정렬했습니다.'
            : '언론사가 경제·증권·코인으로 분류한 뉴스를 최신순으로 모았습니다.'}
        </p>
      </div>

      <TabBar marginBottom={28} coinsMerged />

      {news === null && <div style={{ padding: 48, textAlign: 'center', color: '#6E7A90', fontSize: 14 }}>뉴스 불러오는 중…</div>}

      {news !== null && news.length === 0 && (
        <div style={{ padding: 48, textAlign: 'center', color: '#6E7A90', fontSize: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20 }}>
          표시할 뉴스가 없습니다.
        </div>
      )}

      {news !== null && news.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: layout.newsCols, gap: 16 }}>
          {(expanded ? news : news.slice(0, INITIAL)).map((n, i) => (
            <a
              key={i}
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', flexDirection: 'column', textDecoration: 'none', background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 24,
                backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
              }}
            >
              <ImpactHeader impact={n.impact} target={n.target} importance={n.importance} />
              <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, lineHeight: 1.4, letterSpacing: '-0.01em', color: '#EEF2F8' }}>{n.title}</h3>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#6E7A90', marginBottom: 10 }}>{n.src}</span>
              {n.why && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12, padding: '10px 12px', borderRadius: 12, background: 'rgba(0,199,217,0.06)', border: '1px solid rgba(0,199,217,0.16)' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#5fd9e6', flexShrink: 0, marginTop: 2 }}>왜 중요</span>
                  <span style={{ fontSize: 13, lineHeight: 1.55, color: '#C4CDDC' }}>{n.why}</span>
                </div>
              )}
              <p style={{ margin: '0 0 18px', fontSize: 13, lineHeight: 1.6, color: '#9AA6BC', flex: 1 }}>{n.summary}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {n.tags.map((tag) => (
                  <span key={tag} style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap', background: 'rgba(0,199,217,0.10)', border: '1px solid rgba(0,199,217,0.22)', color: '#5fd9e6' }}>{tag}</span>
                ))}
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#73BFF9' }}>원문 보기 ↗</span>
            </a>
          ))}
        </div>
      )}

      {news !== null && news.length > INITIAL && !expanded && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
          <button
            onClick={() => setExpanded(true)}
            style={{
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: '#9AA6BC',
              padding: '11px 22px', borderRadius: 999, background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            더 보기 +{news.length - INITIAL}
          </button>
        </div>
      )}

      <SourceNote text={aiRanked ? `${SRC_NEWS[activeTab]} · AI 판별 Claude(Haiku)` : SRC_NEWS[activeTab]} style={{ marginTop: 20 }} />
    </div>
  );
}
