// §CATASTRO-NATIONAL-SWEEP / §COVERED-IS-PARSED (L-12952) — the whole-country sweep's PURE half.
//
// WHAT THESE TESTS ARE FOR. The founder's report is "my house has a cadastral parcel and appears in
// Cesium 3D tiles but doesn't appear on 2D or 3D site … I want this everywhere and in every possible
// country starting with spain and france asap". The switch that answers it (`--footprints official`)
// was already wired; what it lacked was REACH, and the two ways of adding reach are not equally
// safe. One of them deletes buildings.
//
// The dangerous one is the reason most of this file exists: `mergeReplaceInBbox` treats its covered
// bboxes as a DELETION SET (every OSM footprint inside one is dropped and the register's are
// appended), and its caller passes the bboxes the run REQUESTED. Point that at the whole country
// and every area the register does not serve — measured live 2026-09-06: Araba/Álava, Gipuzkoa and
// Navarra publish ZERO municipalities, and 992 more declare an EPSG the reprojector refuses — has
// its OSM footprints deleted with nothing put back. The map would EMPTY exactly where the register
// is silent, which is the opposite of the fix.
//
// So `catastroCoveredBboxes` is tested harder than anything else here, and the property it must
// hold is stated as a property, not as a list of provinces: coverage is EARNED by producing a
// footprint. A failure mode nobody has thought of yet withholds coverage automatically.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CATASTRO_MEAN_ZIP_BYTES,
  CATASTRO_NATIONAL_BBOX,
  CATASTRO_PARSE_ZIP_BYTES_PER_S,
  CATASTRO_PARSE_ZIP_BYTES_PER_S_LARGE,
  CATASTRO_PROJ_DEFS,
  bboxesOverlap,
  catastroBudgetPlan,
  catastroCoveredBboxes,
  catastroNationalProjection,
  catastroRunsNeeded,
  catastroSweepOrder,
  formatCatastroSweepSummary,
  registerCatastroProjections,
} from '../footprints/esCatastroNational.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The founder's own house — CL Isla Lanzarote 4, Córdoba, refcat 1950501UG4915S. */
const HOUSE = { lon: -4.7976, lat: 37.8878 };

describe('§CATASTRO-NATIONAL-BBOX — the retain set is the REGION, never a re-invented box', () => {
  it('is byte-identical to the `spain` REGIONS row in bake.mjs', () => {
    // §MDS-BBOX-MUST-COVER-THE-REGION, one country over: a footprint working set SMALLER than the
    // baked region is a strip of ground that no number of re-runs can ever reach, and it fails
    // SILENTLY (the area just keeps its OSM footprints and looks like a place with no register).
    const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
    const row = bake.slice(bake.indexOf("name: 'spain',"));
    const declared = /bbox:\s*'([^']+)'/.exec(row)?.[1];
    expect(declared, "the spain row's bbox").toBeTruthy();
    expect(declared!.split(',').map(Number)).toEqual(CATASTRO_NATIONAL_BBOX);
  });

  it("contains the founder's own house — the address the whole lane is aimed at", () => {
    const [w, s, e, n] = CATASTRO_NATIONAL_BBOX;
    expect(HOUSE.lon).toBeGreaterThanOrEqual(w);
    expect(HOUSE.lon).toBeLessThanOrEqual(e);
    expect(HOUSE.lat).toBeGreaterThanOrEqual(s);
    expect(HOUSE.lat).toBeLessThanOrEqual(n);
  });
});

describe('§COVERED-IS-PARSED — coverage is EARNED by producing a footprint, never by being asked for', () => {
  // The four rows below are the four ways an area can fail to produce footprints. Every one of them
  // must withhold coverage, and they are listed separately because they arrive by different paths
  // and a fix for one has repeatedly not been a fix for the others.
  const areas = [
    { area: '14900-CORDOBA', bbox: [-4.98, 37.67, -4.55, 38.05], kept: 12_345, status: 'ok' },
    { area: '15078-SANTIAGO', bbox: [-8.62, 42.83, -8.47, 42.94], kept: 0, status: 'error', reason: 'reproject: no proj4 def registered for EPSG:25829' },
    { area: '48020-BILBAO', bbox: [-3.01, 43.20, -2.86, 43.32], kept: 4_567, status: 'ok' },
    { area: '99999-HTTP404', bbox: [0, 40, 1, 41], kept: 0, status: 'error', reason: 'HTTP 404' },
    { area: '88888-CLEANZERO', bbox: [1, 41, 2, 42], kept: 0, status: 'ok' },
  ];

  it('returns ONLY the bboxes of areas that actually produced footprints', () => {
    expect(catastroCoveredBboxes(areas)).toEqual([
      [-4.98, 37.67, -4.55, 38.05],
      [-3.01, 43.20, -2.86, 43.32],
    ]);
  });

  it('withholds coverage from a REFUSED projection — the 992-municipality national failure', () => {
    // This is the one the nine-metro working set hides completely: every metro is EPSG:25830/25831,
    // so the refusal fires on zero municipalities today and on all of Galicia the moment the sweep
    // goes national. Refusing is CORRECT (a guessed UTM zone puts a building 400 km away); deleting
    // the OSM underneath the refusal is not.
    const covered = catastroCoveredBboxes(areas);
    expect(covered).not.toContainEqual([-8.62, 42.83, -8.47, 42.94]);
  });

  it('withholds coverage from a CLEAN ZERO, not just from an error (failure ≠ empty)', () => {
    // A municipality can answer 200, parse cleanly and contain no buildings inside the clip.
    // Deleting OSM on the strength of that is the failure-vs-empty collapse pointed at a map.
    expect(catastroCoveredBboxes(areas)).not.toContainEqual([1, 41, 2, 42]);
  });

  it('withholds coverage from an area with NO bbox at all', () => {
    // The three foral provinces' root entries carry a NULL georss polygon (measured 2026-09-06).
    expect(catastroCoveredBboxes([{ area: 'x', bbox: null, kept: 99 }])).toEqual([]);
    expect(catastroCoveredBboxes([{ area: 'x', kept: 99 }])).toEqual([]);
  });

  it('returns [] — not everything — for an empty or missing area list', () => {
    // ⚠ The difference between [] and "the requested set" is the whole safety property. [] deletes
    // nothing; the requested set deletes a country.
    expect(catastroCoveredBboxes([])).toEqual([]);
    expect(catastroCoveredBboxes(undefined)).toEqual([]);
  });
});

describe('§CATASTRO-SWEEP-ORDER — deterministic, priority-first, and resumable', () => {
  const munis = [
    { code: '50297', bbox: [-0.96, 41.58, -0.80, 41.71] },   // zaragoza — in priority
    { code: '05001', bbox: [-4.80, 40.60, -4.60, 40.80] },   // an Ávila village
    { code: '14900', bbox: [-4.98, 37.67, -4.55, 38.05] },   // córdoba — in priority
    { code: '28900', bbox: [-3.80, 40.33, -3.58, 40.52] },   // madrid — in priority
    { code: '15078', bbox: [-8.62, 42.83, -8.47, 42.94] },   // santiago — not priority
  ];
  const priority = [
    [-4.85, 37.83, -4.72, 37.94],   // córdoba (MDS_CITY_BBOXES row)
    [-3.80, 40.33, -3.58, 40.52],   // madrid
    [-0.9591, 41.5888, -0.80, 41.7088], // zaragoza
  ];

  it('sweeps the priority metros FIRST, then everything else by INE code ascending', () => {
    const ordered = catastroSweepOrder(munis, { priorityBboxes: priority });
    const codes = ordered.map((m) => m.code);
    // The three priority metros lead (in code order among themselves), then the tail in code order.
    expect(codes).toEqual(['14900', '28900', '50297', '05001', '15078']);
    expect(ordered.slice(0, 3).every((m) => m.priority)).toBe(true);
  });

  it('orders the tail by STRING compare on the code, so 05001 precedes 15078', () => {
    // mdsNational's first draft sorted "10,3" before "2,3" lexicographically and made a capped run
    // un-resumable. INE codes are fixed-width 5 digits, so a string compare IS the numeric order —
    // but only because they are zero-padded, which this test pins rather than assumes.
    const ordered = catastroSweepOrder(munis, { priorityBboxes: [] });
    expect(ordered.map((m) => m.code)).toEqual(['05001', '14900', '15078', '28900', '50297']);
  });

  it('resumes AT the cursor, inclusive — no municipality is skipped by resuming', () => {
    const ordered = catastroSweepOrder(munis, { priorityBboxes: [], cursor: '15078' });
    expect(ordered.map((m) => m.code)).toEqual(['15078', '28900', '50297']);
  });

  it('NEVER lets a cursor suppress a priority metro', () => {
    // A run resumed deep in the tail must still cover Barcelona/Madrid/Córdoba: they are cheap
    // relative to the nation and degrading them to reach a village has the ordering backwards.
    const ordered = catastroSweepOrder(munis, { priorityBboxes: priority, cursor: '99999' });
    expect(ordered.map((m) => m.code)).toEqual(['14900', '28900', '50297']);
  });

  it('treats a NULL bbox as overlapping nothing (the three foral province entries)', () => {
    expect(bboxesOverlap(null, [-9.55, 35.9, 4.6, 43.9])).toBe(false);
    expect(bboxesOverlap([-9.55, 35.9, 4.6, 43.9], null)).toBe(false);
    // A null must never be read as "everywhere" — that would mark a silent province as priority
    // ground and, one step later, as covered.
    const ordered = catastroSweepOrder([{ code: '01001', bbox: null }], { priorityBboxes: priority });
    expect(ordered[0]!.priority).toBe(false);
  });
});

describe('§CATASTRO-BUDGET — a run stops BEFORE the municipality it cannot finish', () => {
  const mk = (code: string, zipBytes: number, priority = false) => ({ code, zipBytes, priority, bbox: [0, 0, 1, 1] });

  it('plans up to the budget and reports the cursor to resume from', () => {
    // The planner's measured rate is 48,315 ZIP-B/s, so a 483,150 B municipality costs ~10 s.
    const ordered = [mk('a', 483_150), mk('b', 483_150), mk('c', 483_150)];
    const plan = catastroBudgetPlan(ordered, { budgetSeconds: 25 });
    expect(plan.planned.map((m) => m.code)).toEqual(['a', 'b']);
    expect(plan.skipped.map((m) => m.code)).toEqual(['c']);
    expect(plan.nextCursor).toBe('c');
  });

  it('does NOT start a municipality that would overrun — a half-parse is corrupt, not partial', () => {
    // Its features are already appended while its bbox would still report covered, which is
    // §COVERED-IS-PARSED inverted: OSM deleted under a building set we never finished writing.
    const plan = catastroBudgetPlan([mk('big', 483_150_000)], { budgetSeconds: 60 });
    expect(plan.planned).toEqual([]);
    expect(plan.nextCursor).toBe('big');
  });

  it('sweeps PRIORITY municipalities uncapped even when the budget is already spent', () => {
    const plan = catastroBudgetPlan([mk('tail', 483_150), mk('metro', 483_150_000, true)], { budgetSeconds: 1 });
    expect(plan.planned.map((m) => m.code)).toEqual(['metro']);
  });

  it('falls back to the MEASURED mean when the feed gave no ZIP length', () => {
    // The ATOM feed carries no `length` attribute on its enclosures (probed 2026-09-06: 0 of 7,723),
    // so the planner MUST have a defensible default rather than treating unknown as free.
    const plan = catastroBudgetPlan([mk('x', 0)], { budgetSeconds: 1e9 });
    expect(plan.bytes).toBe(CATASTRO_MEAN_ZIP_BYTES);
  });
});

describe('§FOOTPRINT-BUDGET — the projected national cost, stated as a RANGE', () => {
  it('projects ~4–6 GB and ~24–32 h from the measured distribution AND the measured small-muni rate', () => {
    const p = catastroNationalProjection();
    expect(p.municipalities).toBe(7723);
    // Uniform n=200 sample ⇒ 4.2 GB; ×1.3 capital correction ⇒ 5.5 GB. Both recorded, neither hidden.
    expect(p.gigabytesLow).toBeCloseTo(4.2, 1);
    expect(p.gigabytesHigh).toBeGreaterThan(p.gigabytesLow);
    // ⭐ THE CORRECTION THIS TEST EXISTS TO HOLD. Planning on Córdoba's 91,707 B/s gives ~13–18 h and
    // agrees comfortably with the "~17 h whole feed" figure already in the tree. The second measured
    // point (A Capela, 48,315 B/s) says the tail is 1.9× slower than the city it was extrapolated
    // from, and the median municipality is A Capela's size class — so the honest answer is LONGER.
    // A test that accepted the comfortable number would launder the optimistic reading.
    expect(p.hoursLow).toBeGreaterThan(22);
    expect(p.hoursHigh).toBeLessThan(35);
    expect(p.hoursHigh).toBeGreaterThan(28);
  });

  it('says how many runs full coverage takes, and never says zero', () => {
    // The workflow ceiling is `timeout-minutes: 330`; ~4 h is what the Catastro step can have.
    expect(catastroRunsNeeded(4 * 3600)).toBeGreaterThanOrEqual(8);
    expect(catastroRunsNeeded(1e9)).toBe(1);
  });

  it('plans on the SMALL-municipality rate, never the big-city asymptote', () => {
    // Both are measured; only one is representative of 7,723 municipalities with a 230 KB median.
    expect(CATASTRO_PARSE_ZIP_BYTES_PER_S).toBe(Math.round(425_701 / 8.811));
    expect(CATASTRO_PARSE_ZIP_BYTES_PER_S_LARGE).toBe(Math.round(22_926_867 / 250));
    expect(CATASTRO_PARSE_ZIP_BYTES_PER_S).toBeLessThan(CATASTRO_PARSE_ZIP_BYTES_PER_S_LARGE);
  });
});

describe('§LOUD-AND-ORDERED-TRUNCATION — a run that stopped early must SAY so', () => {
  it('names the reason, the counts, the resume cursor AND that skipped ground kept its OSM', () => {
    const line = formatCatastroSweepSummary({
      stopReason: 'budget', total: 7723, covered: 1200, skipped: 6523, nextCursor: '28079', refused: [],
    });
    expect(line).toContain('TRUNCATED (budget)');
    expect(line).toContain('1,200');
    expect(line).toContain('6,523');
    expect(line).toContain('CATASTRO_SWEEP_CURSOR=28079');
    // The decisive clause: a reader must not be able to mistake "not yet swept" for "emptied".
    expect(line).toMatch(/KEEPS its OSM footprints/);
  });

  it('reports REFUSALS separately from skips — they are different facts', () => {
    const line = formatCatastroSweepSummary({
      stopReason: 'complete', total: 7723, covered: 6731, skipped: 0, nextCursor: null,
      refused: [{ code: '15078', reason: 'no proj4 def registered for EPSG:25829' }],
    });
    expect(line).toContain('COMPLETE');
    expect(line).toContain('REFUSED and KEPT THEIR OSM');
    expect(line).toContain('15078');
  });
});

describe('§CATASTRO-PROJ-DEFS — the zones the register declares that the reprojector lacked', () => {
  it('registers EPSG:25829 into BOTH the shared table and proj4, idempotently', () => {
    // BOTH halves are required: `getProjector` guards on the table but builds from proj4's registry,
    // and `ensureRegistered()` copies the table into proj4 exactly ONCE, lazily. Adding to the table
    // alone passes the guard and then fails inside proj4 on any bake where a height stamp ran first.
    const table: Record<string, string> = {};
    const seen: string[] = [];
    const fakeProj4 = { defs: (code: string) => { seen.push(code); } };
    const added = registerCatastroProjections(table, fakeProj4);
    expect(added).toContain('EPSG:25829');
    expect(table['EPSG:25829']).toContain('+zone=29');
    expect(seen).toContain('EPSG:25829');
    // Second call adds nothing — it is a seam with an expiry, not a rival table.
    expect(registerCatastroProjections(table, fakeProj4)).toEqual([]);
  });

  it('NEVER overwrites a def the shared table already owns', () => {
    // When these land in reproject.mjs PROJ_DEFS upstream this must become a silent no-op, not a
    // second opinion about the same EPSG code.
    const table: Record<string, string> = { 'EPSG:25829': '+proj=upstream' };
    registerCatastroProjections(table, { defs: () => {} });
    expect(table['EPSG:25829']).toBe('+proj=upstream');
  });

  it('declares 25829 as UTM zone 29 on GRS80 with a null Helmert, like its 25830/25831 siblings', () => {
    // Read from the register's own <category>, not chosen. A wrong zone puts a building ~400 km away
    // and it would still look like a plausible footprint, which is why esCatastro refuses rather
    // than guesses — and why this def has to be right rather than merely present.
    expect(CATASTRO_PROJ_DEFS['EPSG:25829']).toBe(
      '+proj=utm +zone=29 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    );
  });
});
