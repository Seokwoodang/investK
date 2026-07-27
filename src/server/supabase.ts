import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, has } from './env';

let client: SupabaseClient | null = null;

// Server-side Supabase client (service-role key — never expose to the browser).
// Returns null when not configured so callers can degrade gracefully.
export function getSupabase(): SupabaseClient | null {
  if (!has.supabase()) return null;
  if (!client) {
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });
  }
  return client;
}

/*
  Expected table (run in Supabase SQL editor):

  create table if not exists ai_cache (
    cache_key   text primary key,
    kind        text not null,            -- 'analysis' | 'briefing' | ...
    payload     jsonb not null,
    model       text,
    created_at  timestamptz not null default now()
  );

  -- 로그인 계정(회원가입 없음 — 여기에 직접 insert). pass_hash = "scrypt$<saltHex>$<hashHex>".
  -- 서버(service-role)만 접근. RLS 켜고 정책 없음(anon 접근 차단) 권장.
  create table if not exists app_users (
    username    text primary key,
    pass_hash   text not null,
    created_at  timestamptz not null default now()
  );
  alter table app_users enable row level security;

  -- 유저별 포트폴리오(계정 연동). 서버(service-role)만 접근.
  create table if not exists portfolios (
    username    text primary key,
    holdings    jsonb not null default '[]'::jsonb,
    updated_at  timestamptz not null default now()
  );
  alter table portfolios enable row level security;

  -- 유저별 알림 설정. alerts = { "_cats": ["brief","news",...], "<종목id>": ["swing",...] }.
  create table if not exists user_alerts (
    username    text primary key,
    alerts      jsonb not null default '{}'::jsonb,
    updated_at  timestamptz not null default now()
  );
  alter table user_alerts enable row level security;

  -- 유저별 관심 분야(섹터). sectors = ["kr:반도체","us:반도체", ...] — market 접두사 필수
  -- (반도체·헬스케어가 KR/US 양쪽에 있어 이름만으로는 구분 불가). 개인화 피드용.
  create table if not exists user_interests (
    username    text primary key,
    sectors     jsonb not null default '[]'::jsonb,
    updated_at  timestamptz not null default now()
  );
  alter table user_interests enable row level security;

  주의: 위 목록은 전체가 아니다. 실제로는 kv_store · ai_usage · push_subs · push_sent ·
  mock_*(accounts/holdings/orders/trades/snapshots/season_records)도 사용 중.
*/
