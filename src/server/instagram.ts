import 'server-only';
import { getBriefing } from '@/server/briefing';
import { SITE_URL } from '@/lib/site';

// 인스타그램 자동 게시(Instagram 비즈니스 로그인 API, graph.instagram.com).
//  흐름: 미디어 컨테이너 생성 → 처리 완료 대기 → 게시.
//  토큰(INSTA_TOKEN)은 서버 전용 비밀. 60일짜리 장기 토큰이며 만료 전 갱신 필요(refreshToken).
const IG_API = 'https://graph.instagram.com/v21.0';

function token(): string {
  const t = process.env.INSTA_TOKEN;
  if (!t) throw new Error('INSTA_TOKEN 미설정(Vercel 환경변수에 추가 필요)');
  return t;
}

// 토큰이 가리키는 인스타 계정 ID(게시 대상). 요청마다 바뀌지 않으니 모듈 캐시.
let _igId: string | null = null;
async function igUserId(): Promise<string> {
  if (_igId) return _igId;
  const j = await fetch(`${IG_API}/me?fields=id&access_token=${token()}`).then((r) => r.json());
  if (!j?.id) throw new Error('IG 사용자 ID 조회 실패: ' + JSON.stringify(j));
  _igId = String(j.id);
  return _igId;
}

async function igPost(path: string, body: Record<string, string>): Promise<any> {
  const form = new URLSearchParams({ ...body, access_token: token() });
  const r = await fetch(`${IG_API}/${path}`, { method: 'POST', body: form });
  const j = await r.json();
  if (!r.ok || j?.error) throw new Error(`IG ${path} 실패: ${JSON.stringify(j?.error ?? j)}`);
  return j;
}

// 단일 이미지 게시. 성공 시 게시물 id 반환.
export async function publishImage(imageUrl: string, caption: string): Promise<{ id: string }> {
  const ig = await igUserId();
  const container = await igPost(`${ig}/media`, { image_url: imageUrl, caption });
  const creationId = String(container.id);
  // 이미지 처리 상태 폴링(대개 즉시 FINISHED). 최대 ~20초.
  for (let i = 0; i < 10; i++) {
    const s = await fetch(`${IG_API}/${creationId}?fields=status_code&access_token=${token()}`).then((r) => r.json());
    if (s?.status_code === 'FINISHED') break;
    if (s?.status_code === 'ERROR') throw new Error('이미지 처리 실패(status ERROR)');
    await new Promise((res) => setTimeout(res, 2000));
  }
  const pub = await igPost(`${ig}/media_publish`, { creation_id: creationId });
  return { id: String(pub.id) };
}

// 장기 토큰 갱신(24h~60일 사이에 호출). 갱신된 새 토큰 문자열을 반환한다.
// 주: Vercel 환경변수는 코드에서 못 바꾸므로, 반환값을 별도 저장소/수동 갱신에 사용.
export async function refreshToken(): Promise<{ access_token: string; expires_in: number }> {
  const j = await fetch(`${IG_API}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token()}`).then((r) => r.json());
  if (!j?.access_token) throw new Error('토큰 갱신 실패: ' + JSON.stringify(j));
  return { access_token: j.access_token, expires_in: j.expires_in };
}

// ── 캡션/이미지 ────────────────────────────────────────────────
const kstYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const kstDateLabel = () => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }).format(new Date());

const HASHTAGS = ['#투자', '#주식', '#증시', '#코스피', '#코스닥', '#경제', '#재테크', '#주식투자', '#투자정보', '#환율', '#비트코인', '#investK'];

// 인스타가 이미지를 새로 가져가도록 매 호출 고유 쿼리를 붙여 캐시 무력화.
export function cardImageUrl(type: string): string {
  return `${SITE_URL}/api/card/${type}?t=${Date.now()}`;
}

export async function buildCaption(type: string): Promise<string> {
  if (type === 'brief') {
    const b = await getBriefing(kstYmd());
    const facts = (b.facts ?? []).slice(0, 3).map((f) => `• [${f.k}] ${f.t}`).join('\n');
    return [
      `📊 오늘의 시장 브리핑 · ${kstDateLabel()}`,
      '',
      b.headline || '오늘의 시장 요약',
      '',
      facts,
      '',
      '※ 참고용 지표이며 투자 권유가 아닙니다.',
      '👉 더 많은 지표는 프로필 링크 investk.app',
      '',
      HASHTAGS.join(' '),
    ].join('\n');
  }
  throw new Error('알 수 없는 카드 타입: ' + type);
}
