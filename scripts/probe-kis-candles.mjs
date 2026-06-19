// Probe KIS daily-candle endpoints (domestic + overseas stock) for field names.
// Reuses cached token from Supabase kv_store.
import pg from 'pg';
const APP_KEY = process.env.KIS_APP_KEY, APP_SECRET = process.env.KIS_APP_SECRET;
const BASE = process.env.KIS_BASE || 'https://openapi.koreainvestment.com:9443';
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];

const c = new pg.Client({ host: 'aws-1-ap-northeast-2.pooler.supabase.com', port: 5432, user: 'postgres.' + ref, password: process.env.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows } = await c.query("select v from kv_store where k='kis_token'");
await c.end();
const token = rows[0]?.v?.value;
const H = (tr) => ({ authorization: `Bearer ${token}`, appkey: APP_KEY, appsecret: APP_SECRET, tr_id: tr, custtype: 'P' });
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const now = new Date(), start = new Date(now); start.setMonth(now.getMonth() - 1);

// 국내 일봉: inquire-daily-itemchartprice (FHKST03010100)
{
  const u = new URL(`${BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`);
  u.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J');
  u.searchParams.set('FID_INPUT_ISCD', '005930');
  u.searchParams.set('FID_INPUT_DATE_1', ymd(start));
  u.searchParams.set('FID_INPUT_DATE_2', ymd(now));
  u.searchParams.set('FID_PERIOD_DIV_CODE', 'D');
  u.searchParams.set('FID_ORG_ADJ_PRC', '0');
  const r = await fetch(u, { headers: H('FHKST03010100') });
  const j = await r.json();
  console.log('DOMESTIC', r.status, 'rt', j.rt_cd, 'out2len', (j.output2 || []).length);
  console.log(JSON.stringify((j.output2 || [])[0]));
}
await new Promise((r) => setTimeout(r, 400));
// 해외 일봉: dailyprice (HHDFS76240000)
{
  const u = new URL(`${BASE}/uapi/overseas-price/v1/quotations/dailyprice`);
  u.searchParams.set('AUTH', '');
  u.searchParams.set('EXCD', 'NAS');
  u.searchParams.set('SYMB', 'AAPL');
  u.searchParams.set('GUBN', '0');
  u.searchParams.set('BYMD', ymd(now));
  u.searchParams.set('MODP', '1');
  const r = await fetch(u, { headers: H('HHDFS76240000') });
  const j = await r.json();
  console.log('OVERSEAS', r.status, 'rt', j.rt_cd, 'out2len', (j.output2 || []).length);
  console.log(JSON.stringify((j.output2 || [])[0]));
}
