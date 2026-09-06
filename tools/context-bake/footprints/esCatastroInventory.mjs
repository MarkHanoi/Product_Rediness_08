// ─────────────────────────────────────────────────────────────────────────────
// §CATASTRO-MEASURED-INVENTORY (L-12969, 2026-09-06, lane ES-VILLAGE-CATASTRO-SWEEP)
//
// THE FOUNDER'S REPORT THIS ANSWERS. From his own village, HORNACHUELOS (Córdoba, 37.8341/-5.2490):
// "I can select a cadastral parcel — perfect — but it is not represented nor in 2d view neither on
// 3dsite — THIS WILL AFFECT MOST VILLAGES". The pipeline was EXONERATED (L-12969): the client read
// 36 baked tiles with no failure and got 32 buildings, because OSM ITSELF holds 25 building ways
// there. Catastro holds 2,856 buildings + 9,117 BuildingParts for the same municipality — 114×.
// The fix is therefore REACH, and the thing blocking reach was never code: it was a COST PREMISE.
//
// ⛔ THE PREMISE THAT WAS WRONG, AND WHY IT WAS WRONG. `esCatastro.mjs streamFeatureMembers` says
// "~250 s per city-sized municipality … roughly 250x Córdoba, i.e. ~17 h", and that sentence is why
// the Catastro working set stayed pinned to the nine MDS_CITY_BBOXES metros. NONE of the nine is a
// village, so `--footprints official` as scoped could not fix this report at all. The 250 s is a
// MEASURED number, but it is measured on the single most expensive municipality in the province,
// and it was extrapolated to 7,600 municipalities whose MEDIAN is 249,257 B — ninety times smaller.
//
// ── WHAT THIS FILE IS ───────────────────────────────────────────────────────────────────────────
// The measured national inventory and the budget derived FROM it, kept pure (no I/O, no fetch) so
// vitest imports it directly — the same reason `esCatastroNational.mjs` and `heights/mdsNational.mjs`
// are split this way.
//
// ⚠ IT DOES NOT DUPLICATE `esCatastroNational.mjs`. That file (lane CADASTRAL-FOOTPRINTS-ES-FR) owns
// the sweep machinery — `catastroSweepOrder`, `catastroBudgetPlan`, `catastroCoveredBboxes`,
// `formatCatastroSweepSummary`, `registerCatastroProjections` — and it is CORRECT and stays the
// authority on all of them. This file supplies the MEASUREMENTS those functions should be
// parameterised by, and one ordering they do not offer. Where the two disagree on a number, the
// disagreement is recorded below by name rather than silently resolved, because both were probed on
// the same day and only one of each pair can be true.
//
// ── A. THE DENOMINATOR — FULL WALK, NOT A SAMPLE (measured 2026-09-06, this machine) ─────────────
// Root ATOM `ES.SDGC.BU.atom.xml` → HTTP 200, 682,565 B, 1.30 s, **56 `<entry>` elements**:
//   · **52 "Territorial office NN"** entries — the common regime, per-municipality ZIPs. These are
//     the "52 province ATOMs" the brief names, and they are the whole of the ES.SDGC working set.
//   · **4 foral councils** — Araba/Álava, Bizkaia, Gipuzkoa, Navarra — whose enclosures point at
//     THEIR OWN DOMAINS and carry no ES.SDGC municipality ZIP. See §FORAL-DELEGATION below.
// Walking all 52 office ATOMs: **7,611 municipalities, 0 duplicate codes, 0 refusals.**
// HEAD on every one of the 7,611 ZIPs (383.1 s at concurrency 12): **7,611 / 7,611 HTTP 200 with a
// Content-Length. Zero refusals, zero missing lengths.** So the size distribution below is a CENSUS,
// not an extrapolation — which matters, because every earlier figure in this tree was a sample.
//
// ⚠ THREE MUNICIPALITY COUNTS EXIST IN THIS REPO AND THEY DISAGREE. `esCatastro.mjs` says **7,597**
// ("HEAD-swept 2026-09-05, 52 provinces"), `esCatastroNational.mjs` says **7,723** (walk of "56
// province feeds"), this file says **7,611** (full walk + full HEAD, 2026-09-06). The 7,723 counts
// the 4 foral council feeds as province feeds; they contribute no ES.SDGC municipality, which is
// most of the gap. ⛔ NONE of the three is "~8,131" — that is Spain's civil municipality count, and
// Catastro's common regime does not cover the four foral territories, so the register's denominator
// is ~520 SMALLER than the country's by construction. Do not reconcile them by preferring the
// biggest; the feed is the authority and it moves.
//
// ── B. THE SIZE CENSUS (all 7,611, bytes from Content-Length) ────────────────────────────────────
//   TOTAL **5,726,101,818 B = 5.73 GB**
//   min 5,015 · p10 56,447 · p25 108,494 · **MEDIAN 249,257** · p75 691,223 · p90 1,666,720 ·
//   p99 6,807,096 · max 105,185,640 (28900-MADRID) · MEAN 752,346
// ⚠ **THE MEAN IS 3.0x THE MEDIAN** — the distribution is extremely long-tailed, which is exactly
// why one sample point cannot budget it and why `esCatastroNational.mjs`'s uniform n=200 sample
// (mean 546,272 B ⇒ 4.2 GB) UNDER-COUNTS by 27% against this census. Its own header says the uniform
// sample under-counts capitals and applies a x1.3 correction; the measured answer is 5.73 GB, so the
// correction was in the right direction and still short. **Plan on 5.73 GB.**
//
// ── C. THE PARSE CURVE — THREE POINTS, NOT ONE (end-to-end through `parseMunicipalityZip`) ───────
// Every row below was parsed on this machine 2026-09-06 from the real ZIP, emitting real Features:
//
//   MUNICIPALITY            ZIP BYTES     FETCH     PARSE      ZIP-B/s    FEATURES   B/FEATURE
//   14036 HORNACHUELOS      1,381,659    1,573 ms   6,189 ms   223,244     11,973      115
//     (village — the founder's own; 9,117 parts + 2,856 buildings, EXACTLY the L-12969 counts)
//   14038 LUCENA            6,092,851    1,531 ms  54,956 ms   110,868     50,908      120
//     (mid town, ~43k people)
//   14900 CORDOBA          22,926,867    5,269 ms 181,032 ms   126,645    192,956      119
//     (metro — the municipality the ~250 s premise was measured on)
//
// ⭐ **BYTES-PER-FEATURE IS ESSENTIALLY CONSTANT (115 / 120 / 119).** That is the finding that makes
// a ZIP-byte budget legitimate at all: ZIP size is a faithful proxy for feature count across two
// orders of magnitude, so a rate keyed to ZIP bytes — which a HEAD can read BEFORE fetching — can be
// applied to a municipality the sweep has not opened. It also means the cost is dominated by the
// per-feature regex pass, exactly as `streamFeatureMembers`'s own comment concluded.
//
// ⭐ **CÓRDOBA PARSED IN 181 s, NOT 250 s** — and that run was CONTENDED (15 fleet lanes plus a
// concurrent 7,611-URL HEAD sweep on this box). The ~250 s figure is not fabricated, but it is the
// pessimistic end of a range, and it was the only point the national extrapolation ever had.
//
// ⚠ **THE RATE IS NOT CONSTANT AND THIS FILE REFUSES TO PUBLISH ONE NUMBER FOR IT.** The three rows
// span 110,868–223,244 B/s, and a re-parse of the SAME cached Hornachuelos ZIP under heavier load
// took 11,942 ms (115,697 B/s) against 6,189 ms (223,244 B/s) minutes earlier — **1.93x on identical
// input**. So the spread is dominated by MACHINE CONTENTION, not by municipality size. The planner
// therefore uses the SLOWEST measured rate and states the range.
//
// ⛔ **AND IT CONTRADICTS `esCatastroNational.mjs`'s 48,315 B/s.** That constant comes from A Capela
// (425,701 B in 8,811 ms) and is **2.3x–4.6x slower than all three points here**, on a file smaller
// than every one of them. A single cold-start parse — module load, proj4 `ensureRegistered()`, first
// JIT — attributed to an unusually small file will read exactly like that. The consequence is not
// academic: 48,315 B/s puts full ES coverage at 24–32 h, this census + curve puts it at ~17.5 h, and
// the difference is two whole dispatch runs. **Neither number should be trusted without a re-run on
// an idle box; both are recorded so the next lane re-measures instead of picking.**
//
// ── D. THE PROJECTION HOLE, NOW QUANTIFIED IN BYTES ──────────────────────────────────────────────
// EPSG census over all 7,611 (from each municipality's own `<category>`):
//   EPSG:25830  5,357 munis  3,467 MB  ✅ in reproject.mjs PROJ_DEFS
//   EPSG:25831  1,174 munis  1,005 MB  ✅ in PROJ_DEFS
//   EPSG:25829    992 munis  1,005 MB  ⛔ ABSENT from PROJ_DEFS — `getProjector` THROWS
//   EPSG:32628     88 munis    249 MB  ⛔ ABSENT — the Canaries
// ⇒ **1,080 municipalities = 1,254 MB = 21.9% OF THE NATIONAL FEED would refuse to parse.** All nine
// metros are 25830/25831, so this fires on ZERO municipalities today. `esCatastroNational.mjs
// registerCatastroProjections` already fixes it and `parseMunicipalityZip` already calls it before
// `getProjector`; this file only supplies the blast radius, which had been stated as a count and is
// better understood as a fifth of the country. ⚠ There is NO EPSG:4258 municipality in the feed —
// see §FORAL-DELEGATION for where that code actually appears.
//
// ── E. §FORAL-DELEGATION — THE REGISTER IS NOT SILENT, IT DELEGATES ──────────────────────────────
// ⛔ THE CORRECTION THIS SECTION EXISTS FOR. Comments in `esCatastro.mjs`, `footprintMerge.mjs` and
// `esCatastroNational.mjs` describe the four foral territories as publishing NOTHING, and
// `esCatastroNational.mjs` header E goes further: *"Araba/Álava 0 · Gipuzkoa 0 · Navarra 0 … ⭐ AND
// THE FOURTH FORAL REGISTER IS NOT SILENT: Bizkaia publishes 112, in EPSG:4258."* **Measured, that
// is wrong in both directions**, and the mechanism is the interesting part: Catastro's root ATOM
// carries a foral entry whose enclosure points AT THE COUNCIL'S OWN DOMAIN.
//
//   TERRITORY      ROOT ENCLOSURE                                    HTTP / BYTES      WHAT IT HOLDS
//   Araba/Álava    geo.araba.eus/atom/BU/Buildings.atom              200 ·     5,760 B  3 entries, province-wide ZIPs, EPSG:3042 **and EPSG:4258**
//   Bizkaia        apli.bizkaia.eus/apps/Danok/INSPIRE/buildings.xml 200 ·   119,028 B  **112 per-municipality ZIPs** `ES.BFA.BU.NNN.zip` (48001-ABADIÑO …)
//   Gipuzkoa       b5m.gipuzkoa.eus/inspire/download/buildings.xml   200 ·     4,469 B  ONE province-wide `ES.GFA.BU.zip`
//   Navarra        filescartografia.navarra.es/…/Buildings_ServiceATOM_Navarra.xml
//                                                                    200 · 1,082,602 B  281 entries, 281 distinct `BU_Navarra_N.gml.zip`
//
// So: **ALL FOUR ARE REACHABLE AND MACHINE-READABLE.** Bizkaia's "112" is a real number — it is 112
// municipalities on Bizkaia's OWN feed, not 112 ES.SDGC entries — and the EPSG:4258 belongs to
// ARABA's feed, not Bizkaia's. ⚠ **None of them is in ES.SDGC**, so `resolveMunicipalities` yields
// ZERO for all four today and their ground keeps its OSM footprints by construction. That is the
// correct behaviour and `esCatastroVillage.spec.ts` proves it end-to-end through the real merge.
// ⇒ Reading this as "the foral registers publish nothing" throws away a NAMED, SOURCED FUTURE
//   UNBLOCK: ~520 municipalities including Bilbao, Vitoria-Gasteiz, Donostia and Pamplona are one
//   adapter away, at four URLs that answered 200 today. It is out of scope for this lane and it is
//   not a refusal — it is unbuilt.
// ─────────────────────────────────────────────────────────────────────────────

/** Municipalities in the ES.SDGC common-regime feed. FULL walk of the 52 office ATOMs, 2026-09-06.
 *  A LOG number for the budget line, never a gate — the feed is the authority and it moves. */
export const ES_SDGC_MUNICIPALITIES_2026_09 = 7611;

/** Territorial-office ATOMs carrying per-municipality ZIPs (the 4 foral councils are NOT among them). */
export const ES_SDGC_PROVINCE_ATOMS = 52;

/** Sum of Content-Length over all 7,611 ZIPs. A CENSUS (7,611/7,611 answered), not a sample. */
export const ES_SDGC_TOTAL_ZIP_BYTES = 5_726_101_818;

/** Percentiles of the same census, bytes. The MEAN is 3.0x the MEDIAN — budget on the total. */
export const ES_SDGC_ZIP_BYTE_PERCENTILES = Object.freeze({
  min: 5_015, p10: 56_447, p25: 108_494, p50: 249_257, p75: 691_223,
  p90: 1_666_720, p99: 6_807_096, max: 105_185_640, mean: 752_346,
});

/**
 * The measured parse curve (header C). Kept as the RAW THREE POINTS rather than a fitted constant,
 * because the honest reading of them is a range and a fit would hide that.
 */
export const CATASTRO_PARSE_CURVE = Object.freeze([
  Object.freeze({ code: '14036', name: 'HORNACHUELOS', kind: 'village', zipBytes: 1_381_659, fetchMs: 1_573, parseMs: 6_189, features: 11_973 }),
  Object.freeze({ code: '14038', name: 'LUCENA', kind: 'town', zipBytes: 6_092_851, fetchMs: 1_531, parseMs: 54_956, features: 50_908 }),
  Object.freeze({ code: '14900', name: 'CORDOBA', kind: 'metro', zipBytes: 22_926_867, fetchMs: 5_269, parseMs: 181_032, features: 192_956 }),
]);

/**
 * Planning rate = the SLOWEST of the three measured points (Lucena, 110,868 ZIP-B/s).
 *
 * ⚠ Deliberately the slowest, not the mean. The spread across the curve is dominated by machine
 * contention (a re-parse of the SAME ZIP varied 1.93x), and a national sweep runs on a CI box that
 * is also downloading a 1.3 GB pbf, clipping it and running the MDS height stamp. Budgeting on the
 * fastest observation is how a sweep gets dispatched that everyone believes will finish.
 */
export const CATASTRO_PLAN_ZIP_BYTES_PER_S = 110_868;
/** The fastest measured point, kept named so the range stays visible and nobody "corrects" to it. */
export const CATASTRO_BEST_ZIP_BYTES_PER_S = 223_244;

/**
 * Per-municipality fetch cost, seconds. ⭐ THE COST THE NINE-METRO WORKING SET CANNOT SEE.
 *
 * Measured fetches were 1,573 / 1,531 / 5,269 ms for 1.4 / 6.1 / 22.9 MB — i.e. roughly constant up
 * to ~6 MB, so it is LATENCY (TLS + request), not throughput. At nine metros that is 14 s and
 * invisible. Across 7,611 municipalities it is ~3.2 h, which is **18% of the whole national budget**
 * and is pure serial dead time: `writeCatastroWorkingSet` downloads a municipality, then parses it,
 * then downloads the next. Prefetching the next ZIP while the current one parses reclaims nearly all
 * of it for no algorithmic change. Recorded here because it is the single cheapest hour to win.
 */
export const CATASTRO_FETCH_SECONDS_PER_MUNICIPALITY = 1.5;

/**
 * Projected end-to-end wall-clock for the WHOLE ES.SDGC feed, from the census and the curve.
 *
 * @returns {{hours:number, parseHours:number, fetchHours:number, gigabytes:number, municipalities:number}}
 */
export function projectNationalSweep({
  municipalities = ES_SDGC_MUNICIPALITIES_2026_09,
  totalZipBytes = ES_SDGC_TOTAL_ZIP_BYTES,
  bytesPerSecond = CATASTRO_PLAN_ZIP_BYTES_PER_S,
  fetchSecondsEach = CATASTRO_FETCH_SECONDS_PER_MUNICIPALITY,
} = {}) {
  const parseSeconds = totalZipBytes / bytesPerSecond;
  const fetchSeconds = municipalities * fetchSecondsEach;
  return {
    municipalities,
    gigabytes: Number((totalZipBytes / 1e9).toFixed(2)),
    parseHours: Number((parseSeconds / 3600).toFixed(2)),
    fetchHours: Number((fetchSeconds / 3600).toFixed(2)),
    hours: Number(((parseSeconds + fetchSeconds) / 3600).toFixed(2)),
  };
}

/**
 * §POPULATION-ORDERED-SWEEP — order municipalities so the most-used ground lands first.
 *
 * ORDERING KEY: **descending ZIP bytes, ties broken by ascending INE code.**
 *
 * ⭐ WHY BYTES ARE THE POPULATION PROXY, AND WHY THAT IS DEFENSIBLE RATHER THAN LAZY. Header C
 * measured bytes-per-feature at 115 / 120 / 119 across a village, a town and a metro — constant to
 * ±2%. So ZIP bytes ARE building count, to a very good approximation, and building count is the
 * best available stand-in for "how many people's ground does this cover". The alternative — joining
 * an INE population table — would add a dataset, a licence and a staleness problem to obtain a
 * ranking that the feed already implies. ⚠ It is a PROXY and is named as one: a municipality with
 * many holiday homes outranks a denser one with fewer buildings. For sweep ORDER that is harmless;
 * it must never be presented to a user as a population figure.
 *
 * The measured concentration is what makes this ordering worth having at all:
 *   top   50 munis = 16.4% of national bytes      top 1000 = 63.5%
 *   top  100 munis = 22.8%                        top 2000 = 79.7%
 *   top  500 munis = 48.3%                        top 3000 = 88.2%
 * ⇒ ONE 3.5-hour run covering the largest 112 municipalities puts Madrid, Barcelona, Murcia,
 *   Valencia, Sevilla, Málaga, Palma, Cartagena, Zaragoza, Las Palmas, Elche and Córdoba on the map.
 *   Code-ascending order spends that same run on villages beginning "02…".
 *
 * ⛔ THIS ORDER IS INCOMPATIBLE WITH `catastroSweepOrder`'s CURSOR AND THAT IS THE POINT TO READ.
 * That function's cursor is a bare INE code resumed inclusively, which is exact ONLY for a
 * code-ascending total order. Under bytes-descending the codes are not monotone, so a bare-code
 * cursor would silently skip or re-sweep. `sweepCursorFor` / `afterCursor` below encode the FULL
 * sort key (`bytes:code`) for that reason. The two orderings are alternatives, not layers: pick one
 * per run and keep its cursor with it.
 *
 * @param {{code:string, zipBytes?:number, bbox?:number[]|null}[]} municipalities
 * @param {{priorityBboxes?:number[][], cursor?:string|null, meanZipBytes?:number}} opts
 * @returns {{code:string, zipBytes:number, priority:boolean}[]}
 */
export function populationOrderedSweep(municipalities, {
  priorityBboxes = [], cursor = null, meanZipBytes = ES_SDGC_ZIP_BYTE_PERCENTILES.p50,
} = {}) {
  const ranked = [];
  for (const m of municipalities ?? []) {
    if (!m || typeof m.code !== 'string') continue;
    const zipBytes = Number.isFinite(m.zipBytes) && m.zipBytes > 0 ? m.zipBytes : meanZipBytes;
    // A null bbox NEVER overlaps — the foral council entries carry one, and reading null as
    // "everywhere" would mark a delegated territory as priority ground and then as covered.
    const priority = priorityBboxes.some((b) => bboxOverlap(m.bbox, b));
    ranked.push({ ...m, zipBytes, priority });
  }
  ranked.sort(compareSweepKey);
  if (!cursor) return ranked;
  // Priority municipalities are ALWAYS re-swept regardless of the cursor — the same guarantee
  // MDS_PRIORITY_BBOXES gives the height sweep and catastroSweepOrder gives the nine metros.
  return ranked.filter((m) => m.priority || !afterCursor(cursor, m));
}

/** The total order: priority first, then bytes DESC, then code ASC. Exported for the cursor codec. */
export function compareSweepKey(a, b) {
  if (a.priority !== b.priority) return a.priority ? -1 : 1;
  if (a.zipBytes !== b.zipBytes) return b.zipBytes - a.zipBytes;
  return a.code.localeCompare(b.code);
}

/**
 * The resume cursor for a bytes-descending sweep: `"<zipBytes>:<code>"`.
 *
 * ⚠ It encodes the WHOLE sort key, not the code, because under this ordering the code alone does not
 * determine position. A cursor that cannot reconstruct the sort position is not a resume point, it
 * is a guess that reads as one.
 */
export function sweepCursorFor(m) {
  return m ? `${m.zipBytes}:${m.code}` : null;
}

/** True when `m` sorts strictly BEFORE `cursor` — i.e. a previous run already covered it. */
export function afterCursor(cursor, m) {
  if (!cursor) return false;
  const i = String(cursor).indexOf(':');
  if (i < 0) return false;
  const bytes = Number(String(cursor).slice(0, i));
  const code = String(cursor).slice(i + 1);
  if (!Number.isFinite(bytes)) return false;
  return compareSweepKey(m, { zipBytes: bytes, code, priority: m.priority }) < 0;
}

/** [w,s,e,n] overlap, null-safe. A null bbox overlaps NOTHING (§FORAL-DELEGATION). */
export function bboxOverlap(a, b) {
  if (!a || !b || a.length < 4 || b.length < 4) return false;
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/**
 * Split an ordered sweep into RUNS of at most `budgetSeconds` each — the dispatch plan.
 *
 * ⚠ A municipality is never SPLIT across runs: a half-parsed municipality is corrupt, not partial —
 * its features are already appended while its bbox would still report covered, which inverts
 * §COVERED-IS-PARSED. One that cannot fit even an empty run still gets its own run rather than being
 * dropped silently.
 *
 * @returns {{runs:{index:number, municipalities:number, seconds:number, bytes:number,
 *            firstCode:string, lastCode:string, cursor:string|null}[], totalSeconds:number}}
 */
export function planSweepRuns(ordered, {
  budgetSeconds = 3.5 * 3600,
  bytesPerSecond = CATASTRO_PLAN_ZIP_BYTES_PER_S,
  fetchSecondsEach = CATASTRO_FETCH_SECONDS_PER_MUNICIPALITY,
} = {}) {
  const cost = (m) => m.zipBytes / bytesPerSecond + fetchSecondsEach;
  const runs = [];
  let cur = [], acc = 0, bytes = 0, total = 0;
  const close = () => {
    if (!cur.length) return;
    runs.push({
      index: runs.length + 1,
      municipalities: cur.length,
      seconds: Math.round(acc),
      bytes,
      firstCode: cur[0].code,
      lastCode: cur[cur.length - 1].code,
      cursor: null,
    });
    cur = []; acc = 0; bytes = 0;
  };
  for (const m of ordered ?? []) {
    const c = cost(m);
    if (cur.length && acc + c > budgetSeconds) close();
    cur.push(m); acc += c; bytes += m.zipBytes; total += c;
  }
  close();
  // Each run's cursor is the sort key of the FIRST municipality of the run AFTER it.
  let seen = 0;
  for (const r of runs) {
    seen += r.municipalities;
    r.cursor = seen < (ordered?.length ?? 0) ? sweepCursorFor(ordered[seen]) : null;
  }
  return { runs, totalSeconds: Math.round(total) };
}
