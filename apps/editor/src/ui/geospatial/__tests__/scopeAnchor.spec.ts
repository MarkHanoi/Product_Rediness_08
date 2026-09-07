// §SITE-SCOPE-ANCHOR-IS-THE-PARCEL (L-13086; C12 §13.1; ADR-0382) — the founder's *"now it always
// would center statically the scope depending on the parcel that has been selected on plan view"*.
//
// WHAT THESE PIN, AND WHY EACH ARM EARNS ITS PLACE:
//   · the AREA centroid, not the first vertex and not the vertex mean — the first vertex is what
//     `parcelFrameOrigin` deliberately returns for the project-origin datum, and it is a CORNER;
//     the vertex mean is pulled by the near-collinear runs every real cadastral ring contains.
//   · the affine identity that makes the degree-space shoelace exact at parcel scale, measured
//     against a metric centroid rather than asserted in a comment.
//   · a candidate beyond the scope loses — this is the §CTX-RESEAT-ANCHOR-IS-CURRENT-SITE (L-12964)
//     guard, and without it the fix would rebuild every layer at the PREVIOUS parcel on a site move.
//   · an unusable requested centre is returned UNCHANGED — an anchor must never substitute for a
//     missing origin, because that turns a loud refusal into a quiet, plausible answer.
//   · every outcome carries a note naming what won and what it beat, so "the anchor held" and
//     "there was no anchor" cannot be read as the same observation.
//   · a SOURCE-TEXT arm that the one production call site still routes through this decision —
//     `site.location-changed` is the trigger the enumeration identified, and a fix that is reverted
//     to `loc.latitude, loc.longitude` would leave every unit arm below passing.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parcelCentroidLonLat, resolveScopeAnchor, type LonLatPair } from '../scopeAnchor';
import { originSeparationMeters } from '../globeGroundAnchor';

const BCN = { lat: 41.38258, lon: 2.17707 };

/** Metres → a `[lon, lat]` offset from BCN (local equirectangular; parcel scale). */
const at = (eastM: number, northM: number): LonLatPair => [
    BCN.lon + (eastM / (111_320 * Math.cos((BCN.lat * Math.PI) / 180))),
    BCN.lat + northM / 110_540,
];

describe('parcelCentroidLonLat — the AREA centroid, not a corner and not a vertex mean', () => {
    it('a square ring centres on its middle', () => {
        const ring = [at(0, 0), at(40, 0), at(40, 30), at(0, 30)];
        const c = parcelCentroidLonLat(ring)!;
        expect(c).not.toBeNull();
        // ~20 m east, ~15 m north of the first vertex.
        expect(originSeparationMeters({ lat: ring[0]![1], lon: ring[0]![0] }, c)).toBeCloseTo(25, 0);
    });

    it('⛔ IT IS NOT THE FIRST VERTEX — which is exactly what `parcelFrameOrigin` returns', () => {
        const ring = [at(0, 0), at(80, 0), at(80, 60), at(0, 60)];
        const c = parcelCentroidLonLat(ring)!;
        const firstVertex = { lat: ring[0]![1], lon: ring[0]![0] };
        // 50 m apart on a 80×60 m lot: the whole point of the defect. A city lot is tens of metres;
        // a rural or industrial parcel is hundreds.
        expect(originSeparationMeters(firstVertex, c)).toBeGreaterThan(45);
    });

    it('⛔ IT IS NOT THE VERTEX MEAN — a digitised run on one edge must not pull the centre', () => {
        // One physical edge split into five near-collinear survey vertices (the Córdoba
        // `2947201UG4924N` shape). The vertex mean drifts toward that edge; the area centroid does not.
        const ring: LonLatPair[] = [
            at(0, 0), at(20, 0), at(40, 0), at(60, 0), at(80, 0),
            at(80, 60), at(0, 60),
        ];
        const area = parcelCentroidLonLat(ring)!;
        let sLon = 0, sLat = 0;
        for (const p of ring) { sLon += p[0]; sLat += p[1]; }
        const mean = { lat: sLat / ring.length, lon: sLon / ring.length };
        expect(originSeparationMeters(area, mean)).toBeGreaterThan(5);
        // The true centroid of this trapezoid-ish ring sits above the crowded south edge.
        const southEdgeMid = { lat: at(40, 0)[1], lon: at(40, 0)[0] };
        expect(originSeparationMeters(area, southEdgeMid)).toBeGreaterThan(
            originSeparationMeters(mean, southEdgeMid),
        );
    });

    it('the degree-space shoelace equals the METRIC centroid — the affine identity, measured', () => {
        const ring = [at(-30, -12), at(55, -20), at(70, 44), at(-10, 61), at(-48, 20)];
        const c = parcelCentroidLonLat(ring)!;
        // Independently: convert to local metres, take the metric area centroid, convert back.
        const k = 111_320 * Math.cos((BCN.lat * Math.PI) / 180);
        const pts = ring.map((p) => [(p[0] - BCN.lon) * k, (p[1] - BCN.lat) * 110_540] as const);
        let a2 = 0, cx = 0, cy = 0;
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i]!, q = pts[(i + 1) % pts.length]!;
            const cross = p[0] * q[1] - q[0] * p[1];
            a2 += cross; cx += (p[0] + q[0]) * cross; cy += (p[1] + q[1]) * cross;
        }
        const metric = {
            lat: BCN.lat + cy / (3 * a2) / 110_540,
            lon: BCN.lon + cx / (3 * a2) / k,
        };
        expect(originSeparationMeters(metric, c)).toBeLessThan(0.01); // under a centimetre.
    });

    it('a closed ring (repeated last vertex) gives the same answer as the open one', () => {
        const open = [at(0, 0), at(40, 0), at(40, 30), at(0, 30)];
        const closed = [...open, open[0]!];
        const a = parcelCentroidLonLat(open)!;
        const b = parcelCentroidLonLat(closed)!;
        expect(originSeparationMeters(a, b)).toBeLessThan(1e-6);
    });

    it('a DEGENERATE ring (no interior) falls back to the vertex mean, never to null or zero', () => {
        const collinear = [at(0, 0), at(20, 0), at(40, 0)];
        const c = parcelCentroidLonLat(collinear)!;
        expect(c).not.toBeNull();
        expect(originSeparationMeters(c, { lat: at(20, 0)[1], lon: at(20, 0)[0] })).toBeLessThan(0.01);
    });

    it('fewer than three vertices, or a non-finite one, is null — never a fabricated centre', () => {
        expect(parcelCentroidLonLat(null)).toBeNull();
        expect(parcelCentroidLonLat([])).toBeNull();
        expect(parcelCentroidLonLat([at(0, 0), at(10, 0)])).toBeNull();
        expect(parcelCentroidLonLat([[Number.NaN, 41], at(10, 0), at(0, 10)])).toBeNull();
        // A "ring" whose closing repeat leaves only TWO distinct vertices is a line segment, not a
        // parcel — null, not the midpoint. (Contrast the collinear THREE-vertex case above, which
        // does have three distinct points and therefore an honest vertex-mean answer.)
        expect(parcelCentroidLonLat([at(0, 0), at(10, 0), at(0, 0)])).toBeNull();
    });
});

describe('resolveScopeAnchor — the ladder, and what it refuses', () => {
    const RING = [at(0, 0), at(60, 0), at(60, 45), at(0, 45)];
    const FRAME = { lat: RING[0]![1], lon: RING[0]![0] }; // parcelFrameOrigin = the FIRST VERTEX.

    it('THE FOUNDER\'S CASE: an address 120 m off the parcel loses to the parcel centroid', () => {
        const address = { lat: at(0, 120)[1], lon: at(0, 120)[0] };
        const d = resolveScopeAnchor({
            requested: address,
            parcelRingLonLat: RING,
            frameOrigin: FRAME,
            sameSiteRadiusM: 1000,
        });
        expect(d.source).toBe('parcel-centroid');
        const centroid = parcelCentroidLonLat(RING)!;
        expect(originSeparationMeters(d, centroid)).toBeLessThan(0.01);
        expect(d.movedM).toBeGreaterThan(90);
        expect(d.note).toContain('area centroid');
    });

    it('no ring ⇒ the site frame origin, and it SAYS it is the first vertex', () => {
        const d = resolveScopeAnchor({
            requested: { lat: at(0, 120)[1], lon: at(0, 120)[0] },
            parcelRingLonLat: null,
            frameOrigin: FRAME,
            sameSiteRadiusM: 1000,
        });
        expect(d.source).toBe('parcel-frame-origin');
        expect(d.note).toContain('first vertex');
        expect(originSeparationMeters(d, FRAME)).toBeLessThan(0.01);
    });

    it('⛔ A DIFFERENT SITE LOSES — §CTX-RESEAT-ANCHOR-IS-CURRENT-SITE (L-12964)', () => {
        // Madrid, ~500 km from the Barcelona parcel: on a real site move this event fires BEFORE
        // renderFormaMassing re-seats the anchor, so the stale parcel must NOT win.
        const madrid = { lat: 40.4168, lon: -3.7038 };
        const d = resolveScopeAnchor({
            requested: madrid,
            parcelRingLonLat: RING,
            frameOrigin: FRAME,
            sameSiteRadiusM: 1000,
        });
        expect(d.source).toBe('requested');
        expect(d.lat).toBe(madrid.lat);
        expect(d.lon).toBe(madrid.lon);
        expect(d.movedM).toBe(0);
        expect(d.note).toContain('DIFFERENT site');
        expect(d.note).toMatch(/\d+ m away/);           // the distance is NAMED, not implied.
        expect(d.note).toContain('L-12964');
    });

    it('the boundary is the SCOPE radius, not a minted constant — either side of it', () => {
        const near = { lat: at(0, 900)[1], lon: at(0, 900)[0] };
        const inside = resolveScopeAnchor({ requested: near, parcelRingLonLat: RING, frameOrigin: FRAME, sameSiteRadiusM: 1000 });
        expect(inside.source).toBe('parcel-centroid');
        const outside = resolveScopeAnchor({ requested: near, parcelRingLonLat: RING, frameOrigin: FRAME, sameSiteRadiusM: 400 });
        expect(outside.source).toBe('requested');
        expect(outside.note).toContain('400 m scope');
    });

    it('⛔ AN UNUSABLE REQUESTED CENTRE IS RETURNED UNCHANGED — the anchor never stands in for it', () => {
        for (const bad of [{ lat: 0, lon: 0 }, { lat: Number.NaN, lon: 2.1 }]) {
            const d = resolveScopeAnchor({
                requested: bad,
                parcelRingLonLat: RING,
                frameOrigin: FRAME,
                sameSiteRadiusM: 1000,
            });
            expect(d.source).toBe('requested');
            expect(d.note).toContain('not a usable origin');
            // The parcel is RIGHT THERE and is still not substituted: the caller's own refusal must speak.
            expect(d.lat).toBe(bad.lat);
        }
    });

    it('no parcel at all is the PRE-PARCEL case and says so — not a silent fallback to nothing', () => {
        const d = resolveScopeAnchor({
            requested: BCN,
            parcelRingLonLat: null,
            frameOrigin: null,
            sameSiteRadiusM: 1000,
        });
        expect(d.source).toBe('requested');
        expect(d.note).toContain('pre-parcel case');
        expect(d.note).toContain('correct, not a fallback to nothing');
    });

    it('a missing same-site radius cannot be answered, so the requested centre stands', () => {
        const d = resolveScopeAnchor({
            requested: BCN,
            parcelRingLonLat: RING,
            frameOrigin: FRAME,
            sameSiteRadiusM: Number.NaN,
        });
        expect(d.source).toBe('requested');
        expect(d.note).toContain('same-site radius');
    });

    it('it is IDEMPOTENT: re-anchoring an already-anchored centre does not move it again', () => {
        const first = resolveScopeAnchor({
            requested: { lat: at(0, 120)[1], lon: at(0, 120)[0] },
            parcelRingLonLat: RING, frameOrigin: FRAME, sameSiteRadiusM: 1000,
        });
        const second = resolveScopeAnchor({
            requested: { lat: first.lat, lon: first.lon },
            parcelRingLonLat: RING, frameOrigin: FRAME, sameSiteRadiusM: 1000,
        });
        expect(second.movedM).toBeLessThan(0.01);
        expect(second.lat).toBeCloseTo(first.lat, 9);
    });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * SOURCE-TEXT ARM — the production call site.
 *
 * The unit arms above all pass against a module nobody calls. The trigger enumeration named
 * `site.location-changed` as the ONE remaining path that re-centres the slab on a non-parcel point
 * (every other trigger already resolves through `contextBuildingsAt` / `formaMassingOrigin` /
 * `readSiteLocation`, and the camera path was pinned by lane SCOPE-CUT-2 in `ff60ce85`). A revert of
 * that one line to `loc.latitude, loc.longitude` is invisible to every arm above — so it is pinned
 * here. `CesiumViewport` needs a live Cesium viewer on a WebGL context, which happy-dom has not got.
 */
describe('§SITE-SCOPE-ANCHOR-IS-THE-PARCEL — the wire', () => {
    const SRC = readFileSync(
        resolve(__dirname, '..', 'CesiumViewport.ts'),
        'utf8',
    );

    it('the site.location-changed context load routes through resolveScopeAnchor', () => {
        expect(SRC).toContain("import { resolveScopeAnchor } from \"./scopeAnchor\";");
        const at0 = SRC.indexOf('§SITE-SCOPE-ANCHOR-IS-THE-PARCEL site.location-changed');
        expect(at0, 'the anchored location-changed load site is gone').toBeGreaterThan(-1);
        const near = SRC.slice(at0 - 1400, at0 + 400);
        expect(near).toContain('resolveScopeAnchor({');
        expect(near).toContain('parcelRingLonLat: this.committedParcelLonLat');
        expect(near).toContain('void this.loadContextBuildings(anchor.lat, anchor.lon, true);');
    });

    it('⛔ it no longer loads about the RAW EVENT ADDRESS', () => {
        expect(
            SRC,
            'site.location-changed re-centres the scope on the address again — the slab will leave the parcel',
        ).not.toContain('void this.loadContextBuildings(loc.latitude, loc.longitude, true);');
    });

    it('the same-site radius is the SCOPE’s own radius, so no constant is minted for it', () => {
        const at0 = SRC.indexOf('§SITE-SCOPE-ANCHOR-IS-THE-PARCEL site.location-changed');
        expect(SRC.slice(at0 - 1400, at0)).toContain('sameSiteRadiusM: scopeOuterRadiusUnclampedM(this.contextScope)');
    });

    it('the decision is PRINTED either way — a held anchor and an absent one are different lines', () => {
        const at0 = SRC.indexOf('§SITE-SCOPE-ANCHOR-IS-THE-PARCEL site.location-changed');
        expect(SRC.slice(at0 - 200, at0 + 300)).toContain('${anchor.source}: ${anchor.note}');
    });

    it('the premise still holds: the clip is armed off loadContextBuildings’ own centre', () => {
        // If this stops being true, the reasoning that made `site.location-changed` a scope trigger
        // at all is stale and must be re-derived rather than left asserted.
        expect(SRC).toContain('this.contextBuildingsAt = { lat, lon };');
        expect(SRC).toContain('void this.applySiteScopeClip(lat, lon);');
    });
});
