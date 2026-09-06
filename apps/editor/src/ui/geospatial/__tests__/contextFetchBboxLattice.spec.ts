// §CTX-FETCH-BBOX-LATTICE (L-12953) — the spec that pins "one read per NEIGHBOURHOOD", and the
// one that stops it being bought with somebody's house.
//
// THE MEASUREMENT THAT NAMES THE DEFECT. Founder Córdoba, 2026-09-06, verbatim: *"the same layer
// is re-read 5–6 times per session"* — buildings at **8871, 8799, 8804, 8817, 8919** footprints,
// each read costing a 36–42-tile PMTiles fan-out and each triggering a full re-render. Those five
// counts are NEAR each other and all DIFFERENT, which is the whole diagnosis: they are five
// slightly different windows over one city, not five reads of one window. §CTX-ONE-READ-PER-BBOX
// (L-585) shares a read per bbox and works exactly as designed — but four callers hold four
// different centres for one neighbourhood (geocode, site origin, camera ground point, and the 2D
// map centre, which moves on every `moveend` while the user pans looking for a parcel), and
// `bboxKey`'s 4-dp rounding of the CORNERS snaps nothing: 12 m apart is a different key.
//
// The fix snaps the FETCH centre to a 0.001° lattice — the same grain `SiteBoundaryMap2D` already
// calls "same area, skip the refetch" — and GROWS the half-extent by the snap radius so the window
// can only ever get bigger. These tests assert both halves, because either alone is a bug:
// snapping without growing silently drops footprints off one edge; growing without snapping keeps
// the five cold reads.
import { describe, it, expect } from 'vitest';
import {
    CONTEXT_BBOX_FAR_HALF_DEG,
    CONTEXT_BBOX_HALF_DEG,
    CONTEXT_FETCH_SNAP_DEG,
    contextBboxAround,
    contextFetchBbox,
    type Bbox,
} from '../contextBuildings';

/** The key `fetchForBbox` actually caches on — copied from `contextBuildings.bboxKey`, which is
 *  module-private. If that literal ever changes, this test is the thing that should notice. */
const bboxKey = (b: Bbox): string => b.map((n) => n.toFixed(4)).join(',');

const contains = (outer: Bbox, inner: Bbox): boolean =>
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];

describe('§CTX-FETCH-BBOX-LATTICE — callers who mean the same neighbourhood get the same key', () => {
    it('centres a few metres apart - today FOUR keys and four 36-42-tile reads - become ONE', () => {
        // WARNING: THE COORDINATES ARE CONSTRUCTED, not transcribed. The founder's evidence is the
        // five footprint COUNTS (8871 / 8799 / 8804 / 8817 / 8919), not five logged lat/lons. What
        // is taken from his run is the SHAPE - several callers holding centres a few tens of metres
        // apart for one neighbourhood - and the defect that shape triggers.
        const nudged: Array<[number, number]> = [
            [37.88779, -4.79761],     // Cordoba, his site
            [37.887801, -4.797598],   // ~12 m - inside bboxKey's own 4-dp rounding, and STILL a miss
            [37.887972, -4.797712],   // ~20 m
            [37.887640, -4.797510],   // ~19 m
        ];
        const before = new Set(nudged.map(([la, lo]) => bboxKey(contextBboxAround(la, lo, CONTEXT_BBOX_FAR_HALF_DEG))));
        const after = new Set(nudged.map(([la, lo]) => bboxKey(contextFetchBbox(la, lo, CONTEXT_BBOX_FAR_HALF_DEG))));

        // BEFORE: four callers -> THREE distinct keys, i.e. three cold 36-42-tile reads and three
        // full re-renders. (Not four: bboxKey's 4-dp CORNER rounding happens to merge two of them.
        // That is the point rather than a mitigation - it merges by accident of where the corners
        // land, not by design, so ~12 m apart is sometimes a hit and usually a miss.)
        expect(before.size).toBe(3);
        // AFTER: one key, one read; every later caller is a cache HIT.
        expect(after.size).toBe(1);
    });

    it('THE RESIDUAL, NAMED: two callers either side of a cell edge still pay two reads', () => {
        // A lattice has boundaries, and this one is 0.001 deg (~111 m in latitude). Two centres
        // 20 m apart that happen to straddle an edge snap to DIFFERENT cells and still read twice.
        // So the honest claim is "callers within a cell share one read", NOT "one read per
        // session" - the founder's 5-6 reads collapse substantially, not necessarily to 1.
        // Closing the residual needs superset REUSE (serve a request from a cached box that
        // contains it), which is a strictly larger change and is deliberately NOT done here.
        const a = bboxKey(contextFetchBbox(37.887490, -4.79761, CONTEXT_BBOX_FAR_HALF_DEG));
        const b = bboxKey(contextFetchBbox(37.887510, -4.79761, CONTEXT_BBOX_FAR_HALF_DEG));
        expect(a).not.toBe(b);
    });

    it('the snapped box is a strict SUPERSET of the exact one — the lattice never drops a footprint', () => {
        // Across latitudes (the E/W widening is `1 / cos(lat)`, so the superset property has to
        // hold at the equator and at Reykjavík alike), and across offsets INSIDE one lattice cell,
        // which is where a snap-without-grow would shift the window and lose the far edge.
        for (const lat of [0, 12.5, 37.88779, 48.85, 55.67, 64.14, -33.87, -1.29]) {
            for (const dLat of [-0.0005, -0.0004, -0.00013, 0, 0.00021, 0.00049]) {
                for (const dLon of [-0.0005, -0.00037, 0, 0.00018, 0.00049]) {
                    const la = lat + dLat;
                    const lo = -4.79761 + dLon;
                    for (const half of [CONTEXT_BBOX_HALF_DEG, CONTEXT_BBOX_FAR_HALF_DEG]) {
                        const exact = contextBboxAround(la, lo, half);
                        const fetched = contextFetchBbox(la, lo, half);
                        expect(contains(fetched, exact)).toBe(true);
                    }
                }
            }
        }
    });

    it('the growth is bounded — a superset, not a licence to widen the read', () => {
        // 4.5 % more extent on the far ring (0.011 → 0.0115). The fan-out measured on the live
        // tileset is 36–42 tiles against `MAX_TILES_PER_FETCH = 64`, so this stays inside the cap
        // and cannot silently drop the reader to a coarser zoom.
        const exact = contextBboxAround(37.88779, -4.79761, CONTEXT_BBOX_FAR_HALF_DEG);
        const fetched = contextFetchBbox(37.88779, -4.79761, CONTEXT_BBOX_FAR_HALF_DEG);
        const areaOf = (b: Bbox): number => (b[2] - b[0]) * (b[3] - b[1]);
        const ratio = areaOf(fetched) / areaOf(exact);
        expect(ratio).toBeGreaterThan(1);
        expect(ratio).toBeLessThan(1.12);
    });

    it('callers a REAL distance apart still get different boxes — this is a lattice, not a global cache', () => {
        // ~1.5 km apart: genuinely different neighbourhoods, and each must still get its own read.
        const a = bboxKey(contextFetchBbox(37.88779, -4.79761, CONTEXT_BBOX_FAR_HALF_DEG));
        const b = bboxKey(contextFetchBbox(37.90129, -4.79761, CONTEXT_BBOX_FAR_HALF_DEG));
        expect(a).not.toBe(b);
    });

    it('the lattice is the grain SiteBoundaryMap2D already calls "same area"', () => {
        // `SiteBoundaryMap2D.loadContextBuildings` skips on `${lat.toFixed(3)},${lng.toFixed(3)}`.
        // If these two grains drift apart again, a pan the 2D layer calls "the same place" becomes
        // a cold read one layer down — which is precisely how this defect arose.
        expect(CONTEXT_FETCH_SNAP_DEG).toBe(0.001);
        const c = { lat: 37.887791, lng: -4.797613 };
        const mapKey = `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`;
        const latticeKey = `${(Math.round(c.lat / CONTEXT_FETCH_SNAP_DEG) * CONTEXT_FETCH_SNAP_DEG).toFixed(3)},`
            + `${(Math.round(c.lng / CONTEXT_FETCH_SNAP_DEG) * CONTEXT_FETCH_SNAP_DEG).toFixed(3)}`;
        expect(latticeKey).toBe(mapKey);
    });

    it('a non-finite centre falls through to the exact box rather than snapping NaN', () => {
        const nan = contextFetchBbox(Number.NaN, -4.79761, CONTEXT_BBOX_HALF_DEG);
        expect(Number.isNaN(nan[1])).toBe(true);   // honest garbage-in, not a silently valid box
    });
});
