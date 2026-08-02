/**
 * STEP 4 — FULL CENSUS DOWNLOAD. Not a sample.
 *
 * Step 3 proved paging works with sortBy=CDID and that a full walk is complete and
 * duplicate-free. So every layer is taken WHOLE. There is no draw, no head, no
 * "indicative" caveat: n = N.
 *
 * Each layer is verified against its independent resultType=hits total before being written.
 * A layer whose walk does not reconcile is written with reconciled:false and MUST NOT be quoted.
 *
 * Run: node tools/madrid-spacm-probe/04-census.mjs
 */
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { getJson, q, hits } from './lib.mjs';

const OUT = new URL('./out/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const ORD_FIELDS = [
  'CDID', 'CD_MUNICIPIO', 'DS_MUNICIPIO', 'CD_REUR', 'DS_NOM_AMB', 'DS_CLAS_SUE', 'DS_NOMB_ORD',
  'CD_UNI', 'NM_S_ORD', 'NM_C_ED_ORD', 'NM_S_MX_ED_O', 'NM_C_ED_MAZ', 'NM_S_MX_ED_M',
  'DS_TIPOLOG', 'NM_ALTURA', 'NM_N_PLTA', 'NM_OCP_MX', 'NM_RTR_FRNT', 'NM_RTR_LATL',
  'NM_RTR_POST', 'NM_FDO_MX_ED', 'NM_FRTE_MIN', 'NM_APRV_BC', 'NM_OCP_PB', 'NM_AREA',
  'DS_LEY', 'DS_PLANEAM_GRAL', 'FC_BOCM', 'DS_DOCU',
];
const AMB_FIELDS = [
  'CDID', 'CD_MUNICIPIO', 'DS_MUNICIPIO', 'CD_REUR', 'DS_NOMB_AMB', 'DS_CLAS_SUE', 'DS_PROMOC',
  'DS_FIG_DES', 'DS_SIST_ACT', 'CD_UNI', 'DS_ORD_ASOC', 'NM_C_ED', 'NM_S_MAX_ED', 'NM_APRO_TIPO',
  'NM_S_TOT', 'NM_AREA', 'DS_LEY', 'DS_PLANEAM_GRAL', 'FC_AC', 'FC_BOCM', 'DS_DOCU',
];
const CLASIF_FIELDS = [
  'CDID', 'CD_MUNICIPIO', 'DS_MUNICIPIO', 'CD_REUR', 'DS_CLASIF_DET', 'DS_CLASIF_GEN',
  'CD_SIGLAS', 'NM_AREA', 'DS_LEY', 'DS_PLANEAM_GRAL',
];

const LAYERS = [
  ['sitcm:VPLA_V_ORDENANZA', ORD_FIELDS],
  ['sitcm:VPLA_V_AMBITO', AMB_FIELDS],
  ['sitcm:VPLA_V_AMBITO_MODIF', AMB_FIELDS],
  ['sitcm:VPLA_V_ORDENANZA_MODIF', ORD_FIELDS],
  ['sitcm:VPLA_V_CLASIFICACION', CLASIF_FIELDS],
  ['sitcm:VPLA_V_CLASIFICACION_MODIF', CLASIF_FIELDS],
  ['sitcm:VPLA_V_ORDENANZA_REF_23', ORD_FIELDS.filter((f) => !['DS_LEY', 'DS_PLANEAM_GRAL', 'FC_BOCM', 'DS_DOCU'].includes(f))],
];

const PAGE = 5000;

for (const [tn, fields] of LAYERS) {
  const short = tn.split(':')[1];
  const file = `${OUT}/census-${short}.json`;
  if (existsSync(file)) {
    const prev = JSON.parse(readFileSync(file, 'utf8'));
    console.log(`${short.padEnd(30)} cached: ${prev.rows.length} rows, reconciled=${prev.reconciled}`);
    continue;
  }
  const expected = (await hits(tn)).count;
  const rows = [];
  const seen = new Set();
  let dupes = 0, failures = [];
  for (let s = 0; s < expected + PAGE; s += PAGE) {
    let got = null;
    for (let attempt = 0; attempt < 3 && !got; attempt++) {
      const r = await getJson(q({
        service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: tn,
        outputFormat: 'application/json', count: String(PAGE), startIndex: String(s),
        propertyName: fields.join(','), sortBy: 'CDID',
      }), { timeoutMs: 300000 });
      if (r.ok) got = r.json.features;
      else if (attempt === 2) failures.push({ startIndex: s, status: r.status, err: r.owsException ?? r.transportError });
    }
    if (!got) break;
    if (got.length === 0) break;
    for (const f of got) {
      const id = f.properties.CDID;
      if (seen.has(id)) dupes++; else { seen.add(id); rows.push(f.properties); }
    }
    process.stdout.write(`\r${short.padEnd(30)} ${rows.length}/${expected}   `);
  }
  const reconciled = rows.length === expected && dupes === 0 && failures.length === 0;
  writeFileSync(file, JSON.stringify({
    typeName: tn, expectedFromHits: expected, rowsWalked: rows.length,
    duplicates: dupes, failures, reconciled, fields, rows,
  }));
  console.log(`\r${short.padEnd(30)} ${rows.length}/${expected} dupes=${dupes} fail=${failures.length} ` +
              `${reconciled ? 'RECONCILED ✓' : '⛔ NOT RECONCILED — DO NOT QUOTE'}`);
}
