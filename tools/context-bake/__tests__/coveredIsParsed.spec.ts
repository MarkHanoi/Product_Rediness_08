// §COVERED-IS-PARSED (L-12952, 2026-09-06, lane CADASTRAL-FOOTPRINTS-ES-FR) — the merge may only
// delete OSM where the register actually WROTE something.
//
// ⛔ WHY THIS IS THE MOST IMPORTANT TEST IN THE OFFICIAL-FOOTPRINT PATH.
//
// `mergeReplaceInBbox(base, out, coveredBboxes, …)` is not advisory: every OSM footprint whose
// first vertex falls inside a covered bbox is DROPPED, and the register's footprints are appended.
// Its only caller passes the bboxes the RUN REQUESTED. So an area that was requested and produced
// nothing — a 404 on a municipality ZIP, a projection the reprojector refuses, a province the
// register does not publish, a sweep that ran out of budget before reaching it — has its OSM
// footprints deleted with nothing put in their place. The bake already prints "those areas are
// HOLES, not empty", which NAMES the outcome without preventing it.
//
// At the nine-metro working set that costs one city on a bad day. Measured live from this machine
// on 2026-09-06, at national scale it costs:
//   • Araba/Álava, Gipuzkoa and Navarra — 0 municipalities each in the ES.SDGC feed (and their root
//     entries carry a NULL georss polygon). ⚠ NOT "the Basque Country": BIZKAIA PUBLISHES 112.
//   • 992 municipalities declaring EPSG:25829 — all of Galicia and much of the west — which
//     `parseMunicipalityZip` refuses, correctly, because a guessed UTM zone puts a building 400 km
//     away and it still looks like a plausible footprint.
// A national bake that trusted the request would have answered the founder's "my house is missing"
// by emptying Galicia. That is a strictly worse product than the one he reported.
//
// The rule under test is therefore stated as a PROPERTY and not as a list of provinces: coverage is
// EARNED by producing a footprint. A failure mode nobody has thought of yet withholds coverage
// automatically, with no new guard to remember.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import {
  coveredManifestPath,
  mergeReplaceInBbox,
  readCoveredManifest,
  writeCoveredManifest,
} from '../footprints/frBdtopo.mjs';

let dir: string;
beforeEach(() => { dir = mkdtempSync(resolve(tmpdir(), 'pryzm-covered-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/** One OSM-ish footprint at (lon, lat), as the bake's geojsonseq carries it. */
const osmAt = (lon: number, lat: number, id: string) => JSON.stringify({
  type: 'Feature',
  properties: { building: 'yes', id },
  geometry: { type: 'Polygon', coordinates: [[[lon, lat], [lon + 1e-4, lat], [lon + 1e-4, lat + 1e-4], [lon, lat]]] },
});

/** One official footprint the register produced. */
const officialAt = (lon: number, lat: number, ref: string) => JSON.stringify({
  type: 'Feature',
  properties: { 'building:part': 'yes', 'pryzm:source': 'es_catastro', 'pryzm:ref': ref },
  geometry: { type: 'Polygon', coordinates: [[[lon, lat], [lon + 1e-4, lat], [lon + 1e-4, lat + 1e-4], [lon, lat]]] },
});

// Two places, far apart, standing in for "the register served here" and "the register was silent".
const CORDOBA = { lon: -4.7976, lat: 37.8878, bbox: [-4.85, 37.83, -4.72, 37.94] };   // the founder's house
const SANTIAGO = { lon: -8.5448, lat: 42.8805, bbox: [-8.62, 42.83, -8.47, 42.94] };  // EPSG:25829 — refused

function seed() {
  const base = resolve(dir, 'base.geojsonseq');
  const seq = resolve(dir, 'official.geojsonseq');
  writeFileSync(base, [
    osmAt(CORDOBA.lon, CORDOBA.lat, 'osm-cordoba'),
    osmAt(SANTIAGO.lon, SANTIAGO.lat, 'osm-santiago'),
    osmAt(2.17, 41.39, 'osm-barcelona-outside'),
  ].join('\n') + '\n');
  // The register produced footprints for Córdoba ONLY. Santiago refused (unregistered projection).
  writeFileSync(seq, officialAt(CORDOBA.lon, CORDOBA.lat, '1950501UG4915S') + '\n');
  return { base, seq, out: resolve(dir, 'merged.geojsonseq') };
}

const idsIn = (path: string) => readFileSync(path, 'utf8').trim().split('\n')
  .filter(Boolean).map((l) => JSON.parse(l).properties.id ?? JSON.parse(l).properties['pryzm:ref']);

describe('§COVERED-IS-PARSED — a register\'s silence must never delete a building', () => {
  it('DELETES the OSM the register replaced, and KEEPS the OSM where it wrote nothing', () => {
    const { base, seq, out } = seed();
    // The writer asked for BOTH cities and only Córdoba answered — the national failure in miniature.
    writeCoveredManifest(seq, [CORDOBA.bbox]);
    const res = mergeReplaceInBbox(base, out, [CORDOBA.bbox, SANTIAGO.bbox], null, { seqPath: seq });

    expect(res.status).toBe('ok');
    const ids = idsIn(out);
    // Córdoba's OSM footprint is gone — the register's own is standing in its place.
    expect(ids).not.toContain('osm-cordoba');
    expect(ids).toContain('1950501UG4915S');
    // ⭐ THE ASSERTION THIS FILE EXISTS FOR. Santiago was REQUESTED and never delivered, so its OSM
    // footprint survives. Without the manifest this row is deleted and Galicia goes blank.
    expect(ids).toContain('osm-santiago');
    // Ground outside the working set is untouched, as it always was.
    expect(ids).toContain('osm-barcelona-outside');
  });

  it('reports WHICH set licensed the deletions and how many requested areas were withheld', () => {
    const { base, seq, out } = seed();
    writeCoveredManifest(seq, [CORDOBA.bbox]);
    const res = mergeReplaceInBbox(base, out, [CORDOBA.bbox, SANTIAGO.bbox], null, { seqPath: seq });
    // An operator reading a bake log must be able to see that an area was withheld, not guess it.
    expect(res.coveredFrom).toBe('writer-manifest');
    expect(res.coveredCount).toBe(1);
    expect(res.coveredWithheld).toBe(1);
  });

  it('an EMPTY manifest deletes NOTHING — the three foral provinces case', () => {
    // Araba/Álava, Gipuzkoa and Navarra publish zero municipalities. The writer returns early with
    // an empty covered set, and every OSM footprint in the requested ground must survive intact.
    const { base, seq, out } = seed();
    writeFileSync(seq, '');
    writeCoveredManifest(seq, []);
    const res = mergeReplaceInBbox(base, out, [CORDOBA.bbox, SANTIAGO.bbox], null, { seqPath: seq });
    expect(res.osmDropped).toBe(0);
    expect(idsIn(out).sort()).toEqual(['osm-barcelona-outside', 'osm-cordoba', 'osm-santiago']);
  });

  it('NO manifest falls back to the requested set — byte-identical to the pre-L-12952 behaviour', () => {
    // ⚠ `null` (no manifest at all) and `[]` (a manifest saying nothing was covered) are DIFFERENT
    // ANSWERS and must not collapse. A writer that predates this mechanism keeps its old semantics
    // rather than silently having every deletion withdrawn, which would look like a fixed bug and
    // be an unnoticed behaviour change (C57 §1.5, failure ≠ empty, applied to a deletion licence).
    const { base, seq, out } = seed();
    const res = mergeReplaceInBbox(base, out, [CORDOBA.bbox, SANTIAGO.bbox], null, { seqPath: seq });
    expect(res.coveredFrom).toBe('request');
    expect(idsIn(out)).not.toContain('osm-santiago');   // the OLD, unsafe behaviour, pinned
  });

  it('a CORRUPT manifest deletes nothing rather than promoting the request to a licence', () => {
    const { base, seq, out } = seed();
    writeFileSync(coveredManifestPath(seq), '{not json');
    const res = mergeReplaceInBbox(base, out, [CORDOBA.bbox, SANTIAGO.bbox], null, { seqPath: seq });
    expect(res.osmDropped).toBe(0);
    expect(idsIn(out)).toContain('osm-santiago');
  });

  it('round-trips, and refuses to record a malformed bbox as covered ground', () => {
    const { seq } = seed();
    // A NaN or short bbox is not a place. Recording one as covered would licence a deletion whose
    // extent nobody can state — and `inAnyBbox` would answer unpredictably for it.
    writeCoveredManifest(seq, [CORDOBA.bbox, [1, 2, 3] as unknown as number[], [NaN, 0, 1, 1]]);
    expect(readCoveredManifest(seq)).toEqual([CORDOBA.bbox]);
  });
});
