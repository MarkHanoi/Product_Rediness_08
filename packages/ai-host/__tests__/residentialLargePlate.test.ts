// §RESI-PARTITION-BBOX-PLATE (large-plate zero-apartments fix, 2026-06-23).
//
// THE BUG: the founder drew an ~18,764 m² parcel (≈137×137 m) and the residential build
// rejected with `level 1 partition placed zero apartments (core/corridor leave no usable
// band runs)`. The ~38×43 m feasibility plate placed fine, so the failure was LARGE /
// IRREGULAR-plate-specific.
//
// ROOT CAUSE: the orchestrator de-rotates the parcel into an axis-aligned LOCAL frame and
// commits to `bb = bbox(footprint)` for EVERY downstream geometry op (core, corridor band,
// front/back bands, netArea), but it then passed the RAW de-rotated polygon to
// `partitionLevelPlate`. The partition re-derives the same bbox for its geometry but ALSO
// runs a `bboxFill ≥ 0.80` gate on the polygon. A real hand-drawn parcel is a slightly
// irregular quad whose de-rotated corners don't sit exactly on the bbox corners → fill can
// dip below 0.80 → the partition HARD-rejects for EVERY k in the orchestrator's prefix-trim
// loop → the loop exhausts → the misleading "no usable band runs" reject.
//
// THE FIX: the orchestrator now hands the partition the AXIS-ALIGNED BBOX RECTANGLE it has
// already committed to (byte-identical geometry for a clean/rotated rectangle, fill = 1.0).
//
// This test asserts a ~137×137 m and an ~80×80 m T2/T3 plate place MANY apartments and are
// NOT rejected — failing before the fix (zero) and passing after.

import { describe, it, expect } from 'vitest';
import {
    orchestrateResidentialBuilding,
    type ResidentialBuildingOrchestratorInput,
} from '../src/workflows/residentialBuilding/residentialBuildingOrchestrator.js';
import type { Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';

/** Axis-aligned rectangular footprint, metres, plan frame. */
function plate(w: number, d: number): Pt[] {
    return [
        { x: 0, z: 0 },
        { x: w, z: 0 },
        { x: w, z: d },
        { x: 0, z: d },
    ];
}

/** A slightly IRREGULAR convex quad ≈ w×d (the founder case — a hand-drawn boundary whose
 *  corners do NOT land exactly on the bbox). bbox stays w×d; the polygon area is a little
 *  under it, so its de-rotated bbox-fill is < 1.0 (the exact shape that triggered the bug). */
function irregularPlate(w: number, d: number, nudge: number): Pt[] {
    return [
        { x: nudge, z: nudge },
        { x: w - nudge, z: 0 },
        { x: w, z: d - nudge },
        { x: 0, z: d },
    ];
}

function largeInput(over: Partial<ResidentialBuildingOrchestratorInput> = {}): ResidentialBuildingOrchestratorInput {
    return {
        footprint: plate(137, 137),  // ~18,769 m² — the founder's site plate
        upperLevels: 1,
        coreWidthM: 6,
        coreDepthM: 4,
        corridorWidthM: 1.5,
        minApartmentAreaM2: 60,
        maxApartmentAreaM2: 100,
        typologies: { T1: false, T2: true, T3: true, T4: false },
        ...over,
    };
}

function upperCount(input: ResidentialBuildingOrchestratorInput): { total: number; status: string } {
    const r = orchestrateResidentialBuilding(input);
    if (r.status !== 'ok') return { total: 0, status: r.status };
    const upper = r.perLevelApartments.find((l) => l.role === 'upper');
    return { total: upper ? upper.apartments.length : 0, status: 'ok' };
}

describe('§RESI-PARTITION-BBOX-PLATE — a LARGE plate places MANY apartments (not zero)', () => {
    // §RESI-LARGE-PLATE-REGRESSION (2026-06-24) — a ~137×137 m plate now places MANY (~200+) real
    // apartments, each laid out by the heavy per-cell D-TGL engine, so a single orchestration takes
    // several seconds — well over vitest's 5 s default. The yield + determinism are CORRECT (verified
    // ≥10 and byte-identical); the failures were purely the default timeout. Give the big-plate tests
    // a realistic budget. (Not a logic change — the partition/engine output is unchanged.)
    it('a ~137×137 m T2/T3 plate is NOT rejected and places ≥10 apartments', () => {
        const r = orchestrateResidentialBuilding(largeInput());
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        const upper = r.perLevelApartments.find((l) => l.role === 'upper');
        expect(upper).toBeTruthy();
        if (!upper) return;
        expect(upper.apartments.length).toBeGreaterThanOrEqual(10);
    }, 60_000);

    it('an IRREGULAR (hand-drawn) ~137×137 m quad — the founder shape — also places ≥10', { timeout: 60_000 }, () => {
        // Pre-fix this is the exact reproduction: the de-rotated quad's bbox-fill dips below
        // 0.80 → the partition rejected for every k → zero apartments.
        // nudge = 20 m drops the bbox-fill to ~0.73 (< the partition's 0.80 gate) — the exact
        // pre-fix reproduction (a perfect rectangle has fill 1.0 and never tripped the gate).
        const r = orchestrateResidentialBuilding(
            largeInput({ footprint: irregularPlate(137, 137, 20) }),
        );
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        const upper = r.perLevelApartments.find((l) => l.role === 'upper');
        expect(upper).toBeTruthy();
        if (!upper) return;
        expect(upper.apartments.length).toBeGreaterThanOrEqual(10);
    });

    it('an ~80×80 m T2/T3 plate places a strong majority (≥8)', { timeout: 60_000 }, () => {
        const { total, status } = upperCount(largeInput({ footprint: plate(80, 80) }));
        expect(status).toBe('ok');
        expect(total).toBeGreaterThanOrEqual(8);
    });

    it('the existing ~38×43 m plate STILL places several apartments (no regression)', () => {
        const { total, status } = upperCount(
            largeInput({ footprint: plate(38, 43), minApartmentAreaM2: 60, maxApartmentAreaM2: 100 }),
        );
        expect(status).toBe('ok');
        expect(total).toBeGreaterThanOrEqual(4);
    });

    it('a genuinely TOO-SMALL plate still rejects (the fix does not mask real capacity misses)', () => {
        // A 12×10 m plate (after core + corridor) cannot host a single ≥72 m² engine-feasible
        // apartment → the packer/partition must still soft-fail.
        const r = orchestrateResidentialBuilding(largeInput({ footprint: plate(12, 10) }));
        expect(r.status).toBe('rejected');
    });

    it('is deterministic on the large plate — same input twice → identical output', { timeout: 60_000 }, () => {
        const a = orchestrateResidentialBuilding(largeInput({ upperLevels: 2 }));
        const b = orchestrateResidentialBuilding(largeInput({ upperLevels: 2 }));
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});
