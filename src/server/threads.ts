import 'server-only';
import { kvGet, kvSet } from '@/server/kv';

// 스레드(Threads) 자동 게시.
//
// 왜 스레드인가: 인스타 피드 게시물은 본문에 클릭 가능한 링크를 못 넣는다. 그래서 유입
// 경로가 '프로필 방문 → 바이오 링크' 하나뿐이고, 팔로워 21명에선 사실상 0이다.
// 스레드는 본문에 링크가 붙고(link_attachment) 클릭이 되므로 사이트로 직접 보낼 수 있다.
// 릴스 같은 영상 제작 부담도 없다.
//
// 토큰: THREADS_TOKEN(60일 장기 토큰). 인스타와 마찬가지로 갱신본을 KV에 두고 우선 읽는다
// — 갱신을 안 하면 만료와 동시에 조용히 죽는다(인스타에서 실제로 그 상태였다).
const API = 'https://graph.threads.net/v1.0';

export const THREADS_TOKEN_KEY = 'threads:token';
interface StoredToken { access_token: string; refreshed_at: string; expires_at: string }

let _tokenCache: string | null = null;
async function token(): Promise<string> {
  if (_tokenCache) return _tokenCache;
  const stored = await kvGet<StoredToken>(THREADS_TOKEN_KEY).catch(() => null);
  const t = stored?.access_token || process.env.THREADS_TOKEN;
  if (!t) throw new Error('THREADS_TOKEN 미설정(Vercel 환경변수에 추가 필요)');
  _tokenCache = t;
  return t;
}

let _userId: string | null = null;
async function userId(): Promise<string> {
  if (_userId) return _userId;
  const j = await fetch(`${API}/me?fields=id&access_token=${await token()}`).then((r) => r.json());
  if (!j?.id) throw new Error('스레드 사용자 ID 조회 실패: ' + JSON.stringify(j));
  _userId = String(j.id);
  return _userId;
}

async function post(path: string, body: Record<string, string>): Promise<any> {
  const form = new URLSearchParams({ ...body, access_token: await token() });
  const r = await fetch(`${API}/${path}`, { method: 'POST', body: form });
  const j = await r.json();
  if (!r.ok || j?.error) throw new Error(`Threads ${path} 실패: ${JSON.stringify(j?.error ?? j)}`);
  return j;
}

/** 스레드 최대 길이(초과분은 잘라서 올린다 — API가 거부하면 게시 자체가 실패하므로). */
const MAX_TEXT = 480;

/**
 * 텍스트 스레드 게시. link는 본문 아래 클릭 가능한 링크 카드로 붙는다.
 * 컨테이너 생성 → 게시 2단계라 인스타 캐러셀처럼 오래 걸리지 않는다(왕복 2회).
 */
export async function publishThread(text: string, link?: string): Promise<{ id: string }> {
  const uid = await userId();
  const body: Record<string, string> = {
    media_type: 'TEXT',
    text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text,
  };
  if (link) body.link_attachment = link;
  const c = await post(`${uid}/threads`, body);
  const pub = await post(`${uid}/threads_publish`, { creation_id: String(c.id) });
  return { id: String(pub.id) };
}

/** 장기 토큰 갱신 → KV 저장. 인스타와 같은 이유로 자동화가 필수다. */
export async function refreshThreadsToken(): Promise<{ expires_in: number; expires_at: string }> {
  const j = await fetch(`${API}/refresh_access_token?grant_type=th_refresh_token&access_token=${await token()}`).then((r) => r.json());
  if (!j?.access_token) throw new Error('스레드 토큰 갱신 실패: ' + JSON.stringify(j));
  const expiresIn = Number(j.expires_in) || 60 * 86400;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  await kvSet(THREADS_TOKEN_KEY, { access_token: j.access_token, refreshed_at: new Date().toISOString(), expires_at: expiresAt });
  _tokenCache = j.access_token;
  return { expires_in: expiresIn, expires_at: expiresAt };
}

export async function threadsTokenStatus(): Promise<{ source: 'kv' | 'env'; expires_at: string | null; days_left: number | null }> {
  const stored = await kvGet<StoredToken>(THREADS_TOKEN_KEY).catch(() => null);
  if (!stored?.access_token) return { source: 'env', expires_at: null, days_left: null };
  const left = Math.floor((new Date(stored.expires_at).getTime() - Date.now()) / 86400000);
  return { source: 'kv', expires_at: stored.expires_at, days_left: left };
}
