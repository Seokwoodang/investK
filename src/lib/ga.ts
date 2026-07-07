import { sendGAEvent } from '@next/third-parties/google';

// GA4 커스텀 이벤트 전송(클라이언트 전용). 브라우저→GA 직접 전송이라 서버·Claude 비용과 무관.
// GA 미설정/미로드여도 안전하게 무시된다. 개인정보는 담지 않는다("무슨 행동을 몇 번" 수준만).
export function track(name: string, params?: Record<string, string | number | boolean>) {
  try {
    sendGAEvent('event', name, params ?? {});
  } catch {
    /* GA 미로드 등 — 무시 */
  }
}
