/**
 * STEP 2 — (a) Does paging actually work?  (b) Municipality census.  (c) Domain values.
 *
 * (a) matters MORE than anything else here. MADRID-DATA-INVENTORY §2 records
 *     "paging unsupported — cannot do natural order without a primary key", which forced every
 *     prior figure to be a NATURAL-ORDER HEAD, i.e. INDICATIVE, not MEASURED.
 *     If `resultType=hits` + CQL_FILTER returns an exact server-side numberMatched, then rates
 *     can be computed as COUNT/COUNT with NO SAMPLING AT ALL — which is MEASURED.
 *
 * Run: node tools/madrid-spacm-probe/02-paging-and-domains.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { get, getJson, q, hits } from './lib.mjs';

const OUT = new URL('./out/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const log = [];
const say = (s) => { console.log(s); log.push(s); };

// ─── (a) PAGING CAPABILITY ────────────────────────────────────────────────────
say('=== (a) PAGING CAPABILITY TEST ===');
for (const tn of ['sitcm:VPLA_V_ORDENANZA', 'sitcm:VPLA_V_AMBITO_MODIF']) {
  for (const [label, extra] of [
    ['count only          ', { count: '5' }],
    ['count+startIndex=0  ', { count: '5', startIndex: '0' }],
    ['count+startIndex=100', { count: '5', startIndex: '100' }],
    ['count+sortBy=CDID   ', { count: '5', startIndex: '100', sortBy: 'CDID' }],
  ]) {
    const r = await getJson(q({
      service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: tn,
      outputFormat: 'application/json', propertyName: 'CD_MUNICIPIO', ...extra,
    }));
    const n = r.json?.features?.length ?? null;
    say(`  ${tn.padEnd(28)} ${label} -> ${r.ok ? `${n} features` : `FAIL ${r.status} ${r.owsException ?? r.transportError}`}`);
  }
}

// ─── (a2) IS numberMatched EXACT, OR CAPPED? ─────────────────────────────────
say('\n=== (a2) IS numberMatched CAPPED BY maxRecordCount? ===');
const cap = await get(q({ service: 'WFS', version: '2.0.0', request: 'GetCapabilities' }));
const cnt = cap.body.match(/CountDefault[^>]*>(\d+)/i)?.[1]
  ?? cap.body.match(/name="CountDefault"[\s\S]{0,200}?>(\d+)</i)?.[1] ?? 'not advertised';
say(`  advertised CountDefault / maxFeatures = ${cnt}`);
const full = await hits('sitcm:VPLA_V_ORDENANZA');
say(`  numberMatched(VPLA_V_ORDENANZA, no filter) = ${full.count}`);
say(`  ${full.count > 10000 ? '=> numberMatched EXCEEDS any page cap, therefore NOT capped: it is an exact server-side count.'
                            : '=> INCONCLUSIVE'}`);

// ─── (b) MUNICIPALITY CENSUS ─────────────────────────────────────────────────
say('\n=== (b) MUNICIPALITY CENSUS (from the same server, Callejero:SIGI_V_MUNICIPIOS) ===');
const muni = await getJson(q({
  service: 'WFS', version: '2.0.0', request: 'GetFeature',
  typeNames: 'Callejero:SIGI_V_MUNICIPIOS', outputFormat: 'application/json', count: '1000',
}));
let munis = [];
if (muni.ok && muni.json?.features?.length) {
  const p0 = muni.json.features[0].properties;
  say(`  fields: ${Object.keys(p0).join(', ')}`);
  say(`  sample: ${JSON.stringify(p0)}`);
  munis = muni.json.features.map((f) => f.properties);
  say(`  municipality features returned: ${munis.length}`);
} else {
  say(`  FAIL ${muni.status} ${muni.owsException ?? muni.transportError}`);
}

// ─── (b2) INE vs DGC — the join-key check ────────────────────────────────────
say('\n=== (b2) JOIN-KEY IDENTITY: is CD_MUNICIPIO an INE code? ===');
// Known answer control: Madrid capital INE = 28079. DGC for Madrid capital is 28900.
for (const code of ['28079', '28900', '28005']) {
  const h = await hits('sitcm:VPLA_V_ORDENANZA', `CD_MUNICIPIO='${code}'`);
  say(`  CD_MUNICIPIO='${code}' -> ${h.count ?? 'NULL:' + (h.diag.owsException ?? h.diag.transportError)}`);
}
const nameProbe = await getJson(q({
  service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: 'sitcm:VPLA_V_ORDENANZA',
  outputFormat: 'application/json', count: '1', CQL_FILTER: "CD_MUNICIPIO='28079'",
  propertyName: 'CD_MUNICIPIO,DS_MUNICIPIO',
}));
say(`  28079 resolves to DS_MUNICIPIO = ${JSON.stringify(nameProbe.json?.features?.[0]?.properties ?? null)}`);

// ─── (c) DOMAIN VALUES ───────────────────────────────────────────────────────
// No DISTINCT in WFS. Enumerate candidate values and COUNT each with hits() — exact, unsampled.
say('\n=== (c) DOMAINS — DS_FIG_DES (figura de desarrollo) on VPLA_V_AMBITO ===');
say('  (enumerated by pulling a large propertyName-reduced draw; AMBITO is small enough to take whole)');
const amb = await getJson(q({
  service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: 'sitcm:VPLA_V_AMBITO',
  outputFormat: 'application/json', count: '20000',
  propertyName: 'CD_MUNICIPIO,DS_MUNICIPIO,DS_FIG_DES,DS_CLAS_SUE,DS_PROMOC,DS_SIST_ACT',
}), { timeoutMs: 300000 });
if (amb.ok) {
  const feats = amb.json.features;
  say(`  drew ${feats.length} of ${(await hits('sitcm:VPLA_V_AMBITO')).count} AMBITO features` +
      (feats.length === 5937 ? '  => WHOLE LAYER, this is a CENSUS not a sample' : '  => PARTIAL'));
  for (const field of ['DS_FIG_DES', 'DS_CLAS_SUE', 'DS_PROMOC', 'DS_SIST_ACT']) {
    const tally = new Map();
    for (const f of feats) {
      const v = f.properties[field] ?? '(null)';
      tally.set(v, (tally.get(v) ?? 0) + 1);
    }
    say(`\n  ${field} — ${tally.size} distinct`);
    for (const [v, n] of [...tally].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
      say(`     ${String(n).padStart(6)}  ${v}`);
    }
  }
  writeFileSync(`${OUT}/02-ambito-census.json`, JSON.stringify(feats.map((f) => f.properties), null, 2));
} else {
  say(`  FAIL ${amb.status} ${amb.owsException ?? amb.transportError}`);
}

writeFileSync(`${OUT}/02-paging-and-domains.log`, log.join('\n'));
