// §EU-REGISTERS — the Dutch / Belgian / Irish official building registers, pinned on the LIVE
// responses this lane's predecessor captured on 2026-09-06 (lane EU-REG-WEST) and this lane wired
// (lane EU-REGISTERS-WIRE, same day).
//
// EVERY BODY PARSED HERE IS A REAL SERVER ANSWER ON DISK. Nothing is synthesised except the two OSM
// base files in the last describe(), which stand in for a Geofabrik extract and are marked as such.
// A fake built from the header cannot falsify the header (§FAKE-MORE-CAPABLE-THAN-REAL), so where a
// claim in `euRegisters.mjs`'s header is checkable against a fixture, it is checked against the
// fixture and not against the sentence.
//
// THE ONE TEST THAT MATTERS MOST is the last describe(): **a register's silence must never delete a
// building.** Spain's merge would have emptied Galicia and three Basque provinces before that was
// caught (L-12952), and Belgium ships the identical hole by construction — Brussels' 19 communes
// have NO register door (UrbIS exposes one type, `UrbisAdm:Pz`, and no buildings), and Northern
// Ireland is inside the `ireland` extract but outside Tailte Éireann's layer. So the proof is run at
// two REAL coordinates the register does not cover, through the REAL merge, and it asserts the OSM
// building is still in the output file.
//
// LAYERING: a build-tool test — no OTel span (P8 applies to exported package functions).
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EU_CELL_KEY_RE,
  EU_FOOTPRINT_SOURCE_KEYS,
  EU_REGISTER_DOORS,
  EU_REGISTER_SOURCES,
  IE_TAILTE_PRIORITY_BBOXES,
  euBboxToken,
  euBudgetPlan,
  euCellKey,
  euCoveredBboxes,
  euDoorsFor,
  euFootprintFeature,
  euFootprintRecord,
  euHitsUrl,
  euNationalProjection,
  euPageUrl,
  euParseHits,
  euParsePage,
  euRefusals,
  euRegisterFootprintSource,
  euSecondsPerCell,
  euSweepEnv,
  euSweepOrder,
  euYear,
  formatEuSweepSummary,
} from '../footprints/euRegisters.mjs';
import { mergeReplaceInBbox, writeCoveredManifest, appendFeaturesSeq } from '../footprints/frBdtopo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(resolve(HERE, 'fixtures', name), 'utf8');

const NL = EU_REGISTER_DOORS.nl_bag;
const GRB = EU_REGISTER_DOORS.be_grb;
const PICC = EU_REGISTER_DOORS.be_picc;
const IE = EU_REGISTER_DOORS.ie_tailte;

// ─────────────────────────────────────────────────────────────────────────────
// A. THE FOUR SILENT-TRUNCATION TRAPS — each one is HTTP 200 with a plausible body.
// ─────────────────────────────────────────────────────────────────────────────
describe('§EU-REG-WEST A1 — axis order, the trap that returns 200 with ZERO features', () => {
  it('emits lat,lon for NL and BE-Flanders and lon,lat for the ArcGIS doors', () => {
    // Measured 2026-09-06: NL 52.997,7.185,53.010,7.205 → 249; the swapped form → 0.
    expect(euBboxToken(NL, [7.185, 52.997, 7.205, 53.01])).toBe('52.997,7.185,53.01,7.205');
    expect(euBboxToken(GRB, [5.15, 50.79, 5.18, 50.81])).toBe('50.79,5.15,50.81,5.18');
    expect(euBboxToken(PICC, [4.8, 50.45, 4.82, 50.47])).toBe('4.8,50.45,4.82,50.47');
    expect(euBboxToken(IE, [-9.79, 52.09, -9.77, 52.11])).toBe('-9.79,52.09,-9.77,52.11');
  });

  it('THROWS on a door with no declared axis rather than guessing a default', () => {
    // There is no defensible default: France wants the opposite order to its neighbours, so a
    // guessed default is a silently empty country somewhere.
    expect(() => euBboxToken({ key: 'x' } as never, [0, 0, 1, 1])).toThrow(/declares no axis order/);
  });
});

describe('§EU-REG-WEST A2 — NL without srsName returns RD metres and only whispers it', () => {
  it('the WRONG fixture really is EPSG:28992 — the geometry is metres, not degrees', () => {
    const rd = JSON.parse(fixture('nl-bag-pand-nosrsname-rd-2026-09-06.json'));
    expect(rd.crs.properties.name).toBe('urn:ogc:def:crs:EPSG::28992');
    const [x, y] = rd.features[0].geometry.coordinates[0][0];
    // 275,845 / 559,485 written into a WGS84 tile is a building in the middle of nowhere, and
    // nothing in the pipeline would have errored.
    expect(x).toBeGreaterThan(1000);
    expect(y).toBeGreaterThan(1000);
  });

  it('the RIGHT fixture is CRS84 degrees over Bourtange', () => {
    const ok = JSON.parse(fixture('nl-bag-pand-bourtange-2026-09-06.json'));
    const [lon, lat] = ok.features[0].geometry.coordinates[0][0];
    expect(lon).toBeGreaterThan(7.1);
    expect(lon).toBeLessThan(7.3);
    expect(lat).toBeGreaterThan(52.9);
    expect(lat).toBeLessThan(53.1);
  });

  it('every WFS page URL carries srsName — the one line that separates the two fixtures', () => {
    const url = euPageUrl(NL, [7.185, 52.997, 7.205, 53.01]);
    expect(url).toContain('srsName=urn:ogc:def:crs:EPSG::4326');
    expect(euPageUrl(GRB, [5.15, 50.79, 5.18, 50.81])).toContain('srsName=EPSG:4326');
  });
});

describe('§EU-REG-WEST A3 — numberMatched on a page is a RUNNING TOTAL, not the total', () => {
  it('a PDOK door never stops on numberMatched (that stops on page one, always)', () => {
    // Measured: same bbox, hits → 192,181; COUNT=1000 STARTINDEX=0 → returned 969, matched 969.
    // A pager trusting `startIndex >= numberMatched` ships 0.5 % of Amsterdam and calls it complete.
    expect(NL.pageStopsOnMatched).toBe(false);
    expect(GRB.pageStopsOnMatched).toBe(false);
  });

  it('`more` is "the page was full" for WFS and the server\'s own flag for ArcGIS', () => {
    const nlPage = euParsePage(NL, fixture('nl-bag-pand-bourtange-2026-09-06.json'));
    expect(nlPage.status).toBe('ok');
    expect(nlPage.features).toHaveLength(5);
    expect(nlPage.more).toBe(false); // 5 rows is not a full page of 969+

    const iePage = euParsePage(IE, fixture('ie-tailte-buildings-killorglin-2026-09-06.json'));
    expect(iePage.status).toBe('ok');
    // MEASURED on the live layer at the 2,000-row cap: the collection carries the flag itself.
    expect(iePage.exceededTransferLimit).toBe(true);
    expect(iePage.more).toBe(true);
  });

  it('a WFS page is "more" when it reaches the MEASURED cap, not the requested COUNT', () => {
    const body = JSON.stringify({
      type: 'FeatureCollection',
      features: Array.from({ length: NL.measuredPageCap }, () => ({
        type: 'Feature', properties: { identificatie: String(Math.random()) },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] },
      })),
    });
    // Asked for 1000, got 982 — PDOK's cap. A `>= requested` test would call this the last page.
    expect(euParsePage(NL, body, { requested: 1000 }).more).toBe(true);
  });
});

describe('§EU-REG-WEST A4 — a GRB hits reading of exactly 10000 is a CEILING, not a census', () => {
  it('reads the REAL rural count off the live hits fixture', () => {
    expect(euParseHits(GRB, fixture('be-grb-hits-limburg-2026-09-06.xml'))).toEqual({ total: 1409, atCeiling: false });
  });

  it('flags the literal 10000 as atCeiling instead of reporting it as a total', () => {
    const saturated = fixture('be-grb-hits-limburg-2026-09-06.xml').replace('numberMatched="1409"', 'numberMatched="10000"');
    expect(euParseHits(GRB, saturated)).toEqual({ total: 10_000, atCeiling: true });
  });

  it('declares Flanders\' national count UNKNOWN — null, never 0', () => {
    // The server refuses to say. A 0 here would be read as "Flanders has no buildings".
    expect(GRB.nationalCount).toBeNull();
    expect(euSecondsPerCell(GRB)).toBeNull();
    expect(euNationalProjection('be_registers')).toMatchObject({ unknownDoors: 1, atLeast: true });
  });

  it('reads NL\'s real hits total off the live Bourtange fixture (a VILLAGE, 249 panden)', () => {
    expect(euParseHits(NL, fixture('nl-bag-hits-bourtange-2026-09-06.xml'))).toEqual({ total: 249, atCeiling: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. RECORD MAPPING — the register row → the tag contract every other adapter emits.
// ─────────────────────────────────────────────────────────────────────────────
describe('§OFFICIAL-FOOTPRINT-TAG-CONTRACT — one record shape for ES, FR and these four doors', () => {
  it('maps a live BAG pand: ref, use, year — and NO height, because BAG publishes none', () => {
    const page = euParsePage(NL, fixture('nl-bag-pand-bourtange-2026-09-06.json'));
    const rec = euFootprintRecord(NL, page.features[0]);
    expect(rec).toMatchObject({
      source: 'nl_bag', part: false, ref: '0048100000001963',
      use: 'woonfunctie', built: 1980, condition: 'Pand in gebruik',
      // §CONTEXT-DATA-HONESTY — the fields measured on this service are identificatie · bouwjaar ·
      // status · gebruiksdoel · oppervlakte_min/max · aantal_verblijfsobjecten. No metres exist.
      height: null, heightKind: 'unknown', floors: null, floorsKind: null,
    });
    const props = euFootprintFeature(rec!).properties as Record<string, unknown>;
    expect(props['pryzm:height_kind']).toBe('unknown');
    expect(props['pryzm:source']).toBe('nl_bag');
    expect(props['pryzm:part']).toBe('false');
    expect(props).not.toHaveProperty('building:levels');
    // ⚠ The absence below is the honesty: no `pryzm:height_m` key at all, rather than a 9 or a 0.
    expect(Object.keys(props).filter((k) => k.includes('height_m'))).toEqual([]);
  });

  it('maps a live GRB GBG row, taking the YEAR out of a date string', () => {
    const page = euParsePage(GRB, fixture('be-grb-gbg-limburg-2026-09-06.json'));
    expect(page.features.length).toBeGreaterThan(0);
    const rec = euFootprintRecord(GRB, page.features[0]);
    expect(rec).toMatchObject({ source: 'be_grb', ref: '189769', use: 'hoofdgebouw', built: 2006, height: null });
  });

  it('maps a live Tailte row — GUID only, which is the WHOLE field list', () => {
    const page = euParsePage(IE, fixture('ie-tailte-buildings-killorglin-2026-09-06.json'));
    const rec = euFootprintRecord(IE, page.features[0]);
    expect(rec).toMatchObject({ source: 'ie_tailte', height: null, heightKind: 'unknown', use: null, built: null });
    expect(rec!.ref).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('euYear reads a year out of a date, a string or a number — and NEVER returns 0', () => {
    expect(euYear('2006-11-16')).toBe(2006);
    expect(euYear(1980)).toBe(1980);
    expect(euYear('1980')).toBe(1980);
    for (const junk of ['', 'onbekend', null, undefined, 0, 12, 99_999]) expect(euYear(junk as never)).toBeNull();
  });

  it('drops a permit with no structure, KEEPS a demolition permit, and keeps UNMEASURED statuses', () => {
    // A DROP-LIST, not an allow-list: an allow-list of four measured spellings would delete every
    // status this lane never saw — i.e. real buildings (§BDTOPO-CAP-TRUNCATE, completeness first).
    const ring = { type: 'Polygon', coordinates: [[[5, 50], [5, 51], [6, 51], [5, 50]]] };
    const mk = (status: string) => euFootprintRecord(NL, { type: 'Feature', properties: { identificatie: 'x', status }, geometry: ring } as never);
    expect(mk('Bouwvergunning verleend')).toBeNull();
    expect(mk('Sloopvergunning verleend')).not.toBeNull(); // still standing
    expect(mk('Pand in gebruik')).not.toBeNull();
    expect(mk('Een status nobody measured')).not.toBeNull();
  });

  it('drops a row with no ring — a point or a null geometry is not a footprint', () => {
    for (const geometry of [null, { type: 'Point', coordinates: [5, 50] }, { type: 'Polygon', coordinates: [[[5, 50]]] }]) {
      expect(euFootprintRecord(NL, { type: 'Feature', properties: { identificatie: 'x' }, geometry } as never)).toBeNull();
    }
  });
});

describe('§ESRI-JSON-IS-NOT-AN-EMPTY-PAGE — a refusal wearing the costume of an empty cell', () => {
  it('names the PICC ESRI-JSON body as an ERROR instead of parsing it to zero features', () => {
    // The shipped fixture IS this body (`f=json` while the door asks for `f=geojson`). It has a
    // `features` array, so the old reader walked it, `euHasRing` rejected every `rings` geometry and
    // the cell reported "0 kept" — safe for deletions, invisible to everyone. Failure ≠ empty.
    const r = euParsePage(PICC, fixture('be-picc-l11-rural-2026-09-06.json'));
    expect(r.status).toBe('error');
    expect(r.reason).toMatch(/ESRI JSON, not the GeoJSON this door requested/);
  });

  it('does NOT mistake a genuine empty GeoJSON FeatureCollection for that failure', () => {
    // Tailte over a cell it does not cover. This one IS empty, and must stay `ok` + zero features,
    // because that is what keeps its OSM (the next describe proves the consequence).
    const r = euParsePage(IE, fixture('ie-tailte-buildings-kerry-2026-09-06.json'));
    expect(r.status).toBe('ok');
    expect(r.features).toHaveLength(0);
    expect(r.more).toBe(false);
  });

  it('names an ArcGIS `error` envelope rather than reading it as an empty page', () => {
    const r = euParsePage(IE, JSON.stringify({ error: { code: 400, message: 'Unable to complete operation.' } }));
    expect(r.status).toBe('error');
    expect(r.reason).toMatch(/server error 400/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. THE NATIONAL SWEEP — whole-country, resumable, budgeted.
// ─────────────────────────────────────────────────────────────────────────────
describe('§EU-NATIONAL-SWEEP — the unit is a grid cell of the country, not a city', () => {
  it('sweeps the DOOR\'S OWN national bbox, and the metros are an ORDERING inside it', () => {
    const metro = [4.83, 52.34, 4.97, 52.42]; // amsterdam, from NL_3DBAG_CITY_BBOXES
    const ordered = euSweepOrder(NL, { priorityBboxes: [metro], cellDeg: 0.5 });
    const [w, s, e, n] = NL.nationalBbox;
    // `tileBboxes` CEILS each axis — a partial cell at the edge is still swept, so the last 0.45°
    // of Groningen is not quietly outside the country.
    expect(ordered.length).toBe(Math.ceil((e - w) / 0.5) * Math.ceil((n - s) / 0.5));
    expect(ordered.filter((c) => c.priority).length).toBeGreaterThan(0);
    // Priority first, then lexicographic — a truncated run covers Amsterdam before Zeeland.
    const firstTail = ordered.findIndex((c) => !c.priority);
    expect(ordered.slice(0, firstTail).every((c) => c.priority)).toBe(true);
  });

  it('resumes AT a cursor and re-sweeps the metros regardless of it', () => {
    const metro = [4.83, 52.34, 4.97, 52.42];
    const all = euSweepOrder(NL, { priorityBboxes: [metro], cellDeg: 0.5 });
    const tail = all.filter((c) => !c.priority);
    const cursor = tail[Math.floor(tail.length / 2)]!.key;
    const resumed = euSweepOrder(NL, { priorityBboxes: [metro], cursor, cellDeg: 0.5 });
    expect(resumed.filter((c) => c.priority).length).toBe(all.filter((c) => c.priority).length);
    expect(resumed.filter((c) => !c.priority).every((c) => c.key.localeCompare(cursor) >= 0)).toBe(true);
    expect(resumed.length).toBeLessThan(all.length);
  });

  it('a cell key round-trips through the cursor alphabet the workflow prints', () => {
    expect(euCellKey([3.3, 51.7])).toBe('+003.300+051.700');
    expect(euCellKey([-10.7, 51.3])).toBe('-010.700+051.300');
    expect(EU_CELL_KEY_RE.test(euCellKey([-10.7, 51.3]))).toBe(true);
  });

  it('THE BUDGET BINDS PRIORITY CELLS TOO — the correction this lane made before the first dispatch', () => {
    // The bug shape: `write()` forwards the working set in as priorityBboxes, so a row declaring its
    // NATIONAL bbox there marks EVERY cell priority. Exempting priority cells from the clock made
    // that sweep unbounded; an 18-22 h pull inside a 330-minute job is killed by the runner, and a
    // killed run never writes its covered manifest, so it publishes NOTHING.
    const allPriority = Array.from({ length: 100 }, (_, i) => ({ cell: [i, 0, i + 1, 1], key: `+${String(i).padStart(3, '0')}.000+000.000`, priority: true }));
    const plan = euBudgetPlan(allPriority as never, { budgetSeconds: 30, secondsPerCell: 3 });
    expect(plan.planned).toHaveLength(10);
    expect(plan.skipped).toHaveLength(90);
    // No TAIL cell exists, so there is nothing to resume — and the cursor says so rather than
    // naming a metro, which would strand every tail cell sorting before it.
    expect(plan.nextCursor).toBeNull();
  });

  it('stops BEFORE the cell that would overrun and names the first TAIL cell as the cursor', () => {
    const cells = [
      { cell: [0, 0, 1, 1], key: '+000.000+000.000', priority: true },
      { cell: [1, 0, 2, 1], key: '+001.000+000.000', priority: false },
      { cell: [2, 0, 3, 1], key: '+002.000+000.000', priority: false },
    ];
    const plan = euBudgetPlan(cells as never, { budgetSeconds: 5, secondsPerCell: 3 });
    expect(plan.planned.map((c) => c.key)).toEqual(['+000.000+000.000']);
    expect(plan.nextCursor).toBe('+001.000+000.000');
  });

  it('plans an UNKNOWN per-cell cost at a real cost, never for free', () => {
    // GRB's national count is null. `writeEuRegisterWorkingSet` passes `?? 3` rather than 0; a free
    // cell would let an unknown country buy the whole budget.
    expect(euSecondsPerCell(GRB)).toBeNull();
    expect(euBudgetPlan([{ cell: [0, 0, 1, 1], key: 'k', priority: false }] as never,
      { budgetSeconds: 1, secondsPerCell: null as never }).planned).toHaveLength(0);
  });

  it('prints a TRUNCATION sentence that names the cursor and says the skipped ground kept its OSM', () => {
    const s = formatEuSweepSummary({
      source: 'nl_bag', total: 28_637, covered: 4_000, skipped: 24_637,
      nextCursor: '+005.100+052.300', stopReason: 'budget', refused: [],
    });
    expect(s).toContain('TRUNCATED');
    expect(s).toContain('EU_SWEEP_CURSOR=+005.100+052.300');
    expect(s).toMatch(/Skipped ground KEEPS its OSM footprints/);
    expect(s).toMatch(/absent from the deletion set, not emptied/);
  });

  it('names REFUSED cells in the summary — a refusal is reported, never absorbed', () => {
    const s = formatEuSweepSummary({
      source: 'be_registers', total: 10, covered: 8, skipped: 0, nextCursor: null, stopReason: 'complete',
      refused: [{ key: '+004.300+050.800', reason: 'page 0 @0: HTTP 503' }],
    });
    expect(s).toContain('1 cell(s) REFUSED and KEPT THEIR OSM footprints');
    expect(s).toContain('HTTP 503');
  });
});

describe('§EU-REGISTERS — the environment switches, and the default that inverts Spain\'s', () => {
  it('DEFAULTS TO NATIONAL with nothing set — the opposite of catastroSweepEnv, deliberately', () => {
    expect(euSweepEnv({})).toMatchObject({ national: true, cursor: null });
    expect(euSweepEnv({}).budgetSeconds).toBeUndefined();
  });

  it('treats a CLOSED LIST as the off switch, so a typo cannot silently shrink the country', () => {
    for (const off of ['0', 'false', 'off', 'no', 'FALSE', ' off ']) {
      expect(euSweepEnv({ EU_REGISTER_NATIONAL: off }).national, off).toBe(false);
    }
    for (const on of ['1', 'true', '', 'yes-please', 'national']) {
      expect(euSweepEnv({ EU_REGISTER_NATIONAL: on }).national, on).toBe(true);
    }
  });

  it('IGNORES a cursor in the CATASTRO alphabet instead of applying it', () => {
    // The two sweeps share one workflow input (10-input cap). An INE code sorts AFTER every cell key
    // ('1' > '+'), so applying it would filter out the entire tail and quietly reduce a national
    // sweep to its metros while still reporting a national sweep.
    const warned: string[] = [];
    const env = euSweepEnv({ EU_SWEEP_CURSOR: '15078' }, { warn: (m: string) => warned.push(m) });
    expect(env.cursor).toBeNull();
    expect(warned.join(' ')).toMatch(/is not a cell key/);
  });

  it('accepts a real cell key untouched', () => {
    expect(euSweepEnv({ EU_SWEEP_CURSOR: '+005.100+052.300' }, { warn: () => {} }).cursor).toBe('+005.100+052.300');
  });

  it('ignores a nonsense budget rather than treating it as zero (which would sweep NOTHING)', () => {
    expect(euSweepEnv({ EU_BUDGET_SECONDS: 'soon' }).budgetSeconds).toBeUndefined();
    expect(euSweepEnv({ EU_BUDGET_SECONDS: '-5' }).budgetSeconds).toBeUndefined();
    expect(euSweepEnv({ EU_BUDGET_SECONDS: '9000' }).budgetSeconds).toBe(9000);
  });
});

describe('§EU-REGISTERS — the door table is DATA, including the refusals', () => {
  it('exposes exactly the three wired source keys, each resolving to wired doors', () => {
    expect([...EU_FOOTPRINT_SOURCE_KEYS]).toEqual(['nl_bag', 'be_registers', 'ie_tailte']);
    for (const key of EU_FOOTPRINT_SOURCE_KEYS) {
      const doors = euDoorsFor(key);
      expect(doors.length).toBeGreaterThan(0);
      for (const d of doors) expect(d.status).toBe('wired');
    }
    // Belgium is ONE source with TWO doors: the OSM extract and the merge are per-region, and
    // Belgium is one bake region.
    expect(EU_REGISTER_SOURCES.be_registers).toEqual(['be_grb', 'be_picc']);
  });

  it('THROWS on an unknown or unwired source key rather than baking OSM in silence', () => {
    expect(() => euDoorsFor('de_lod2')).toThrow(/unknown footprint source/);
    expect(() => euDoorsFor('nope')).toThrow(/unknown footprint source/);
  });

  it('carries every probed-and-refused country as DATA with a verbatim reason (C57 §1.5)', () => {
    const refusals = euRefusals();
    expect(refusals.map((r) => r.country)).toEqual(expect.arrayContaining([
      'Germany', 'Switzerland', 'United Kingdom', 'Luxembourg', 'Austria', 'Portugal', 'Italy', 'Belgium (Brussels)',
    ]));
    for (const r of refusals) {
      expect(['wire-not-build', 'blocked']).toContain(r.status);
      expect(r.reason.length).toBeGreaterThan(60); // a reason, not a shrug
    }
  });

  it('NEVER requests Z from PICC — its ring Z is a per-object constant, not a building height', () => {
    // Measured: returnZ=true gives hasZ:true and all three probed vertices of a ring share one Z.
    // Emitting that as a height is the one thing the measurement forbids.
    expect(euPageUrl(PICC, [4.8, 50.45, 4.82, 50.47])).toContain('returnZ=false');
    expect(PICC.heightField).toBeNull();
    expect(PICC.floorsField).toBeNull();
  });

  it('asks for the TRUE total with a hits/count probe, per door kind', () => {
    expect(euHitsUrl(NL, [7.185, 52.997, 7.205, 53.01])).toContain('RESULTTYPE=hits');
    expect(euHitsUrl(IE, [-9.79, 52.09, -9.77, 52.11])).toContain('returnCountOnly=true');
  });

  it('projects the whole-country cost from MEASURED rates, and says "at least" when a door is unknown', () => {
    expect(euNationalProjection('nl_bag')).toMatchObject({ buildings: 11_429_771, unknownDoors: 0, atLeast: false });
    expect(euNationalProjection('ie_tailte')).toMatchObject({ buildings: 3_785_414, atLeast: false });
    expect(euNationalProjection('be_registers')).toMatchObject({ buildings: 3_887_403, atLeast: true });
  });
});

describe('§EU-REGISTERS — the FOOTPRINT_SOURCES row factory', () => {
  it('REFUSES an empty priority list rather than defaulting to the nation', () => {
    expect(() => euRegisterFootprintSource('nl_bag')).toThrow(/needs a non-empty priorityBboxes/);
    expect(() => euRegisterFootprintSource('nl_bag', { priorityBboxes: [] })).toThrow(/needs a non-empty priorityBboxes/);
  });

  it("declares the CONSUMER's three-arg write signature and the footprints opt-in", () => {
    const row = euRegisterFootprintSource('ie_tailte', { priorityBboxes: IE_TAILTE_PRIORITY_BBOXES.map((c) => c.bbox) });
    // applyNationalFootprints calls spec.write(fpSeq, bboxes, onArea). ES got this inverted once.
    expect(row.write).toHaveLength(3);
    expect(row.optIn).toBe('footprints');
    expect(row.defaultBboxes()).toHaveLength(IE_TAILTE_PRIORITY_BBOXES.length);
    expect(row.attribution).toContain('Tailte Éireann');
  });

  it("Ireland's priority list includes the PROBED VILLAGE, not only the four cities", () => {
    // The founder's complaint is about villages. Killorglin's cell returned 1,281 buildings.
    const k = IE_TAILTE_PRIORITY_BBOXES.find((c) => c.city === 'killorglin');
    expect(k).toBeDefined();
    const [w, s, e, n] = k!.bbox;
    expect(-9.78).toBeGreaterThan(w); expect(-9.78).toBeLessThan(e);
    expect(52.10).toBeGreaterThan(s); expect(52.10).toBeLessThan(n);
  });

  it('every priority bbox sits INSIDE its door\'s national bbox', () => {
    for (const { city, bbox } of IE_TAILTE_PRIORITY_BBOXES) {
      const [W, S, E, N] = IE.nationalBbox;
      expect(bbox[0], city).toBeGreaterThanOrEqual(W);
      expect(bbox[1], city).toBeGreaterThanOrEqual(S);
      expect(bbox[2], city).toBeLessThanOrEqual(E);
      expect(bbox[3], city).toBeLessThanOrEqual(N);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. ⛔ THE BINDING INVARIANT — A REGISTER'S SILENCE MUST NEVER DELETE A BUILDING.
//
// Run through the REAL merge, at REAL coordinates neither register covers, on the REAL covered
// manifest the writer produces. Spain's version of this bug would have emptied Galicia and three
// Basque provinces (L-12952); Belgium and Ireland ship the identical hole by construction.
// ─────────────────────────────────────────────────────────────────────────────
describe('§COVERED-IS-PARSED — a cell that produced nothing is ABSENT from the deletion set', () => {
  const tmp = () => mkdtempSync(resolve(tmpdir(), 'eu-registers-'));

  it('euCoveredBboxes admits a cell on kept > 0, never on status ok', () => {
    const areas = [
      { area: 'be_grb:+005.160+050.800', bbox: [5.16, 50.8, 5.18, 50.82], status: 'ok', kept: 6 },
      // Brussels: the request succeeded, the register simply has nothing there.
      { area: 'be_grb:+004.340+050.840', bbox: [4.34, 50.84, 4.36, 50.86], status: 'ok', kept: 0 },
      // A refusal: 503. Emphatically not a licence to delete.
      { area: 'be_grb:+004.400+050.900', bbox: [4.4, 50.9, 4.42, 50.92], status: 'error', kept: 0 },
    ];
    expect(euCoveredBboxes(areas as never)).toEqual([[5.16, 50.8, 5.18, 50.82]]);
  });

  it('KEEPS BRUSSELS: a belgium sweep replaces Limburg and leaves the Grand-Place standing', () => {
    const dir = tmp();
    // The base file stands in for the OSM/Overture buildings geojsonseq bake produces. Two real
    // places: one inside GRB's Limburg cell, one on the Brussels Grand-Place where NO door exists.
    const base = resolve(dir, 'belgium-buildings.geojsonseq');
    writeFileSync(base, [
      { type: 'Feature', properties: { building: 'yes', name: 'osm-limburg' }, geometry: { type: 'Polygon', coordinates: [[[5.1723, 50.8094], [5.1724, 50.8095], [5.1725, 50.8094], [5.1723, 50.8094]]] } },
      { type: 'Feature', properties: { building: 'yes', name: 'osm-brussels-grand-place' }, geometry: { type: 'Polygon', coordinates: [[[4.3525, 50.8467], [4.3526, 50.8468], [4.3527, 50.8467], [4.3525, 50.8467]]] } },
    ].map((f) => JSON.stringify(f)).join('\n') + '\n');

    // The official working set: the REAL GRB rows from the Limburg fixture. Brussels contributes
    // none, because its cell answered with none.
    const fpSeq = resolve(dir, 'belgium-buildings-be_registers.geojsonseq');
    const grbFeats = euParsePage(GRB, fixture('be-grb-gbg-limburg-2026-09-06.json')).features!
      .map((f: unknown) => euFootprintRecord(GRB, f as never)).filter(Boolean)
      .map((r: unknown) => euFootprintFeature(r as never));
    expect(grbFeats.length).toBeGreaterThan(0);
    appendFeaturesSeq(fpSeq, grbFeats);

    const limburgCell = [5.16, 50.8, 5.18, 50.82];
    const brusselsCell = [4.34, 50.84, 4.36, 50.86];
    const covered = euCoveredBboxes([
      { area: 'be_grb:limburg', bbox: limburgCell, status: 'ok', kept: grbFeats.length },
      { area: 'be_grb:brussels', bbox: brusselsCell, status: 'ok', kept: 0 },
    ] as never);
    writeCoveredManifest(fpSeq, covered);

    // ⚠ THE REQUESTED SET STILL CONTAINS BRUSSELS — that is the whole point. The merge must believe
    // the WRITER's manifest, not the request, or the capital is deleted with nothing put back.
    const out = resolve(dir, 'belgium-buildings-footprints.geojsonseq');
    const res = mergeReplaceInBbox(base, out, [limburgCell, brusselsCell], null, { seqPath: fpSeq });

    expect(res.status).toBe('ok');
    expect(res.coveredFrom).toBe('writer-manifest');
    expect(res.coveredWithheld).toBe(1); // Brussels was requested and WITHHELD from the licence
    const written = readFileSync(out, 'utf8');
    expect(written).toContain('osm-brussels-grand-place'); // ⭐ the capital survives
    expect(written).not.toContain('osm-limburg');          // replaced by the register's own outline
    expect(written).toContain('"pryzm:source":"be_grb"');
    expect(res.osmDropped).toBe(1);
    expect(res.osmKept).toBe(1);
  });

  it('KEEPS NORTHERN IRELAND: Tailte answers 200-with-zero there and Belfast stays on the map', () => {
    const dir = tmp();
    // The `ireland` extract covers the whole island; the Tailte layer holds the Republic only. The
    // shipped `ie-tailte-buildings-kerry` fixture IS a real 200-with-zero answer.
    const empty = euParsePage(IE, fixture('ie-tailte-buildings-kerry-2026-09-06.json'));
    expect(empty.status).toBe('ok');
    expect(empty.features).toHaveLength(0);

    const base = resolve(dir, 'ireland-buildings.geojsonseq');
    writeFileSync(base, [
      { type: 'Feature', properties: { building: 'yes', name: 'osm-killorglin' }, geometry: { type: 'Polygon', coordinates: [[[-9.7856, 52.1061], [-9.7855, 52.1062], [-9.7854, 52.1061], [-9.7856, 52.1061]]] } },
      { type: 'Feature', properties: { building: 'yes', name: 'osm-belfast-city-hall' }, geometry: { type: 'Polygon', coordinates: [[[-5.9301, 54.5966], [-5.9300, 54.5967], [-5.9299, 54.5966], [-5.9301, 54.5966]]] } },
    ].map((f) => JSON.stringify(f)).join('\n') + '\n');

    const fpSeq = resolve(dir, 'ireland-buildings-ie_tailte.geojsonseq');
    const ieFeats = euParsePage(IE, fixture('ie-tailte-buildings-killorglin-2026-09-06.json')).features!
      .map((f: unknown) => euFootprintRecord(IE, f as never)).filter(Boolean)
      .map((r: unknown) => euFootprintFeature(r as never));
    appendFeaturesSeq(fpSeq, ieFeats);

    const killorglinCell = [-9.80, 52.10, -9.78, 52.12];
    const belfastCell = [-5.94, 54.59, -5.92, 54.61];
    writeCoveredManifest(fpSeq, euCoveredBboxes([
      { area: 'ie_tailte:killorglin', bbox: killorglinCell, status: 'ok', kept: ieFeats.length },
      { area: 'ie_tailte:belfast', bbox: belfastCell, status: 'ok', kept: 0 },
    ] as never));

    const out = resolve(dir, 'ireland-buildings-footprints.geojsonseq');
    const res = mergeReplaceInBbox(base, out, [killorglinCell, belfastCell], null, { seqPath: fpSeq });
    const written = readFileSync(out, 'utf8');
    expect(written).toContain('osm-belfast-city-hall'); // ⭐ Belfast survives
    expect(written).not.toContain('osm-killorglin');
    expect(res.coveredWithheld).toBe(1);
  });

  it('a REFUSED cell (503) deletes nothing either — a hole is not an emptiness', () => {
    const dir = tmp();
    const base = resolve(dir, 'b.geojsonseq');
    writeFileSync(base, JSON.stringify({ type: 'Feature', properties: { name: 'osm-in-the-refused-cell' }, geometry: { type: 'Polygon', coordinates: [[[5.17, 50.81], [5.171, 50.811], [5.172, 50.81], [5.17, 50.81]]] } }) + '\n');
    const fpSeq = resolve(dir, 'b-official.geojsonseq');
    writeFileSync(fpSeq, '');
    // The cell errored, so it produced nothing and is absent from the covered set.
    writeCoveredManifest(fpSeq, euCoveredBboxes([{ area: 'x', bbox: [5.16, 50.80, 5.18, 50.82], status: 'error', kept: 0 }] as never));
    const out = resolve(dir, 'b-merged.geojsonseq');
    const res = mergeReplaceInBbox(base, out, [[5.16, 50.80, 5.18, 50.82]], null, { seqPath: fpSeq });
    expect(readFileSync(out, 'utf8')).toContain('osm-in-the-refused-cell');
    expect(res.osmDropped).toBe(0);
    expect(res.coveredWithheld).toBe(1);
  });
});
