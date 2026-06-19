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
*/
