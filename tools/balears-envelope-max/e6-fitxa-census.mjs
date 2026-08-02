/**
 * E6 — ⭐ THE ENVELOPE MAXIMUM: MINE THE FITXA, BUILDABLE ONLY, THREE DENOMINATORS.
 *
 * ── WHAT THE BASELINE ACTUALLY MEASURED ─────────────────────────────────────
 * ⛔ MUIB PUBLISHES NO ENVELOPE ATTRIBUTES AT ALL. QUALIFICACIONS carries
 * OBJECTID · CODIPLA · CODICLAS · NOM · CODIAJ · CODIMUIB · CODIMUNI · MUNICIPI ·
 * OBS · DINIVIGEN · DFIVIGEN · IDENTITAT · URL · Shape_*. There is no height
 * field, no occupation field, no FAR field. So the 36.7 % was ALREADY a fitxa
 * measurement, and "buildable + fitxa" cannot be additive to "buildable only" —
 * ⭐ THE FITXA IS THE ONLY SOURCE THERE HAS EVER BEEN. What CAN move the number
 * is the DENOMINATOR and the DRAWABILITY BAR, and this measures both.
 *
 * ── THREE DENOMINATORS, MEASURED SEPARATELY ─────────────────────────────────
 *  D1  per fitxa, uniform            — like-for-like with the 36.7 % baseline
 *  D2  per km² of SU+SB land         — the product question
 *  D3  per km² of PRIVATE DEVELOPABLE land — SU+SB minus road, public open
 *      space and infrastructure, which can never carry a private envelope
 *
 * ⚠ D1 IS NOT A PROXY FOR D2 HERE, AND THAT IS MEASURED, NOT ASSUMED: the top
 * 1 % of fitxes govern 32.0 % of buildable land and the top 10 % govern 73.3 %.
 * A uniform-over-documents rate therefore says almost nothing about land.
 *
 * ── SAMPLING ────────────────────────────────────────────────────────────────
 * Seeded (20260802) and re-runnable. Three arms, fetched as one de-duplicated
 * union so no page is requested twice:
 *   ARM U  uniform over distinct fitxes, stratified by island, n = 200
 *          → D1, and the direct replacement for the baseline
 *   ARM C  CERTAINTY stratum: the 60 largest fitxes by area, CENSUSED
 *   ARM P  probability-proportional-to-area over the remainder, 180 draws
 *          → with ARM C, an unbiased estimator of D2 and D3
 *
 * ⛔ VALID VALUES NOT PRESENCE — see fitxa-parse.mjs. A row that exists with no
 * number, an occupation of 0 %, an occupation of exactly 100 % alongside a
 * published setback, and a 99999999 sentinel are four different failures and
 * none of them is an envelope.
 *
 * Run:  node tools/balears-envelope-max/e6-fitxa-census.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rng, sleep } from './lib.mjs';
import { parseFitxa, classify, drawability, ENVELOPE_CODES } from './fitxa-parse.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const SEED = 20260802;
const UNIFORM_PER_ISLAND = { Mallorca: 90, Menorca: 40, Eivissa: 40, Formentera: 30 };
const CERTAINTY_N = 60;
const PPS_DRAWS = 180;
const CONCURRENCY = 3;

const inv = JSON.parse(fs.readFileSync(path.join(OUT, 'e4-buildable-inventory.json'), 'utf8'));
if (!inv.controls.walkReconciles || !inv.controls.areaReconciles) {
  throw new Error('⛔ E4 inventory did not reconcile — refusing to compute a rate on it.');
}
const inventory = inv.inventory;

// ── zone-class taxonomy, from the CODIMUIB_G vocabulary measured in E2 ───────
// ⭐ A THIRD OF "BUILDABLE" LAND IS ROAD, PUBLIC OPEN SPACE AND INFRASTRUCTURE.
// Those polygons are urban soil and they are in SU/SB, but no private envelope
// exists on them at any completeness of data, so they belong in their own
// denominator rather than silently in the numerator's denominator.
function zoneClassOf(groups) {
  const g = groups.filter(Boolean);
  const isPrivate = (x) => /^(RE_|TU|IN|TE|SB_|AMR)/.test(x);
  const isFacility = (x) => /^EQ_/.test(x);
  if (g.some(isPrivate)) return 'PRIVATE_DEVELOPABLE';
  if (g.some(isFacility)) return 'FACILITY';
  return 'NON_ENVELOPE'; // EL_PB, EL_PR, CI_*, SE_*
}
for (const e of inventory) e.zoneClass = zoneClassOf(e.codimuibG);

// ── ARM U · uniform over distinct fitxes, island-stratified ─────────────────
const rand = rng(SEED);
const byIsland = {};
for (const e of inventory) {
  const isl = e.islands[0] || 'UNASSIGNED';
  (byIsland[isl] ||= []).push(e);
}
function drawUniform(pool, k) {
  const picked = [];
  const seen = new Set();
  let guard = 0;
  while (picked.length < Math.min(k, pool.length) && guard++ < 200000) {
    const c = pool[Math.floor(rand() * pool.length)];
    if (!c || seen.has(c.url)) continue;
    seen.add(c.url);
    picked.push(c);
  }
  return picked;
}
const armU = [];
const armUByIsland = {};
for (const [isl, k] of Object.entries(UNIFORM_PER_ISLAND)) {
  const pool = byIsland[isl] || [];
  const picked = drawUniform(pool, k);
  armUByIsland[isl] = { poolSize: pool.length, drawn: picked.length };
  for (const p of picked) armU.push(p);
}

// ── ARM C · certainty stratum (largest fitxes, censused) ────────────────────
const byArea = [...inventory].sort((a, b) => b.areaM2 - a.areaM2);
const armC = byArea.slice(0, CERTAINTY_N);
const armCUrls = new Set(armC.map((e) => e.url));
const remainder = byArea.slice(CERTAINTY_N);
const totalArea = inventory.reduce((s, e) => s + e.areaM2, 0);
const certaintyArea = armC.reduce((s, e) => s + e.areaM2, 0);
const remainderArea = remainder.reduce((s, e) => s + e.areaM2, 0);

// ── ARM P · PPS-with-replacement over the remainder ─────────────────────────
// With probability proportional to area, the simple mean of an indicator over
// the draws is an UNBIASED estimator of the area-weighted rate. Draw multiplicity
// is kept so the page is fetched once and counted as many times as drawn.
const cum = [];
{
  let acc = 0;
  for (const e of remainder) { acc += e.areaM2; cum.push(acc); }
}
function ppsDraw() {
  const t = rand() * remainderArea;
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < t) lo = mid + 1; else hi = mid; }
  return remainder[lo];
}
const armPMultiplicity = new Map();
for (let i = 0; i < PPS_DRAWS; i++) {
  const e = ppsDraw();
  armPMultiplicity.set(e.url, (armPMultiplicity.get(e.url) || 0) + 1);
}

// ── the de-duplicated fetch set ─────────────────────────────────────────────
const fetchSet = new Map();
const tag = (e, arm) => {
  let r = fetchSet.get(e.url);
  if (!r) { r = { entry: e, arms: new Set() }; fetchSet.set(e.url, r); }
  r.arms.add(arm);
};
for (const e of armU) tag(e, 'U');
for (const e of armC) tag(e, 'C');
for (const u of armPMultiplicity.keys()) tag(inventory.find((x) => x.url === u), 'P');

console.error(
  `arms: U=${armU.length} C=${armC.length} P=${armPMultiplicity.size} unique-draws (${PPS_DRAWS} draws) → ${fetchSet.size} pages to fetch`,
);
console.error(`certainty stratum covers ${((100 * certaintyArea) / totalArea).toFixed(2)}% of buildable land`);

// ── fetch + parse ───────────────────────────────────────────────────────────
const results = new Map();
const errors = [];
const queue = [...fetchSet.values()];
let done = 0;
async function worker(wid) {
  while (queue.length) {
    const item = queue.shift();
    if (!item) break;
    try {
      const res = await fetch(item.entry.url, {
        headers: { 'User-Agent': 'PRYZM-balears-envelope-max/1.0' },
        signal: AbortSignal.timeout(60000),
      });
      const html = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseFitxa(html);
      const P = {};
      for (const c of ENVELOPE_CODES) P[c] = classify(c, parsed.rows[c]);
      const d = drawability(P);
      const paramArticles = [...new Set(ENVELOPE_CODES.flatMap((c) => (P[c] && P[c].articleRefs) || []))];
      results.set(item.entry.url, {
        url: item.entry.url,
        arms: [...item.arms],
        identitat: parsed.identitat,
        municipi: parsed.municipi,
        codiMuib: parsed.codiMuib,
        island: item.entry.islands[0],
        zoneClass: item.entry.zoneClass,
        codimuibG: item.entry.codimuibG,
        features: item.entry.features,
        areaM2: item.entry.areaM2,
        codiclas: item.entry.codiclas,
        params: Object.fromEntries(Object.entries(P).map(([k, v]) => [k, { status: v.status, verdict: v.verdict, value: v.value, units: v.units, why: v.why }])),
        drawability: d,
        articleRefsAll: parsed.articleRefsAll,
        articleOnEnvelopeParam: paramArticles,
        hasAnyArticle: parsed.articleRefsAll.length > 0,
        hasArticleOnEnvelopeParam: paramArticles.length > 0,
        deferredToPlanols: parsed.deferredToPlanols,
        // ⛔ emptyParse means "the fitxa published no parameter row at all".
        // It is only believable alongside codeCellsUnparsed === 0 — otherwise
        // it is the parser, not the publisher. Both are recorded.
        emptyParse: Object.keys(parsed.rows).length === 0,
        codeCellsSeen: parsed.codeCellsSeen,
        codeCellsUnparsed: parsed.codeCellsUnparsed,
        bytes: html.length,
      });
    } catch (err) {
      errors.push({ url: item.entry.url, error: String(err.message || err) });
    }
    done++;
    if (done % 25 === 0) console.error(`  fetched ${done}/${fetchSet.size} (errors ${errors.length})`);
    await sleep(90);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
console.error(`fetched ${results.size}, errors ${errors.length}`);

// ⛔ RUN-LEVEL PARSE-MISS GUARD, BEFORE ANY RATE IS COMPUTED.
const misses = [...results.values()].filter((r) => r.codeCellsUnparsed.length > 0);
const parseHealth = {
  pages: results.size,
  pagesWithUnparsedCodeCells: misses.length,
  examples: misses.slice(0, 10).map((r) => ({ url: r.url, cells: r.codeCellsUnparsed })),
  clean: misses.length === 0,
};
console.error(`parse health: ${misses.length} page(s) with unparsed code cells`);
if (!parseHealth.clean) {
  console.error('⛔ PARSER MISSED ROWS. Every rate below is a LOWER BOUND contaminated by parser failure.');
}

// ── ESTIMATORS ──────────────────────────────────────────────────────────────
const pct = (a, b) => (b ? +((100 * a) / b).toFixed(2) : null);

const IND = {
  complete: (r) => r.drawability.tier === 'COMPLETE',
  partialDrawable: (r) => r.drawability.tier === 'PARTIAL_DRAWABLE',
  anyDrawable: (r) => r.drawability.tier === 'COMPLETE' || r.drawability.tier === 'PARTIAL_DRAWABLE',
  notDrawable: (r) => r.drawability.tier === 'NOT_DRAWABLE',
  height: (r) => r.drawability.heightAny,
  heightStoreys: (r) => r.drawability.heightStoreys,
  heightMetres: (r) => r.drawability.heightMetres,
  occupation: (r) => r.drawability.occupation,
  far: (r) => r.drawability.far,
  anySetback: (r) => r.drawability.setbackCount > 0,
  threeOfThree: (r) => r.drawability.heightAny && r.drawability.occupation && r.drawability.far,
  articleAnywhere: (r) => r.hasAnyArticle,
  articleOnEnvelopeParam: (r) => r.hasArticleOnEnvelopeParam,
  emptyParse: (r) => r.emptyParse,
};

// D1 — uniform over fitxes, island-stratified, re-weighted to island fitxa counts.
const uRows = [...results.values()].filter((r) => r.arms.includes('U'));
const islandFitxaTotals = Object.fromEntries(
  Object.entries(byIsland).map(([k, v]) => [k, v.length]),
);
const allFitxaTotal = Object.values(islandFitxaTotals).reduce((s, n) => s + n, 0);
function d1(indicator) {
  let acc = 0, wsum = 0;
  const per = {};
  for (const isl of Object.keys(UNIFORM_PER_ISLAND)) {
    const rows = uRows.filter((r) => r.island === isl);
    if (!rows.length) continue;
    const rate = rows.filter(indicator).length / rows.length;
    per[isl] = { n: rows.length, hits: rows.filter(indicator).length, ratePct: +(100 * rate).toFixed(2) };
    const w = islandFitxaTotals[isl] || 0;
    acc += rate * w; wsum += w;
  }
  return { ratePct: wsum ? +((100 * acc) / wsum).toFixed(2) : null, nSampled: uRows.length, perIsland: per };
}

// D2 / D3 — land-weighted, certainty stratum + PPS remainder.
function landWeighted(indicator, filter = () => true) {
  const cRows = armC.filter((e) => filter(e)).map((e) => results.get(e.url)).filter(Boolean);
  const cArea = armC.filter(filter).reduce((s, e) => s + e.areaM2, 0);
  const cHitArea = cRows.filter(indicator).reduce((s, r) => s + r.areaM2, 0);

  // PPS arm: sum draw multiplicities, restricted to the filtered subpopulation.
  let pDraws = 0, pHits = 0, pMissing = 0;
  for (const [url, mult] of armPMultiplicity) {
    const e = inventory.find((x) => x.url === url);
    if (!filter(e)) continue;
    pDraws += mult;
    const r = results.get(url);
    if (!r) { pMissing += mult; continue; }
    if (indicator(r)) pHits += mult;
  }
  const remArea = remainder.filter(filter).reduce((s, e) => s + e.areaM2, 0);
  const subTotalArea = cArea + remArea;
  const pRate = pDraws - pMissing > 0 ? pHits / (pDraws - pMissing) : null;
  const cRate = cArea > 0 ? cHitArea / cArea : null;
  if (pRate === null && cRate === null) return null;
  const wC = subTotalArea ? cArea / subTotalArea : 0;
  const wR = subTotalArea ? remArea / subTotalArea : 0;
  return {
    ratePct: +(100 * ((cRate ?? 0) * wC + (pRate ?? 0) * wR)).toFixed(2),
    certainty: { fitxes: cRows.length, areaKm2: +(cArea / 1e6).toFixed(3), hitAreaKm2: +(cHitArea / 1e6).toFixed(3), ratePct: pct(cHitArea, cArea), weight: +wC.toFixed(4) },
    ppsRemainder: { draws: pDraws, usable: pDraws - pMissing, hits: pHits, ratePct: pRate === null ? null : +(100 * pRate).toFixed(2), weight: +wR.toFixed(4) },
    subpopulationAreaKm2: +(subTotalArea / 1e6).toFixed(3),
  };
}

const isPrivate = (e) => e && e.zoneClass === 'PRIVATE_DEVELOPABLE';
const isBuildingCapable = (e) => e && (e.zoneClass === 'PRIVATE_DEVELOPABLE' || e.zoneClass === 'FACILITY');

const R = {
  probe: 'e6-fitxa-census',
  runAt: new Date().toISOString(),
  seed: SEED,
  design: {
    armU: { perIsland: UNIFORM_PER_ISLAND, drawn: armU.length, byIsland: armUByIsland },
    armC: { n: armC.length, areaKm2: +(certaintyArea / 1e6).toFixed(3), shareOfBuildableLandPct: pct(certaintyArea, totalArea) },
    armP: { draws: PPS_DRAWS, uniqueUrls: armPMultiplicity.size, remainderAreaKm2: +(remainderArea / 1e6).toFixed(3) },
    pagesFetched: results.size,
    fetchErrors: errors.length,
  },
  parseHealth,
  denominators: {
    allQualificacionsFeatures: 46607,
    buildableFeatures: inv.controls.oracleCount,
    buildableAreaKm2: +(totalArea / 1e6).toFixed(3),
    distinctBuildableFitxes: inventory.length,
    byZoneClass: (() => {
      const m = {};
      for (const e of inventory) {
        m[e.zoneClass] ||= { fitxes: 0, features: 0, areaM2: 0 };
        m[e.zoneClass].fitxes++; m[e.zoneClass].features += e.features; m[e.zoneClass].areaM2 += e.areaM2;
      }
      return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v, areaKm2: +(v.areaM2 / 1e6).toFixed(3), shareOfBuildablePct: pct(v.areaM2, totalArea) }]));
    })(),
  },
  D1_perFitxa_uniform: Object.fromEntries(Object.entries(IND).map(([k, f]) => [k, d1(f)])),
  D2_perKm2_allBuildable: Object.fromEntries(Object.entries(IND).map(([k, f]) => [k, landWeighted(f)])),
  D3_perKm2_privateDevelopable: Object.fromEntries(Object.entries(IND).map(([k, f]) => [k, landWeighted(f, isPrivate)])),
  D3b_perKm2_buildingCapable: Object.fromEntries(Object.entries(IND).map(([k, f]) => [k, landWeighted(f, isBuildingCapable)])),
  perParameter: (() => {
    const rows = [...results.values()];
    const out = {};
    for (const c of ENVELOPE_CODES) {
      const s = { ABSENT: 0, PRESENT_EMPTY: 0, PRESENT_VALID: 0, PRESENT_SUSPECT: 0, PRESENT_UNUSABLE: 0, PRESENT_ZERO_AMBIGUOUS: 0 };
      for (const r of rows) {
        const p = r.params[c];
        if (!p || p.status === 'ABSENT') s.ABSENT++;
        else if (p.status === 'PRESENT_EMPTY') s.PRESENT_EMPTY++;
        else s[`PRESENT_${p.verdict}`] = (s[`PRESENT_${p.verdict}`] || 0) + 1;
      }
      out[c] = { ...s, n: rows.length, validPct: pct(s.PRESENT_VALID, rows.length) };
    }
    return out;
  })(),
  zoneClassBreakdown: (() => {
    const rows = [...results.values()];
    const out = {};
    for (const zc of ['PRIVATE_DEVELOPABLE', 'FACILITY', 'NON_ENVELOPE']) {
      const rs = rows.filter((r) => r.zoneClass === zc);
      out[zc] = {
        nFitxesSampled: rs.length,
        completePct: pct(rs.filter(IND.complete).length, rs.length),
        partialPct: pct(rs.filter(IND.partialDrawable).length, rs.length),
        anyDrawablePct: pct(rs.filter(IND.anyDrawable).length, rs.length),
        emptyParsePct: pct(rs.filter(IND.emptyParse).length, rs.length),
      };
    }
    return out;
  })(),
  errors,
};

fs.writeFileSync(path.join(OUT, 'e6-fitxa-census.json'), JSON.stringify({ ...R, fitxes: [...results.values()] }, null, 2));

const line = (label, v) => console.error(`  ${label.padEnd(30)} ${v === null || v === undefined ? 'n/a' : v}`);
console.error('\n=== D1 · per fitxa, uniform (like-for-like with the 36.7 % baseline) ===');
for (const k of ['threeOfThree', 'complete', 'partialDrawable', 'anyDrawable', 'height', 'occupation', 'far', 'anySetback', 'articleAnywhere', 'articleOnEnvelopeParam']) line(k, R.D1_perFitxa_uniform[k]?.ratePct + ' %');
console.error('\n=== D2 · per km² of ALL buildable land ===');
for (const k of ['threeOfThree', 'complete', 'partialDrawable', 'anyDrawable', 'articleAnywhere', 'articleOnEnvelopeParam']) line(k, R.D2_perKm2_allBuildable[k]?.ratePct + ' %');
console.error('\n=== D3 · per km² of PRIVATE DEVELOPABLE land ===');
for (const k of ['threeOfThree', 'complete', 'partialDrawable', 'anyDrawable', 'articleAnywhere', 'articleOnEnvelopeParam']) line(k, R.D3_perKm2_privateDevelopable[k]?.ratePct + ' %');
console.error('\nzoneClassBreakdown:', JSON.stringify(R.zoneClassBreakdown, null, 2));
console.error('errors:', errors.length);
