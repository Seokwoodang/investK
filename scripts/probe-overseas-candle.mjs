import pg from 'pg';
const APP_KEY = process.env.KIS_APP_KEY, APP_SECRET = process.env.KIS_APP_SECRET;
const BASE = process.env.KIS_BASE || 'https://openapi.koreainvestment.com:9443';
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
const c = new pg.Client({ host: 'aws-1-ap-northeast-2.pooler.supabase.com', port: 5432, user: 'postgres.' + ref, password: process.env.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } });
await c.connect(); const { rows } = await c.query("select v from kv_store where k='kis_token'"); await c.end();
const token = rows[0].v.value;
const H = (tr) => ({ authorization: `Bearer ${token}`, appkey: APP_KEY, appsecret: APP_SECRET, tr_id: tr, custtype: 'P' });
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

// Candidate A: dailyprice HHDFS76240000 — read body
{
  const u = new URL(`${BASE}/uapi/overseas-price/v1/quotations/dailyprice`);
  u.searchParams.set('AUTH', ''); u.searchParams.set('EXCD', 'NAS'); u.searchParams.set('SYMB', 'AAPL');
  u.searchParams.set('GUBN', '0'); u.searchParams.set('BYMD', ''); u.searchParams.set('MODP', '1');
  const r = await fetch(u, { headers: H('HHDFS76240000') });
  console.log('A dailyprice', r.status, (await r.text()).slice(0, 280));
}
await new Promise((r) => setTimeout(r, 500));
// Candidate B: inquire-daily-chartprice FHKST03030100 with N + AAPL
{
  const now = new Date(), start = new Date(now); start.setMonth(now.getMonth() - 1);
  const u = new URL(`${BASE}/uapi/overseas-price/v1/quotations/inquire-daily-chartprice`);
  u.searchParams.set('FID_COND_MRKT_DIV_CODE', 'N'); u.searchParams.set('FID_INPUT_ISCD', 'AAPL');
  u.searchParams.set('FID_INPUT_DATE_1', ymd(start)); u.searchParams.set('FID_INPUT_DATE_2', ymd(now));
  u.searchParams.set('FID_PERIOD_DIV_CODE', 'D');
  const r = await fetch(u, { headers: H('FHKST03030100') });
  const t = await r.text();
  console.log('B chartprice/N', r.status, t.slice(0, 120), '| out2[0]:', JSON.stringify(JSON.parse(t).output2?.[0] || null));
}
