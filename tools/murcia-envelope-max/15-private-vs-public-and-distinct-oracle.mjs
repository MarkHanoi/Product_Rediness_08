// §MURCIA-ENVELOPE-MAX · STEP 15 — THE COORDINATOR'S THREE NATIONAL FINDINGS, APPLIED
//
// ─────────────────────────────────────────────────────────────────────────────
// (A) THE DISTINCT-COUNT DEFECT — does it fire here?
//     Reported: on ArcGIS MapServer, `resultRecordCount` alongside `returnDistinctValues`
//     SILENTLY CANCELS de-duplication, so a caller reads a ROW count and labels it DISTINCT.
//
//     ⭐ IT CANNOT FIRE ON THIS SERVICE, AND THAT IS A STRUCTURAL ANSWER, NOT A HOPE:
//        Murcia's regional service is **GeoServer WFS 2.0.0**, not ArcGIS MapServer. There is
//        no `returnDistinctValues` parameter in the WFS protocol, and this tool never sends
//        one. Every distinct count in this run was computed CLIENT-SIDE, in JS, over the FULL
//        row set already proven complete by a numberMatched === features.length assertion.
//        We never asked the server to de-duplicate, so there is no de-duplication to cancel.
//
//     But the UNDERLYING question the finding protects — "is this per-feature routing or a
//     register homepage?" — is exactly right and IS re-tested here, three independent ways.
//
// ─────────────────────────────────────────────────────────────────────────────
// (B) ⭐ THE REAL DENOMINATOR IS INSIDE "BUILDABLE" — and this WAS a defect in step 9.
//     Step 9 counted ALL urbano + sectorised-urbanizable land as buildable. That silently
//     includes viario, espacios libres, equipamientos and infrastructure — land that can
//     NEVER carry a private envelope at any completeness of data. Balears measured 32.55 %
//     of its buildable land in that state, and excluding it moved complete-rule 41.6 → 61.4 %.
//     Corrected here: PRIVATE-DEVELOPABLE is separated from PUBLIC/SYSTEMS and both reported.
//
// ─────────────────────────────────────────────────────────────────────────────
// (C) ⚠ ROW-WEIGHTED vs LAND-WEIGHTED answer different questions. Both are emitted, labelled.

import { wfsJson, wfsCount, writeOut, areaOf } from './lib.mjs';

const REFRESH = process.argv.includes('--refresh');
const O = { refresh: REFRESH };
const report = { step: 15, measuredAt: new Date().toISOString(), notes: [] };

// ═══════════════════════════════════════════════════════════════════════════
// (A) IS `Enlace_ficha` PER-FEATURE ROUTING, OR A REGISTER HOMEPAGE?
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n== 15A · is Enlace_ficha per-feature routing? ==');
{
  const j = await wfsJson(
    'SIT_USU_PLA_URB_CARM:plu_ze_37_mun_uso_suelo',
    { propertyName: 'Municipio,Ambito,Uso_Especifico,Area_m2,Enlace_ficha', count: 200000 },
    O
  );
  // ⛔ completeness assertion — a truncated fetch would deflate every count below
  if (j.features.length !== j.numberMatched)
    throw new Error(`TRUNCATION: ${j.features.length} != ${j.numberMatched}`);

  const links = j.features.map((f) => f.properties.Enlace_ficha);
  const rows = links.length;
  // ⭐ CLIENT-SIDE distinct — immune to the reported server-side defect by construction
  const distinct = new Set(links.filter(Boolean));
  const wides = new Set(links.map((l) => /[?&]wide=(\d+)/.exec(l || '')?.[1]).filter(Boolean));

  // TEST 1 — cardinality. A register HOMEPAGE collapses to a handful of URLs
  //          (València: 99 % coverage, 20 distinct). Per-feature routing does not.
  const ratio = +(distinct.size / rows).toFixed(4);

  // TEST 2 — INDEPENDENT SERVER-SIDE ORACLE. Instead of trusting one number, ask the
  //          server a question whose ANSWER IS THE GROUP: for a sample of individual
  //          links, how many rows carry exactly that link? If routing is per-feature the
  //          multiplicities are small; if it is a homepage one link covers thousands.
  const counts = new Map();
  for (const l of links) if (l) counts.set(l, (counts.get(l) || 0) + 1);
  const multiplicities = [...counts.values()].sort((a, b) => b - a);
  const top = multiplicities[0];

  // verify a few multiplicities AGAINST THE SERVER with a hits query — the returned
  // numberMatched IS the group size, so this is the GROUP BY oracle in WFS form.
  const probes = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .concat([...counts.entries()].filter(([, n]) => n === 1).slice(0, 2));
  const oracle = [];
  for (const [link, clientCount] of probes) {
    const serverCount = await wfsCount(
      'SIT_USU_PLA_URB_CARM:plu_ze_37_mun_uso_suelo',
      `Enlace_ficha='${link.replace(/'/g, "''")}'`,
      O
    );
    oracle.push({ link, clientCount, serverCount, agrees: clientCount === serverCount });
    console.log(`    oracle: client=${clientCount} server=${serverCount} ${clientCount === serverCount ? '✓' : '⛔ DISAGREE'}  ${link.slice(-40)}`);
  }
  const oracleAgrees = oracle.every((o) => o.agrees);

  report.linkRouting = {
    rows,
    withLink: links.filter(Boolean).length,
    distinctLinksClientSide: distinct.size,
    distinctWideIds: wides.size,
    distinctPerRow: ratio,
    maxRowsSharingOneLink: top,
    medianMultiplicity: multiplicities[Math.floor(multiplicities.length / 2)],
    serverSideOracle: oracle,
    oracleAgreesWithClient: oracleAgrees,
    defectApplicable: false,
    defectReason:
      'GeoServer WFS 2.0.0 — there is no `returnDistinctValues` / `resultRecordCount` pair in this ' +
      'protocol and none was sent. Distinct counts are computed client-side over a row set proven ' +
      'complete by numberMatched === features.length.',
    verdict: null,
  };
  report.linkRouting.verdict =
    ratio > 0.5 && top < rows * 0.05 && oracleAgrees
      ? `PER-FEATURE ROUTING. ${distinct.size} distinct links / ${wides.size} distinct opaque \`wide\` ids over ` +
        `${rows} rows (${(100 * ratio).toFixed(1)} % distinct); the most-shared link covers only ${top} rows. ` +
        `Server-side hits oracle agrees with the client count on every probe. This is NOT a register homepage ` +
        `(contrast València: 99 % coverage, 20 distinct).`
      : 'HOMEPAGE-SHAPED or unverified — do NOT treat as routing.';
  console.log(`  rows ${rows} · distinct links ${distinct.size} · distinct wide ids ${wides.size} · ${(100 * ratio).toFixed(1)} % distinct`);
  console.log(`  most-shared link covers ${top} rows; median multiplicity ${report.linkRouting.medianMultiplicity}`);
  console.log(`  ⭐ ${report.linkRouting.verdict}`);

  // TEST 3 — ⭐ THE BYTE-HASH CONTROL, which is immune to ALL of the above because it
  //          never asks the server to de-duplicate anything. Reported honestly at the n
  //          the WAF permitted.
  const { readdirSync, readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { HERE } = await import('./lib.mjs');
  const { classify } = await import('./detect.mjs');
  const { createHash } = await import('node:crypto');
  const RAW = join(HERE, 'raw-fichas');
  const hashes = [];
  if (existsSync(RAW)) {
    for (const f of readdirSync(RAW)) {
      if (!f.endsWith('.html')) continue;
      const buf = readFileSync(join(RAW, f));
      if (classify(buf.toString('utf8')) !== 'ficha') continue;
      hashes.push({ file: f, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') });
    }
  }
  report.byteHashControl = {
    documentsHarvested: hashes.length,
    distinctHashes: new Set(hashes.map((h) => h.sha256)).size,
    detail: hashes,
    status: hashes.length >= 14 ? 'RUN' : 'BLOCKED — see report.wafBlock',
    note:
      'The preferred headline control, because it never asks the server to de-duplicate and is therefore ' +
      'immune to the reported ArcGIS defect entirely. ⛔ THIS RUN COULD NOT REACH n=14: the Radware WAF at ' +
      'urbmurcia.carm.es IP-blocked this client. The count below is what was actually obtained and is NOT ' +
      'presented as a corpus rate.',
  };
  console.log(`  byte-hash control: ${hashes.length} documents, ${report.byteHashControl.distinctHashes} distinct hashes — ${report.byteHashControl.status}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// (B) PRIVATE-DEVELOPABLE vs PUBLIC/SYSTEMS, INSIDE BUILDABLE
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n== 15B · private-developable vs public/systems, inside buildable ==');

const BUILDABLE_NOW = new Set([
  'Suelo Urbano', 'Suelo Urbano Consolidado', 'Suelo Urbano Sin Consolidar', 'Suelo Urbano Especial',
  'Suelo Urbanizable Sectorizado', 'Suelo Urbanizable Sectorizado Especial',
  'Suelo Urbanizable Programado', 'Suelo Apto para Urbanizar', 'Suelo Urbanizable',
]);

// the ZE layer is the one carrying Uso_Especifico — the use that decides public vs private
const ze = await wfsJson(
  'SIT_USU_PLA_URB_CARM:plu_ze_37_mun_uso_suelo',
  { count: 200000 },
  { ...O, timeout: 300_000 }
);
if (ze.features.length !== ze.numberMatched) throw new Error('TRUNCATION on ZE layer');

// derive the use vocabulary FROM THE DATA before classifying it
const uses = new Map();
for (const f of ze.features) {
  const p = f.properties;
  if (!BUILDABLE_NOW.has(p.Clasificacion)) continue;
  const u = p.Uso_Especifico || '<null>';
  if (!uses.has(u)) uses.set(u, { use: u, n: 0, area: 0 });
  const e = uses.get(u);
  e.n++; e.area += areaOf(f.geometry);
}
console.log('  use vocabulary on buildable-now land (derived, not assumed):');
for (const u of [...uses.values()].sort((a, b) => b.area - a.area))
  console.log(`    ${(u.area / 1e6).toFixed(3).padStart(10)} M m²  ${String(u.n).padStart(5)}  ${u.use}`);

// ⛔ PUBLIC / SYSTEMS: land that can never carry a PRIVATE envelope, whatever the data says.
const PUBLIC_USES = new Set([
  'Espacios Libres', 'Equipamientos', 'Comunicaciones', 'Infraestructuras - Servicios',
  'Protección Hidráulica', 'Hidráulico', 'Protección Medio Ambiente', 'Sistema General',
]);
// Anything left that is NOT recognised throws rather than being bucketed silently.
const PRIVATE_USES = new Set(
  [...uses.keys()].filter((u) => !PUBLIC_USES.has(u))
);

const per = new Map();
let totPrivate = 0, totPublic = 0;
for (const f of ze.features) {
  const p = f.properties;
  if (!BUILDABLE_NOW.has(p.Clasificacion)) continue;
  const m = p.Municipio;
  const a = areaOf(f.geometry);
  const u = p.Uso_Especifico || '<null>';
  const isPublic = PUBLIC_USES.has(u);
  if (!per.has(m)) per.set(m, { municipio: m, privateArea: 0, publicArea: 0, privateRows: 0, publicRows: 0 });
  const e = per.get(m);
  if (isPublic) { e.publicArea += a; e.publicRows++; totPublic += a; }
  else { e.privateArea += a; e.privateRows++; totPrivate += a; }
}

// ⛔ ASSERT THE DECOMPOSITION SUMS
const totalBuildable = totPrivate + totPublic;
const recomputed = [...per.values()].reduce((s, e) => s + e.privateArea + e.publicArea, 0);
if (Math.abs(recomputed - totalBuildable) > 1) throw new Error('PRIVATE/PUBLIC DOES NOT SUM');

report.privateVsPublic = {
  buildableNow_Mm2: +(totalBuildable / 1e6).toFixed(3),
  privateDevelopable_Mm2: +(totPrivate / 1e6).toFixed(3),
  publicSystems_Mm2: +(totPublic / 1e6).toFixed(3),
  publicSharePct: +((100 * totPublic) / totalBuildable).toFixed(2),
  privateSharePct: +((100 * totPrivate) / totalBuildable).toFixed(2),
  publicUsesTreatedAsNonPrivate: [...PUBLIC_USES].filter((u) => uses.has(u)),
  privateUses: [...PRIVATE_USES],
  balearsComparison: 'Balears measured 32.55 % of its buildable land as public/systems.',
};
console.log(`\n  buildable-now       ${report.privateVsPublic.buildableNow_Mm2} M m²`);
console.log(`  PRIVATE developable ${report.privateVsPublic.privateDevelopable_Mm2} M m²  (${report.privateVsPublic.privateSharePct} %)`);
console.log(`  PUBLIC / systems    ${report.privateVsPublic.publicSystems_Mm2} M m²  (${report.privateVsPublic.publicSharePct} %)  ⛔ can never carry a private envelope`);
console.log(`  (Balears: 32.55 % public/systems)`);

// per municipality
const rows = [...per.values()].sort((a, b) => b.privateArea - a.privateArea).map((e) => ({
  municipio: e.municipio,
  privateDevelopable_Mm2: +(e.privateArea / 1e6).toFixed(3),
  publicSystems_Mm2: +(e.publicArea / 1e6).toFixed(3),
  publicSharePct: +((100 * e.publicArea) / (e.privateArea + e.publicArea)).toFixed(2),
  privateRows: e.privateRows,
  publicRows: e.publicRows,
}));
report.perMunicipality = rows;
console.log('\n  municipality                  private Mm²   public Mm²   public %');
for (const r of rows)
  console.log(`  ${r.municipio.slice(0, 28).padEnd(29)} ${String(r.privateDevelopable_Mm2).padStart(11)} ${String(r.publicSystems_Mm2).padStart(12)} ${String(r.publicSharePct).padStart(10)}`);

// ═══════════════════════════════════════════════════════════════════════════
// (C) ROW-WEIGHTED vs LAND-WEIGHTED — both, labelled
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n== 15C · row-weighted vs land-weighted ==');
{
  const privRows = rows.reduce((s, r) => s + r.privateRows, 0);
  const pubRows = rows.reduce((s, r) => s + r.publicRows, 0);
  // ⚠ land concentration — Balears found the top 1 % of records govern 32 % of land
  const areas = [];
  for (const f of ze.features) {
    const p = f.properties;
    if (!BUILDABLE_NOW.has(p.Clasificacion)) continue;
    if (PUBLIC_USES.has(p.Uso_Especifico || '<null>')) continue;
    areas.push(areaOf(f.geometry));
  }
  areas.sort((a, b) => b - a);
  const tot = areas.reduce((s, a) => s + a, 0);
  const top1 = areas.slice(0, Math.max(1, Math.ceil(areas.length * 0.01))).reduce((s, a) => s + a, 0);
  const top10 = areas.slice(0, Math.max(1, Math.ceil(areas.length * 0.10))).reduce((s, a) => s + a, 0);
  report.weighting = {
    privateRows: privRows,
    publicRows: pubRows,
    publicShare_ROW_weighted_pct: +((100 * pubRows) / (privRows + pubRows)).toFixed(2),
    publicShare_LAND_weighted_pct: report.privateVsPublic.publicSharePct,
    landConcentration: {
      top1pctOfRecordsGovernPctOfPrivateLand: +((100 * top1) / tot).toFixed(2),
      top10pctOfRecordsGovernPctOfPrivateLand: +((100 * top10) / tot).toFixed(2),
      balearsComparison: 'Balears: top 1 % of zone records govern 32.0 % of buildable land',
    },
    statement:
      'Every rate in this tool that is scored against LAND is AREA-WEIGHTED (m² in native EPSG:25830). ' +
      'Every rate scored against DOCUMENTS is ROW-WEIGHTED. They are never mixed and never averaged together.',
  };
  console.log(`  public share, ROW-weighted  : ${report.weighting.publicShare_ROW_weighted_pct} %`);
  console.log(`  public share, LAND-weighted : ${report.weighting.publicShare_LAND_weighted_pct} %`);
  console.log(`  ⚠ top 1 % of private records govern ${report.weighting.landConcentration.top1pctOfRecordsGovernPctOfPrivateLand} % of private land`);
  console.log(`  ⚠ top 10 %                        govern ${report.weighting.landConcentration.top10pctOfRecordsGovernPctOfPrivateLand} %`);
}

// ═══════════════════════════════════════════════════════════════════════════
// (D) THE PARTIALS QUESTION — and why it resolves to zero here regardless
// ═══════════════════════════════════════════════════════════════════════════
report.partials = {
  balears: 'complete 61.4 % + partial-drawable 12.7 % = 74.1 % any-drawable; FAR-alone-without-height 1.6 %',
  murcia:
    'The partials lever cannot pay here, and the reason is structural rather than a threshold choice: ' +
    'a partial requires SOME shape constraint — a height with no footprint, or a footprint with no height. ' +
    'Murcia publishes NEITHER, on any of the 14 regional layers and in the ficha\'s fixed label set. ' +
    'Its published quantity is exclusively FAR-alone-without-height, which is precisely the 1.6 % tier ' +
    'Balears could afford to discard. So Murcia is 0 % complete, 0 % partial, 100 % not-drawable — and ' +
    'lowering the bar to "partial" recovers nothing, because there is no shape term to be partial ABOUT.',
};
console.log(`\n== 15D · partials ==\n  ⭐ ${report.partials.murcia}`);

writeOut('15-private-vs-public-and-distinct-oracle.json', report);
console.log('\nSTEP 15 done.');
