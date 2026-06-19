// Probe KIS real-time websocket: approval_key → ws connect → subscribe 삼성전자 체결가.
// Node 22 has global WebSocket. ws://ops.koreainvestment.com:21000 (실전).
const APP_KEY = process.env.KIS_APP_KEY, APP_SECRET = process.env.KIS_APP_SECRET;
const BASE = process.env.KIS_BASE || 'https://openapi.koreainvestment.com:9443';

// 1) approval_key (note: field is 'secretkey', not 'appsecret')
const ar = await fetch(`${BASE}/oauth2/Approval`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ grant_type: 'client_credentials', appkey: APP_KEY, secretkey: APP_SECRET }),
});
const aj = await ar.json().catch(() => ({}));
console.log('APPROVAL', ar.status, JSON.stringify(aj).slice(0, 120));
const approvalKey = aj.approval_key;
if (!approvalKey) process.exit(1);

// 2) ws connect + subscribe
const ws = new WebSocket('ws://ops.koreainvestment.com:21000');
let got = 0;
const timer = setTimeout(() => { console.log('TIMEOUT (no frames; market may be closed)'); ws.close(); process.exit(0); }, 9000);
ws.onopen = () => {
  console.log('WS OPEN');
  ws.send(JSON.stringify({
    header: { approval_key: approvalKey, custtype: 'P', tr_type: '1', 'content-type': 'utf-8' },
    body: { input: { tr_id: 'H0STCNT0', tr_key: '005930' } },
  }));
};
ws.onmessage = (ev) => {
  const d = typeof ev.data === 'string' ? ev.data : '(binary)';
  console.log('MSG', d.slice(0, 160));
  if (++got >= 2) { clearTimeout(timer); ws.close(); process.exit(0); }
};
ws.onerror = (e) => { console.log('WS ERROR', e.message || e.type); clearTimeout(timer); process.exit(2); };
ws.onclose = () => console.log('WS CLOSE');
