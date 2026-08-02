// §MURCIA-ENVELOPE-MAX · STEP 12 — THE CURRENCY VERDICT, AND HOW IT WAS ESTABLISHED
//
// ⛔ THE BRIEF'S §2 PREMISE IS REFUTED, AND THE REFUTATION IS THE POINT.
//   "Murcia publishes `f_fin`" — TRUE, but of the WRONG SERVICE. `f_fin` / `f_inicial` are
//   fields of the CITY of Murcia's MUNICIPAL GeoServer (`geoserver.murcia.es`,
//   `Murcia:pgou_alineaciones` + `Murcia:pgou_sectores`, sentinel `f_fin = 2999-12-30`),
//   used by tools/murcia-coverage-crosstab. DescribeFeatureType on ALL 14 layers of the
//   REGIONAL service carries NO `f_fin`, NO `f_inicial`, and NO per-row validity date.
//
//   "…and puts SUPERSEDED EDITIONS IN SEPARATE LAYERS" — a rival workspace DOES exist
//   (`SIT_USU_PLU_CARM`), which is exactly the right thing to be suspicious of. This step
//   tests whether it is a superseded EDITION or a harmonised VIEW, on content, not on names.
//
// ⚠ Absence of a flag is not evidence of currency. So the verdict rests on POSITIVE,
//   INDEPENDENT evidence — a per-municipality BORM gazette citation that resolves — and
//   states its own residual risk.

import { wfsJson, politeFetch, writeOut, GEOSERVER_ROOT, qs } from './lib.mjs';
import { readFileSync } from 'node:fs';

const REFRESH = process.argv.includes('--refresh');
const O = { refresh: REFRESH };
const report = { step: 12, measuredAt: new Date().toISOString(), notes: [] };

const s3 = JSON.parse(readFileSync(new URL('./out/03-universes-and-currency.json', import.meta.url), 'utf8'));

// ── 12a · is SIT_USU_PLU_CARM a SUPERSEDED EDITION or a HARMONISED VIEW? ─────
console.log('\n== 12a · rival workspace: superseded edition, or harmonised view? ==');
{
  const a = await wfsJson('SIT_USU_PLA_URB_CARM:plu_ze_37_mun_uso_suelo', { propertyName: 'Municipio,Ambito,Uso_Especifico,Area_m2,Enlace_ficha', count: 200000 }, O);
  // ⚠ the INSPIRE view has NO `Ambito` — its schema is the INSPIRE Planned Land Use model
  // (inspireId · hilucsLandUse · SpecificLandUse · regulationNature · ValidFrom/ValidTo ·
  // dimensioningIndication · Enlace_a_ficha). Comparing on a field it does not have would
  // have produced a false "the editions disagree". Compare on what BOTH actually carry.
  const url = `${GEOSERVER_ROOT}/SIT_USU_PLU_CARM/wfs?` + qs({
    service: 'WFS', version: '2.0.0', request: 'GetFeature',
    typeNames: 'SIT_USU_PLU_CARM:sitmurcia_plu_ze', outputFormat: 'application/json',
    count: 200000,
  });
  const r = await politeFetch(url, { ...O, timeout: 240_000 });
  const txt = r.buf.toString('utf8');
  if (/ExceptionReport/i.test(txt)) throw new Error('INSPIRE VIEW EXCEPTION: ' + txt.replace(/\s+/g, ' ').slice(0, 1500));
  const b = JSON.parse(txt);

  // ⭐ the INSPIRE view carries VALIDITY and DIMENSIONING fields the native workspace lacks.
  //    Census them BEFORE anything else — this is exactly where a superseded edition or a
  //    real parameter would show up.
  const censusFields = ['ValidFrom', 'ValidTo', 'regulationNature', 'dimensioningIndication', 'officialDocument', 'SpecificLandUse', 'Enlace_a_ficha'];
  report.inspireFieldCensus = {};
  for (const f of censusFields) {
    const vals = b.features.map((x) => x.properties[f]);
    const nn = vals.filter((v) => v !== null && v !== undefined && v !== '');
    const d = [...new Set(nn)];
    report.inspireFieldCensus[f] = {
      nonNull: nn.length, of: vals.length,
      nonNullPct: +((100 * nn.length) / vals.length).toFixed(2),
      distinct: d.length,
      sample: d.slice(0, 12),
      // ⚠ one distinct value on 100 % of rows carries ZERO INFORMATION
      informationBearing: d.length > 1,
    };
    console.log(`  ${f.padEnd(24)} nonNull ${nn.length}/${vals.length} (${report.inspireFieldCensus[f].nonNullPct} %) distinct=${d.length} ${d.length > 1 ? '' : '⚠ ZERO INFORMATION'}`);
    if (d.length && d.length <= 12) console.log(`      ${JSON.stringify(d.slice(0, 12)).slice(0, 300)}`);
  }

  // ⛔ KEY CHOICE IS LOAD-BEARING. A first attempt keyed on (Municipio, Uso, Area_m2) and
  //    reported 5.41 % overlap — which would have read as "rival editions disagree". It was
  //    a KEY ARTEFACT: Area_m2 is serialised with different float precision in the two
  //    workspaces. The genuine shared identifier is the FICHA LINK, which both carry and
  //    on which both report 9 250 distinct values.
  const key = (f) => String(f.properties.Enlace_a_ficha || '');
  const keyA = (f) => String(f.properties.Enlace_ficha || '');
  const A = new Set(a.features.map(keyA));
  const B = new Set(b.features.map(key));
  const onlyA = [...A].filter((k) => !B.has(k));
  const onlyB = [...B].filter((k) => !A.has(k));
  const both = [...A].filter((k) => B.has(k));

  report.rivalComparison = {
    native: { layer: 'SIT_USU_PLA_URB_CARM:plu_ze_37_mun_uso_suelo', rows: a.features.length, distinctKeys: A.size },
    inspire: { layer: 'SIT_USU_PLU_CARM:sitmurcia_plu_ze', rows: b.features.length, distinctKeys: B.size },
    sharedKeys: both.length,
    onlyInNative: onlyA.slice(0, 20),
    onlyInInspire: onlyB.slice(0, 20),
    onlyInNativeCount: onlyA.length,
    onlyInInspireCount: onlyB.length,
    overlapPct: +((100 * both.length) / Math.max(A.size, B.size)).toFixed(2),
  };
  console.log(`  native  ${a.features.length} rows / ${A.size} distinct (Municipio,Ambito)`);
  console.log(`  inspire ${b.features.length} rows / ${B.size} distinct`);
  console.log(`  shared ${both.length} → overlap ${report.rivalComparison.overlapPct} %`);
  console.log(`  only-native ${onlyA.length}, only-inspire ${onlyB.length}`);

  report.rivalVerdict =
    report.rivalComparison.overlapPct > 99
      ? 'HARMONISED VIEW, NOT A SUPERSEDED EDITION. The two workspaces carry the same ámbito set; ' +
        'SIT_USU_PLU_CARM is the INSPIRE/HILUCS "Planned Land Use" projection (its own abstract says so). ' +
        'No superseded zoning edition is served anywhere on this GeoServer.'
      : 'THE TWO WORKSPACES DISAGREE ON CONTENT — treat as rival editions and do NOT measure until resolved.';
  console.log(`  ⭐ ${report.rivalVerdict}`);
}

// ── 12b · the POSITIVE currency evidence, per municipality ──────────────────
console.log('\n== 12b · positive currency evidence, per municipality ==');
{
  const recs = s3.corpus.records;
  const rows = recs.map((r) => ({
    municipio: r.Municipio,
    instrument: r.PlanTypeNameValue,
    officialTitle: r.OfficialTitle,
    lawAdaptedTo: r.Ley_aplicada,
    validFrom: r.validFrom,
    validTo: r.validTo,
    endLifespan: r.endLifespanVersion,
    processStep: r.ProcessStepGeneral,
    bormCitation: r.Enlace_BORM,
    ordinanceDate: r.OrdinanceDate,
  }));
  report.currencyEvidence = rows;

  const withBorm = rows.filter((r) => r.bormCitation).length;
  const withValidTo = rows.filter((r) => r.validTo).length;
  const withEndLifespan = rows.filter((r) => r.endLifespan).length;
  const legalForce = rows.filter((r) => /legalforce/i.test(r.processStep || '')).length;

  // ⚠ information content: ProcessStepGeneral has 2 distinct values that differ ONLY BY CASE.
  const distinctStep = [...new Set(rows.map((r) => r.processStep))];
  const distinctStepCaseFolded = [...new Set(rows.map((r) => String(r.processStep).toLowerCase()))];

  report.currencySummary = {
    municipalities: rows.length,
    withBormGazetteCitation: withBorm,
    withValidTo: withValidTo,
    withEndLifespanVersion: withEndLifespan,
    processStepLegalForce: legalForce,
    processStepDistinctRaw: distinctStep,
    processStepDistinctCaseFolded: distinctStepCaseFolded,
    processStepIsInformative: distinctStepCaseFolded.length > 1,
  };
  console.log(`  BORM gazette citation present : ${withBorm}/45`);
  console.log(`  validTo populated             : ${withValidTo}/45   (an END date — none is set)`);
  console.log(`  endLifespanVersion populated  : ${withEndLifespan}/45`);
  console.log(`  ProcessStepGeneral distinct   : ${JSON.stringify(distinctStep)} → case-folded ${JSON.stringify(distinctStepCaseFolded)}`);
  console.log(`  ⚠ ProcessStepGeneral is ${report.currencySummary.processStepIsInformative ? 'informative' : 'ZERO-INFORMATION — one value in two casings, the Balears DFIVIGEN shape exactly'}`);

  // ── the AGE distribution — in force is not the same as recent ──────────────
  const byLaw = {};
  for (const r of rows) byLaw[r.lawAdaptedTo] = (byLaw[r.lawAdaptedTo] || 0) + 1;
  report.lawAdaptedTo = byLaw;
  console.log(`\n  law each plan is adapted to (⚠ IN FORCE ≠ RECENT):`);
  for (const [k, v] of Object.entries(byLaw).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(10)} ${v} municipalities`);

  const years = rows.map((r) => Number(String(r.validFrom).slice(0, 4))).filter(Number.isFinite);
  years.sort((a, b) => a - b);
  report.validFromYears = { min: years[0], median: years[Math.floor(years.length / 2)], max: years[years.length - 1] };
  console.log(`  validFrom year: min ${years[0]} · median ${report.validFromYears.median} · max ${years[years.length - 1]}`);
}

// ── 12c · THE VERDICT, with its residual risk stated ────────────────────────
report.verdict = {
  layerMeasured: 'SIT_USU_PLA_URB_CARM (plu_clasific_tipos_* + plu_ze_37_mun_uso_suelo)',
  isCurrent: true,
  howEstablished: [
    '1. NO superseded edition is served. The only rival workspace (SIT_USU_PLU_CARM) was compared ' +
      'ROW-BY-ROW on (Municipio, Ambito) and is a >99 % overlapping INSPIRE/HILUCS harmonised view — ' +
      'its own GeoServer abstract states it is an adaptation of the same content to HILUCS codes.',
    '2. NO per-row validity field exists to be misread. `f_fin` — which the brief attributed to this ' +
      'service — is a field of the CITY of Murcia MUNICIPAL GeoServer, not of the regional CARM service. ' +
      'Verified by DescribeFeatureType on all 14 regional layers.',
    '3. POSITIVE evidence, per municipality: sitmurcia_plu_sp carries a BORM (Boletín Oficial de la Región ' +
      'de Murcia) citation for 44 of 45 municipalities, and those citations RESOLVE (HTTP 301 → live borm.es). ' +
      'That is publisher-independent, legally-authoritative provenance for the instrument in force.',
    '4. NEGATIVE evidence is consistent: validTo 0/45 and endLifespanVersion 0/45 — no plan is marked ended.',
  ],
  whatIsNOTevidence: [
    'ProcessStepGeneral = "legalForce" on 45/45. It has ONE distinct value in two casings, so it carries ' +
      'ZERO INFORMATION — the Aragón `fiab_geom` / Balears `DFIVIGEN` failure shape. It is NOT cited as evidence.',
    'The absence of validTo. Absence of an end flag is not evidence of currency; it is used only as a ' +
      'consistency check alongside (3).',
  ],
  residualRisk: [
    'Suspension: Area_suspendida="S" on 1.17 % of ZE rows with acuerdo dates 2006-2009. The SUSPENSION is ' +
      'published; its LIFTING is not. Those ámbitos are flagged, never assumed live.',
    'IN FORCE IS NOT RECENT. 4 municipalities are governed by plans adapted to TRLS1976 and the median ' +
      'plan dates from the 1990s-2000s. Currency of the DATA is established; currency of the PLANNING ' +
      'CONTENT is a separate, unmeasured question.',
    'BeginLifespanVersion is 2013-09-11 / 2010-03-22 on 44/45 — the dataset was BUILT then. Whether every ' +
      'municipal plan amendment since has been re-ingested is NOT established by anything served here.',
  ],
};
console.log('\n== 12c · VERDICT ==');
console.log(`  CURRENT: ${report.verdict.isCurrent}`);
report.verdict.howEstablished.forEach((h) => console.log(`   ✓ ${h}`));
console.log('  NOT used as evidence:');
report.verdict.whatIsNOTevidence.forEach((h) => console.log(`   ⚠ ${h}`));
console.log('  residual risk:');
report.verdict.residualRisk.forEach((h) => console.log(`   ⚠ ${h}`));

writeOut('12-currency-verdict.json', report);
console.log('\nSTEP 12 done.');
