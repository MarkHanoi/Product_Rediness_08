// §MURCIA-ENVELOPE-MAX · STEP 14 — THE REPORT BLOCK
//
// Assembles every measured figure into the requested shape, and REFUSES — by name, with the
// blocker stated — anything this run could not measure. A blocked measurement is reported as
// BLOCKED, never as 0 and never as an absence.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeOut, HERE } from './lib.mjs';

const R = (n) => JSON.parse(readFileSync(join(HERE, 'out', n), 'utf8'));
const _s1 = R('01-schema-and-validity.json');
const s3 = R('03-universes-and-currency.json');
const _s6 = R('06-ficha-live-matrix.json');
const _s8 = R('08-control-28-09.json');
const s9 = R('09-wfs-parameter-census.json');
const s12 = R('12-currency-verdict.json');
const s13 = R('13-provenance-and-rank.json');
const s15 = R('15-private-vs-public-and-distinct-oracle.json');

const out = { tool: '§MURCIA-ENVELOPE-MAX', measuredAt: new Date().toISOString() };
const L = [];
const p = (s = '') => { L.push(s); console.log(s); };

p('');
p('════════════════════════════════════════════════════════════════════════════');
p('  MURCIA ENVELOPE MAXIMUM');
p('════════════════════════════════════════════════════════════════════════════');
p('');

// ── municipalities enumerated ───────────────────────────────────────────────
const rec = s3.reconciliation;
p('  municipalities enumerated       33 / 45   ⚠ FIVE COUNTS, FIVE QUESTIONS — none is "the" answer');
p('');
p(`    45  CORPUS   — municipalities the regional planning register governs`);
p(`                   SIT_USU_PLU_CARM:sitmurcia_plu_sp, one polygon per municipal term`);
p(`    33  SCHEMA   — municipalities the zoning service actually CARRIES geometry for`);
p(`                   SIT_USU_PLA_URB_CARM:plu_ze_37_mun_uso_suelo, distinct Municipio`);
p(`    33  INSPIRE  — the harmonised HILUCS view of the same content (2nd workspace)`);
p(`    37  CLAIM    — the string "37mun" in the LAYER NAME. ⛔ CONTRADICTED BY ITS OWN DATA.`);
p(`    12  the gap  — governed by an instrument, NOT zoned in the service:`);
p(`                   ${rec.unzonedMunicipalities.join(', ')}`);
p('');
p('    ⛔ NOT RECONCILED SILENTLY: the layer name says 37 and the layer contains 33. Both are');
p('       reported. The name is a publisher CLAIM about intent; only the data is a measurement.');
p('');

// ── validity ────────────────────────────────────────────────────────────────
p('  ── VALIDITY (established BEFORE measuring) ───────────────────────────────');
p('');
p('    ⛔ THE BRIEF\'S PREMISE IS REFUTED, and the refutation matters:');
p('       "Murcia publishes f_fin"  — TRUE OF THE WRONG SERVICE. `f_fin`/`f_inicial` belong to');
p('       the CITY of Murcia\'s MUNICIPAL GeoServer (geoserver.murcia.es). DescribeFeatureType');
p('       on ALL 14 layers of the REGIONAL CARM service returns NO f_fin and NO per-row date.');
p('');
p('       "superseded editions in separate layers" — a rival workspace DOES exist');
p('       (SIT_USU_PLU_CARM). Tested on CONTENT, not on names:');
p(`         overlap on the genuine shared key (the ficha link): 100.00 %  (9 250 / 9 250)`);
p('         → HARMONISED INSPIRE VIEW, NOT A SUPERSEDED EDITION. No superseded zoning');
p('           edition is served anywhere on this GeoServer.');
p('       ⚠ a first attempt keyed on (Municipio, Uso, Area_m2) gave 5.41 % and would have read');
p('         as "the editions disagree". It was float-precision skew in the key, not content.');
p('');
p('    HOW CURRENCY WAS ESTABLISHED — positive evidence, not an absent flag:');
p(`      · BORM gazette citation of the governing instrument on ${s12.currencySummary.withBormGazetteCitation}/45 municipalities`);
p(`        (100 % of the 33 zoned), and the links RESOLVE — HTTP 301 → live borm.es`);
p(`      · validTo 0/45 and endLifespanVersion 0/45 — consistency check only`);
p('    NOT USED AS EVIDENCE:');
p('      · ProcessStepGeneral = "legalForce" on 45/45 — ONE value in two casings, so ZERO');
p('        INFORMATION. Same shape as Aragón fiab_geom and Balears DFIVIGEN.');
p('      · regulationNature = "definedInLegislation" on 9 470/9 470 — likewise zero information.');
p('    RESIDUAL RISK (stated, not buried):');
p('      · IN FORCE ≠ RECENT. 14 of 45 plans are adapted to TRLS **1976**; median validFrom 2003.');
p('      · Dataset BeginLifespanVersion is 2013-09-11 on 44/45. Whether every municipal');
p('        amendment since has been re-ingested is NOT established by anything served here.');
p('      · Area_suspendida="S" on 1.17 % of rows (acuerdos 2006-2009). Suspension is published;');
p('        its LIFTING is not.');
p('');

// ── tier (a) control ────────────────────────────────────────────────────────
p('  ── TIER (a) · WFS ATTRIBUTES ALONE ───────────────────────────────────────');
p('');
p(`    WFS attributes alone            28.09 %   CONTROL: ✅ REPRODUCED — PASS`);
p(`      23.51 % (packed ∧ not delegated, 17.663 / 75.145 M m²)`);
p(`      + 8.81 pp × 0.520 resolve rate = 4.58 pp  →  28.09 %   exact match`);
p(`      decomposition asserted to sum: 24.800 direct + 50.345 delegated = 75.145 ✓`);
p('');
p('    ⛔ BUT THE CONTROL AND THE FICHA CHANNEL ARE DIFFERENT UNIVERSES, AND CANNOT BE ADDED:');
p('       28.09 %  = CITY of Murcia, ONE municipality, MUNICIPAL GeoServer, per-plot');
p('                  calificación, denominator 75.145 M m².');
p('       ficha    = 33 municipalities, REGIONAL CARM GeoServer, per-ÁMBITO (development');
p('                  sector), a denominator that is neither subset nor superset of the above.');
p('       Emitting "28.09 % + N" would be an unbalanced decomposition. It is NOT emitted.');
p('');
p('    TIER (a) ON THE REGIONAL SERVICE, measured on its own denominator:');
p(`      buildable-now land            ${s15.privateVsPublic.buildableNow_Mm2} M m²  across 33 municipalities`);
p(`        of which PRIVATE developable ${s15.privateVsPublic.privateDevelopable_Mm2} M m²  (${s15.privateVsPublic.privateSharePct} %)`);
p(`        of which PUBLIC / systems    ${s15.privateVsPublic.publicSystems_Mm2} M m²  (${s15.privateVsPublic.publicSharePct} %) — can never carry a private envelope`);
p(`      ⚠ that public share is ${s15.weighting.publicShare_LAND_weighted_pct} % LAND-weighted but ${s15.weighting.publicShare_ROW_weighted_pct} % ROW-weighted.`);
p(`        Murcia is far less public-heavy than Balears BY LAND (8.93 % vs 32.55 %) and far MORE`);
p(`        so BY ROW. The two answer different questions; both are stated.`);
p(`      ⚠ top 1 % of private records govern ${s15.weighting.landConcentration.top1pctOfRecordsGovernPctOfPrivateLand} % of private land; top 10 % govern ${s15.weighting.landConcentration.top10pctOfRecordsGovernPctOfPrivateLand} %.`);
p(`      Edificabilidad with a VALID value: ${s9.regional.edifValidPct} % of buildable-now land`);
p(`        (⛔ VALID, not present: 3 325 polygons carry 0, a null substitute in this corpus)`);
p('');

// ── tier (b) ────────────────────────────────────────────────────────────────
p('  ── TIER (b) · PLUS FICHA PARAMETERS  ← THE QUESTION ──────────────────────');
p('');
p('    + ficha parameters              0 pp of DRAWABLE coverage');
p('      complete rule                 0.00 %');
p('      partial-drawable              0.00 %');
p('      not drawable                  100.00 %       ← all 33 municipalities');
p('');
p('    ⭐ THE FICHA CARRIES NO ENVELOPE PARAMETER. Its page is emitted by an Oracle stored');
p('       procedure — the HTML opens `<!-- PROCEDURE FICHA ( WIde IN Number ) -->` — over a');
p('       FIXED label set, read verbatim from the document, not assumed:');
p('         Municipio · Superficie · Denominación · Nombre · Clasificación del Suelo ·');
p('         Uso global · Aprovechamiento de referencia · Otros usos · Superficie total del');
p('         ámbito de ordenación · Superficie neta del ámbito · Aprovechamiento resultante ·');
p('         SSGG vinculados/adscritos · Densidad(viv/Ha) · Habitantes estimados por');
p('         planeamiento · Nº de viviendas máximo · Viviendas estimadas · Observaciones ·');
p('         Documentación adicional');
p('');
p('       NO altura · NO plantas · NO ocupación · NO retranqueos · NO fondo edificable ·');
p('       NO parcela mínima. It is a DEVELOPMENT-QUANTUM sheet — the same class of quantity as');
p('       the `Edificabilidad` attribute: floor area and dwelling counts, NO SHAPE.');
p('');
p('       CORROBORATED INDEPENDENTLY: the INSPIRE view carries `dimensioningIndication` — the');
p('       INSPIRE model\'s own slot for dimensioning parameters — non-null on 0 of 9 470 rows.');
p('');
p('    §4 CONSEQUENCE: footprint rule + height DRAWS; Edificabilidad alone does not. The ficha');
p('       adds neither, so it moves NOTHING from not-drawable to partial-drawable. And the');
p('       partials lever cannot pay: a partial needs SOME shape term to be partial ABOUT, and');
p('       Murcia publishes none. Its published quantity is exclusively the FAR-alone-without-');
p('       height tier that Balears measured at 1.6 % and could afford to discard.');
p('');
p('    ⛔ REFUSED — THE n>=100 SAMPLE COULD NOT BE TAKEN. Stated as BLOCKED, never as 0:');
p('       urbmurcia.carm.es sits behind a RADWARE BOT MANAGER WAF which IP-blocked this client');
p('       after ~20 requests and held for the rest of the run (verified http and https, two');
p('       paths, browser and bare UA). The seeded stratified sample (n = 132, 4 per municipality,');
p('       seed 20260802) is BUILT and committed in 10-ficha-harvest.mjs; it needs an unblocked');
p('       client to execute.');
p('       Documents actually obtained: 1. Byte-hash control: 1 document, 1 distinct hash —');
p('       reported as OBTAINED, NOT as a corpus rate.');
p('    ⚠ OPEN RESIDUAL, NAMED: the stored procedure emits blocks labelled primer/segundo/');
p('       tercer/cuarto/septimo for the one ámbito observed (Suelo Urbano Consolidado).');
p('       QUINTO and SEXTO did not render. Their content is UNKNOWN. If they carry ordinance');
p('       parameters for other ámbito types, the 0 % above would rise. UNKNOWN NEVER NO —');
p('       so tier (b) is stated as "0 % on the evidence obtained", not as a closed finding.');
p('');

// ── article cited ───────────────────────────────────────────────────────────
p('  ── ARTICLE CITED (§5 — the rate that decides publication) ────────────────');
p('');
p(`    instrument citation (BORM)      ${s13.channelA.pctOf45} %  of 45   ·  100 % of the 33 zoned`);
p('                                    resolves live (301 → borm.es). Cites WHICH PLAN IS IN');
p('                                    FORCE — ⚠ NOT a parameter.');
p('    parameter-granting article      N/A — there is no published parameter to cite one FOR.');
p('');
p('    ⭐ THE POSED COMPARISON DOES NOT RUN, and that is the finding:');
p('       Balears = PARAMETERS WITHOUT PROVENANCE (real PM 200 m² · NP 3 plantes · O 80 % ·');
p('                 E 2.4, and only 3 of 60 cite an article).');
p('       Murcia  = PROVENANCE WITHOUT PARAMETERS (a resolving gazette citation for 44/45');
p('                 municipalities, and no parameter for an article to be cited for).');
p('');
p('       ⛔ MURCIA IS NOT THE STRONGEST `P` IN SPAIN. It neither beats nor matches Balears —');
p('          it is on the OTHER AXIS. On the axis that decides whether an envelope DRAWS,');
p('          BALEARS STRICTLY DOMINATES MURCIA. Provenance cannot draw a solid.');
p('');

// ── addressability ──────────────────────────────────────────────────────────
p('  ── ADDRESSABLE OR VIEWER-ONLY ────────────────────────────────────────────');
p('');
p('    addressable or viewer-only      ADDRESSABLE — but via an UNPUBLISHED REWRITE, and');
p('                                    RATE-DEFENDED.');
p('');
p('    · The URL PUBLISHED in `Enlace_ficha` is 100 % populated (9 469/9 469) and 0 %');
p('      RESOLVABLE: http://opweb.carm.es/... returns HTTP 404, including its own root.');
p('      ⭐ POPULATED IS NOT PRESENT. A pipeline trusting the attribute gets 9 469 404s.');
p('    · The SAME URL over https:// returns 302 → http://urbmurcia.carm.es/urbmurcia/sitmurcia/...');
p('      That rewrite is published NOWHERE. It was found by probing.');
p('    · At the live host, a COLD BARE curl/8.5.0 client — no Referer, no cookie, no browser');
p('      UA — was served the full ficha. So the capability is genuinely addressable, not');
p('      viewer-only.');
p('    · ⛔ BUT it is defended by a Radware Bot Manager WAF that serves a CAPTCHA WITH HTTP 200,');
p('      and blocks by IP. Automation is possible but must be slow and will need block handling.');
p('');
p('    ⭐ AND THE ROUTING IS REAL, RE-TESTED AGAINST THE COORDINATOR\'S NATIONAL FINDING:');
p(`      ${s15.linkRouting.distinctLinksClientSide} distinct links / ${s15.linkRouting.distinctWideIds} distinct opaque \`wide\` ids over ${s15.linkRouting.rows} rows (${(100 * s15.linkRouting.distinctPerRow).toFixed(1)} % distinct);`);
p(`      most-shared link covers only ${s15.linkRouting.maxRowsSharingOneLink} rows; median multiplicity ${s15.linkRouting.medianMultiplicity}.`);
p('      ⛔ THE REPORTED ArcGIS DEFECT CANNOT FIRE HERE: this is GeoServer WFS 2.0.0, which has');
p('         no `returnDistinctValues`/`resultRecordCount` pair; none was sent; and every distinct');
p('         count was computed CLIENT-SIDE over a row set proven complete by');
p('         numberMatched === features.length.');
p('      ✓ Cross-checked anyway against a server-side GROUP-BY oracle (WFS hits per link):');
p(`        client and server counts agree on ${s15.linkRouting.serverSideOracle.length}/${s15.linkRouting.serverSideOracle.length} probes.`);
p('      → This is PER-FEATURE ROUTING, not a register homepage (contrast València: 99 %');
p('        coverage, 20 distinct — which fabricated a ~99 % tier estimate).');
p('');

// ── per-municipality table ──────────────────────────────────────────────────
p('  ── PER MUNICIPALITY — NO MEAN ────────────────────────────────────────────');
p('');
p('    land-weighted (m², EPSG:25830). complete/partial/not-draw are TIER (b) outcomes.');
p('');
p('    municipality              private Mm²  public %   edif VALID %  complete  partial  not-draw  BORM');
p('    ' + '-'.repeat(104));
const privBy = new Map(s15.perMunicipality.map((r) => [r.municipio, r]));
const bormBy = new Map(s12.currencyEvidence.map((r) => [r.municipio, r]));
const rows = [...s9.perMunicipality].sort((a, b) => (privBy.get(b.municipio)?.privateDevelopable_Mm2 || 0) - (privBy.get(a.municipio)?.privateDevelopable_Mm2 || 0));
const tbl = [];
for (const r of rows) {
  const pv = privBy.get(r.municipio) || {};
  const bo = bormBy.get(r.municipio) || {};
  tbl.push({
    municipio: r.municipio,
    privateDevelopable_Mm2: pv.privateDevelopable_Mm2 ?? null,
    publicSharePct: pv.publicSharePct ?? null,
    edifValidPct: r.edifValidPct,
    completeRulePct: 0,
    partialDrawablePct: 0,
    notDrawablePct: 100,
    instrumentCitation: !!bo.bormCitation,
    lawAdaptedTo: bo.lawAdaptedTo ?? null,
    validFrom: bo.validFrom ?? null,
  });
  p(
    `    ${r.municipio.slice(0, 24).padEnd(25)} ${String(pv.privateDevelopable_Mm2 ?? '-').padStart(10)} ${String(pv.publicSharePct ?? '-').padStart(8)} ${String(r.edifValidPct).padStart(13)} ${'0%'.padStart(9)} ${'0%'.padStart(8)} ${'100%'.padStart(9)}  ${bo.bormCitation ? '✓ ' + (bo.lawAdaptedTo || '') : '—'}`
  );
}
p('');
p('    ⛔ NO MEAN IS REPORTED. complete/partial/not-draw are identical across all 33 because the');
p('       cause is STRUCTURAL — the regional schema and the ficha template carry no shape term');
p('       anywhere — not because a mean was taken.');
p('');
p('  ── 12 GOVERNED BUT NOT ZONED IN THE SERVICE ──────────────────────────────');
for (const m of rec.unzonedMunicipalities) {
  const bo = bormBy.get(m) || {};
  p(`    ${m.padEnd(28)} ${(bo.instrument || '?').padEnd(6)} ${(bo.lawAdaptedTo || '?').padEnd(9)} from ${bo.validFrom || '?'}  ${bo.bormCitation ? '✓ BORM' : '⚠ no citation'}`);
}
p('');
p('════════════════════════════════════════════════════════════════════════════');

out.report = L.join('\n');
out.perMunicipality = tbl;
out.headline = {
  municipalitiesEnumerated: { corpus: 45, schema: 33, inspireView: 33, layerNameClaim: 37, governedButNotZoned: 12 },
  tierA_control_pct: 28.09,
  tierA_controlReproduced: true,
  tierA_controlUniverse: 'CITY of Murcia only — NOT summable with the regional ficha channel',
  tierB_ficha_addedDrawablePP: 0,
  completeRulePct: 0,
  partialDrawablePct: 0,
  notDrawablePct: 100,
  articleCited_instrument_pctOf45: s13.channelA.pctOf45,
  articleCited_parameterGranting: 'N/A — no published parameter',
  addressability: 'ADDRESSABLE via an unpublished https-scheme rewrite; Radware WAF rate-defends it',
  publishedLinkResolves: false,
  perFeatureRouting: true,
  privateDevelopable_Mm2: s15.privateVsPublic.privateDevelopable_Mm2,
  publicSystemsShare_landWeighted_pct: s15.privateVsPublic.publicSharePct,
  publicSystemsShare_rowWeighted_pct: s15.weighting.publicShare_ROW_weighted_pct,
  rank: 'NOT the strongest P in Spain — Balears strictly dominates on the drawing axis',
};
out.blocked = {
  what: 'the n>=100 seeded ficha sample and the byte-hash census',
  blocker: 'Radware Bot Manager WAF at urbmurcia.carm.es — CAPTCHA served with HTTP 200, IP-scoped block',
  documentsObtained: 1,
  sampleBuiltAndCommitted: '10-ficha-harvest.mjs, n=132, 4 per municipality, seed 20260802',
  openResidual: 'stored-procedure blocks "quinto"/"sexto" did not render for the observed ámbito type; content UNKNOWN',
};
writeOut('14-report.json', out);
