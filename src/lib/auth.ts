// 아주 단순한 로그인: DB 없이 서명된 세션 쿠키. 미들웨어(엣지)·라우트(노드) 양쪽에서 동작하도록 Web Crypto 사용.
// 쿠키값 = "<만료ms>.<HMAC-SHA256(secret, 만료ms)>". 위조 방지 + 만료 체크.

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

export async function createSession(days = 30): Promise<string> {
  if (!AUTH_CONFIGURED) return '';
  const exp = Date.now() + days * 86400000;
  return `${exp}.${await hmacHex(String(exp))}`;
}

export async function verifySession(token?: string): Promise<boolean> {
  if (!AUTH_CONFIGURED || !token) return false;
  const [expStr, sig] = token.split('.');
  if (!expStr || !sig) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return (await hmacHex(expStr)) === sig;
}
