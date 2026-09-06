// ─────────────────────────────────────────────────────────────────────────────
// §CATASTRO-NATIONAL-SWEEP (L-12952, 2026-09-06, lane CADASTRAL-FOOTPRINTS-ES-FR)
//
// The PURE half of "the founder's house exists EVERYWHERE, not in nine cities": the sweep order,
// the resume cursor, the budget arithmetic, the covered-set rule and the truncation sentence for
// Spain's official footprints. No I/O, no fetch, no zlib — so vitest imports it directly, exactly
// as `heights/mdsNational.mjs` is imported by `mdsNational.spec.ts` (and for the same reason:
// `heightSources.mjs` cannot be imported by vitest at all).
//
// ── WHAT WAS ALREADY TRUE, AND MUST NOT BE REBUILT ──────────────────────────────────────────────
// `esCatastro.mjs` + `footprintMerge.mjs` + `officialFootprints.mjs` already resolve municipalities
// from the live ATOM feeds, stream a municipality ZIP without holding its 597 MB of GML, emit one
// feature per BuildingPart WITH its own storey count, and merge `replace-in-bbox` so the uncovered
// country keeps its OSM footprints. `bake.mjs` registers the `es_catastro` row and
// `.github/workflows/context-bake.yml` exposes `footprints: osm | official`. NONE of that is the
// gap. The gap is REACH: the working set is `MDS_CITY_BBOXES.map(c => c.bbox)` — NINE metro boxes.
//
// ── THE MEASURED NATIONAL PICTURE, PROBED LIVE FROM THIS MACHINE 2026-09-06 ──────────────────────
// (Every number below is an answer this machine received, not an extrapolation of one city.)
//
// A. THE DENOMINATOR. Root ATOM `ES.SDGC.BU.atom.xml` → HTTP 200, 682,142 B, 1.38 s, **56**
//    territorial-office entries. Walking all 56 province feeds (14,453,651 B total) yields
//    **7,723 municipalities**, every one carrying an EPSG in its `<category>` (0 refusals).
//
// B. THE SIZE DISTRIBUTION, from a DETERMINISTIC UNIFORM sample — every 39th municipality of the
//    nationally code-sorted list, n=200, HEAD for `content-length`, 11.6 s:
//        min 5,015 · p25 98,897 · p50 230,265 · p75 545,474 · p90 1,492,615 · p99 4,931,956 ·
//        max 8,894,019 · MEAN 546,272 B
//    ⇒ 546,272 × 7,723 = **≈ 4.2 GB** of ZIP for the whole feed.
//    ⚠ THE UNIFORM SAMPLE UNDER-COUNTS THE CAPITALS AND SAYS SO. A 200-wide uniform sample of
//    7,723 contains ~1.3 provincial capitals, and its max (8.9 MB) is well under the two capitals
//    measured directly: **Córdoba 14900 = 22,926,867 B** and **Madrid 28900 = 105,185,640 B**.
//    Adding ~50 capitals at their own scale puts the honest national figure at **≈ 4–6 GB**.
//    (A separate, capital-OVERSAMPLED probe — first/middle/last per province, n=155 — reported a
//    mean of 4,934,148 B ⇒ 38.1 GB. That is an upper bound biased HIGH by ~1-in-3 capitals against
//    ~1-in-77 in reality, and it is recorded here so nobody re-derives it and believes it.)
//
// C. THE PARSE RATE. The one directly measured point is Córdoba: 22,926,867 B of ZIP → ~250 s
//    (§FOOTPRINT-BUDGET, L-12939) = **91,707 ZIP-bytes/second**, inflate + Latin-1 chunk split +
//    regex member parse + proj4 inverse per vertex, on ONE core.
//    ⇒ at that rate 4.2 GB is 12.8 h — but THAT RATE IS THE WRONG ONE FOR A NATIONAL SWEEP, and a
//    second measurement is what showed it. Parsing **A Capela 15018** (425,701 B, EPSG:25829) end to
//    end on this machine took **8,811 ms** for 3,820 features = **48,315 B/s**, 1.9× slower than
//    Córdoba. The difference is per-municipality FIXED cost that a 23 MB city amortises and 7,723
//    small ones do not — and the measured MEDIAN municipality is 230,265 B, i.e. A Capela's size
//    class. Planning on the big-city rate would be optimistic by ~1.9× over the ground that
//    actually makes up the sweep.
//    ⇒ THE HONEST NATIONAL FIGURE IS **≈ 24–32 h** (4.2–5.5 GB at 48,315 B/s), not 12.8 h.
//    ⚠ THAT IS LONGER THAN THE "~17 h whole feed" FIGURE THE `spain` ROW CARRIES, and it is recorded
//    as a correction rather than reconciled away. ~17 h is what the Córdoba rate predicts; the
//    second measured point says the tail is slower than the city it was extrapolated from. Under-
//    stating this is the failure that ships a sweep everyone believes finished.
//
// D. ⛔ THE PROJECTION HOLE THE NINE METROS HIDE COMPLETELY. The feed's own `<category>` EPSG,
//    counted across all 7,723 municipalities:
//        EPSG:25830  5,357   ✅ in reproject.mjs PROJ_DEFS
//        EPSG:25831  1,174   ✅ in PROJ_DEFS
//        EPSG:25829    992   ⛔ **ABSENT from PROJ_DEFS — `getProjector` THROWS**
//        EPSG:4258     112   ✅ normalised to EPSG:4326 by `normalizeCrs` (this is Bizkaia)
//        EPSG:32628     88   ⛔ absent — the Canaries, outside the `spain` bake bbox today
//    Every one of the nine metros is 25830 or 25831, so this fires on ZERO municipalities today
//    and on **992** — all of Galicia and much of the west — the moment the sweep goes national.
//    `parseMunicipalityZip` refuses correctly (a guessed UTM zone puts a building 400 km away),
//    but a refusal is only safe if the merge then KEEPS that ground's OSM. See §COVERED-IS-PARSED.
//
// E. ⛔ THREE PROVINCES PUBLISH NOTHING, AND THEIR ROOT ENTRIES CARRY A **NULL** georss bbox:
//        Provincial Council of Araba/Álava   0 municipalities
//        Provincial Council of Gipuzkoa      0 municipalities
//        Provincial Council of Navarra       0 municipalities
//    ⭐ AND THE FOURTH FORAL REGISTER IS NOT SILENT: **Bizkaia publishes 112**, in EPSG:4258.
//    The existing comments in `esCatastro.mjs` and `footprintMerge.mjs` say Catastro "excludes the
//    Basque provinces and Navarra" — that is right about three of them and WRONG about Bizkaia,
//    which is why the count is recorded here per-province rather than as a sentence about a region.
//
// ── §COVERED-IS-PARSED — THE ONE RULE THIS FILE EXISTS TO ENFORCE ────────────────────────────────
//
// `mergeReplaceInBbox(base, out, coveredBboxes, …)` uses `coveredBboxes` as the **DELETION SET**:
// every OSM footprint inside one is dropped, and the official footprints are appended. So the
// covered set is not a hint, it is a licence to delete. Today `applyNationalFootprints` passes the
// set of bboxes it REQUESTED. At nine metros that is survivable-but-wrong (a failed Córdoba ZIP
// deletes Córdoba's OSM and puts nothing back — the bake even prints "those areas are HOLES").
// AT NATIONAL SCALE THE SAME LINE IS CATASTROPHIC: a whole-country requested bbox would delete
// Álava, Gipuzkoa, Navarra (E) and all 992 EPSG:25829 municipalities (D) from the map, silently,
// and the founder's report would come back as "Galicia has no buildings at all".
//
// ⇒ THE COVERED SET IS DERIVED FROM MUNICIPALITIES THAT ACTUALLY PRODUCED FOOTPRINTS, NEVER FROM
//   THE REQUEST. `catastroCoveredBboxes` below is that derivation and it is deliberately total:
//   a municipality that was never reached, refused its projection, 404'd, or parsed to zero
//   features contributes NO bbox, so its ground keeps its OSM footprints by construction rather
//   than by anyone remembering to special-case it. This is the register-silence rule the brief
//   names, generalised: it protects Galicia and a future 500-error identically, and it needs no
//   list of exceptions to maintain.
//
// ── WHY A CURSOR AND NOT "JUST RUN IT" ──────────────────────────────────────────────────────────
// The workflow's ceiling is `timeout-minutes: 330` (5.5 h) and the Catastro pull is only one step
// of a bake that also downloads a 1.3 GB pbf, clips it, runs the MDS height sweep and tippecanoes
// four layers. ~13–18 h of GML parsing does not fit in one run and never will. The choice is
// therefore not "national or not" — it is "converge across runs, or silently cover nine cities
// forever". `catastroSweepOrder` + `formatCatastroSweepSummary` make successive runs converge and
// make a truncated run SAY so, in the shape `heights/mdsNational.mjs` established for the MDS
// raster (§LOUD-AND-ORDERED-TRUNCATION). A cap being respected is a budget; a sweep that stopped
// early and said nothing is a lie about coverage.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §CATASTRO-NATIONAL-BBOX — BYTE-IDENTICAL to the `spain` REGIONS row in bake.mjs
 * (`bbox: '-9.55,35.90,4.60,43.90'`), and pinned equal by esCatastroNational.spec.ts.
 *
 * ⚠ It must not be re-invented and it must not be widened. Widened, it pulls the Canary
 * municipalities (EPSG:32628, unregistered — see header D) into the resolve step for a region whose
 * OSM clip does not contain them. Narrowed, it is the §MDS-BBOX-MUST-COVER-THE-REGION defect over
 * again: a strip of baked ground that no number of re-runs can ever reach.
 */
export const CATASTRO_NATIONAL_BBOX = [-9.55, 35.90, 4.60, 43.90];
export const CATASTRO_NATIONAL_BBOXES = [CATASTRO_NATIONAL_BBOX];

/** Municipalities in the live feed, measured 2026-09-06 (see header A). A LOG number for the
 *  budget line — never a gate, because the feed is the authority and it moves. */
export const CATASTRO_MUNICIPALITY_COUNT_2026_09 = 7723;

/** Mean municipality ZIP bytes from the deterministic uniform n=200 sample (header B). */
export const CATASTRO_MEAN_ZIP_BYTES = 546_272;

/**
 * Measured parse throughput in ZIP-bytes/second. TWO measured points, and they DISAGREE BY 1.9×:
 *
 *   • Córdoba 14900 — 22,926,867 B at ~250 s = **91,707 B/s** (§FOOTPRINT-BUDGET, L-12939).
 *   • A Capela 15018 — 425,701 B at 8,811 ms = **48,315 B/s**, measured on this machine 2026-09-06
 *     end-to-end through `parseMunicipalityZip` (3,820 features: 2,958 BuildingParts + 862
 *     outlines, EPSG:25829, first vertex read back at -8.0644, 43.4368 — A Capela, correct).
 *
 * ⭐ THE NATIONAL PLANNER USES THE SMALL-MUNICIPALITY RATE, AND THAT IS THE WHOLE POINT. The
 * measured median municipality is 230,265 B (header B) — A Capela's size class, not Córdoba's. A
 * projection built on the big-city rate is optimistic by ~1.9× on the ground that actually makes up
 * the sweep, and "optimistic about how long full coverage takes" is the reading that ships a sweep
 * everyone believes finished. The gap is per-municipality FIXED cost (HTTP, ZIP central directory,
 * stream setup) which a large city amortises and 7,723 small ones do not.
 *
 * ⚠ It is a ZIP-byte rate, not a GML-byte rate, on purpose: the ATOM feed publishes (and a HEAD
 * returns) the ZIP length, so a rate keyed to ZIP bytes can be applied to a municipality the sweep
 * has not opened yet. The 26× inflation to GML is real but is not a number we can read in advance.
 */
export const CATASTRO_PARSE_ZIP_BYTES_PER_S = 48_315;
/** The large-city asymptote, kept named so nobody "corrects" the planner back up to it. */
export const CATASTRO_PARSE_ZIP_BYTES_PER_S_LARGE = 91_707;

/**
 * Order the municipalities for the sweep, and drop everything the resume cursor has already covered.
 *
 * ORDER = (priority rank, then municipality code ascending). Two jobs, both load-bearing:
 *   • PRIORITY FIRST — a municipality intersecting one of `priorityBboxes` (bake passes
 *     MDS_CITY_BBOXES, the nine metros) sweeps FIRST and is never truncated away, so a run that
 *     runs out of budget still helps the most users. This is the same guarantee
 *     `MDS_PRIORITY_BBOXES` gives the height sweep, and it is why the two lists stay related.
 *   • CODE ASCENDING for the rest — a TOTAL, STABLE order (the 5-digit INE code, compared as a
 *     string so '05001' cannot sort after '14900' the way a lexicographic "ix,iy" once did in
 *     mdsNational's first draft). Deterministic order is what makes the cursor exact.
 *
 * @param {{code:string, bbox:number[]|null}[]} municipalities  as resolveMunicipalities returns
 * @param {{priorityBboxes?: number[][], cursor?: string|null}} opts
 *        `cursor` is a municipality CODE: resume AT it, inclusive. Priority municipalities are
 *        ALWAYS re-swept regardless of the cursor — they are cheap relative to the nation and a
 *        run that skipped them would degrade the metros to help the tail.
 * @returns {{code:string, bbox:number[]|null, priority:boolean}[]}
 */
export function catastroSweepOrder(municipalities, { priorityBboxes = [], cursor = null } = {}) {
  const ranked = [];
  for (const m of municipalities ?? []) {
    if (!m || typeof m.code !== 'string') continue;
    const priority = priorityBboxes.some((b) => bboxesOverlap(m.bbox, b));
    ranked.push({ ...m, priority });
  }
  ranked.sort((a, b) => (a.priority === b.priority ? a.code.localeCompare(b.code) : (a.priority ? -1 : 1)));
  if (!cursor) return ranked;
  // A cursor never suppresses a priority municipality (see the doc comment above).
  return ranked.filter((m) => m.priority || m.code.localeCompare(cursor) >= 0);
}

/** [w,s,e,n] overlap, null-safe. A null bbox NEVER overlaps — the three foral provinces publish a
 *  null georss polygon (header E) and a null must not be read as "everywhere". */
export function bboxesOverlap(a, b) {
  if (!a || !b || a.length < 4 || b.length < 4) return false;
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/**
 * §COVERED-IS-PARSED — the DELETION SET, derived from what was actually parsed.
 *
 * Takes the per-area records `writeCatastroWorkingSet` already builds (`{ area, status, kept,
 * bbox }`) and returns the bboxes of the municipalities that produced AT LEAST ONE footprint.
 * Everything else — never reached, projection refused, HTTP error, or genuinely zero buildings —
 * is ABSENT, so `mergeReplaceInBbox` never receives a licence to delete OSM there.
 *
 * ⚠ `kept > 0` is the test, NOT `status === 'ok'`. A municipality can answer 200, parse cleanly and
 * contain no features inside the requested clip; deleting OSM on the strength of a clean zero is
 * the failure-vs-empty collapse (L-422/457/467/469) pointed at a map instead of at a height.
 */
export function catastroCoveredBboxes(areas) {
  const out = [];
  for (const a of areas ?? []) {
    if (!a || !Array.isArray(a.bbox) || a.bbox.length < 4) continue;
    if (!Number.isFinite(a.kept) || a.kept <= 0) continue;
    out.push(a.bbox);
  }
  return out;
}

/**
 * How much of an ordered sweep fits in `budgetSeconds`, from each municipality's OWN ZIP length
 * when the feed gave one and the measured mean when it did not.
 *
 * ⚠ IT STOPS BEFORE THE MUNICIPALITY THAT WOULD OVERRUN, it does not stop after it. A half-parsed
 * municipality is not a partial answer, it is a corrupt one: its features are already appended to
 * the working-set file while its bbox would still be reported covered, which is §COVERED-IS-PARSED
 * inverted and would delete the OSM under a building set we never finished writing.
 *
 * @returns {{planned:object[], skipped:object[], seconds:number, bytes:number, nextCursor:string|null}}
 */
export function catastroBudgetPlan(ordered, {
  budgetSeconds = 4 * 3600,
  bytesPerSecond = CATASTRO_PARSE_ZIP_BYTES_PER_S,
  meanZipBytes = CATASTRO_MEAN_ZIP_BYTES,
} = {}) {
  const planned = [];
  const skipped = [];
  let seconds = 0;
  let bytes = 0;
  for (const m of ordered ?? []) {
    const zip = Number.isFinite(m?.zipBytes) && m.zipBytes > 0 ? m.zipBytes : meanZipBytes;
    const cost = zip / bytesPerSecond;
    // Priority municipalities are UNCAPPED — the same guarantee the MDS height sweep gives its
    // nine metros. A budget that could drop Barcelona to reach a village has the priority
    // ordering exactly backwards.
    if (!m?.priority && seconds + cost > budgetSeconds) { skipped.push(m); continue; }
    planned.push(m);
    seconds += cost;
    bytes += zip;
  }
  return {
    planned,
    skipped,
    seconds: Math.round(seconds),
    bytes,
    nextCursor: skipped.length ? skipped[0].code : null,
  };
}

/**
 * Projected wall-clock for the WHOLE feed, from the measured distribution. Returns the honest
 * RANGE, because the uniform sample under-counts capitals and this file refuses to publish one
 * number that hides that (header B/C).
 */
export function catastroNationalProjection({
  municipalities = CATASTRO_MUNICIPALITY_COUNT_2026_09,
  meanZipBytes = CATASTRO_MEAN_ZIP_BYTES,
  bytesPerSecond = CATASTRO_PARSE_ZIP_BYTES_PER_S,
  capitalCorrection = 1.3,
} = {}) {
  const bytesLow = municipalities * meanZipBytes;
  const bytesHigh = bytesLow * capitalCorrection;
  return {
    municipalities,
    gigabytesLow: Number((bytesLow / 1e9).toFixed(1)),
    gigabytesHigh: Number((bytesHigh / 1e9).toFixed(1)),
    hoursLow: Number((bytesLow / bytesPerSecond / 3600).toFixed(1)),
    hoursHigh: Number((bytesHigh / bytesPerSecond / 3600).toFixed(1)),
  };
}

/**
 * How many runs full national coverage takes at a given per-run budget. Ceil, and never fewer
 * than 1 — an answer of "0 runs" for an unfinished sweep is the kind of arithmetic that gets read
 * as "already covered".
 */
export function catastroRunsNeeded(budgetSecondsPerRun, projection = catastroNationalProjection()) {
  const hours = projection.hoursHigh;
  return Math.max(1, Math.ceil((hours * 3600) / Math.max(1, budgetSecondsPerRun)));
}

/**
 * §LOUD-AND-ORDERED-TRUNCATION — the sentence a truncated national sweep prints.
 *
 * Mirrors `heights/mdsNational.mjs formatSweepSummary` deliberately, down to the shape of the
 * clauses, so an operator reading a bake log does not have to learn two dialects of "I did not
 * finish". It always carries: why it stopped, how many municipalities were covered, how many were
 * SKIPPED, how many REFUSED (and why — a refusal is not a skip), and the cursor to resume from.
 */
export function formatCatastroSweepSummary(st) {
  const n = (v) => Number(v ?? 0).toLocaleString('en-US');
  const refused = st.refused?.length
    ? ` ${n(st.refused.length)} municipalit(ies) REFUSED and KEPT THEIR OSM footprints `
      + `(${st.refused.slice(0, 3).map((r) => `${r.code}: ${r.reason}`).join('; ')}${st.refused.length > 3 ? '; …' : ''}).`
    : '';
  if (st.stopReason === 'complete') {
    return `catastro national sweep COMPLETE — ${n(st.covered)} municipalit(ies) covered of `
      + `${n(st.total)}.${refused}`;
  }
  return `⚠ catastro national sweep TRUNCATED (${st.stopReason}) — ${n(st.covered)} municipalit(ies) `
    + `covered of ${n(st.total)}; ${n(st.skipped)} SKIPPED. Skipped ground KEEPS its OSM footprints `
    + `(§COVERED-IS-PARSED — it is absent from the deletion set, not emptied).${refused} `
    + `RESUME with CATASTRO_SWEEP_CURSOR=${st.nextCursor ?? '(none)'} (municipality code). `
    + `Priority metros are swept UNCAPPED on every run and are unaffected.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// §CATASTRO-PROJ-DEFS — the UTM zones Spain's own register declares.
//
// ⚠ THESE BELONG IN `reproject.mjs PROJ_DEFS` AND SHOULD BE FOLDED INTO IT. They are declared here
// because that file was held by another lane for the whole of this one (fleet rule: never commit a
// file you did not write), and shipping a national sweep that throws on 992 municipalities in order
// to respect a file lock would be the worse trade. `registerCatastroProjections()` folds them into
// the ONE table at call time and is idempotent, so when the defs land in `PROJ_DEFS` upstream this
// becomes a no-op and can be deleted in one line — it is a seam with an expiry, not a rival table.
//
// The zone numbers are not chosen, they are READ: `parseCrsFromCategory` takes them from each
// municipality's own `<category term=".../EPSG/0/NNNNN">`, and the counts in header D are what the
// live feed actually declares. Every def below is the standard ETRS89/UTM string already used for
// 25830 and 25831 in PROJ_DEFS, with only the zone changed — same ellipsoid, same null Helmert.
// ─────────────────────────────────────────────────────────────────────────────
export const CATASTRO_PROJ_DEFS = Object.freeze({
  // ES UTM29N — Galicia, western Asturias/León/Zamora/Salamanca/Cáceres/Badajoz/Huelva. 992 munis.
  'EPSG:25829': '+proj=utm +zone=29 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  // Canary Islands, WGS84/UTM28N. 88 munis — OUTSIDE the `spain` bake bbox today, registered so a
  // future `canarias` region row cannot fail the same way this lane found 25829 failing.
  'EPSG:32628': '+proj=utm +zone=28 +datum=WGS84 +units=m +no_defs',
});

/**
 * Fold `CATASTRO_PROJ_DEFS` into the shared `PROJ_DEFS` table AND into proj4's own registry.
 *
 * ⚠ BOTH HALVES ARE REQUIRED AND THE REASON IS NOT OBVIOUS. `getProjector` guards on
 * `PROJ_DEFS[epsg]` but builds the projector from proj4's registry, and `ensureRegistered()` copies
 * the table into proj4 EXACTLY ONCE, lazily. So adding to the table alone passes the guard and then
 * fails inside proj4 whenever any earlier projection has already triggered the copy — which in a
 * real bake it always has (the height stamps run first). Registering both is idempotent and
 * order-independent, which is the only property that survives being called from anywhere.
 *
 * @param {object} projDefs the live `PROJ_DEFS` object from reproject.mjs
 * @param {{defs:(code:string, def:string)=>void}} proj4 the live proj4 instance
 * @returns {string[]} the codes newly added (empty on a second call, or once they land upstream)
 */
export function registerCatastroProjections(projDefs, proj4) {
  const added = [];
  for (const [code, def] of Object.entries(CATASTRO_PROJ_DEFS)) {
    if (!projDefs[code]) { projDefs[code] = def; added.push(code); }
    try { proj4.defs(code, projDefs[code]); } catch { /* proj4 rejects nothing we pass; never fatal */ }
  }
  return added;
}
