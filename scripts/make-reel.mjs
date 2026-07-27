// 카드 PNG들을 9:16 세로 릴스(mp4)로 합성한다. GitHub Actions 러너(ffmpeg 설치)에서 실행.
//  usage: node scripts/make-reel.mjs --base https://investk.app --cards cover,kr,global,crypto,outro --out /tmp/reel.mp4
//  각 카드는 1080×1350 → 1080×1920 캔버스 중앙 배치 + 완만한 줌 + 페이드 전환. 배경음은
//  assets/reel-bgm.mp3 있으면 사용, 없으면 잔잔한 앰비언트 패드를 생성(완전 자동).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'https://investk.app');
const CARDS = arg('cards', 'cover,kr,global,crypto,outro').split(',').filter(Boolean);
const OUT = arg('out', join(tmpdir(), 'reel.mp4'));
const PER = parseFloat(arg('per', '2.8')); // 카드당 노출 초
const BG = '0x0A121E';
const FPS = 30;

const ff = (args) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const dir = mkdtempSync(join(tmpdir(), 'reel-'));

try {
  // 1) 카드 PNG 다운로드(콜드 렌더 대비 타임아웃·재시도)
  const fetchCard = async (name, i) => {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const url = `${BASE}/api/card/${name}?t=${Date.now()}_${i}_${attempt}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(100000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 5000) throw new Error(`too small (${buf.length}B)`);
        return buf;
      } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 3000)); }
    }
    throw new Error(`카드 이미지 실패: ${name} — ${lastErr?.message}`);
  };
  const imgs = [];
  for (let i = 0; i < CARDS.length; i++) {
    const p = join(dir, `img${i}.png`);
    writeFileSync(p, await fetchCard(CARDS[i], i));
    imgs.push(p);
  }

  // 2) 카드별 세그먼트(줌+페이드)
  const frames = Math.round(PER * FPS);
  const segs = [];
  for (let i = 0; i < imgs.length; i++) {
    const seg = join(dir, `seg${i}.mp4`);
    const vf = [
      `scale=1080:1350:force_original_aspect_ratio=decrease`,
      `pad=1080:1920:(ow-iw)/2:(oh-ih)/2:${BG}`,
      `zoompan=z='min(zoom+0.0007,1.12)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=${FPS}`,
      `fade=t=in:d=0.3`,
      `fade=t=out:st=${(PER - 0.3).toFixed(2)}:d=0.3`,
      `format=yuv420p`,
    ].join(',');
    ff(['-loop', '1', '-i', imgs[i], '-t', String(PER), '-r', String(FPS), '-vf', vf, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '20', seg]);
    segs.push(seg);
  }

  // 3) 세그먼트 이어붙이기
  const listFile = join(dir, 'list.txt');
  writeFileSync(listFile, segs.map((s) => `file '${s}'`).join('\n'));
  const concat = join(dir, 'concat.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', concat]);

  // 4) 오디오 믹스
  const dur = (PER * imgs.length).toFixed(2);
  const bgm = join(process.cwd(), 'assets', 'reel-bgm.mp3');
  const outFadeStart = Math.max(0, PER * imgs.length - 1.5).toFixed(2);
  if (existsSync(bgm)) {
    ff(['-i', concat, '-stream_loop', '-1', '-i', bgm, '-filter_complex',
      `[1:a]afade=t=in:d=1,afade=t=out:st=${outFadeStart}:d=1.5,volume=0.6[a]`,
      '-map', '0:v', '-map', '[a]', '-t', dur, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', OUT]);
  } else {
    // 잔잔한 앰비언트 패드(F major 저음 사인 + 트레몰로 + 로우패스). 아주 낮은 볼륨.
    const pad = `sine=frequency=174.6:sample_rate=44100,volume=0.06[a0];`
      + `sine=frequency=220:sample_rate=44100,volume=0.05[a1];`
      + `sine=frequency=261.6:sample_rate=44100,volume=0.04[a2];`
      + `[a0][a1][a2]amix=inputs=3,tremolo=f=0.15:d=0.4,lowpass=f=1800,afade=t=in:d=1.2,afade=t=out:st=${outFadeStart}:d=1.5[a]`;
    ff(['-i', concat, '-f', 'lavfi', '-t', dur, '-i', 'anullsrc', '-filter_complex', pad,
      '-map', '0:v', '-map', '[a]', '-t', dur, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', OUT]);
  }

  const size = statSync(OUT).size; // node fs로 크기 확인(리눅스/macOS 공통, stat -f는 macOS 전용이라 GA에서 실패)
  console.log(`reel ok: ${OUT} (${(size / 1e6).toFixed(2)}MB, ${dur}s, ${imgs.length} cards)`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
