// ─────────────────────────────────────────────────────────────────────────────
// §OFFICIAL-FOOTPRINTS (L-12939, 2026-09-05, lane ES-CATASTRO-FOOTPRINTS)
//
// THE DEFECT THIS RETIRES. The founder's own house — CL Isla Lanzarote 4, Arroyo del Moro,
// Córdoba, cadastral reference **1950501UG4915S**, "Residencial · 320 m² · 2020" on the Sede
// Electrónica del Catastro — is ABSENT from PRYZM's 2D map and 3D context. Not mis-sized:
// ABSENT. Every `buildings` tile PRYZM ships is built from OSM footprints, and OSM has not
// mapped that 2020 estate. Six-to-eight-year-old neighbourhoods are simply missing from a
// product whose entire value proposition is "your site, in context".
//
// The national register is not missing them. Spain's Dirección General del Catastro publishes
// INSPIRE Buildings for all 8,131 municipalities, free, keyless, as ATOM-linked GML — and it
// publishes them at a level of detail OSM does not have: one **BuildingPart** per volume, each
// with its OWN `numberOfFloorsAboveGround`. That is what the Catastro "Visor 3D" draws, and it
// is what the founder pointed at: a 2-storey wing beside a 3-storey block reads as two volumes,
// not one flat box.
//
// ⚠ THE THREE FACTS THAT SHAPE THIS MODULE, ALL MEASURED 2026-09-05, NOT ASSUMED:
//
//   1. **`Building.numberOfFloorsAboveGround` IS NIL.** In `A.ES.SDGC.BU.14900.building.gml`
//      (Córdoba, 184 MB) every Building carries
//      `<bu-ext2d:numberOfFloorsAboveGround xsi:nil="true" nilReason="other:unpopulated"/>`.
//      Floors live ONLY on BuildingPart. A pipeline that reads floors off Building gets NOTHING
//      and would report it as "no floors data" — the §CONTEXT-DATA-HONESTY failure-vs-empty
//      collapse. The Building's floor count is therefore DERIVED: `max` over its parts, and
//      labelled as derived (`floorsKind:'max-of-parts'`), never presented as a register field.
//
//   2. **BuildingPart local ids are NOT STABLE ACROSS ACCESS PATHS.** For refcat
//      1950501UG4915S the ATOM ZIP and the WFS `GetBuildingPartByParcel` stored query both give
//      part1=26.7 m² floors 0 · part2=10.2 m² floors 2 · part3=44.8 m² floors 3 · part4=62.4 m²
//      floors 2. The WFS **bbox** form returns the SAME FOUR GEOMETRIES with parts 1 and 2
//      SWAPPED and the 26.7 m² part carrying floors **1** instead of **0**. Same service, same
//      day, same refcat. So: never key a part on `_partN`, and never diff two access paths and
//      call the difference a change. We key on refcat + geometry, and we name the access path
//      we read in the emitted `source`.
//
//   3. **floors 0 IS A REAL VALUE, NOT A MISSING ONE.** The 26.7 m² part above is a patio /
//      uncovered terrace: it is genuinely zero storeys above ground. It must be emitted (it is
//      part of the parcel's built record) with height 0 and it must NOT be extruded. Reading it
//      as "unknown" and substituting a default would fabricate a building on a courtyard.
//
// WHAT THIS FILE IS. The PURE, dependency-free half shared by EVERY national footprint adapter
// (ES Catastro today; FR BD TOPO next — the France lane emits THIS record shape): the record
// type, the OSM-tag mapping the client already reads, and the official-wins merge predicate.
// The network/streaming half lives per country in `esCatastro.mjs` / `frBdtopo.mjs`.
//
// ⚠ WHY THE HEIGHT IS NOT WRITTEN TO THE `height` TAG. `floors × 3.0 m` is DERIVED, and the
// client's `resolveHeightWithProvenance` (contextBuildings.ts §CTX-HEIGHT-PROVENANCE, L-459)
// reads a `height` tag as provenance `tagged` — "a surveyed-ish number". Writing a floors-derived
// metre value there would launder a derivation into a survey, which is exactly the C58 §1.4
// failure the provenance ladder exists to prevent. We write the REAL INTEGER (`building:levels`)
// and let the client's existing `derived-levels` rung do the arithmetic with its own single
// METRES_PER_LEVEL constant. The adapter's own `floors × 3.0` number still travels — under
// `pryzm:height_floors_m`, clearly labelled by `pryzm:height_kind` — for the bake-side record,
// the gate, and any non-client consumer. Two rival storey constants in the renderer is the
// defect this avoids; one honest derivation recorded twice is not.
// ─────────────────────────────────────────────────────────────────────────────

/** The one storey height every official floors→metres derivation in the bake uses. */
export const OFFICIAL_METRES_PER_FLOOR = 3.0;

/** The `heightKind` label that always accompanies a floors-derived metre value. */
export const HEIGHT_KIND_FLOORS = `floors×${OFFICIAL_METRES_PER_FLOOR.toFixed(1)}`;

/**
 * §OFFICIAL-FOOTPRINT-TAG-CONTRACT — the tag keys an official footprint carries into the tiles.
 *
 * Frozen and exported because FOUR things must agree on them and they live in four different
 * languages: this adapter, `bake.mjs`'s merge, the CI gate (`tools/context-height-probe`), and
 * the client reader (`apps/editor/src/ui/geospatial/officialFootprint.ts`). A key renamed in one
 * place and not the others is a silent pass-through failure — the tiles would carry the data and
 * the client would render none of it, with nothing failing. Both sides import their own copy of
 * this table and a spec pins them equal.
 */
export const OFFICIAL_TAGS = Object.freeze({
  /** Which national register produced this footprint: 'es_catastro' | 'fr_bdtopo'. */
  source: 'pryzm:source',
  /** The register's own stable identifier for the BUILDING (ES: the 14-char refcat). */
  ref: 'pryzm:ref',
  /** 'true' on a BuildingPart, 'false' on the whole-building outline. */
  part: 'pryzm:part',
  /** How the floor count was arrived at: 'register' (read) | 'max-of-parts' (derived). */
  floorsKind: 'pryzm:floors_kind',
  /** The adapter's own derived metres. NEVER `height` — see the file header. */
  heightM: 'pryzm:height_floors_m',
  /** Always HEIGHT_KIND_FLOORS when heightM is present. */
  heightKind: 'pryzm:height_kind',
  /** Year of construction from the register, when populated. */
  built: 'pryzm:built',
  /** conditionOfConstruction: functional | ruin | declined | projected | underConstruction. */
  condition: 'pryzm:condition',
});

/** The `source` values wired today. A row not here is not baked — never invent one. */
export const OFFICIAL_SOURCES = Object.freeze(['es_catastro', 'fr_bdtopo']);

/**
 * Map ONE official footprint record onto the OSM-style tag bag the tiles carry and the client
 * already parses. Pure.
 *
 * @param {{source:string, ref:string, part:boolean, floors:number|null, floorsBelow:number|null,
 *          floorsKind:string, use:string|null, built:number|null, condition:string|null}} rec
 * @returns {Record<string, string|number>} tag bag for the GeoJSON feature's `properties`
 */
export function officialFootprintProps(rec) {
  const props = {};
  // §LAYER-DEFINING-TAG — contextTiles.ts LAYER_DEFINING_TAGS.buildings is ['building',
  // 'building:part']; a feature carrying neither is dropped by belongsToLayer as "an incidental
  // referenced object". Parts take `building:part` and outlines take `building`, which is also
  // exactly the OSM Simple-3D-Buildings convention — so the 2D plan filter ("outlines only") is
  // the natural `'building' in tags`, and needs no PRYZM-specific predicate to be correct.
  if (rec.part) props['building:part'] = 'yes';
  else props['building'] = rec.use || 'yes';

  // The REAL INTEGER from the register. This, not a metre value, is what the client's
  // `derived-levels` rung consumes — see the header on why `height` is deliberately not written.
  if (Number.isFinite(rec.floors) && rec.floors > 0) props['building:levels'] = rec.floors;
  if (Number.isFinite(rec.floorsBelow) && rec.floorsBelow > 0) {
    props['building:levels:underground'] = rec.floorsBelow;
  }

  props[OFFICIAL_TAGS.source] = rec.source;
  if (rec.ref) props[OFFICIAL_TAGS.ref] = rec.ref;
  props[OFFICIAL_TAGS.part] = rec.part ? 'true' : 'false';
  if (rec.floorsKind) props[OFFICIAL_TAGS.floorsKind] = rec.floorsKind;
  if (Number.isFinite(rec.floors)) {
    // floors 0 is a REAL value (a patio — header fact 3), so this is `>= 0`, not `> 0`. It
    // travels as 0 m, which the renderer must read as "do not extrude", never as "unknown".
    props[OFFICIAL_TAGS.heightM] = Number((rec.floors * OFFICIAL_METRES_PER_FLOOR).toFixed(1));
    props[OFFICIAL_TAGS.heightKind] = HEIGHT_KIND_FLOORS;
  }
  if (Number.isFinite(rec.built) && rec.built > 0) props[OFFICIAL_TAGS.built] = rec.built;
  if (rec.condition) props[OFFICIAL_TAGS.condition] = rec.condition;
  return props;
}

/** Build the GeoJSON Feature for one record. Pure; `ring` is closed lon/lat. */
export function officialFootprintFeature(rec, rings) {
  return {
    type: 'Feature',
    properties: officialFootprintProps(rec),
    geometry: { type: 'Polygon', coordinates: rings },
  };
}

// ── §OFFICIAL-WINS — the merge predicate ────────────────────────────────────
//
// RULE. When a region declares a `footprintSource`, the national register is the authority for
// WHERE THE BUILDINGS ARE. An OSM footprint whose CENTROID falls inside an official whole-building
// outline is the same building drawn twice — it is DROPPED. Everything else (OSM footprints
// outside official coverage: a municipality the register has not published, a structure the
// register does not hold) is KEPT, tagged `source:'osm'`, and keeps riding the existing heightJoin.
//
// ⚠ CENTROID-IN-OUTLINE, NOT AREA OVERLAP, AND ONLY AGAINST OUTLINES. Two deliberate choices:
//   • Centroid, because an OSM block and an official parcel-split of the same block overlap
//     partially in a hundred ways; the centroid test is the one that survives a redraw.
//   • Outlines only (`part:false`) — testing against PARTS would leave an OSM footprint alive in
//     the courtyard gap between two parts of the same building, i.e. the double-draw this exists
//     to prevent, in the worst possible place.
//
// ⚠ AND THE MERGE IS NEVER "DROP EVERY OSM FOOTPRINT IN THE REGION". Catastro's territorial scope
// EXCLUDES the Basque Country (Álava/Bizkaia/Gipuzkoa) and Navarra, which run their own foral
// cadastres and publish no ES.SDGC feed. Blanket-dropping OSM under a `footprintSource:'es_catastro'`
// row would erase Bilbao, San Sebastián and Pamplona from the map entirely — a national register's
// SILENCE read as "there is nothing here", which is the §CONTEXT-DATA-HONESTY defect at its most
// destructive. Only footprints actually covered by an official outline are dropped.

/** Ring centroid (vertex mean — cheap, stable, and inside for the convex-ish footprints here). */
export function ringCentroid(ring) {
  let x = 0, y = 0, n = 0;
  for (const p of ring) {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    x += p[0]; y += p[1]; n++;
  }
  return n === 0 ? null : [x / n, y / n];
}

/** Standard even-odd ray cast. `ring` is closed or open lon/lat; both work. */
export function pointInRing(pt, ring) {
  if (!pt || !Array.isArray(ring) || ring.length < 3) return false;
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * A uniform-grid index over the official OUTLINES, so the merge is O(n) rather than O(n·m).
 * 0.002° ≈ 220 m at Spanish latitudes — a few footprints per cell in a dense block.
 */
export const OFFICIAL_INDEX_CELL_DEG = 0.002;

export function buildOfficialOutlineIndex(outlines, { cellDeg = OFFICIAL_INDEX_CELL_DEG } = {}) {
  const cells = new Map();
  let indexed = 0;
  for (const o of outlines) {
    const ring = o?.geometry?.coordinates?.[0];
    if (!Array.isArray(ring) || ring.length < 3) continue;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of ring) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    const entry = { ring, minX, minY, maxX, maxY };
    for (let cx = Math.floor(minX / cellDeg); cx <= Math.floor(maxX / cellDeg); cx++) {
      for (let cy = Math.floor(minY / cellDeg); cy <= Math.floor(maxY / cellDeg); cy++) {
        const k = `${cx}/${cy}`;
        let bucket = cells.get(k);
        if (!bucket) { bucket = []; cells.set(k, bucket); }
        bucket.push(entry);
      }
    }
    indexed++;
  }
  return { cells, cellDeg, indexed };
}

/**
 * Is this OSM footprint covered by an official outline? `true` ⇒ DROP it (official wins).
 * @param {object} feat an OSM GeoJSON feature from the bake's own clip
 * @param {{cells:Map, cellDeg:number}} index from buildOfficialOutlineIndex
 */
export function osmFootprintIsCovered(feat, index) {
  const g = feat?.geometry;
  const ring = g?.type === 'Polygon' ? g.coordinates?.[0]
    : g?.type === 'MultiPolygon' ? g.coordinates?.[0]?.[0]
      : null;
  if (!Array.isArray(ring) || ring.length < 3) return false;
  const c = ringCentroid(ring);
  if (!c) return false;
  const k = `${Math.floor(c[0] / index.cellDeg)}/${Math.floor(c[1] / index.cellDeg)}`;
  const bucket = index.cells.get(k);
  if (!bucket) return false;
  for (const e of bucket) {
    if (c[0] < e.minX || c[0] > e.maxX || c[1] < e.minY || c[1] > e.maxY) continue;
    if (pointInRing(c, e.ring)) return true;
  }
  return false;
}

/**
 * The log line the bake prints for a merged buildings layer. Exported so the shape is pinned by a
 * spec rather than by grep — the founder reads this line to know the register actually landed.
 * Counts are SEPARATED BY SOURCE (C57 §1.9): "N official part(s) of M building(s) + K OSM-only".
 */
export function formatOfficialMergeLine(region, source, { parts, buildings, osmKept, osmDropped }) {
  return `▶ official footprints · ${region}: ${source} — ${parts} official part(s) of `
    + `${buildings} building(s) + ${osmKept} OSM-only (dropped ${osmDropped} OSM footprint(s) `
    + 'covered by an official outline)';
}
