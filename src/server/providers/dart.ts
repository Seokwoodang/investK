import 'server-only';
import zlib from 'node:zlib';
import { env, has } from '../env';

// DART(금감원 전자공시) OpenAPI — 국내 상장사 공시(수주·잠정실적 등).
//  - corp_code 매핑: corpCode.xml(zip)을 받아 내장 zlib으로 풀어 stock_code→corp_code 맵을 만든다(하루 캐시).
//  - 종목별 공시: list.json?corp_code=... 로 최근 공시를 받아 시세에 영향 큰 유형만 추린다.
// 미국·코인엔 공시 개념이 없어 국내(6자리 종목코드) 전용.

const DAY = 86400_000;
const KEY = () => env.DART_API_KEY;

// ── stock_code → corp_code 맵(모듈 메모리, 하루 캐시). corpCode.xml zip은 ~3.5MB. ──
let corpMap: Record<string, string> | null = null;
let corpAt = 0;
let corpInflight: Promise<Record<string, string>> | null = null;

async function getCorpMap(): Promise<Record<string, string>> {
  if (corpMap && Date.now() - corpAt < DAY) return corpMap;
  if (corpInflight) return corpInflight;
  corpInflight = (async () => {
    const r = await fetch(`https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${KEY()}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.subarray(0, 4).toString('hex') !== '504b0304') throw new Error('corpCode: not a zip');
    // 단일 파일 zip의 로컬 헤더에서 deflate 데이터 위치를 읽어 inflateRaw로 해제(의존성 없이).
    const method = buf.readUInt16LE(8);
    const compSize = buf.readUInt32LE(18);
    const nameLen = buf.readUInt16LE(26);
    const extraLen = buf.readUInt16LE(28);
    const start = 30 + nameLen + extraLen;
    const comp = compSize > 0 ? buf.subarray(start, start + compSize) : buf.subarray(start);
    const xml = (method === 8 ? zlib.inflateRawSync(comp) : comp).toString('utf8');
    const map: Record<string, string> = {};
    for (const blk of xml.match(/<list>[\s\S]*?<\/list>/g) ?? []) {
      const sc = (blk.match(/<stock_code>(.*?)<\/stock_code>/) ?? [])[1]?.trim();
      const cc = (blk.match(/<corp_code>(.*?)<\/corp_code>/) ?? [])[1]?.trim();
      if (cc && sc && /^\d{6}$/.test(sc)) map[sc] = cc;
    }
    corpMap = map;
    corpAt = Date.now();
    return map;
  })().finally(() => { corpInflight = null; });
  return corpInflight;
}

export interface Disclosure {
  code: string; // 종목코드(6자리)
  date: string; // YYYY-MM-DD (접수일)
  title: string; // 공시명(정리)
  kind: '수주' | '실적' | '공시';
  url: string; // DART 원문 뷰어 링크
}

// 시세에 직접 영향이 큰 공시만. (노이즈: 임원소유·IR개최·지배구조·지속가능 등 제외)
const MATERIAL = /단일판매|공급계약|잠정실적|영업.{0,4}실적|유상증자|무상증자|자기주식|합병|분할|주요사항|전환사채|신주인수권|배당결정|감자|최대주주.*변경|영업양수도|매출액또는손익구조/;
const NOISE = /임원.?주요주주|기업설명회|IR개최|지속가능|지배구조|대규모기업집단|조회공시|특정증권등소유|주식등의대량보유/;

function kindOf(nm: string): Disclosure['kind'] {
  if (/단일판매|공급계약|수주/.test(nm)) return '수주';
  if (/잠정실적|영업.{0,4}실적|매출액또는손익구조|재무제표기준/.test(nm)) return '실적';
  return '공시';
}
const clean = (nm: string) => nm.replace(/\s+/g, ' ').replace(/ㆍ/g, '·').trim();
const ymdDash = (r: string) => `${r.slice(0, 4)}-${r.slice(4, 6)}-${r.slice(6, 8)}`;
function ago(days: number): string {
  const d = new Date(Date.now() - days * DAY);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function listByCorp(cc: string, code: string, bgn: string): Promise<Disclosure[]> {
  const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${KEY()}&corp_code=${cc}&bgn_de=${bgn}&page_count=50&sort=date&sort_mth=desc`;
  const r = await fetch(url, { next: { revalidate: 3600 } }); // 1시간 캐시
  if (!r.ok) return [];
  const j = (await r.json()) as { status?: string; list?: Array<{ report_nm: string; rcept_dt: string; rcept_no: string }> };
  if (j.status !== '000' || !j.list) return [];
  return j.list
    .filter((x) => MATERIAL.test(x.report_nm) && !NOISE.test(x.report_nm))
    .map((x) => ({
      code,
      date: ymdDash(x.rcept_dt),
      title: clean(x.report_nm),
      kind: kindOf(x.report_nm),
      url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${x.rcept_no}`,
    }));
}

// 종목코드 배열의 최근 주요 공시. (미국·코인 코드는 자동 제외 — 6자리 국내만)
export async function getDisclosures(codes: string[], days = 120, perStock = 6): Promise<Disclosure[]> {
  if (!has.dart() || !codes.length) return [];
  const map = await getCorpMap().catch(() => null);
  if (!map) return [];
  const bgn = ago(days);
  const uniq = [...new Set(codes.filter((c) => /^\d{6}$/.test(c)))].slice(0, 30); // 과호출 방지 상한
  const out = await Promise.all(
    uniq.map(async (code) => {
      const cc = map[code];
      if (!cc) return [] as Disclosure[];
      try {
        return (await listByCorp(cc, code, bgn)).slice(0, perStock);
      } catch {
        return [] as Disclosure[];
      }
    }),
  );
  return out.flat().sort((a, b) => b.date.localeCompare(a.date));
}
