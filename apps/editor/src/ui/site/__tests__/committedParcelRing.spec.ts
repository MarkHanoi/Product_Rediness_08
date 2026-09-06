// §PARCEL-VISIBLE-EVERYWHERE (L-13016) — the committed parcel, in WGS84, pinned.
//
// ⭐ WHAT THIS SUITE IS FOR. The founder's report — *"I went into a single view — 2D site view —
// and the parcel was NOT highlighted, although the data was on the right hand side"* — is a
// REACHABILITY defect: the model held the ring and no map-frame surface could ask for it. This
// module is that ask, and the two things worth pinning are the two that were silently wrong
// everywhere else:
//
//   1. **THE THREE ARMS ARE THREE.** `absent` (nothing committed — the resting state) and
//      `refused` (a real ring PRYZM cannot honestly place) must never collapse into one falsy
//      value. That collapse is the §CONTEXT-DATA-HONESTY family, and C58 §1.20 clause 4 names it
//      in advance: *"a `null` envelope is a STATE TO RENDER, not a branch to skip … distinguish
//      them AT THE READ."* Same rule, one object over.
//   2. **θ IS APPLIED, AND ITS SIGN IS THE ONE THAT MIRRORS.** A hand-rolled projection is correct
//      at θ = 0 and lands the ring MIRRORED across the frame origin at a wrong-signed θ — the
//      §PARCEL-SHADE-NOT-MIRRORED defect (L-10740) whose own success criterion had no term for it
//      and therefore reported CONSISTENT forever. So the θ ≠ 0 case is asserted against an
//      INDEPENDENT construction, not against the function's own output.

import { describe, expect, it } from 'vitest';
import { readCommittedParcelRing } from '../committedParcelRing';
import { latLonToSceneXZ } from '../boundaryProjection';

const ORIGIN = { lat: 41.3825, lon: 2.1769 }; // Plaça Sant Jaume, Barcelona — the founder's parcel.

/** A store stub. Structural, exactly as the module declares — no cast, no fake runtime. */
function store(
    polygon: ReadonlyArray<{ x: number; z: number }> | null,
    location: { trueNorth?: number } | null = { trueNorth: 0 },
) {
    return {
        getSite: () => ({
            parcel: polygon === null ? null : { boundary: { polygon } },
            location,
        }),
    };
}

const SQUARE = [
    { x: -10, z: -10 },
    { x: 10, z: -10 },
    { x: 10, z: 10 },
    { x: -10, z: 10 },
];

describe('§PARCEL-VISIBLE-EVERYWHERE — the three arms are THREE, never two', () => {
    it('ABSENT when no parcel is committed — and says so as the resting state, not a failure', () => {
        const r = readCommittedParcelRing(store(null), ORIGIN);
        expect(r.kind).toBe('absent');
        if (r.kind !== 'absent') return;
        expect(r.reason).toMatch(/resting state/i);
        // ⛔ The absent arm must NOT blame PRYZM: nothing is broken, nothing is committed.
        expect(r.reason).not.toMatch(/could not/i);
    });

    it('ABSENT for a degenerate ring (< 3 corners) — a two-point "polygon" is not a plot', () => {
        expect(readCommittedParcelRing(store([{ x: 0, z: 0 }, { x: 1, z: 1 }]), ORIGIN).kind).toBe('absent');
    });

    it('REFUSES — never returns absent — when a REAL ring exists but no origin resolves', () => {
        const r = readCommittedParcelRing(store(SQUARE), null);
        expect(r.kind).toBe('refused');
        if (r.kind !== 'refused') return;
        // The sentence must carry the CORNER COUNT, so the reader can tell this is a real plot
        // being withheld rather than an empty project.
        expect(r.reason).toContain('4 corners');
        expect(r.reason).toMatch(/wrong land/i);
    });

    it('REFUSES when θ cannot be READ — ⛔ that is NOT the same as θ = 0 (§L-446)', () => {
        const r = readCommittedParcelRing(store(SQUARE, null), ORIGIN);
        expect(r.kind).toBe('refused');
        if (r.kind !== 'refused') return;
        expect(r.reason).toMatch(/NOT the same as θ = 0/);
    });

    it('a REACHABLE location with trueNorth 0 is a DEFINITE answer and draws normally', () => {
        const r = readCommittedParcelRing(store(SQUARE, { trueNorth: 0 }), ORIGIN);
        expect(r.kind).toBe('ring');
        if (r.kind !== 'ring') return;
        expect(r.ring).toHaveLength(4);
        expect(r.thetaRad).toBe(0);
    });

    it('REFUSES rather than drawing a PARTIAL plot when vertices are non-finite', () => {
        const r = readCommittedParcelRing(
            store([{ x: 0, z: 0 }, { x: NaN, z: 1 }, { x: Infinity, z: 2 }]),
            ORIGIN,
        );
        expect(r.kind).toBe('refused');
        if (r.kind !== 'refused') return;
        expect(r.reason).toMatch(/partial plot outline/i);
    });

    it('never throws when the store itself throws — it REFUSES and says the gap is PRYZM’s', () => {
        const r = readCommittedParcelRing({ getSite: () => { throw new Error('boom'); } }, ORIGIN);
        expect(r.kind).toBe('refused');
        if (r.kind !== 'refused') return;
        expect(r.reason).toMatch(/gap in PRYZM/i);
    });
});

describe('§PARCEL-VISIBLE-EVERYWHERE — the projection round-trips, and θ is really applied', () => {
    it('θ = 0 round-trips through the INVERSE projection to the metres it was given', () => {
        const r = readCommittedParcelRing(store(SQUARE), ORIGIN);
        expect(r.kind).toBe('ring');
        if (r.kind !== 'ring') return;
        r.ring.forEach((ll, i) => {
            const back = latLonToSceneXZ(ll, ORIGIN.lat, ORIGIN.lon);
            expect(back.x).toBeCloseTo(SQUARE[i]!.x, 6);
            expect(back.z).toBeCloseTo(SQUARE[i]!.z, 6);
        });
    });

    it('θ = 90° ROTATES the ring — and against an INDEPENDENT construction, not its own output', () => {
        const theta = Math.PI / 2;
        // ONE point, east of the origin in the PROJECT frame.
        const r = readCommittedParcelRing(
            store([{ x: 10, z: 0 }, { x: 10, z: 5 }, { x: 0, z: 5 }], { trueNorth: theta }),
            ORIGIN,
        );
        expect(r.kind).toBe('ring');
        if (r.kind !== 'ring') return;
        const back = latLonToSceneXZ(r.ring[0]!, ORIGIN.lat, ORIGIN.lon);
        // §L-430 / `sceneXZToEnu`: scene +X at θ = 90° points to TRUE SOUTH (east = cos θ ≈ 0,
        // north = −sin θ = −1). In the TRUE-north XZ frame this reader emits, that is z = +10.
        // ⛔ A wrong-signed θ lands it at z = −10 — visually plausible, and exactly the mirrored
        // answer L-10740 shipped. This assertion is what makes that reachable by a test.
        expect(back.x).toBeCloseTo(0, 4);
        expect(back.z).toBeCloseTo(10, 4);
    });

    it('preserves the store’s own vertex ORDER — a re-wound ring is a different polygon', () => {
        const r = readCommittedParcelRing(store(SQUARE), ORIGIN);
        expect(r.kind).toBe('ring');
        if (r.kind !== 'ring') return;
        // Corner 0 is the south-west of the square, so it is the southernmost AND westernmost.
        const lats = r.ring.map((p) => p.lat);
        const lons = r.ring.map((p) => p.lon);
        expect(r.ring[0]!.lat).toBeCloseTo(Math.max(...lats), 9); // z = −10 ⇒ NORTH of the origin
        expect(r.ring[0]!.lon).toBeCloseTo(Math.min(...lons), 9);
    });
});
