import { NextResponse } from 'next/server';

// 유니버스에 없는 임의 종목(미국 ETF·소형주 등)을 네이버로 즉석 조회.
//   ?q=QQQM       → 자동완성 후보 목록(드롭다운용, 시세 없음)
//   ?price=QQQM   → 단일 종목 + 현재가(보유 평가용)
// 네이버: ac.stock.naver.com(자동완성), api.stock.naver.com/stock/{reutersCode}/basic(시세). 키 불필요.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const H = { 'User-Agent': 'Mozilla/5.0', Referer: 'https://m.stock.naver.com/' };
const num = (s: unknown) => Number(String(s ?? '').replace(/[^0-9.\-]/g, '')) || 0;

interface AcItem { code?: string; symbolCode?: string; name?: string; reutersCode?: string; nationCode?: string; typeName?: string; category?: string }

function mapItem(it: AcItem) {
  const usa = it.nationCode === 'USA';
  return {
    ticker: it.symbolCode || it.code || '',
    name: it.name || '',
    rc: it.reutersCode || it.code || '',
    cur: (usa ? '$' : '₩') as '$' | '₩',
    tab: usa ? 'us_stock' : 'kr_stock',
    group: usa ? '해외주식' : '국내주식',
    market: it.typeName || '',
  };
}

async function ac(q: string): Promise<AcItem[]> {
  const r = await fetch(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock`, { headers: H });
  if (!r.ok) return [];
  const j = (await r.json()) as { items?: AcItem[] };
  return (j.items ?? []).filter((it) => (it.category ?? 'stock') === 'stock' && (it.symbolCode || it.code));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q');
  const price = url.searchParams.get('price');
  try {
    if (price) {
      const items = await ac(price);
      // 티커 정확 일치 우선
      const it = items.find((x) => (x.symbolCode || x.code)?.toUpperCase() === price.toUpperCase()) || items[0];
      if (!it) return NextResponse.json({ found: false });
      const m = mapItem(it);
      const b = (await (await fetch(`https://api.stock.naver.com/stock/${m.rc}/basic`, { headers: H })).json()) as Record<string, unknown>;
      let pct = num(b.fluctuationsRatio);
      const sign = (b.compareToPreviousPrice as { code?: string } | undefined)?.code;
      if ((sign === '4' || sign === '5') && pct > 0) pct = -pct;
      return NextResponse.json({ found: true, ticker: m.ticker, name: m.name, cur: m.cur, tab: m.tab, group: m.group, price: num(b.closePrice), pct });
    }
    if (q) {
      const items = (await ac(q)).slice(0, 6).map(mapItem).map(({ rc, ...rest }) => rest);
      return NextResponse.json({ items });
    }
    return NextResponse.json({ items: [] });
  } catch {
    return NextResponse.json(price ? { found: false } : { items: [] });
  }
}
