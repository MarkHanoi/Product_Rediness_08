// §MURCIA-ENVELOPE-MAX · STEP 1 — SCHEMA, ENUMERATION, VALIDITY
//
// Order matters and is NOT negotiable: VALIDITY BEFORE MEASUREMENT.
// Murcia publishes `f_fin` and (per brief) may hold superseded editions in
// separate layers. If we measure a superseded layer every downstream figure is
// void, so this step establishes WHICH LAYER IS CURRENT and states HOW.
//
// ⚠ Absence of a flag is not evidence of currency, and presence can be evidence
// against it (Aragón `fiab_geom`; Balears `DFIVIGEN`). So we do not trust a
// field name — we count its DISTINCT VALUES and its INFORMATION CONTENT.

import { politeFetch, wfsJson, proveFilterApplied, writeOut, WFS, WS, GEOSERVER_ROOT, qs, truncationSuspect } from './lib.mjs';

const REFRESH = process.argv.includes('--refresh');
const O = { refresh: REFRESH };

const report = { step: 1, measuredAt: new Date().toISOString(), service: WFS, notes: [] };

// ─────────────────────────────────────────────────────────────────────────────
// 1a · WHAT DOES THE SERVER ACTUALLY SERVE — all workspaces, not just ours.
//      A superseded edition living in a SEPARATE LAYER would show up here.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n== 1a · GeoServer inventory ==');
{
  const caps = await politeFetch(
    `${WFS}?service=WFS&version=2.0.0&request=GetCapabilities`,
    O
  );
  const xml = caps.buf.toString('utf8');
  const names = [...xml.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]).filter((n) => n.includes(':'));
  report.workspaceLayers = [...new Set(names)].sort();
  console.log(`  workspace ${WS}: ${report.workspaceLayers.length} feature types`);

  // The GLOBAL capabilities doc — every workspace on the box. This is how we
  // look for a rival/older planning workspace rather than assuming there is none.
  const g = await politeFetch(`${GEOSERVER_ROOT}/wfs?service=WFS&version=2.0.0&request=GetCapabilities`, {
    ...O,
    timeout: 180_000,
    tag: 'global-caps',
  });
  const gx = g.buf.toString('utf8');
  const all = [...new Set([...gx.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]).filter((n) => n.includes(':')))];
  report.globalLayerCount = all.length;
  report.globalPlanningLayers = all.filter((n) => /plu|urban|planea|clasific|ze_|ordena/i.test(n)).sort();
  report.globalWorkspaces = [...new Set(all.map((n) => n.split(':')[0]))].sort();
  console.log(`  server-wide: ${all.length} layers across ${report.globalWorkspaces.length} workspaces`);
  console.log(`  planning-ish layers server-wide: ${report.globalPlanningLayers.length}`);
  for (const l of report.globalPlanningLayers) console.log(`    · ${l}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1b · SCHEMA of every layer in the planning workspace — DERIVED, NOT ASSUMED.
//      (Balears' assumed abbreviations collided with USE CLASSES. We read.)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n== 1b · DescribeFeatureType (derived, not assumed) ==');
report.schemas = {};
for (const layer of report.workspaceLayers) {
  const r = await politeFetch(
    `${WFS}?${qs({ service: 'WFS', version: '2.0.0', request: 'DescribeFeatureType', typeNames: layer })}`,
    O
  );
  const xml = r.buf.toString('utf8');
  if (/ExceptionReport/i.test(xml)) {
    report.schemas[layer] = { error: xml.slice(0, 500) };
    console.log(`  ${layer}: EXCEPTION`);
    continue;
  }
  const fields = [...xml.matchAll(/<xsd:element[^>]*name="([^"]+)"[^>]*type="([^"]+)"/g)].map((m) => ({
    name: m[1],
    type: m[2],
  }));
  report.schemas[layer] = { fields };
  console.log(`  ${layer}: ${fields.map((f) => f.name).join(', ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1c · NEGATIVE CONTROL — prove the service APPLIES CQL before trusting counts.
//      HTTP 200 is not an applied filter.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n== 1c · filter-applied negative control ==');
report.filterProofs = [];
for (const layer of ['plu_clasific_tipos_urbano', 'plu_clasific_tipos_urbanizable', 'plu_ze_37_mun_uso_suelo']) {
  const full = `${WS}:${layer}`;
  if (!report.workspaceLayers.includes(full)) continue;
  const fieldNames = (report.schemas[full]?.fields || []).map((f) => f.name);
  const key = fieldNames.find((f) => /^municipio$/i.test(f)) || fieldNames.find((f) => /municipio/i.test(f));
  if (!key) {
    report.filterProofs.push({ typeName: full, error: 'no municipio-like field' });
    continue;
  }
  try {
    const p = await proveFilterApplied(full, key);
    report.filterProofs.push(p);
    console.log(
      `  ${layer}: total=${p.total} impossible-filter=${p.impossible} → filterApplied=${p.filterApplied}` +
        (truncationSuspect(p.total) ? '  ⚠ TRUNCATION SUSPECT' : '')
    );
    if (!p.filterApplied) report.notes.push(`⛔ ${full}: CQL NOT APPLIED — counts void`);
  } catch (e) {
    report.filterProofs.push({ typeName: full, error: String(e.message).slice(0, 800) });
    console.log(`  ${layer}: ERROR ${String(e.message).slice(0, 200)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1d · ENUMERATE MUNICIPALITIES — per layer, so the universes stay separate.
//      SCHEMA universe (what the service carries) vs CORPUS universe (what the
//      instrument governs) must be NAMED, not silently reconciled.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n== 1d · municipality enumeration, per layer ==');
report.enumeration = {};
for (const full of report.workspaceLayers) {
  const fieldNames = (report.schemas[full]?.fields || []).map((f) => f.name);
  const key = fieldNames.find((f) => /^municipio$/i.test(f)) || fieldNames.find((f) => /municipio|termino|tm$/i.test(f));
  if (!key) continue;
  try {
    const j = await wfsJson(full, { propertyName: key, count: 200000 }, O);
    const vals = j.features.map((f) => f.properties[key]).filter((v) => v !== null && v !== undefined && v !== '');
    const distinct = [...new Set(vals)].sort();
    report.enumeration[full] = {
      keyField: key,
      featureCount: j.features.length,
      numberMatched: j.numberMatched ?? null,
      numberReturned: j.numberReturned ?? null,
      distinctMunicipalities: distinct.length,
      truncationSuspect: truncationSuspect(j.features.length),
      municipalities: distinct,
    };
    console.log(
      `  ${full}: ${j.features.length} features (matched ${j.numberMatched}) → ${distinct.length} distinct "${key}"` +
        (truncationSuspect(j.features.length) ? '  ⚠ TRUNCATION SUSPECT' : '')
    );
  } catch (e) {
    report.enumeration[full] = { keyField: key, error: String(e.message).slice(0, 800) };
    console.log(`  ${full}: ERROR ${String(e.message).slice(0, 200)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1e · VALIDITY — f_fin / suspension fields. Count DISTINCT VALUES: a field
//      with one distinct value carries ZERO information whatever its name says.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n== 1e · validity fields — information content, not presence ==');
report.validity = {};
for (const full of report.workspaceLayers) {
  const fields = report.schemas[full]?.fields || [];
  const vfields = fields
    .map((f) => f.name)
    .filter((n) => /f_fin|f_ini|fecha|vigen|suspend|aprob|estado|situacion|version|edicion/i.test(n));
  if (!vfields.length) continue;
  try {
    const j = await wfsJson(full, { propertyName: vfields.join(','), count: 200000 }, O);
    const per = {};
    for (const vf of vfields) {
      const vals = j.features.map((f) => f.properties[vf]);
      const nonNull = vals.filter((v) => v !== null && v !== undefined && v !== '');
      const distinct = [...new Set(nonNull)];
      per[vf] = {
        rows: vals.length,
        nonNull: nonNull.length,
        nonNullPct: vals.length ? +((100 * nonNull.length) / vals.length).toFixed(2) : null,
        distinctCount: distinct.length,
        sampleDistinct: distinct.slice(0, 25),
        // ⚠ one distinct value on 100% of rows = ZERO information (Balears DFIVIGEN)
        informationBearing: distinct.length > 1,
      };
    }
    report.validity[full] = { fields: vfields, rows: j.features.length, per };
    for (const vf of vfields) {
      const p = per[vf];
      console.log(
        `  ${full}.${vf}: nonNull ${p.nonNull}/${p.rows} (${p.nonNullPct}%), distinct=${p.distinctCount} → ${p.informationBearing ? 'informative' : '⚠ ZERO INFORMATION'}`
      );
      if (p.distinctCount <= 6) console.log(`      values: ${JSON.stringify(p.sampleDistinct)}`);
    }
  } catch (e) {
    report.validity[full] = { fields: vfields, error: String(e.message).slice(0, 800) };
    console.log(`  ${full}: VALIDITY ERROR ${String(e.message).slice(0, 200)}`);
  }
}

writeOut('01-schema-and-validity.json', report);
console.log('\nSTEP 1 done.');
