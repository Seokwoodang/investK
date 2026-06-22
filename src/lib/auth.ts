// 아주 단순한 로그인: DB 없이 서명된 세션 쿠키. 미들웨어(엣지)·라우트(노드) 양쪽에서 동작하도록 Web Crypto 사용.
// 쿠키값 = "<만료ms>.<HMAC-SHA256(secret, 만료ms)>". 위조 방지 + 만료 체크.

export const COOKIE = 'ik_session';
// ⚠️ 공개 레포이므로 실제 배포에선 반드시 Vercel 환경변수 AUTH_SECRET 를 설정할 것(미설정 시 아래 기본값=게이트 우회 가능).
const SECRET = process.env.AUTH_SECRET || 'investkang-dev-secret-change-me';
const enc = new TextEncoder();

async function hmacHex(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createSession(days = 30): Promise<string> {
  const exp = Date.now() + days * 86400000;
  return `${exp}.${await hmacHex(String(exp))}`;
}

export async function verifySession(token?: string): Promise<boolean> {
  if (!token) return false;
  const [expStr, sig] = token.split('.');
  if (!expStr || !sig) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return (await hmacHex(expStr)) === sig;
}
