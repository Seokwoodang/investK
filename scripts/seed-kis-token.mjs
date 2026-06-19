// One-off: request a KIS access token ONCE, test a domestic quote, and store the
// token in Supabase kv_store so the app reuses it (KIS limits issuance to 1/min,
// token valid 24h). Reads config from process.env (source .env.local first).
import pg from 'pg';

const APP_KEY = process.env.KIS_APP_KEY;
const APP_SECRET = process.env.KIS_APP_SECRET;
const BASE = process.env.KIS_BASE || 'https://openapi.koreainvestment.com:9443';
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
const dbPass = process.env.SUPABASE_DB_PASSWORD;

// 1) token
const tRes = await fetch(`${BASE}/oauth2/tokenP`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ grant_type: 'client_credentials', appkey: APP_KEY, appsecret: APP_SECRET }),
});
const tBody = await tRes.text();
console.log('TOKEN', tRes.status, tBody.slice(0, 220));
if (!tRes.ok) process.exit(1);
const tj = JSON.parse(tBody);
const rec = { value: tj.access_token, expiresAt: Date.now() + (tj.expires_in ?? 86400) * 1000 };

// 2) test quote (삼성전자)
const q = new URL(`${BASE}/uapi/domestic-stock/v1/quotations/inquire-price`);
q.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J');
q.searchParams.set('FID_INPUT_ISCD', '005930');
const qRes = await fetch(q, {
  headers: {
    authorization: `Bearer ${tj.access_token}`,
    appkey: APP_KEY,
    appsecret: APP_SECRET,
    tr_id: 'FHKST01010100',
    custtype: 'P',
  },
});
const qBody = await qRes.text();
console.log('QUOTE', qRes.status, qBody.slice(0, 320));

// 3) seed token into kv_store
const c = new pg.Client({
  host: 'aws-1-ap-northeast-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.' + ref,
  password: dbPass,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
await c.connect();
await c.query(
  `insert into kv_store(k,v) values('kis_token',$1) on conflict(k) do update set v=excluded.v, updated_at=now()`,
  [rec],
);
await c.end();
console.log('SEEDED kis_token');
