// §MURCIA-ENVELOPE-MAX · STEP 2 — WHICH LAYER IS CURRENT
//
// ⛔ THIS CAN VOID EVERYTHING. Step 1 found a RIVAL WORKSPACE:
//      SIT_USU_PLA_URB_CARM  — plu_ze_37_mun_uso_suelo, plu_clasific_tipos_*
//      SIT_USU_PLU_CARM      — sitmurcia_plu_ze, sitmurcia_plu_sp/sr, plu_sp_VIGENTE
//   Two workspaces serving the same concept (ZE = zonas de edificación) on the
//   same box is the textbook "superseded edition in a separate layer" shape.
//
// We do NOT resolve it by name. "vigente" in a layer name is a CLAIM, not
// evidence — the same class of mistake as reading Navarra's `41SueloU` as a
// planning layer because its title said "Suelo". We resolve it with:
//   (i)   independent metadata (GeoServer layer abstract / keywords / title)
//   (ii)  extent — which one covers more municipalities
//   (iii) content — do they disagree on the same municipality
//   (iv)  the ficha links — do both point at the same document channel

import { politeFetch, wfsJson, wfsCount, writeOut, GEOSERVER_ROOT, qs, truncationSuspect } from './lib.mjs';

const REFRESH = process.argv.includes('--refresh');
const O = { refresh: REFRESH };
const report = { step: 2, measuredAt: new Date().toISOString(), notes: [] };

const RIVALS = [
  'SIT_USU_PLU_CARM:sitmurcia_plu_ze',
  'SIT_USU_PLU_CARM:sitmurcia_plu_sp',
  'SIT_USU_PLU_CARM:sitmurcia_plu_sr',
  'SIT_USU_PLU_CARM:plu_sp_vigente',
  'URB_PLU_ITUPL1_CARM:nnss_usos',
];

// ── 2a · schema of the rivals ────────────────────────────────────────────────
console.log('\n== 2a · rival-workspace schemas ==');
report.rivalSchemas = {};
for (const full of RIVALS) {
  const ws = full.split(':')[0];
  const url = `${GEOSERVER_ROOT}/${ws}/wfs?${qs({ service: 'WFS', version: '2.0.0', request: 'DescribeFeatureType', typeNames: full })}`;
  const r = await politeFetch(url, O);
  const xml = r.buf.toString('utf8');
  if (/ExceptionReport/i.test(xml)) {
    report.rivalSchemas[full] = { error: xml.slice(0, 600) };
    console.log(`  ${full}: EXCEPTION`);
    continue;
  }
  const fields = [...xml.matchAll(/<xsd:element[^>]*name="([^"]+)"[^>]*type="([^"]+)"/g)].map((m) => ({ name: m[1], type: m[2] }));
  report.rivalSchemas[full] = { fields };
  console.log(`  ${full}: ${fields.map((f) => f.name).join(', ')}`);
}

// ── 2b · INDEPENDENT metadata: the GeoServer layer Title/Abstract/Keywords.
//         This is authored by the publisher, separate from the layer NAME.
console.log('\n== 2b · independent metadata (Title / Abstract / Keywords) ==');
report.layerMetadata = {};
for (const ws of ['SIT_USU_PLA_URB_CARM', 'SIT_USU_PLU_CARM', 'URB_PLU_ITUPL1_CARM']) {
  const r = await politeFetch(`${GEOSERVER_ROOT}/${ws}/wfs?service=WFS&version=2.0.0&request=GetCapabilities`, {
    ...O,
    tag: 'ws-caps-' + ws,
  });
  const xml = r.buf.toString('utf8');
  for (const m of xml.matchAll(/<FeatureType[^>]*>([\s\S]*?)<\/FeatureType>/g)) {
    const blk = m[1];
    const name = (blk.match(/<Name>([^<]*)<\/Name>/) || [])[1];
    if (!name) continue;
    report.layerMetadata[name] = {
      title: (blk.match(/<Title>([^<]*)<\/Title>/) || [])[1] || null,
      abstract: (blk.match(/<Abstract>([\s\S]*?)<\/Abstract>/) || [])[1] || null,
      keywords: [...blk.matchAll(/<ows:Keyword>([^<]*)<\/ows:Keyword>/g)].map((k) => k[1]),
    };
  }
}
for (const [n, m] of Object.entries(report.layerMetadata)) {
  if (!/plu|ze_|nnss|clasific/i.test(n)) continue;
  console.log(`  ${n}`);
  console.log(`      title    : ${m.title}`);
  if (m.abstract) console.log(`      abstract : ${String(m.abstract).replace(/\s+/g, ' ').slice(0, 300)}`);
  if (m.keywords.length) console.log(`      keywords : ${m.keywords.join(' | ')}`);
}

// ── 2c · EXTENT — municipality coverage of each rival ────────────────────────
console.log('\n== 2c · extent: municipalities per rival layer ==');
report.rivalExtent = {};
for (const full of RIVALS) {
  const ws = full.split(':')[0];
  const fields = (report.rivalSchemas[full]?.fields || []).map((f) => f.name);
  const key = fields.find((f) => /^municipio$/i.test(f)) || fields.find((f) => /municipio|munic|tm|termino/i.test(f));
  const base = `${GEOSERVER_ROOT}/${ws}/wfs`;
  try {
    const url =
      base +
      '?' +
      qs({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: full,
        outputFormat: 'application/json',
        count: 200000,
        ...(key ? { propertyName: key } : {}),
      });
    const r = await politeFetch(url, { ...O, timeout: 180_000 });
    const t = r.buf.toString('utf8');
    if (/ExceptionReport/i.test(t)) throw new Error(t.slice(0, 900));
    const j = JSON.parse(t);
    const vals = key ? j.features.map((f) => f.properties[key]).filter(Boolean) : [];
    const distinct = [...new Set(vals)].sort();
    report.rivalExtent[full] = {
      keyField: key || null,
      features: j.features.length,
      numberMatched: j.numberMatched ?? null,
      distinctMunicipalities: distinct.length,
      municipalities: distinct,
      truncationSuspect: truncationSuspect(j.features.length),
    };
    console.log(`  ${full}: ${j.features.length} features → ${distinct.length} municipalities (key=${key})`);
  } catch (e) {
    report.rivalExtent[full] = { keyField: key || null, error: String(e.message).slice(0, 900) };
    console.log(`  ${full}: ERROR ${String(e.message).slice(0, 260)}`);
  }
}

// ── 2d · the ficha channel on the CURRENT candidate ──────────────────────────
console.log('\n== 2d · ficha link shape on the primary workspace ==');
{
  const j = await wfsJson(
    'SIT_USU_PLA_URB_CARM:plu_ze_37_mun_uso_suelo',
    { propertyName: 'Municipio,Ambito,Enlace_ficha', count: 200000 },
    O
  );
  const rows = j.features.map((f) => f.properties);
  const links = rows.map((r) => r.Enlace_ficha).filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
  const distinct = [...new Set(links)];
  report.fichaChannel = {
    rows: rows.length,
    withLink: links.length,
    withLinkPct: +((100 * links.length) / rows.length).toFixed(2),
    distinctLinks: distinct.length,
    samples: distinct.slice(0, 8),
    hosts: [...new Set(distinct.map((u) => { try { return new URL(u).host; } catch { return '<<UNPARSABLE:' + String(u).slice(0, 60) + '>>'; } }))],
  };
  console.log(`  rows=${rows.length} withLink=${links.length} (${report.fichaChannel.withLinkPct}%) distinct=${distinct.length}`);
  console.log(`  hosts: ${report.fichaChannel.hosts.join(', ')}`);
  report.fichaChannel.samples.forEach((s) => console.log(`    · ${s}`));
}

writeOut('02-which-layer-is-current.json', report);
console.log('\nSTEP 2 done.');
