import { NextResponse } from 'next/server';
import { getSupabase } from '@/server/supabase';

// 릴스 mp4 업로드 슬롯 발급. GitHub Actions가 이 서명 URL로 직접 업로드하고,
// 반환된 공개 URL을 /api/ig/publish?video= 로 넘겨 릴스를 게시한다(GA엔 CRON_SECRET만 필요).
//  GET ?name=reel-daily-20260725.mp4  → { signedUrl, publicUrl, path }
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const BUCKET = 'reels';

function authed(req: Request, url: URL): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  const mt = process.env.MOCK_FILL_TOKEN;
  if (mt && url.searchParams.get('t') === mt) return true;
  return false;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!authed(req, url)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'no supabase' }, { status: 500 });

  const raw = url.searchParams.get('name') || 'reel.mp4';
  const name = raw.replace(/[^a-zA-Z0-9._-]/g, '').slice(-64) || 'reel.mp4';
  const path = `auto/${name}`;

  try {
    // 공개 버킷 보장(이미 있으면 무시). 릴스는 공개 URL로 IG가 가져가야 한다.
    const { data: buckets } = await sb.storage.listBuckets();
    if (!buckets?.some((b) => b.name === BUCKET)) {
      const { error: cbErr } = await sb.storage.createBucket(BUCKET, { public: true });
      if (cbErr) return NextResponse.json({ ok: false, error: `버킷 생성 실패: ${cbErr.message}` }, { status: 500 });
    }
    // 오래된 파일 정리(같은 이름 재업로드 위해 먼저 삭제).
    await sb.storage.from(BUCKET).remove([path]).catch(() => {});
    const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message || '서명 URL 생성 실패');
    const publicUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ ok: true, signedUrl: data.signedUrl, token: data.token, path, publicUrl });
  } catch (e) {
    console.error('[ig/reel-slot] failed:', (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
