// 서명된 세션 쿠키. 미들웨어(엣지)·라우트(노드) 양쪽에서 동작하도록 Web Crypto 사용.
// 쿠키값 = "<b64u(username)>.<만료ms>.<HMAC-SHA256(secret, "<user>.<exp>")>". 위조 방지 + 만료 + 누가 로그인했는지.

export const COOKIE = 'ik_session';
// 서명키는 환경변수로만. 운영(prod)에서 미설정이면 SECRET=''  → 세션 생성/검증 모두 실패(fail-closed).
// 이렇게 해야 "공개 레포의 기본키로 쿠키 위조" 가 원천적으로 불가능하다. 로컬 개발에서만 임시 키 사용.
const SECRET = process.env.AUTH_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-only-insecure-secret');
export const AUTH_CONFIGURED = SECRET.length > 0;
const enc = new TextEncoder();

async function hmacHex(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ASCII username용 base64url(쿠키/구분자 안전).
const b64u = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

export async function createSession(username: string, days = 30): Promise<string> {
  if (!AUTH_CONFIGURED) return '';
  const exp = Date.now() + days * 86400000;
  const body = `${b64u(username)}.${exp}`;
  return `${body}.${await hmacHex(body)}`;
}

// 토큰 검증 후 페이로드 반환(없으면 null).
async function readSession(token?: string): Promise<{ user: string; exp: number } | null> {
  if (!AUTH_CONFIGURED || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [u, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  if ((await hmacHex(`${u}.${expStr}`)) !== sig) return null;
  try {
    return { user: unb64u(u), exp };
  } catch {
    return null;
  }
}

export async function verifySession(token?: string): Promise<boolean> {
  return (await readSession(token)) !== null;
}

// 로그인한 사용자명(서버에서 포폴 등 유저별 데이터 조회용). 유효하지 않으면 null.
export async function getSessionUser(token?: string): Promise<string | null> {
  return (await readSession(token))?.user ?? null;
}
