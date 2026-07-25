import { NextResponse } from 'next/server';
import { kvGet, kvSet } from '@/server/kv';

// 인스타 댓글 → 자동 DM(무료·무제한, ManyChat 불필요).
//  게시물 댓글에 키워드(지표/링크 등)가 있으면 그 사람에게 investk.app 링크를 DM으로 보낸다.
//  DM 링크는 인스타에서 유일하게 '클릭되는' 링크라 유입 깔때기로 작동.
//  설정: Meta 앱 대시보드 → Webhooks → 콜백 URL(https://investk.app/api/ig/webhook) +
//        Verify Token(아래 VERIFY) → 'comments' 필드 구독. 계정 구독은 /api/ig/webhook-setup로 1회.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const IG_API = 'https://graph.instagram.com/v21.0';
const VERIFY = process.env.IG_WEBHOOK_VERIFY || 'investk-verify-9f3a2c';
const KEYWORDS = ['지표', '링크', '가격', '정보'];
const DM_TEXT = '안녕하세요! 📊 실시간 시장 지표는 여기서 확인하세요 👇\nhttps://investk.app\n\n매일 아침·저녁 시장 브리핑도 팔로우하면 놓치지 않아요 🙌';
const REPLY_TEXT = 'DM 보내드렸어요! 📩 메시지함 확인해주세요 🙌'; // 키워드(지표/링크/가격/정보) 포함 금지 — 자기 트리거 방지

const token = () => process.env.INSTA_TOKEN ?? '';
let _igId: string | null = null;
async function igId(): Promise<string> {
  if (_igId) return _igId;
  const j = await fetch(`${IG_API}/me?fields=id&access_token=${token()}`).then((r) => r.json());
  _igId = String(j?.id ?? '');
  return _igId;
}

// 웹훅 검증(구독 등록 시 Meta가 GET으로 호출).
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === VERIFY) {
    return new Response(u.searchParams.get('hub.challenge') || '', { status: 200 });
  }
  return new Response('forbidden', { status: 403 });
}

// 이벤트 수신: 댓글에 키워드 있으면 프라이빗 리플라이(DM) 발송.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const me = await igId();
    for (const entry of body?.entry ?? []) {
      for (const ch of entry?.changes ?? []) {
        if (ch?.field !== 'comments') continue;
        const v = ch.value ?? {};
        const text = String(v.text ?? '');
        const commentId = v.id;
        if (!commentId) continue;
        if (v.parent_id) continue; // 대댓글(답글)엔 반응 안 함 — 내 답글이 다시 트리거되는 루프 차단
        if (v.from?.id && me && String(v.from.id) === me) continue; // 내 댓글 무시
        if (String(v.from?.username ?? '').toLowerCase() === 'invest___k') continue; // 내 계정 이중 방어
        if (!KEYWORDS.some((k) => text.includes(k))) continue;
        // 중복 처리 방지(Meta 재전송·재시도) — 같은 댓글 1회만
        const seenKey = `wh:${commentId}`;
        if (await kvGet(seenKey)) continue;
        await kvSet(seenKey, Date.now());
        // 1) 프라이빗 리플라이(DM) 발송
        await fetch(`${IG_API}/${me}/messages?access_token=${token()}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text: DM_TEXT } }),
        }).then((r) => r.json()).then((j) => { if (j?.error) console.error('[ig/webhook] DM 실패:', JSON.stringify(j.error)); }).catch(() => {});
        // 2) 공개 대댓글("DM 보냈어요") — 다른 사람들도 보고 참여 유도
        await fetch(`${IG_API}/${commentId}/replies`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ message: REPLY_TEXT, access_token: token() }),
        }).then((r) => r.json()).then((j) => { if (j?.error) console.error('[ig/webhook] 대댓글 실패:', JSON.stringify(j.error)); }).catch(() => {});
      }
    }
  } catch (e) {
    console.error('[ig/webhook] 처리 오류:', (e as Error).message);
  }
  return NextResponse.json({ ok: true }); // 항상 200 (Meta 재시도 방지)
}
