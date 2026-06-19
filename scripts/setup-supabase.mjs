// One-off: create the ai_cache table via a direct Postgres connection.
// Usage: SUPA_REF=... SUPA_DB_PASSWORD=... node scripts/setup-supabase.mjs
import pg from 'pg';

const ref = process.env.SUPA_REF;
const password = process.env.SUPA_DB_PASSWORD;
if (!ref || !password) {
  console.error('SUPA_REF and SUPA_DB_PASSWORD required');
  process.exit(1);
}

const DDL = `
create table if not exists ai_cache (
  cache_key   text primary key,
  kind        text not null,
  payload     jsonb not null,
  model       text,
  created_at  timestamptz not null default now()
);
`;

// Try direct host first, then the common pooler hosts (region unknown → try a few).
const candidates = [
  { host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres' },
  { host: `aws-0-ap-northeast-2.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` },
  { host: `aws-1-ap-northeast-2.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` },
  { host: `aws-0-ap-southeast-1.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` },
  { host: `aws-0-us-east-1.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` },
  { host: `aws-0-us-west-1.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` },
];

for (const c of candidates) {
  const client = new pg.Client({
    host: c.host,
    port: c.port,
    user: c.user,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    await client.query(DDL);
    const r = await client.query('select count(*)::int as n from ai_cache');
    console.log(`OK via ${c.host} — ai_cache ready (rows=${r.rows[0].n})`);
    await client.end();
    process.exit(0);
  } catch (e) {
    console.error(`FAIL ${c.host}: ${e.code || e.message}`);
    try { await client.end(); } catch {}
  }
}
console.error('ALL_HOSTS_FAILED');
process.exit(2);
