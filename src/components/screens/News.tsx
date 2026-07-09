'use client';

import { Fragment, useEffect, useState } from 'react';
import { SRC_NEWS } from '../../lib/sources';
import { useDashboard } from '../../store/DashboardContext';
import { useViewportLayout } from '../DashboardChrome';
import { TabBar } from '../TabBar';
import { SourceNote, UpdateNote } from '../SourceNote';
import { InlineSpinner } from '../Footer';
import { AdSlot } from '../AdSlot';

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
  호재: { bg: 'var(--c-gn22)', color: 'var(--c-upbr)', border: 'var(--c-gn50)' },
  악재: { bg: 'var(--c-rd22)', color: 'var(--c-downbr)', border: 'var(--c-rd50)' },
  중립: { bg: 'var(--c-gy18)', color: 'var(--c-tx4b)', border: 'var(--c-gy40)' },
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
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'var(--c-w06)', color: 'var(--c-tx4)' }}>중요도 {importance}</span>
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
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap', background: 'var(--c-cy16)', color: 'var(--c-accyanbr)' }}>AI 판별 · 중요도순</span>
          )}
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-tx5)' }}>
          {aiRanked
            ? '언론사 경제·증권·코인 뉴스를 AI가 호재·악재와 중요도로 판별해 정렬했습니다.'
            : '언론사가 경제·증권·코인으로 분류한 뉴스를 최신순으로 모았습니다.'}
        </p>
        <UpdateNote text="하루 4회(06 · 12 · 18 · 24시 KST) 자동 갱신" style={{ marginTop: 8 }} />
      </div>

      <TabBar marginBottom={28} coinsMerged />

      {news === null && <div style={{ padding: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--c-tx6)', fontSize: 14 }}><InlineSpinner />뉴스 불러오는 중…</div>}

      {news !== null && news.length === 0 && (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--c-tx6)', fontSize: 14, background: 'var(--c-w03)', border: '1px solid var(--c-w06)', borderRadius: 20 }}>
          표시할 뉴스가 없습니다.
        </div>
      )}

      {news !== null && news.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: layout.newsCols, gap: 16 }}>
          {(() => {
            const shown = expanded ? news : news.slice(0, INITIAL);
            const adAt = Math.min(2, shown.length - 1); // 3번째 카드 뒤(짧으면 마지막 뒤)에 인피드 광고 1개
            return shown.map((n, i) => (
              <Fragment key={i}>
                <a
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', flexDirection: 'column', textDecoration: 'none', background: 'var(--c-w04)',
                    border: '1px solid var(--c-w08)', borderRadius: 20, padding: 24,
                    backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
                  }}
                >
                  <ImpactHeader impact={n.impact} target={n.target} importance={n.importance} />
                  <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, lineHeight: 1.4, letterSpacing: '-0.01em', color: 'var(--c-tx1b)' }}>{n.title}</h3>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-tx6)', marginBottom: 10 }}>{n.src}</span>
                  {n.why && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12, padding: '10px 12px', borderRadius: 12, background: 'var(--c-cy06)', border: '1px solid var(--c-cy16)' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--c-accyanbr)', flexShrink: 0, marginTop: 2 }}>왜 중요</span>
                      <span style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--c-tx3)' }}>{n.why}</span>
                    </div>
                  )}
                  <p style={{ margin: '0 0 18px', fontSize: 13, lineHeight: 1.6, color: 'var(--c-tx4)', flex: 1 }}>{n.summary}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                    {n.tags.map((tag) => (
                      <span key={tag} style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap', background: 'var(--c-cy10)', border: '1px solid var(--c-cy22)', color: 'var(--c-accyanbr)' }}>{tag}</span>
                    ))}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-acblue)' }}>원문 보기 ↗</span>
                </a>
                {i === adAt && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <AdSlot style={{ margin: '8px 0' }} />
                  </div>
                )}
              </Fragment>
            ));
          })()}
        </div>
      )}

      {news !== null && news.length > INITIAL && !expanded && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
          <button
            onClick={() => setExpanded(true)}
            style={{
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: 'var(--c-tx4)',
              padding: '11px 22px', borderRadius: 999, background: 'var(--c-w04)',
              border: '1px solid var(--c-w12)',
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
