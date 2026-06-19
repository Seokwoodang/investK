import { kisSocket } from '@/server/kisSocket';

// SSE: 브라우저가 ?codes=005930,000660 로 구독 → 서버 KIS 소켓이 해당 종목 체결가를
// 푸시할 때마다 data 이벤트로 중계. 지속 연결이라 상시 서버 필요(Vercel 서버리스 X).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const codes = (new URL(req.url).searchParams.get('codes') || '')
    .split(',')
    .filter(Boolean)
    .slice(0, 40);
  await kisSocket.ensure(codes);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(ctrl) {
      const write = (obj: unknown) => {
        try {
          ctrl.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          /* closed */
        }
      };
      write({ snapshot: kisSocket.snapshot(codes) });
      const onTick = (code: string, q: { price: number; pct: number }) => {
        if (codes.includes(code)) write({ code, ...q });
      };
      kisSocket.addListener(onTick);
      const ping = setInterval(() => {
        try {
          ctrl.enqueue(enc.encode(`: ping\n\n`));
        } catch {
          /* closed */
        }
      }, 15000);
      req.signal.addEventListener('abort', () => {
        clearInterval(ping);
        kisSocket.removeListener(onTick);
        try {
          ctrl.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' },
  });
}
