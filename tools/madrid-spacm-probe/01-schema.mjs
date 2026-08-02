/**
 * STEP 1 — Full attribute schema + feature count for every sitcm:VPLA_V_* layer.
 *
 * The four catalogue entries named in MADRID-DATA-INVENTORY §3 are catalogue aliases.
 * This step establishes, by query, which WFS typeName each one is.
 *
 * Run: node tools/madrid-spacm-probe/01-schema.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { get, q, hits, truncationSuspect } from './lib.mjs';

const OUT = new URL('./out/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const LAYERS = [
  // catalogue alias                 typeName
  ['spacm_ambitos',                  'sitcm:VPLA_V_AMBITO'],
  ['spacm_ambitosmodif',             'sitcm:VPLA_V_AMBITO_MODIF'],
  ['spacm_ordenanzas',               'sitcm:VPLA_V_ORDENANZA'],
  ['spacm_ordenanzasref2023',        'sitcm:VPLA_V_ORDENANZA_REF_23'],
  // adjacent layers discovered in GetCapabilities, not in the catalogue list
  ['(discovered) ordenanza modif',   'sitcm:VPLA_V_ORDENANZA_MODIF'],
  ['(discovered) ordenanza ref19',   'sitcm:VPLA_V_ORDENANZA_REF_19'],
  ['(discovered) ordenanza ref25',   'sitcm:VPLA_V_ORDENANZA_REF_25'],
  ['(discovered) ambito ref23',      'sitcm:VPLA_V_AMBITO_REF_23'],
  ['(discovered) ambito ref25',      'sitcm:VPLA_V_AMBITO_REF_25'],
  ['(discovered) clasificacion',     'sitcm:VPLA_V_CLASIFICACION'],
  ['(discovered) clasif modif',      'sitcm:VPLA_V_CLASIFICACION_MODIF'],
  ['(discovered) clasif ref23',      'sitcm:VPLA_V_CLASIFICACION_REF_23'],
  ['(discovered) clasif ref25',      'sitcm:VPLA_V_CLASIFICACION_REF_25'],
  ['(discovered) red',               'sitcm:VPLA_V_RED'],
];

function parseXsd(xml) {
  const out = [];
  const re = /<xsd:element[^>]*?name="([^"]+)"[^>]*?type="([^"]+)"[^>]*?>/g;
  let m;
  while ((m = re.exec(xml))) {
    const tag = m[0];
    const nillable = /nillable="true"/.test(tag);
    const minOccurs = tag.match(/minOccurs="(\d+)"/)?.[1] ?? '1';
    out.push({ name: m[1], type: m[2], nillable, minOccurs });
  }
  return out;
}

const results = [];
for (const [alias, tn] of LAYERS) {
  const dft = await get(q({
    service: 'WFS', version: '2.0.0', request: 'DescribeFeatureType', typeNames: tn,
  }));
  const fields = dft.ok ? parseXsd(dft.body) : [];
  const h = await hits(tn);
  const rec = {
    alias, typeName: tn,
    describe: { ok: dft.ok, status: dft.status, bytes: dft.bytes, err: dft.owsException ?? dft.transportError },
    fieldCount: fields.length,
    fields,
    featureCount: h.count,
    featureCountErr: h.count == null ? (h.diag.owsException ?? h.diag.transportError) : null,
    truncationSuspect: truncationSuspect(h.count),
  };
  results.push(rec);
  console.log(
    `${tn.padEnd(36)} fields=${String(rec.fieldCount).padStart(3)} ` +
    `features=${rec.featureCount ?? 'NULL(' + rec.featureCountErr + ')'}` +
    (rec.truncationSuspect ? '  <<< TRUNCATION SUSPECT' : '')
  );
  if (dft.ok) writeFileSync(`${OUT}/dft-${tn.split(':')[1]}.xsd`, dft.body);
}

writeFileSync(`${OUT}/01-schema.json`, JSON.stringify(results, null, 2));

console.log('\n--- FIELD LISTS ---');
for (const r of results) {
  if (!r.fieldCount) continue;
  console.log(`\n${r.typeName}  (${r.alias})`);
  for (const f of r.fields) {
    console.log(`   ${f.name.padEnd(22)} ${f.type.replace('xsd:', '')}${f.nillable ? '' : '  NOT-NULL'}`);
  }
}
