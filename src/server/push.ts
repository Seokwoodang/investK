import 'server-only';
import webpush from 'web-push';
import { env, has } from './env';
import { getSupabase } from './supabase';

// 웹푸시 발송 헬퍼. 구독은 push_subs(사용자당 기기별 여러 행), 중복 방지는 push_sent(dedupe_key).
// 죽은 구독(브라우저에서 해지됨 → 404/410)은 발송 시점에 정리한다.

let configured = false;
function ensureVapid(): boolean {
  if (!has.push()) return false;
  if (!configured) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    configured = true;
  }
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string; // 알림 클릭 시 이동
  tag?: string; // 같은 tag 알림은 겹쳐쓰기
}

interface SubRow { endpoint: string; username: string; p256dh: string; auth: string }

// username의 모든 기기로 발송. dedupeKey가 있으면 push_sent에 먼저 기록을 시도해
// 이미 보낸 알림(키 충돌)은 건너뛴다 → 크론이 겹쳐 돌아도 중복 발송 없음.
export async function sendPush(username: string, payload: PushPayload, dedupeKey?: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb || !ensureVapid()) return false;

  if (dedupeKey) {
    const { error } = await sb.from('push_sent').insert({ username, dedupe_key: dedupeKey });
    if (error) return false; // 이미 보냄(PK 충돌) 또는 기록 실패 → 발송 안 함(중복 방지 우선)
  }

  const { data: subs } = await sb.from('push_subs').select('endpoint, username, p256dh, auth').eq('username', username);
  if (!subs?.length) return false;

  let sent = 0;
  await Promise.all(
    (subs as SubRow[]).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await sb.from('push_subs').delete().eq('endpoint', s.endpoint); // 해지된 구독 정리
        }
      }
    }),
  );
  return sent > 0;
}

// push_sent 오래된 행 청소(기본 14일). 크론 끝에 호출.
export async function cleanupPushSent(days = 14): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  await sb.from('push_sent').delete().lt('sent_at', cutoff);
}
