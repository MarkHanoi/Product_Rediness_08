// §MURCIA-ENVELOPE-MAX · STEP 3 — THE UNIVERSES, NAMED; AND HOW CURRENCY IS ESTABLISHED
//
// Step 2 found the two universes are BOTH REAL and BOTH DIFFERENT NUMBERS:
//   · sitmurcia_plu_sp   45 features / 45 municipalities  ← CORPUS  (what the instrument governs)
//   · sitmurcia_plu_ze   9470 rows   / 33 municipalities  ← SCHEMA  (what the service carries)
//   · plu_ze_37_mun_uso_suelo 9469 rows / 33              ← the same content, native workspace
//   · the layer NAME says "37mun". The DATA says 33. That disagreement is REPORTED, not resolved
//     silently — it is a third number belonging to a third question ("what was the layer built for").
//
// This step reads sitmurcia_plu_sp / plu_sp_vigente in full: per municipality,
// WHICH INSTRUMENT, adapted to WHICH LAW, APPROVED WHEN. That is the currency
// evidence — publisher-authored, per-row, and independent of any layer name.

import { politeFetch, writeOut, GEOSERVER_ROOT, qs, assertSums } from './lib.mjs';

const REFRESH = process.argv.includes('--refresh');
const O = { refresh: REFRESH };
const report = { step: 3, measuredAt: new Date().toISOString(), notes: [] };

async function describe(full) {
  const ws = full.split(':')[0];
  const r = await politeFetch(
    `${GEOSERVER_ROOT}/${ws}/wfs?${qs({ service: 'WFS', version: '2.0.0', request: 'DescribeFeatureType', typeNames: full })}`,
    O
  );
  const xml = r.buf.toString('utf8');
  if (/ExceptionReport/i.test(xml)) return { error: xml.slice(0, 800) };
  return { fields: [...xml.matchAll(/<xsd:element[^>]*name="([^"]+)"[^>]*type="([^"]+)"/g)].map((m) => ({ name: m[1], type: m[2] })) };
}

async function getAll(full, propertyName) {
  const ws = full.split(':')[0];
  const url =
    `${GEOSERVER_ROOT}/${ws}/wfs?` +
    qs({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: full,
      outputFormat: 'application/json',
      count: 200000,
      ...(propertyName ? { propertyName } : {}),
    });
  const r = await politeFetch(url, { ...O, timeout: 240_000 });
  const t = r.buf.toString('utf8');
  // ⛔ READ THE WHOLE ERROR STRING — a truncated exception hides the actual cause.
  if (/ExceptionReport/i.test(t)) throw new Error(t.replace(/\s+/g, ' ').slice(0, 2000));
  return JSON.parse(t);
}

// ── 3a · schemas of the plan-level layers ────────────────────────────────────
console.log('\n== 3a · plan-level schemas ==');
for (const full of ['SIT_USU_PLU_CARM:sitmurcia_plu_sp', 'SIT_USU_PLU_CARM:plu_sp_vigente']) {
  const d = await describe(full);
  report[full] = { schema: d };
  console.log(`  ${full}: ${d.fields ? d.fields.map((f) => f.name).join(', ') : 'ERROR ' + String(d.error).slice(0, 300)}`);
}

// ── 3b · CORPUS universe — one row per municipality, with its instrument ─────
console.log('\n== 3b · CORPUS universe: sitmurcia_plu_sp (all attributes) ==');
{
  const j = await getAll('SIT_USU_PLU_CARM:sitmurcia_plu_sp', null);
  const rows = j.features.map((f) => {
    const p = { ...f.properties };
    delete p.geom;
    delete p.geometry;
    return p;
  });
  report.corpus = { layer: 'SIT_USU_PLU_CARM:sitmurcia_plu_sp', rows: rows.length, records: rows };
  console.log(`  ${rows.length} rows. Fields: ${Object.keys(rows[0] || {}).join(', ')}`);
  console.log(JSON.stringify(rows.slice(0, 4), null, 2));

  // ⚠ information content of every field: a field with one distinct value is a
  //   label, not a fact (Balears DFIVIGEN).
  const info = {};
  for (const k of Object.keys(rows[0] || {})) {
    const vals = rows.map((r) => r[k]);
    const nn = vals.filter((v) => v !== null && v !== undefined && v !== '');
    const d = [...new Set(nn)];
    info[k] = { nonNull: nn.length, of: vals.length, distinct: d.length, values: d.length <= 20 ? d : d.slice(0, 20) };
  }
  report.corpusFieldInfo = info;
  console.log('\n  field information content:');
  for (const [k, v] of Object.entries(info)) {
    console.log(`    ${k}: nonNull ${v.nonNull}/${v.of}, distinct ${v.distinct}${v.distinct <= 12 ? ' → ' + JSON.stringify(v.values) : ''}`);
  }
}

// ── 3c · plu_sp_vigente — the "planeamiento VIGENTE" layer. Its GetFeature
//         threw in step 2; read the WHOLE error, then try WMS GetFeatureInfo
//         style fallbacks rather than declaring it absent. UNKNOWN ≠ NO.
console.log('\n== 3c · plu_sp_vigente ==');
report.vigente = {};
for (const attempt of [
  { tag: 'plain', extra: {} },
  { tag: 'gml32', extra: { outputFormat: 'application/gml+xml; version=3.2' } },
  { tag: 'count5', extra: { count: 5 } },
  { tag: 'hits', extra: { resultType: 'hits' } },
]) {
  const url =
    `${GEOSERVER_ROOT}/SIT_USU_PLU_CARM/wfs?` +
    qs({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: 'SIT_USU_PLU_CARM:plu_sp_vigente',
      ...(attempt.extra.outputFormat || attempt.extra.resultType ? {} : { outputFormat: 'application/json' }),
      ...attempt.extra,
    });
  try {
    const r = await politeFetch(url, { ...O, tag: 'vig-' + attempt.tag, timeout: 120_000 });
    const t = r.buf.toString('utf8');
    const exc = /ExceptionReport/i.test(t);
    report.vigente[attempt.tag] = {
      status: r.status,
      exception: exc,
      // ⛔ READ THE WHOLE ERROR STRING
      body: exc ? t.replace(/\s+/g, ' ').slice(0, 1500) : t.slice(0, 400),
    };
    console.log(`  ${attempt.tag}: HTTP ${r.status} ${exc ? 'EXCEPTION' : 'ok'}`);
    if (exc) console.log(`      ${t.replace(/\s+/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 500)}`);
  } catch (e) {
    report.vigente[attempt.tag] = { error: String(e.message).slice(0, 1200) };
    console.log(`  ${attempt.tag}: ERROR ${String(e.message).slice(0, 300)}`);
  }
}

// ── 3d · SCHEMA universe vs CORPUS universe — reconcile, do not silently pick.
console.log('\n== 3d · universe reconciliation ==');
{
  const step2 = JSON.parse(
    (await import('node:fs')).readFileSync(new URL('./out/02-which-layer-is-current.json', import.meta.url), 'utf8')
  );
  const step1 = JSON.parse(
    (await import('node:fs')).readFileSync(new URL('./out/01-schema-and-validity.json', import.meta.url), 'utf8')
  );
  const corpusMunis = new Set(report.corpus.records.map((r) => r.Municipio).filter(Boolean));
  const zeMunis = new Set(step1.enumeration['SIT_USU_PLA_URB_CARM:plu_ze_37_mun_uso_suelo'].municipalities);
  const inspireMunis = new Set(step2.rivalExtent['SIT_USU_PLU_CARM:sitmurcia_plu_ze'].municipalities);

  const zoned = [...corpusMunis].filter((m) => zeMunis.has(m)).sort();
  const unzoned = [...corpusMunis].filter((m) => !zeMunis.has(m)).sort();
  const orphan = [...zeMunis].filter((m) => !corpusMunis.has(m)).sort();

  // ⛔ ASSERT THE DECOMPOSITION SUMS.
  assertSums('CORPUS 45 = zoned + unzoned', corpusMunis.size, { zoned: zoned.length, unzoned: unzoned.length });

  report.reconciliation = {
    CORPUS_universe: {
      count: corpusMunis.size,
      question: 'How many municipalities does the regional planning instrument register govern?',
      source: 'SIT_USU_PLU_CARM:sitmurcia_plu_sp — one polygon per municipal term, carrying its instrument',
    },
    SCHEMA_universe: {
      count: zeMunis.size,
      question: 'How many municipalities does the zoning service actually CARRY zoning geometry for?',
      source: 'SIT_USU_PLA_URB_CARM:plu_ze_37_mun_uso_suelo, distinct Municipio',
    },
    INSPIRE_view_universe: {
      count: inspireMunis.size,
      question: 'How many does the INSPIRE-harmonised HILUCS view carry? (same content, second workspace)',
      source: 'SIT_USU_PLU_CARM:sitmurcia_plu_ze',
    },
    LAYER_NAME_claim: {
      count: 37,
      question: 'What did the publisher NAME the layer for? — a CLAIM, not a measurement',
      source: 'the literal string "37mun" in plu_ze_37_mun_uso_suelo / sg_plu_ze_37mun / clases_plu_ze_37mun',
    },
    zonedMunicipalities: zoned,
    unzonedMunicipalities: unzoned,
    orphanZonedNotInCorpus: orphan,
  };
  console.log(`  CORPUS (instrument governs)      : ${corpusMunis.size}`);
  console.log(`  SCHEMA (service carries zoning)  : ${zeMunis.size}`);
  console.log(`  INSPIRE view                     : ${inspireMunis.size}`);
  console.log(`  LAYER NAME claims                : 37  ⚠ a claim, contradicted by the data`);
  console.log(`  → ${zoned.length} zoned, ${unzoned.length} NOT zoned in the service`);
  console.log(`  NOT ZONED: ${unzoned.join(', ')}`);
  if (orphan.length) console.log(`  ⚠ ORPHANS (zoned but absent from corpus layer): ${orphan.join(', ')}`);
}

writeOut('03-universes-and-currency.json', report);
console.log('\nSTEP 3 done.');
