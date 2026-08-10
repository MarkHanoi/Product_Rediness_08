/**
 * E7 — THE REPORT: assemble E1/E3/E4/E6 into the maximum, with the intervals
 * and the two lines that decide whether any of it publishes.
 *
 * Adds four things the census itself does not:
 *   1. WILSON 95 % INTERVALS. n = 200 on the uniform arm, and 60 censused + 180 PPS draws on
 *      the land arm. ⛔ A POINT ESTIMATE WITHOUT AN INTERVAL INVITES THE
 *      PRECISION IT DOES NOT HAVE.
 *   2. THE `O = 100 %` CONTRADICTION, counted rather than asserted: an
 *      occupation of exactly 100 % published ALONGSIDE a setback is not a
 *      buildable footprint, it is a null substitute wearing a number.
 *   3. THE CURRENCY EXCLUSION. Palma, Andratx and Eivissa self-declare that
 *      MUIB does not show their current planning, and Palma alone is 9,442 of
 *      46,607 polygons. The maximum is reported with them IN and OUT.
 *   4. THE PTI REACH, as measured in E3.
 *
 * Run:  node tools/balears-envelope-max/e7-report.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
const read = (f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
const e1 = read('e1-buildable-denominator.json');
const e3 = read('e3-pti-reach.json');
const e4 = read('e4-buildable-inventory.json');
const e6 = read('e6-fitxa-census.json');

if (!e6.parseHealth.clean) throw new Error('⛔ E6 parse health not clean — refusing to report.');
if (e6.design.fetchErrors > 0) console.error(`⚠ ${e6.design.fetchErrors} fetch error(s) in E6.`);

/** Wilson score interval — behaves at the extremes where normal approx does not. */
function wilson(hits, n, z = 1.96) {
  if (!n) return null;
  const p = hits / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { pct: +(100 * p).toFixed(2), lo: +((100 * (c - s)) / d).toFixed(2), hi: +((100 * (c + s)) / d).toFixed(2), n };
}

const F = e6.fitxes;
const uRows = F.filter((r) => r.arms.includes('U'));

// Re-derive the zone class on the inventory (E6 owns the taxonomy; E4 stores
// only the raw CODIMUIB_G groups). Kept identical so the two cannot drift.
for (const e of e4.inventory) {
  const g = (e.codimuibG || []).filter(Boolean);
  e.zoneClass = g.some((x) => /^(RE_|TU|IN|TE|SB_|AMR)/.test(x))
    ? 'PRIVATE_DEVELOPABLE'
    : g.some((x) => /^EQ_/.test(x))
      ? 'FACILITY'
      : 'NON_ENVELOPE';
}

// ── 2 · the O = 100 % contradiction, and the null-substitute census ─────────
const occ = F.map((r) => r.params.O).filter((p) => p && p.status === 'PRESENT');
const occ100 = F.filter((r) => r.params.O && r.params.O.value === 100);
const occ100WithSetback = occ100.filter((r) => ['RA', 'RF', 'RM'].some((c) => r.params[c] && r.params[c].status === 'PRESENT' && r.params[c].verdict === 'VALID'));
const occ0 = F.filter((r) => r.params.O && r.params.O.status === 'PRESENT' && r.params.O.value === 0);
const occAbsoluteM2 = F.filter((r) => r.params.O && r.params.O.status === 'PRESENT' && /m2|m²/i.test(String(r.params.O.units || '')));
const setbackZero = F.filter((r) => ['RA', 'RF', 'RM'].some((c) => r.params[c] && r.params[c].verdict === 'ZERO_AMBIGUOUS'));

const contradictions = {
  fitxesSampled: F.length,
  occupationPublished: occ.length,
  occupationExactly100: occ100.length,
  occupationExactly100AlsoPublishingASetback: occ100WithSetback.length,
  occupationExactly100Examples: occ100WithSetback.slice(0, 8).map((r) => ({ municipi: r.municipi, codiMuib: r.codiMuib, setbacks: ['RA', 'RF', 'RM'].filter((c) => r.params[c] && r.params[c].verdict === 'VALID').map((c) => `${c}=${r.params[c].value}`), url: r.url })),
  occupationExactly0: occ0.length,
  occupationPublishedAsAbsoluteM2NotPercent: occAbsoluteM2.length,
  fitxesWithAZeroSetback: setbackZero.length,
  note: '⚠ O = 100 % beside a published setback is a CONTRADICTION, and 0 and 100 have both been null substitutes in this dataset. Both are scored SUSPECT / UNUSABLE, never VALID, so none of them enters a COMPLETE or PARTIAL_DRAWABLE count.',
};

// ── 3 · the currency exclusion ──────────────────────────────────────────────
// Palma '040', Andratx '005', Eivissa — resolved from the E4 inventory by name.
const notCurrentNames = ['PALMA', 'ANDRATX', 'EIVISSA'];
const notCurrentMunis = new Set();
for (const e of e4.inventory) {
  for (const m of e.municipalities) {
    if (notCurrentNames.some((n) => String(e.exampleMunicipi || '').toUpperCase().startsWith(n))) notCurrentMunis.add(m);
  }
}
const isNotCurrent = (r) => notCurrentNames.some((n) => String(r.municipi || '').toUpperCase().startsWith(n));

const _invByUrl = new Map(e4.inventory.map((e) => [e.url, e]));
const totalBuildableArea = e4.inventory.reduce((s, e) => s + e.areaM2, 0);
const notCurrentArea = e4.inventory
  .filter((e) => notCurrentNames.some((n) => String(e.exampleMunicipi || '').toUpperCase().startsWith(n)))
  .reduce((s, e) => s + e.areaM2, 0);

// ── uniform-arm rates with intervals, on several sub-populations ────────────
//
// ⚠ THE ARM IS STRATIFIED, SO A POOLED MEAN IS THE WRONG ESTIMATOR. Mallorca
// holds 3,855 of 5,272 buildable fitxes (73 %) but contributes 90 of 200 draws
// (45 %), so pooling over-weights the small islands. Every rate below is
// re-weighted to the true per-island fitxa counts of the SUBPOPULATION being
// measured; the Wilson interval is computed on the pooled n and is therefore
// the honest width, not a narrower stratified one.
const ISLANDS = ['Mallorca', 'Menorca', 'Eivissa', 'Formentera'];
function islandFitxaCounts(pred) {
  const m = Object.fromEntries(ISLANDS.map((i) => [i, 0]));
  for (const e of e4.inventory) {
    const isl = e.islands[0];
    if (!(isl in m)) continue;
    if (pred && !pred(e)) continue;
    m[isl]++;
  }
  return m;
}

function arm(rows, label, populationPred) {
  const W = islandFitxaCounts(populationPred);
  const Wsum = Object.values(W).reduce((s, n) => s + n, 0);
  const t = (f) => {
    const pooled = wilson(rows.filter(f).length, rows.length);
    if (!pooled) return null;
    let acc = 0, used = 0;
    const perIsland = {};
    for (const isl of ISLANDS) {
      const rs = rows.filter((r) => r.island === isl);
      if (!rs.length || !W[isl]) continue;
      const rate = rs.filter(f).length / rs.length;
      perIsland[isl] = { n: rs.length, ratePct: +(100 * rate).toFixed(2), weight: +(W[isl] / Wsum).toFixed(4) };
      acc += rate * W[isl];
      used += W[isl];
    }
    return {
      pct: used ? +((100 * acc) / used).toFixed(2) : pooled.pct,
      pooledPct: pooled.pct,
      lo: pooled.lo,
      hi: pooled.hi,
      n: pooled.n,
      perIsland,
    };
  };
  const heightAny = (r) => r.drawability.heightAny;
  return {
    label,
    n: rows.length,
    completeRule: t((r) => r.drawability.tier === 'COMPLETE'),
    partialDrawable: t((r) => r.drawability.tier === 'PARTIAL_DRAWABLE'),
    anyDrawable: t((r) => r.drawability.tier !== 'NOT_DRAWABLE'),
    notDrawable: t((r) => r.drawability.tier === 'NOT_DRAWABLE'),
    height: t(heightAny),
    heightInStoreysOnly: t((r) => r.drawability.heightStoreys && !r.drawability.heightMetres),
    heightInMetres: t((r) => r.drawability.heightMetres),
    occupation: t((r) => r.drawability.occupation),
    far: t((r) => r.drawability.far),
    anySetback: t((r) => r.drawability.setbackCount > 0),
    heightPlusOccupation: t((r) => heightAny(r) && r.drawability.occupation),
    heightPlusSetback: t((r) => heightAny(r) && r.drawability.setbackCount > 0),
    farAloneNoHeight: t((r) => r.drawability.far && !heightAny(r)),
    nothingAtAll: t((r) => Object.values(r.params).every((p) => p.status === 'ABSENT')),
    articleAnywhere: t((r) => r.hasAnyArticle),
    articleOnEnvelopeParam: t((r) => r.hasArticleOnEnvelopeParam),
    completeRuleWithArticle: t((r) => r.drawability.tier === 'COMPLETE' && r.hasArticleOnEnvelopeParam),
  };
}

const priv = (r) => r.zoneClass === 'PRIVATE_DEVELOPABLE';
const privInv = (e) => e.zoneClass === 'PRIVATE_DEVELOPABLE';
const privCurrentInv = (e) =>
  e.zoneClass === 'PRIVATE_DEVELOPABLE' &&
  !notCurrentNames.some((n) => String(e.exampleMunicipi || '').toUpperCase().startsWith(n));
const R = {
  probe: 'e7-report',
  runAt: new Date().toISOString(),
  inputs: { e1: e1.runAt, e3: e3.runAt, e4: e4.runAt, e6: e6.runAt },

  denominatorLadder: {
    allQualificacionsFeatures: e1.layers.QUALIFICACIONS.total,
    allClassifiedLandKm2: +(e1.layers.CLASSIFICACIO.totalAreaM2 / 1e6).toFixed(2),
    rusticLandKm2: +(e1.layers.CLASSIFICACIO.byCodiclas.find((c) => c.codiclas === 'SR').areaKm2).toFixed(2),
    rusticSharePct: +((100 * e1.layers.CLASSIFICACIO.byCodiclas.find((c) => c.codiclas === 'SR').areaM2) / e1.layers.CLASSIFICACIO.totalAreaM2).toFixed(2),
    buildableFeatures: e4.controls.oracleCount,
    buildableLandKm2: +(totalBuildableArea / 1e6).toFixed(2),
    buildableShareOfLandPct: +((100 * totalBuildableArea) / e1.layers.CLASSIFICACIO.totalAreaM2).toFixed(2),
    distinctBuildableFitxes: e4.inventory.length,
    byZoneClass: e6.denominators.byZoneClass,
    // ⭐ THE ROW THE BASELINE NEVER HAD: rustic is 94.5 % of the LAND but only
    // 67 of 46,607 QUALIFICACIONS ROWS. "Exclude rustic" is a near no-op on the
    // layer that carries the parameters.
    rusticRowsInQualificacions: e1.layers.QUALIFICACIONS.byCodiclas.find((c) => c.codiclas === 'SR').features,
  },

  uniformArm: {
    allBuildable: arm(uRows, 'all buildable fitxes, uniform', null),
    privateDevelopable: arm(uRows.filter(priv), 'private developable only', privInv),
    privateDevelopableCurrentOnly: arm(
      uRows.filter((r) => priv(r) && !isNotCurrent(r)),
      'private developable, excluding self-declared not-current municipalities',
      privCurrentInv,
    ),
    perIsland: Object.fromEntries(
      ISLANDS.map((i) => [i, arm(uRows.filter((r) => r.island === i), i, (e) => e.islands[0] === i)]),
    ),
  },

  landWeighted: {
    allBuildable: e6.D2_perKm2_allBuildable,
    privateDevelopable: e6.D3_perKm2_privateDevelopable,
    buildingCapable: e6.D3b_perKm2_buildingCapable,
  },

  contradictions,

  currency: {
    selfDeclaredNotCurrentMunicipalities: notCurrentNames,
    buildableFeaturesAffected: e3.ptiReachIntoBuildable.viaQualificacionsLayer.flaggedBuildableFeatures,
    buildableAreaAffectedKm2: e3.ptiReachIntoBuildable.viaQualificacionsLayer.flaggedBuildableAreaKm2,
    shareOfBuildableFeaturesPct: e3.ptiReachIntoBuildable.viaQualificacionsLayer.flaggedFeaturePct,
    shareOfBuildableAreaPct: e3.ptiReachIntoBuildable.viaQualificacionsLayer.flaggedAreaPct,
    crossCheckFromInventoryPct: +((100 * notCurrentArea) / totalBuildableArea).toFixed(2),
    note: '⚠ These three municipalities publish, in OBS on the zoning layer itself, that MUIB does NOT show their current planning. This is a CURRENCY ceiling on buildable land and it is DISTINCT from the PTI ceiling.',
  },

  ptiCeiling: {
    flagText: e3.obsDistinct_RUSTIC_CATEGORIES.values[0],
    distinctFlagStrings: e3.obsDistinct_RUSTIC_CATEGORIES.n,
    flagOnRusticCategoriesLayer: e3.ptiReachIntoBuildable.viaRusticCategoriesLayer,
    // ⭐ THE MEASUREMENT NOBODY HAD RUN.
    reachIntoBuildableByAttributeAttachmentPct: e3.ptiReachIntoBuildable.viaRusticCategoriesLayer.flaggedAreaPct,
    reachIntoBuildableByTheFlagsOwnScopePct: 0,
    verdict:
      '⭐ THE FLAG IS ATTACHED TO 100 % OF BUILDABLE-CLASS ROWS ON LAYER 11 AND ITS TEXT SCOPES ITSELF TO RUSTIC. ' +
      'It reads "Les àrees de transició (AT), i la resta de categories del sòl rústic, NO estan adaptades a les darreres ' +
      'modificacions dels plans territorials" — it names the transition areas and the REST OF THE RUSTIC CATEGORIES, and ' +
      'nothing else. The 100 % attachment is a TABLE artefact: layer 11 carries the whole-territory classification ' +
      'polygons (552 SU + 297 SB, matching CLASSIFICACIO to the square metre) alongside the 25,264 rustic-category ' +
      'polygons, and the same boilerplate string is stamped on every row. ' +
      '⛔ UNKNOWN NEVER NO: this measures the reach of the PUBLISHED FLAG, not the reach of the island territorial plans ' +
      'themselves. Balears PTIs do carry determinations over urban land (growth ceilings, tourist-place limits). ' +
      'What is proven is that MUIB PUBLISHES NO ABROGATION FLAG OVER BUILDABLE LAND — absence of a flag has never been ' +
      'evidence of currency in this corpus, and it is not evidence here.',
  },

  nationalFinding: {
    id: 'ARCGIS-DISTINCT-SILENTLY-CANCELLED',
    statement:
      '⛔ ON THIS ArcGIS MapServer, SENDING `resultRecordCount` ALONGSIDE `returnDistinctValues` SILENTLY CANCELS THE ' +
      'DE-DUPLICATION. HTTP 200, no Esri error, and the response is the WHOLE TABLE projected onto the requested field — ' +
      'so a caller that counts returned rows reads a ROW count and labels it a DISTINCT count. ' +
      'Measured: CLASSIFICACIO.CODICLAS → 3 without it, 916 with it. QUALIFICACIONS.CODICLAS → 3 without it, 46,607 with it. ' +
      'This is the CQL_FILTER failure class on a different parameter. The independent oracle is a statistics GROUP BY, ' +
      'whose returned rows ARE the groups and whose counts must sum to the filtered total.',
    evidence: 'tools/balears-envelope-max/out/e0-distinct-integrity-control.json',
    publishedNumbersRetested: {
      'QUALIFICACIONS.URL distinct (published 5,273)': 'CONFIRMED — 5,274 over all rows, 5,273 over SU+SB, GROUP BY oracle agrees',
      'GESTIO.URL distinct (published 1,951)': 'CONFIRMED — GROUP BY oracle agrees',
    },
  },
};

// ── THE HEADLINE BLOCK ──────────────────────────────────────────────────────
const U = R.uniformArm;
const L = R.landWeighted;
const fmt = (w) => (w ? `${w.pct.toFixed(1)}%  [${w.lo.toFixed(1)}–${w.hi.toFixed(1)}, n=${w.n}]` : "n/a");

R.headline = {
  'all features (published baseline)': '36.7%  (per-fitxa, n=60; the committed artefact at n=80 gives 31.3%)',
  'buildable only, per fitxa': fmt(U.allBuildable.completeRule),
  'buildable only, per km² of land': `${L.allBuildable.complete.ratePct}%`,
  'private developable, per fitxa': fmt(U.privateDevelopable.completeRule),
  'private developable, per km² — THE MAXIMUM (complete rule)': `${L.privateDevelopable.complete.ratePct}%`,
  'private developable, per km² — THE MAXIMUM (any drawable)': `${L.privateDevelopable.anyDrawable.ratePct}%`,
  '  of which complete rule': `${L.privateDevelopable.complete.ratePct}%`,
  '  of which partial-drawable': `${L.privateDevelopable.partialDrawable.ratePct}%`,
  'article cited (any, per fitxa)': fmt(U.allBuildable.articleAnywhere),
  'article cited on the envelope parameter itself': fmt(U.allBuildable.articleOnEnvelopeParam),
  'complete rule AND an article on the parameter': fmt(U.allBuildable.completeRuleWithArticle),
  'PTI reach into buildable (flag attachment)': `${R.ptiCeiling.reachIntoBuildableByAttributeAttachmentPct}%`,
  'PTI reach into buildable (flag scope, by its own words)': '0%',
  'buildable land self-declared NOT CURRENT': `${R.currency.shareOfBuildableAreaPct}% by area, ${R.currency.shareOfBuildableFeaturesPct}% by feature`,
};

fs.writeFileSync(path.join(OUT, 'e7-report.json'), JSON.stringify(R, null, 2));

console.error('\n════════════ BALEARS ENVELOPE MAXIMUM ════════════');
for (const [k, v] of Object.entries(R.headline)) console.error(`  ${k.padEnd(58)} ${v}`);
console.error('\n──── denominator ladder ────');
console.error(JSON.stringify(R.denominatorLadder, null, 2));
console.error('\n──── uniform arm · all buildable ────');
console.error(JSON.stringify(U.allBuildable, null, 2));
console.error('\n──── uniform arm · private developable ────');
console.error(JSON.stringify(U.privateDevelopable, null, 2));
console.error('\n──── uniform arm · private developable, current only ────');
console.error(JSON.stringify(U.privateDevelopableCurrentOnly, null, 2));
console.error('\n──── contradictions ────');
console.error(JSON.stringify(contradictions, null, 2));
console.error('\n──── per island (uniform) ────');
for (const [i, a] of Object.entries(U.perIsland)) console.error(`  ${i.padEnd(12)} n=${a.n} complete=${fmt(a.completeRule)} anyDrawable=${fmt(a.anyDrawable)} article=${fmt(a.articleAnywhere)}`);
