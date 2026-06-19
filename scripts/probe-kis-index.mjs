// Probe KIS index endpoints to discover exact response field names.
// Reuses the cached token from Supabase kv_store (avoids re-issuing). Run:
//   set -a; . ./.env.local; set +a; node scripts/probe-kis-index.mjs
import pg from 'pg';

const APP_KEY = process.env.KIS_APP_KEY;
const APP_SECRET = process.env.KIS_APP_SECRET;
const BASE = process.env.KIS_BASE || 'https://openapi.koreainvestment.com:9443';
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];

// read cached token
const c = new pg.Client({
  host: 'aws-1-ap-northeast-2.pooler.supabase.com', port: 5432,
  user: 'postgres.' + ref, password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
await c.connect();
const { rows } = await c.query("select v from kv_store where k='kis_token'");
await c.end();
const token = rows[0]?.v?.value;
if (!token) { console.error('no cached token'); process.exit(1); }

const H = (tr) => ({ authorization: `Bearer ${token}`, appkey: APP_KEY, appsecret: APP_SECRET, tr_id: tr, custtype: 'P' });

// 1) 국내업종 현재지수 (코스피 0001, 코스닥 1001)
async function domestic(code) {
  const u = new URL(`${BASE}/uapi/domestic-stock/v1/quotations/inquire-index-price`);
  u.searchParams.set('FID_COND_MRKT_DIV_CODE', 'U');
  u.searchParams.set('FID_INPUT_ISCD', code);
  const r = await fetch(u, { headers: H('FHPUP02100000') });
  console.log(`DOMESTIC ${code}`, r.status, (await r.text()).slice(0, 400));
}

// 2) 해외지수 일자별 (S&P500 SPX, 나스닥종합 COMP) — chartprice
async function overseas(symb) {
  const u = new URL(`${BASE}/uapi/overseas-price/v1/quotations/inquire-daily-chartprice`);
  u.searchParams.set('FID_COND_MRKT_DIV_CODE', 'N');
  u.searchParams.set('FID_INPUT_ISCD', symb);
  u.searchParams.set('FID_INPUT_DATE_1', '20260601');
  u.searchParams.set('FID_INPUT_DATE_2', '20260616');
  u.searchParams.set('FID_PERIOD_DIV_CODE', 'D');
  const r = await fetch(u, { headers: H('FHKST03030100') });
  console.log(`OVERSEAS ${symb}`, r.status, (await r.text()).slice(0, 500));
}

await domestic('0001');
await new Promise((r) => setTimeout(r, 300));
await domestic('1001');
await new Promise((r) => setTimeout(r, 300));
await overseas('SPX');
await new Promise((r) => setTimeout(r, 300));
await overseas('COMP');
