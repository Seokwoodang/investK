import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { env, has } from './env';
import { getSupabase } from './supabase';

// Configurable via ANTHROPIC_MODEL (default Sonnet — see env.ts).
const MODEL = env.ANTHROPIC_MODEL;

interface GenerateArgs {
  cacheKey: string; // e.g. `analysis:samsung:1주:2026-06-15`
  kind: string; // 'analysis' | 'briefing'
  system: string;
  prompt: string;
  fallback: string; // used when no API key (or on error)
}

// In-process cache tier (survives across requests, not restarts/deploys).
// Prevents repeat Claude calls before a persistent Supabase cache is configured.
const memCache = new Map<string, string>();

// Get-or-generate: returns the cached analysis if present; otherwise generates
// with Claude (when configured) and stores it; otherwise returns the fallback.
// Same cacheKey → never re-analyzed. Cache tiers: memory → Supabase → Claude.
export async function getOrGenerate({ cacheKey, kind, system, prompt, fallback }: GenerateArgs): Promise<string> {
  const cached = memCache.get(cacheKey);
  if (cached) return cached;

  const sb = getSupabase();

  if (sb) {
    const { data } = await sb.from('ai_cache').select('payload').eq('cache_key', cacheKey).maybeSingle();
    if (data?.payload?.text) {
      memCache.set(cacheKey, data.payload.text as string);
      return data.payload.text as string;
    }
  }

  let text = fallback;
  if (has.anthropic()) {
    try {
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: prompt }],
      });
      const block = msg.content.find((b) => b.type === 'text');
      if (block && block.type === 'text') text = block.text.trim();
    } catch (e) {
      console.error('[ai] generation failed, using fallback:', e);
    }
  }

  // Only persist real generations (don't cache the fallback as if it were AI).
  if (has.anthropic() && text) {
    memCache.set(cacheKey, text);
    if (sb) {
      await sb.from('ai_cache').upsert({
        cache_key: cacheKey,
        kind,
        payload: { text },
        model: MODEL,
      });
    }
  }

  return text;
}

interface GenerateJSONArgs<T> {
  cacheKey: string;
  kind: string;
  system: string;
  // 문자열 또는 thunk. thunk는 캐시 미스 시에만 실행돼 무거운 컨텍스트 조립을 아낀다.
  prompt: string | (() => Promise<string>);
  fallback: T;
  // true면 캐시를 무시하고 무조건 새로 생성·저장(cron 강제 갱신용).
  force?: boolean;
}

const memJson = new Map<string, unknown>();

// 생성 없이 캐시(메모리 → Supabase)만 조회. 없으면 null. (브리핑 슬롯이 미리 만들어져 있는지 확인용)
export async function readJSONCache<T>(cacheKey: string): Promise<T | null> {
  const cached = memJson.get(cacheKey);
  if (cached !== undefined) return cached as T;
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb.from('ai_cache').select('payload').eq('cache_key', cacheKey).maybeSingle();
    if (data?.payload) {
      memJson.set(cacheKey, data.payload);
      return data.payload as T;
    }
  }
  return null;
}

// 구조화(JSON) 버전. 캐시 계층은 동일(메모리 → Supabase → Claude). Claude가 JSON만
// 반환하도록 지시하고 파싱; 실패/키없음 시 fallback 객체를 그대로 반환한다.
export async function getOrGenerateJSON<T>({ cacheKey, kind, system, prompt, fallback, force }: GenerateJSONArgs<T>): Promise<T> {
  const sb = getSupabase();

  if (!force) {
    const cached = memJson.get(cacheKey);
    if (cached !== undefined) return cached as T;

    if (sb) {
      const { data } = await sb.from('ai_cache').select('payload').eq('cache_key', cacheKey).maybeSingle();
      if (data?.payload) {
        memJson.set(cacheKey, data.payload);
        return data.payload as T;
      }
    }
  }

  if (!has.anthropic()) return fallback;

  try {
    const userPrompt = typeof prompt === 'function' ? await prompt() : prompt;
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const block = msg.content.find((b) => b.type === 'text');
    let txt = block && block.type === 'text' ? block.text.trim() : '';
    txt = txt.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim(); // 코드펜스 제거
    const obj = JSON.parse(txt) as T;
    memJson.set(cacheKey, obj);
    if (sb) await sb.from('ai_cache').upsert({ cache_key: cacheKey, kind, payload: obj as object, model: MODEL });
    return obj;
  } catch (e) {
    console.error('[ai] JSON generation failed, using fallback:', e);
    return fallback;
  }
}
