// 로그인 계정 생성 스크립트 (회원가입 없음 — 여기서 직접 추가).
// 사용법:  node scripts/adduser.mjs <아이디> <비밀번호>
//   - Supabase app_users 테이블에 scrypt$<salt>$<hash> 형식으로 저장
//   - 자격 형식/해시 로직은 src/app/api/auth/login/route.ts 와 동일해야 함
//   - .env.local 의 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 사용
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const scrypt = promisify(crypto.scrypt);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error('사용법: node scripts/adduser.mjs <아이디> <비밀번호>');
  process.exit(1);
}

// .env.local 로드 (프로젝트 루트)
try {
  const envText = readFileSync(join(root, '.env.local'), 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  console.error('.env.local 을 읽을 수 없습니다.');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 없습니다.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

// 1) 중복 확인 — 기존 계정을 덮어쓰지 않는다.
const { data: existing, error: selErr } = await sb
  .from('app_users').select('username').eq('username', username).maybeSingle();
if (selErr) { console.error('조회 오류:', selErr.message); process.exit(1); }
if (existing) { console.error(`이미 존재하는 아이디: ${username} (중단)`); process.exit(2); }

// 2) 해시 생성 — login route와 동일: scrypt$<saltHex>$<hashHex>, scrypt(pw, saltHex, 32)
const salt = crypto.randomBytes(16).toString('hex');
const hash = (await scrypt(password, salt, 32)).toString('hex');
const pass_hash = `scrypt$${salt}$${hash}`;

// 3) 삽입 — 관리자가 직접 추가하는 계정은 승인 대기 없이 바로 사용(status='approved').
//    (회원가입 신청은 /api/auth/signup 경로에서 status='pending'으로 들어가 /admin에서 승인)
const { error: insErr } = await sb.from('app_users').insert({ username, pass_hash, status: 'approved' });
if (insErr) { console.error('삽입 오류:', insErr.message); process.exit(1); }

// 4) 검증 — 방금 넣은 해시로 비번이 통과하는지 재확인
const [, s, h] = pass_hash.split('$');
const ok = crypto.timingSafeEqual(await scrypt(password, s, 32), Buffer.from(h, 'hex'));
console.log(`생성 완료: username=${username}, 해시검증=${ok ? 'OK' : '실패'}`);
