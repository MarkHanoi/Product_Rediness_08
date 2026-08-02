#!/usr/bin/env node
/**
 * M2 - MADRID: the committed census measured 11 columns. The schema has 30+.
 * `NM_DIM_MX_B` ("dimension maxima de ... B") is DEPTH-SHAPED and was NEVER
 * MEASURED - it is not in 05-coverage-by-municipality.csv at all.
 *
 * A parameter can be missed by never being put in the wordlist just as easily as
 * by being searched under the wrong word. This checks the columns the census
 * skipped, using the publisher's own alias documentation where available and the
 * VALUE LADDER where not: a length in metres banded per zone IS a depth
 * whatever its name.
 *
 * CONTROL: `NM_FDO_MX_ED` is pulled through the SAME code path. Its ladder is
 * known-good depth, so if the two ladders have the same shape the candidate is
 * depth-like; if NM_DIM_MX_B looks like anything else, the ladder will say so.
 *
 * Endpoint: WFS 2.0.0 idem.comunidad.madrid/geoserver3/wfs (no key).
 * ALSO probes WFS 1.1.0 and 1.0.0 - a modern-default-only probe cannot tell
 * "service down" from "one version broken".
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });

const WFS = 'https://idem.comunidad.madrid/geoserver3/wfs';
const TYPE = 'VPLA_V_ORDENANZA';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36';

function curl(url) {
  return execFileSync('curl', ['-sL', '--max-time', '180', '-A', UA, url],
    { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
}

// ── version control: never probe only the modern default ────────────────
const versions = {};
for (const [v, tn] of [['2.0.0', 'TYPENAMES'], ['1.1.0', 'TYPENAME'], ['1.0.0', 'TYPENAME']]) {
  const u = `${WFS}?service=WFS&version=${v}&request=GetFeature&${tn}=${TYPE}&${v === '2.0.0' ? 'count' : 'maxFeatures'}=1&outputFormat=application/json`;
  let body = '';
  try { body = curl(u); } catch (e) { body = 'CURL-FAILED ' + String(e).slice(0, 120); }
  versions[v] = {
    bytes: body.length,
    looksJson: body.trimStart().startsWith('{'),
    exception: /ExceptionText>([^<]{0,240})/.exec(body)?.[1]
      || /ORA-\d+[^<\n]{0,120}/.exec(body)?.[0] || null,
    head: body.slice(0, 200).replace(/\s+/g, ' '),
  };
}

// ── the census's own page-walk recipe: sortBy=CDID is REQUIRED ───────────
function page(props, start, count) {
  const u = `${WFS}?service=WFS&version=2.0.0&request=GetFeature&TYPENAMES=${TYPE}`
    + `&propertyName=${props.join(',')}&sortBy=CDID&startIndex=${start}&count=${count}`
    + `&outputFormat=application/json`;
  return JSON.parse(curl(u));
}

// independent oracle for the total - resultType=hits
const hitsBody = curl(`${WFS}?service=WFS&version=2.0.0&request=GetFeature&TYPENAMES=${TYPE}&resultType=hits`);
const numberMatched = Number(/numberMatched="(\d+)"/.exec(hitsBody)?.[1] || 0);

const CANDIDATES = ['NM_FDO_MX_ED', 'NM_DIM_MX_B', 'NM_DIST_MIN_B', 'NM_FRTE_MIN', 'NM_TA_MIN_P', 'NM_PTE_MX'];
const PROPS = ['CDID', 'CD_MUNICIPIO', 'DS_NOMB_ORD', ...CANDIDATES];

const acc = Object.fromEntries(CANDIDATES.map(c => [c, new Map()]));
let read = 0;
const PAGE = 5000;
const LIMIT = Number(process.env.LIMIT || numberMatched || 0);
for (let s = 0; s < LIMIT; s += PAGE) {
  const j = page(PROPS, s, PAGE);
  const fs_ = j.features || [];
  if (!fs_.length) break;
  read += fs_.length;
  for (const f of fs_) {
    for (const c of CANDIDATES) {
      const v = f.properties?.[c];
      if (v === null || v === undefined || v === '') continue;
      acc[c].set(String(v), (acc[c].get(String(v)) || 0) + 1);
    }
  }
  process.stderr.write(`  read ${read}/${LIMIT}\n`);
}

function summarise(c) {
  const m = acc[c];
  // "valid" follows the census convention: > 0, because step 05 showed zero-inflation
  let nonNull = 0, positive = 0;
  const ladder = [];
  for (const [k, n] of m) {
    const x = Number(String(k).replace(',', '.'));
    nonNull += n;
    if (Number.isFinite(x) && x > 0) { positive += n; ladder.push([x, n]); }
  }
  ladder.sort((a, b) => a[0] - b[0]);
  const distinct = ladder.length;
  return {
    column: c, rowsRead: read,
    nonNull, positive,
    validPct: read ? +(positive / read * 100).toFixed(2) : 0,
    distinctPositiveValues: distinct,
    range: distinct ? [ladder[0][0], ladder[distinct - 1][0]] : null,
    top25: ladder.slice().sort((a, b) => b[1] - a[1]).slice(0, 25),
    ladderHead: ladder.slice(0, 30),
  };
}

const res = {
  endpoint: WFS, typename: TYPE,
  versionControl: versions,
  independentTotal_numberMatched: numberMatched,
  rowsRead: read,
  reconciled: read === numberMatched,
  columns: CANDIDATES.map(summarise),
};
fs.writeFileSync(path.join(OUT, 'm2-madrid-second-depth-column.json'), JSON.stringify(res, null, 2));

console.log('MADRID - columns the committed census never measured');
console.log('version control:'); console.log(JSON.stringify(versions, null, 2));
console.log(`\nnumberMatched=${numberMatched} rowsRead=${read} reconciled=${res.reconciled}\n`);
for (const s of res.columns) {
  console.log(`${s.column.padEnd(14)} valid ${String(s.validPct).padStart(6)}%  distinct ${String(s.distinctPositiveValues).padStart(5)}  range ${JSON.stringify(s.range)}`);
  console.log(`   top: ${JSON.stringify(s.top25.slice(0, 14))}`);
}
