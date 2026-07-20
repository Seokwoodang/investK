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

  -- 백테스트 전략 저장(계정별). 공유는 클라이언트에서 config를 URL 쿼리로 인라인 인코딩(DB 무관).
  -- saved_at = 저장 시점(포워드 성과 기준일). 서버(service-role)만 접근.
  create table if not exists saved_strategies (
    id          uuid primary key default gen_random_uuid(),
    username    text not null references app_users(username) on delete cascade,
    name        text not null,
    config      jsonb not null,
    saved_at    date not null,
    created_at  timestamptz not null default now()
  );
  alter table saved_strategies enable row level security;
*/
