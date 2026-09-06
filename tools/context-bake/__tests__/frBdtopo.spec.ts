// §FR-BDTOPO-FOOTPRINTS (L-12940) — the DECISIONS of the IGN BD TOPO footprint adapter, pinned
// against a REAL WFS page rather than a hand-written one.
//
// THE FIXTURE IS THE LIVE SERVER'S OWN BYTES. `fixtures/fr-bdtopo-wfs-batiment-page-2026-09-05.json`
// is three unedited features lifted from three live GetFeature responses on 2026-09-05:
//   1. BATIMENT0000000207209247 — on the founder's SÈTE gate parcel 34301000BO0317, hauteur 7.0 m,
//      1 étage, "En service", apparition 1987. This is the row the gate row is about.
//   2. BATIMENT0000000322073810 — on the founder's JOUY-EN-JOSAS parcel 78322000AB0340, hauteur
//      7.7 m, 2 étages, apparition 1966.
//   3. BATIMENT0000000241936205 — central Paris, **hauteur null AND nombre_d_etages null** (263 of
//      the 5,000 rows on that page are exactly this).
//   4. BATIMENT0000000245157882 — central Paris, **hauteur null but nombre_d_etages 1**: the
//      floors×3.0 branch, ON REAL DATA. ⭐ ADDED 2026-09-06, and it REPLACED A LABELLED SYNTHETIC.
//      The header of frBdtopo.mjs asserted that the 313 null-`hauteur` rows on that page "all had
//      `nombre_d_etages` null TOO", so this case was believed not to occur and the test mutated a
//      real row instead. Re-measured on the live page: **313 null-`hauteur` rows = 263 with floors
//      null · 46 with floors ≥ 1 · 4 with floors exactly 0**. The branch fires ~0.9 % of the time
//      in central Paris, and it now has a capture rather than a hypothesis behind it.
// Fabricating this page from the field list would reproduce the very defect the adapter exists to
// avoid: a fake built from the header cannot falsify the header. Where a case does NOT occur in the
// real page (a demolished building), the test MUTATES a real row and says so in the test name — a
// labelled synthetic, never a fixture pretending to be a capture.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  FR_BDTOPO,
  FR_BDTOPO_CITY_BBOXES,
  FR_BDTOPO_WORKING_SET_COUNT,
  bdtopoFootprint,
  bdtopoHitsUrl,
  bdtopoNationalParquetSql,
  bdtopoPageUrl,
  estimateWfsRuntime,
  firstLonLat,
  footprintFeature,
  footprintTags,
  inAnyBbox,
  isStandingCondition,
  pagesFor,
  parseWfsHits,
  stripZ,
  tileBboxes,
  yearOf,
  METRES_PER_FLOOR,
} from '../footprints/frBdtopo.mjs';
// Imported, not re-declared: the point of the contract assertions below is that ONE table governs
// the bake, the CI gate and the client reader. A test with its own copy of the keys would pass
// while the four drifted apart, which is the exact failure the table exists to prevent.
import {
  HEIGHT_KIND_FLOORS,
  OFFICIAL_METRES_PER_FLOOR,
  OFFICIAL_SOURCES,
  OFFICIAL_TAGS,
} from '../footprints/officialFootprints.mjs';

const PAGE = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/fr-bdtopo-wfs-batiment-page-2026-09-05.json'), 'utf8'),
) as { features: any[] };

const byId = (id: string) => PAGE.features.find((f: any) => f.properties.cleabs === id);
const SETE = byId('BATIMENT0000000207209247');
const JOUY = byId('BATIMENT0000000322073810');
const NULL_H = byId('BATIMENT0000000241936205');
const FLOORS_ONLY = byId('BATIMENT0000000245157882');

describe('the fixture is the shape the live WFS actually returns', () => {
  it('carries the LONG lowercase attribute names, not the shapefile 8.3 names', () => {
    // The lane brief (and IGN's SHP/GPKG delivery) call these HAUTEUR / NB_ETAGES / USAGE1 /
    // DATE_APP / ETAT_DE_L_OBJET. Keying on those against the WFS yields `undefined` for every
    // field — a silent total data loss that still writes a plausible-looking file.
    expect(Object.keys(SETE.properties)).toEqual(expect.arrayContaining([
      'hauteur', 'nombre_d_etages', 'usage_1', 'date_d_apparition', 'etat_de_l_objet', 'cleabs',
    ]));
    expect(SETE.properties.HAUTEUR).toBeUndefined();
    expect(SETE.properties.NB_ETAGES).toBeUndefined();
    expect(SETE.properties.USAGE1).toBeUndefined();
  });

  it('ships XYZ vertices — the third ordinate is real and must be handled, not assumed away', () => {
    expect(SETE.geometry.type).toBe('MultiPolygon');
    expect(SETE.geometry.coordinates[0][0][0]).toHaveLength(3);
  });

  it('holds BOTH null-hauteur shapes — with floors and without — because both occur live', () => {
    expect(PAGE.features.filter((f: any) => f.properties.hauteur === null)).toHaveLength(2);
    expect(NULL_H.properties.hauteur).toBeNull();
    expect(NULL_H.properties.nombre_d_etages).toBeNull();
    expect(FLOORS_ONLY.properties.hauteur).toBeNull();
    expect(FLOORS_ONLY.properties.nombre_d_etages).toBe(1);
  });

  it('⚠ carries the "Pas de Z" NODATA SENTINEL −1000 in the third ordinate — not a real altitude', () => {
    // Measured 2026-09-06: every vertex of the floors-only capture is Z = −1000, and its
    // `methode_d_acquisition_altimetrique` is "Pas de Z" (313 of 5,000 rows on that page). The
    // national GeoParquet footer agrees — its declared `geo` bbox for `geometrie` starts at
    // −1000.0 on the z axis, so the sentinel is BD TOPO-wide and not a quirk of one page.
    // This is why `stripZ` is a correctness rule and not tidiness: a consumer that reads the third
    // ordinate as a ground altitude puts the building a kilometre underground.
    const zs = new Set(FLOORS_ONLY.geometry.coordinates[0][0].map((c: number[]) => c[2]));
    expect([...zs]).toEqual([-1000]);
    expect(FLOORS_ONLY.properties.methode_d_acquisition_altimetrique).toBe('Pas de Z');
    for (const c of stripZ(FLOORS_ONLY.geometry).coordinates[0][0]) expect(c).toHaveLength(2);
  });
});

describe('bdtopoFootprint — the record shape shared with the ES lane', () => {
  it('maps the SÈTE gate-row building to a measured height', () => {
    const rec = bdtopoFootprint(SETE)!;
    expect(rec).toMatchObject({
      source: 'fr_bdtopo',
      part: false,
      floors: 1,
      height: 7,
      heightKind: 'measured',
      use: 'Résidentiel',
      built: 1987,
      condition: 'En service',
      id: 'BATIMENT0000000207209247',
    });
  });

  it('maps the JOUY building — the founder’s "not true shape" site — with its 1966 build year', () => {
    const rec = bdtopoFootprint(JOUY)!;
    expect(rec.height).toBe(7.7);
    expect(rec.heightKind).toBe('measured');
    expect(rec.floors).toBe(2);
    expect(rec.built).toBe(1966);
    // The whole point of a footprint source: the geometry is IGN's, not OSM's.
    expect(rec.geometry.coordinates[0][0].length).toBeGreaterThan(3);
  });

  it('a null hauteur with no floors is heightKind:"unknown" — never a fabricated number', () => {
    const rec = bdtopoFootprint(NULL_H)!;
    expect(rec.height).toBeNull();
    expect(rec.heightKind).toBe('unknown');
    expect(rec.floors).toBeNull();
    // ⚠ The FOOTPRINT still survives. Dropping a real outline because its height is missing would
    // trade the founder's actual complaint (shape) for the one we already have an answer to.
    expect(rec.geometry).toBeTruthy();
  });

  it('REAL CAPTURE: floors and no hauteur → floors×3.0, and it is NEVER labelled measured', () => {
    // Was a synthetic until 2026-09-06, on the strength of a header claim that this case does not
    // occur. It occurs 46 times in 5,000 central-Paris rows. The capture is the evidence.
    const rec = bdtopoFootprint(FLOORS_ONLY)!;
    expect(rec.height).toBe(3);
    expect(rec.heightKind).toBe('floors×3.0');
    expect(rec.floors).toBe(1);
    // ⭐ C57 §1.9, the honesty inversion this guards: a derived height must NOT carry the
    // `measured-lidar` provenance, or it outranks a real OSM survey in the client's height ladder.
    expect(footprintTags(rec)['pryzm:height_src']).toBeUndefined();
    expect(footprintTags(rec)['pryzm:height_kind']).toBe('floors×3.0');
  });

  it('SYNTHETIC (mutated from the real floors-only row): 3 étages → 9 m, still floors×3.0', () => {
    const mutated = { ...FLOORS_ONLY, properties: { ...FLOORS_ONLY.properties, nombre_d_etages: 3 } };
    const rec = bdtopoFootprint(mutated)!;
    expect(rec.height).toBe(9);
    expect(rec.heightKind).toBe('floors×3.0');
    expect(rec.floors).toBe(3);
  });

  it('REAL: nombre_d_etages 0 with a null hauteur is UNKNOWN, not a 0 m building', () => {
    // 4 of the 313 null-`hauteur` rows on the live page carry `nombre_d_etages` exactly 0. Zero
    // storeys is not a measurement of a flat building; multiplying it by 3.0 would emit a 2.5 m
    // clamped height for a building nobody measured (§CONTEXT-DATA-HONESTY: failure ≠ empty).
    const zeroFloors = { ...FLOORS_ONLY, properties: { ...FLOORS_ONLY.properties, nombre_d_etages: 0 } };
    const rec = bdtopoFootprint(zeroFloors)!;
    expect(rec.height).toBeNull();
    expect(rec.heightKind).toBe('unknown');
    expect(rec.floors).toBeNull();
  });

  it('a building recorded as gone or not yet built is DROPPED, not drawn ("En ruine" is REAL)', () => {
    // "En ruine" is not a synthetic: it is the exact value that made the live Sète-cell smoke report
    // `dropped=1` of 3,636 rows. The rest are labelled synthetics from IGN's documented vocabulary.
    for (const etat of ['En ruine', 'Détruit', 'En projet', 'Démoli']) {
      const gone = { ...SETE, properties: { ...SETE.properties, etat_de_l_objet: etat } };
      expect(bdtopoFootprint(gone)).toBeNull();
    }
  });

  it('SYNTHETIC: "En construction" is KEPT and an absent status is KEPT (unknown ≠ gone)', () => {
    const building = { ...SETE, properties: { ...SETE.properties, etat_de_l_objet: 'En construction' } };
    expect(bdtopoFootprint(building)).not.toBeNull();
    const noStatus = { ...SETE, properties: { ...SETE.properties, etat_de_l_objet: null } };
    expect(bdtopoFootprint(noStatus)).not.toBeNull();
    expect(isStandingCondition(undefined)).toBe(true);
    expect(isStandingCondition('En ruine')).toBe(false);
  });

  it('carries IGN’s own per-row acquisition method rather than collapsing it into the kind', () => {
    expect(bdtopoFootprint(SETE)!.heightMethod).toBe('Interpolation bâti BDTopo');
    expect(bdtopoFootprint(JOUY)!.heightMethod).toBe('Corrélation');
    expect(bdtopoFootprint(NULL_H)!.heightMethod).toBe('Pas de Z');
  });

  it('refuses a row with no geometry rather than emitting a propertied ghost', () => {
    expect(bdtopoFootprint({ properties: SETE.properties } as any)).toBeNull();
    expect(bdtopoFootprint(null as any)).toBeNull();
  });

  it('clamps an absurd hauteur into the same band the national height sources use', () => {
    const tall = { ...SETE, properties: { ...SETE.properties, hauteur: 9999 } };
    expect(bdtopoFootprint(tall)!.height).toBe(400);
    const flat = { ...SETE, properties: { ...SETE.properties, hauteur: 0.4 } };
    expect(bdtopoFootprint(flat)!.height).toBe(2.5);
  });
});

describe('yearOf', () => {
  it('reads the year off both IGN date shapes and refuses anything else', () => {
    expect(yearOf('1966-01-01Z')).toBe(1966);
    expect(yearOf('2010-01-19T14:13:49.663Z')).toBe(2010);
    expect(yearOf(null as any)).toBeNull();
    expect(yearOf('')).toBeNull();
    expect(yearOf('unknown')).toBeNull();
  });
});

describe('footprintTags — what tippecanoe and the client tile reader actually see', () => {
  it('always sets `building`, because belongsToLayer() drops a footprint without it', () => {
    for (const f of PAGE.features) {
      const tags = footprintTags(bdtopoFootprint(f)!);
      expect(tags.building).toBe('yes');
    }
  });

  it('marks measured-lidar ONLY for a measured height', () => {
    expect(footprintTags(bdtopoFootprint(SETE)!)['pryzm:height_src']).toBe('measured-lidar');
    const mutated = { ...NULL_H, properties: { ...NULL_H.properties, nombre_d_etages: 3 } };
    const derived = footprintTags(bdtopoFootprint(mutated)!);
    // ⚠ A floors×3.0 estimate claiming `measured-lidar` would outrank a real OSM survey. That is the
    // honesty inversion C57 §1.9 bans, and it is one careless line away at all times.
    expect(derived['pryzm:height_src']).toBeUndefined();
    expect(derived['pryzm:height_kind']).toBe('floors×3.0');
    expect(derived.height).toBe(9);
  });

  it('emits NO height key at all when the height is unknown', () => {
    const tags = footprintTags(bdtopoFootprint(NULL_H)!);
    expect('height' in tags).toBe(false);
    expect(tags['pryzm:height_kind']).toBe('unknown');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // §OFFICIAL-FOOTPRINT-TAG-CONTRACT. These four assertions are the REACHABILITY of this whole
  // lane. `officialFootprints.mjs` lists 'fr_bdtopo' in OFFICIAL_SOURCES and the client reader
  // apps/editor/src/ui/geospatial/officialFootprint.ts decides "is this an official footprint" by
  // the presence of `pryzm:source` — so a France bake without these keys delivers IGN's true
  // outlines and has the client read every one of them as an ordinary OSM footprint. Nothing would
  // fail; the founder would simply still not have his building (§COMMITTED-IS-NOT-REACHABLE).
  // ───────────────────────────────────────────────────────────────────────────
  it('carries the OFFICIAL_TAGS contract keys, IMPORTED from the shared table not copied', () => {
    const tags = footprintTags(bdtopoFootprint(SETE)!);
    expect(tags[OFFICIAL_TAGS.source]).toBe('fr_bdtopo');
    expect(OFFICIAL_SOURCES).toContain('fr_bdtopo');
    // `cleabs` is IGN's own national identifier — the counterpart of the Catastro refcat, and what
    // makes a NAMED-BUILDING CI gate possible for France (a count cannot see a missing building).
    expect(tags[OFFICIAL_TAGS.ref]).toBe('BATIMENT0000000207209247');
    expect(tags[OFFICIAL_TAGS.part]).toBe('false');
    expect(tags[OFFICIAL_TAGS.condition]).toBe('En service');
    expect(tags[OFFICIAL_TAGS.built]).toBe(1987);
  });

  it('keeps `heightSource` ALONGSIDE `pryzm:source` — dropping it regresses the older reader', () => {
    const tags = footprintTags(bdtopoFootprint(SETE)!);
    expect(tags.heightSource).toBe('fr_bdtopo');
    expect(tags[OFFICIAL_TAGS.source]).toBe('fr_bdtopo');
  });

  it('writes the real `height` key, which the ES source deliberately does NOT', () => {
    // The divergence is the honesty: IGN MEASURED these metres, so they travel as `height`.
    // Catastro's metres are our own floors×3.0 arithmetic, so they travel as
    // `pryzm:height_floors_m` and never as `height`. Same contract, opposite honest answers.
    const tags = footprintTags(bdtopoFootprint(SETE)!);
    expect(tags.height).toBe(7);
    expect(tags[OFFICIAL_TAGS.heightM]).toBeUndefined();
  });

  it('agrees with the ES source CHARACTER FOR CHARACTER on the one shared height kind', () => {
    const tags = footprintTags(bdtopoFootprint(FLOORS_ONLY)!);
    expect(tags[OFFICIAL_TAGS.heightKind]).toBe(HEIGHT_KIND_FLOORS);
    expect(METRES_PER_FLOOR).toBe(OFFICIAL_METRES_PER_FLOOR);
  });
});

describe('geometry handling', () => {
  it('stripZ drops the third ordinate and keeps lon/lat exactly', () => {
    const before = SETE.geometry.coordinates[0][0][0];
    const after = stripZ(SETE.geometry).coordinates[0][0][0];
    expect(after).toEqual([before[0], before[1]]);
    expect(footprintFeature(bdtopoFootprint(SETE)!).geometry.coordinates[0][0][0]).toHaveLength(2);
    expect(footprintFeature(bdtopoFootprint(SETE)!, { keepZ: true }).geometry.coordinates[0][0][0]).toHaveLength(3);
  });

  it('firstLonLat finds a sample point on the Sète parcel and inAnyBbox places it in `sete`', () => {
    const [lon, lat] = firstLonLat(SETE.geometry)!;
    expect(lon).toBeCloseTo(3.675, 2);
    expect(lat).toBeCloseTo(43.396, 2);
    const sete = FR_BDTOPO_CITY_BBOXES.find((c) => c.city === 'sete')!.bbox;
    expect(inAnyBbox(lon, lat, [sete])).toBe(true);
    const paris = FR_BDTOPO_CITY_BBOXES.find((c) => c.city === 'paris')!.bbox;
    expect(inAnyBbox(lon, lat, [paris])).toBe(false);
  });

  it('the JOUY parcel falls inside the jouy-en-josas bbox and OUTSIDE the paris one', () => {
    // The reason this row exists: Jouy is in no MNH working set, so no height stamp can ever reach
    // the founder's "not true size / not true shape" site. The footprint path is the only answer.
    const [lon, lat] = firstLonLat(JOUY.geometry)!;
    const jouy = FR_BDTOPO_CITY_BBOXES.find((c) => c.city === 'jouy-en-josas')!.bbox;
    const paris = FR_BDTOPO_CITY_BBOXES.find((c) => c.city === 'paris')!.bbox;
    expect(inAnyBbox(lon, lat, [jouy])).toBe(true);
    expect(inAnyBbox(lon, lat, [paris])).toBe(false);
  });
});

describe('WFS URL construction — the two ways to get a silent wrong answer', () => {
  const cell: [number, number, number, number] = [2.16, 48.77, 2.18, 48.78];

  it('emits BBOX in lon,lat order — lat,lon is a 200 with zero features', () => {
    expect(bdtopoPageUrl(cell)).toContain('BBOX=2.16,48.77,2.18,48.78,EPSG:4326');
  });

  it('NEVER omits SORTBY — unsorted paging returned 7091 distinct rows of 7092 matched', () => {
    expect(bdtopoPageUrl(cell)).toContain('&SORTBY=cleabs');
    expect(bdtopoPageUrl(cell, { startIndex: 5000 })).toContain('&SORTBY=cleabs');
  });

  it('clamps COUNT to the server cap instead of asking for more and being truncated', () => {
    expect(bdtopoPageUrl(cell, { count: 50_000 })).toContain('&COUNT=5000');
    expect(bdtopoPageUrl(cell, { count: 200 })).toContain('&COUNT=200');
    expect(FR_BDTOPO.maxPageCount).toBe(5000);
  });

  it('the hits URL asks for a count and no features', () => {
    expect(bdtopoHitsUrl(cell)).toContain('RESULTTYPE=hits');
    expect(bdtopoHitsUrl(cell)).not.toContain('OUTPUTFORMAT');
  });
});

describe('parseWfsHits — a failed count is UNKNOWN, never zero', () => {
  it('reads numberMatched off the real hits root element', () => {
    expect(parseWfsHits('<wfs:FeatureCollection numberMatched="1102" numberReturned="0"/>')).toBe(1102);
    expect(parseWfsHits('<wfs:FeatureCollection numberMatched="49948635"/>')).toBe(49_948_635);
  });

  it('returns null — not 0 — for an exception report or an unparseable body', () => {
    expect(parseWfsHits('<ows:ExceptionReport>…</ows:ExceptionReport>')).toBeNull();
    expect(parseWfsHits('<wfs:FeatureCollection numberMatched="unknown"/>')).toBeNull();
    expect(parseWfsHits(undefined as any)).toBeNull();
  });
});

describe('tiling and paging arithmetic', () => {
  it('tiles a city bbox into cells of at most the requested degree span', () => {
    const cells = tileBboxes([2.22, 48.80, 2.47, 48.91], 0.05);
    expect(cells.length).toBe(5 * 3); // 0.25° / 0.05 = 5 cols; 0.11° / 0.05 = 3 rows (last is short)
    for (const [w, s, e, n] of cells) {
      expect(e - w).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(n - s).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(e).toBeLessThanOrEqual(2.47 + 1e-9);
      expect(n).toBeLessThanOrEqual(48.91 + 1e-9);
    }
  });

  it('a cell still needs paging — the measured 0.05° Paris cell holds 32,358 buildings', () => {
    expect(pagesFor(32_358)).toBe(7);
    expect(pagesFor(7092)).toBe(2);
    expect(pagesFor(0)).toBe(0);
    expect(pagesFor(null as any)).toBe(0);
  });
});

describe('the working set and its cost', () => {
  it('is the MNH city list PLUS jouy-en-josas, the site with no height stamp', () => {
    const cities = FR_BDTOPO_CITY_BBOXES.map((c) => c.city);
    // The 13 MNH_FR_CITY_BBOXES cities, verbatim, so footprints and heights cover the same ground.
    expect(cities.slice(0, 13)).toEqual([
      'paris', 'lyon', 'marseille', 'toulouse', 'nice', 'nantes', 'strasbourg',
      'montpellier', 'bordeaux', 'rennes', 'grenoble', 'sete', 'lille',
    ]);
    expect(cities).toContain('jouy-en-josas');
  });

  it('the WFS path is minutes for the working set and HOURS for the nation — hence GeoParquet', () => {
    const ws = estimateWfsRuntime(FR_BDTOPO_WORKING_SET_COUNT);
    expect(FR_BDTOPO_WORKING_SET_COUNT).toBe(1_564_795);
    expect(ws.pages).toBe(313);
    expect(ws.minutes).toBeLessThan(20);

    const nation = estimateWfsRuntime(FR_BDTOPO.nationalFeatureCount);
    expect(nation.pages).toBe(9990);
    // ~6.7 h and ~73 GB of GeoJSON: past the 180-minute job ceiling by itself. This assertion is the
    // reason bdtopoNationalParquetSql exists at all.
    expect(nation.hours).toBeGreaterThan(6);
    expect(nation.gigabytes).toBeGreaterThan(70);
  });
});

describe('bdtopoNationalParquetSql — the whole-France path', () => {
  const sql = bdtopoNationalParquetSql([2.14, 48.75, 2.20, 48.79], '/work/france-bdtopo.geojsonseq');

  it('pushes the bbox down onto the GeoParquet covering column, as the Overture query does', () => {
    expect(sql).toContain('geometrie_bbox.xmin <= 2.2');
    expect(sql).toContain('geometrie_bbox.xmax >= 2.14');
    expect(sql).toContain('geometrie_bbox.ymin <= 48.79');
    expect(sql).toContain('geometrie_bbox.ymax >= 48.75');
  });

  it('filters demolished/planned buildings in SQL to the SAME set the WFS path keeps', () => {
    expect(sql).toContain("etat_de_l_objet IN ('En service', 'En construction')");
    expect(sql).toContain('etat_de_l_objet IS NULL OR');
  });

  it('reproduces the three-case height rule rather than inventing a fourth', () => {
    expect(sql).toContain('CASE WHEN hauteur > 0 THEN hauteur WHEN nombre_d_etages > 0 THEN nombre_d_etages * 3');
    expect(sql).toContain("WHEN nombre_d_etages > 0 THEN 'floors×3.0' ELSE 'unknown'");
    expect(sql).toContain("CASE WHEN hauteur > 0 THEN 'measured-lidar' END");
  });

  it('names the pinned national edition and emits GeoJSONSeq in EPSG:4326', () => {
    expect(sql).toContain('BDTOPO_TOUSTHEMES_3-5_GEOPARQUET_WGS84G_FRA_2026-06-15/batiment.parquet');
    expect(sql).toContain("DRIVER 'GeoJSONSeq'");
    expect(sql).toContain("SRS 'EPSG:4326'");
    expect(sql).toContain("TO '/work/france-bdtopo.geojsonseq'");
  });
});
