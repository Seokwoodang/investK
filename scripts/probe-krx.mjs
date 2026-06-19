// Probe KRX 전종목 시세 (all listed KR stocks in one call). Discovers field names
// and confirms it works. Tries recent dates until a trading day returns data.
const base = new Date(process.env.PROBE_DATE ? Number(process.env.PROBE_DATE) : Date.now());
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

async function fetchDay(trdDd) {
  const body = new URLSearchParams({
    bld: 'dbms/MDC/STAT/standard/MDCSTAT01501',
    mktId: 'ALL',
    trdDd,
    money: '1',
    csvxls_isNo: 'false',
  });
  const res = await fetch('https://data.krx.go.kr/comm/bldAttendant/getJsonData.cmd', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: 'http://data.krx.go.kr/contents/MDC/MDI/mdiLoader/index.cmd',
      'User-Agent': 'Mozilla/5.0',
    },
    body: body.toString(),
  });
  const j = await res.json().catch(() => ({}));
  const arr = j.OutBlock_1 || j.output || [];
  return { status: res.status, count: arr.length, sample: arr.slice(0, 2) };
}

for (let i = 0; i < 6; i++) {
  const d = new Date(base);
  d.setDate(base.getDate() - i);
  const trdDd = ymd(d);
  const r = await fetchDay(trdDd);
  console.log(trdDd, 'status', r.status, 'count', r.count);
  if (r.count > 0) {
    console.log(JSON.stringify(r.sample, null, 0).slice(0, 700));
    break;
  }
  await new Promise((res) => setTimeout(res, 300));
}
