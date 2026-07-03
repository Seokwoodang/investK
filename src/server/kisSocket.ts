import 'server-only';
import { env, has } from './env';
import { kvDel } from './kv';

// KIS 실시간 체결가 웹소켓 매니저(서버 싱글톤). 서버가 KIS 소켓을 1개 물고,
// 구독 종목(≤40, KIS 41 한도)을 등록해 최신 체결가를 보관 → SSE로 브라우저에 중계.
// ⚠️ 지속 연결이 필요하므로 Vercel 서버리스가 아닌 상시 서버(로컬/자체호스트)에서 동작.
export interface RtQuote {
  price: number;
  pct: number;
}
type Listener = (code: string, q: RtQuote) => void;

const WS_URL = env.KIS_BASE.includes('vts')
  ? 'ws://ops.koreainvestment.com:31000'
  : 'ws://ops.koreainvestment.com:21000';
const MAX_SUBS = 40;

class KisSocket {
  private ws: WebSocket | null = null;
  private connecting = false;
  private approval = '';
  private wanted = new Set<string>(); // 구독하고 싶은 종목(보이는 종목)
  private subs = new Set<string>(); // KIS가 OPSP0000으로 확정한 종목
  private latest = new Map<string, RtQuote>();
  private listeners = new Set<Listener>();

  private refreshing = false;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private overCount = 0; // 이번 주기 한도초과(OPSP0008) 거부 누적 — 주기당 1줄로 요약 로깅

  // 승인키는 인메모리만 유지(ws는 상시 서버에서만 동작). kv 영속 캐시는 만료/폐기된 키를
  // 계속 재사용해 OPSP0011(invalid approval)을 유발하므로 쓰지 않는다. 과거 캐시는 1회 정리.
  private async approvalKey(): Promise<string> {
    if (this.approval) return this.approval;
    void kvDel('kis_ws_approval');
    const r = await fetch(`${env.KIS_BASE}/oauth2/Approval`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', appkey: env.KIS_APP_KEY, secretkey: env.KIS_APP_SECRET }),
    });
    const j = (await r.json()) as { approval_key?: string };
    this.approval = j.approval_key ?? '';
    return this.approval;
  }

  // 무효 승인키(OPSP0011) 감지 시: 키를 비우고 ws를 닫아 새 키로 재연결.
  private async refreshApproval(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    this.approval = '';
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.connecting = false;
    setTimeout(() => {
      this.refreshing = false;
      void this.connect();
    }, 1000);
  }

  private async connect(): Promise<void> {
    if (this.ws || this.connecting || !has.kis()) return;
    this.connecting = true;
    // 승인키 발급/소켓 생성이 throw하면 connecting=true로 영구 고착돼(가드에 걸려)
    // 프로세스 재시작 전까지 실시간이 전면 불능이 되던 버그 → 실패 시 복구 + 백오프 재시도.
    let ws: WebSocket;
    try {
      const key = await this.approvalKey();
      if (!key) throw new Error('approval key empty');
      ws = new WebSocket(WS_URL);
    } catch (e) {
      console.error('[kisSocket] connect failed, retrying in 5s:', (e as Error).message);
      this.connecting = false;
      if (this.wanted.size) setTimeout(() => void this.connect(), 5000);
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.connecting = false;
      this.subs.clear(); // 재연결 시 확정 상태 초기화 → 원하는 종목 전부 재등록
      this.wanted.forEach((c) => this.register(c, '1'));
    };
    ws.onmessage = (ev) => this.onMessage(typeof ev.data === 'string' ? ev.data : '');
    ws.onclose = () => {
      this.ws = null;
      this.connecting = false;
      this.subs.clear();
      if (this.wanted.size) setTimeout(() => void this.connect(), 3000);
    };
    ws.onerror = () => ws.close();
    this.startRetry();
  }

  // 한도 초과(OPSP0008)로 거부된 종목을 주기적으로 재등록 → 다른 세션 정리로 슬롯이
  // 비면 자동으로 채운다. 확정(subs)된 종목은 건너뛰어 중복 등록을 피한다.
  private startRetry(): void {
    if (this.retryTimer) return;
    this.retryTimer = setInterval(() => {
      if (this.ws?.readyState !== 1) return;
      const pending = [...this.wanted].filter((c) => !this.subs.has(c));
      if (!pending.length) return;
      this.overCount = 0;
      pending.forEach((c) => this.register(c, '1'));
      // 한 주기 거부 결과를 1줄로 요약(도배 방지). 약간 지연 후 집계.
      setTimeout(() => {
        if (this.overCount > 0) {
          console.warn(`[kisSocket] ${this.overCount}/${pending.length}종목 구독 보류 — KIS 계정 등록 한도(~41) 초과, 슬롯 비면 자동 재시도`);
        }
      }, 1500);
    }, 30000);
  }

  private register(code: string, type: '1' | '2'): void {
    if (this.ws?.readyState !== 1) return;
    this.ws.send(
      JSON.stringify({
        header: { approval_key: this.approval, custtype: 'P', tr_type: type, 'content-type': 'utf-8' },
        body: { input: { tr_id: 'H0STCNT0', tr_key: code } },
      }),
    );
  }

  private onMessage(raw: string): void {
    if (!raw) return;
    if (raw[0] === '{') {
      try {
        const j = JSON.parse(raw) as { header?: { tr_id?: string; tr_key?: string }; body?: { rt_cd?: string; msg_cd?: string; msg1?: string } };
        if (j.header?.tr_id === 'PINGPONG') {
          this.ws?.send(raw);
          return;
        }
        // 구독 응답: rt_cd '0'=성공(tr_key 확정) / '9'=실패.
        // OPSP0011=무효 승인키 → 새 키로 재연결. OPSP0008=한도초과 → wanted에 남겨 재시도.
        const rc = j.body?.rt_cd;
        const key = j.header?.tr_key;
        if (rc === '0') {
          if (key) this.subs.add(key);
        } else if (rc) {
          // 한도초과(OPSP0008)는 재시도 중 예상되는 일시적 거부 → 주기당 요약(startRetry)으로만 로깅.
          if (j.body?.msg_cd === 'OPSP0008') {
            this.overCount++;
          } else {
            console.warn(`[kisSocket] subscribe rejected ${j.body?.msg_cd} ${j.body?.msg1}`);
            if (j.body?.msg_cd === 'OPSP0011') void this.refreshApproval();
          }
        }
      } catch {
        /* ignore */
      }
      return;
    }
    // 데이터 프레임: recvtype|tr_id|count|payload(^로 구분)
    const parts = raw.split('|');
    if (parts.length < 4 || parts[1] !== 'H0STCNT0') return;
    const f = parts[3].split('^');
    const code = f[0];
    const price = Number(f[2]); // 현재가
    const pct = Number(f[5]); // 전일대비율
    if (!code || !Number.isFinite(price)) return;
    const q: RtQuote = { price, pct };
    this.latest.set(code, q);
    this.listeners.forEach((l) => l(code, q));
  }

  // 구독 대상(wanted)을 "현재 필요한 codes"와 일치시킨다(≤40). 더 이상 필요 없는 종목은
  // 해지(tr_type '2'), 새 종목은 등록('1') 요청. 실제 구독 확정(subs)은 OPSP0000 응답으로 처리하며,
  // 한도초과로 거부된 건 wanted에 남아 startRetry가 슬롯이 비는 대로 재등록한다.
  async ensure(codes: string[]): Promise<void> {
    await this.connect();
    const want = new Set(codes.slice(0, MAX_SUBS));
    for (const c of [...this.wanted]) {
      if (!want.has(c)) {
        this.register(c, '2');
        this.wanted.delete(c);
        this.subs.delete(c);
        this.latest.delete(c);
      }
    }
    for (const c of want) {
      if (!this.wanted.has(c)) {
        this.wanted.add(c);
        this.register(c, '1');
      }
    }
  }

  snapshot(codes: string[]): Record<string, RtQuote> {
    const o: Record<string, RtQuote> = {};
    codes.forEach((c) => {
      const q = this.latest.get(c);
      if (q) o[c] = q;
    });
    return o;
  }

  addListener(l: Listener): void {
    this.listeners.add(l);
  }
  removeListener(l: Listener): void {
    this.listeners.delete(l);
  }
}

// HMR/요청 간 단일 인스턴스 유지.
declare global {
  // eslint-disable-next-line no-var
  var __kisSocket: KisSocket | undefined;
}
export const kisSocket: KisSocket = globalThis.__kisSocket ?? (globalThis.__kisSocket = new KisSocket());
