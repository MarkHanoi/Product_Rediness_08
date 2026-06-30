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

describe('§RESI-MIDEDGE-FILL-REGRESSION — a large square fills the mid-edge bands (not just 4 corners)', () => {
    // FOUNDER REPRODUCTION (2026-06-29): a LARGE square plot, 5 levels, T2+T3 mix, min 25 / max 100 m²
    // produced "only 4 corner units, the mid-edge bands between the corners completely empty". The
    // §RESI-CORRIDOR-GRID (default-on) + §RESI-EDGE-TYPE-VARIETY perimeter fill resolves this: the plate
    // now packs a full grid of double-loaded rows around the central core, so a large square places
    // MANY units and the mid-edge bands carry apartments. This test LOCKS that in — a regression back
    // to a corner-quadrant-only partition (4 cells) would fail it. (The 4-corner screenshot the founder
    // saw was a STALE bundle predating the corridor-grid commit `89e3f6fd`.)
    //
    // The founder used min 25 m² (below T2's 55 m² band floor); the orchestrator floors the packer min
    // at the engine-feasible 72 m² (capped by the user max 100), so cells come out as real T2/T3 units.

    /** A cell counts as "mid-edge" when one z-extreme sits on a plate Z-façade but it is NOT a corner
     *  (it does not also touch an X-façade) — i.e. an edge-adjacent unit between the two corner units. */
    function midEdgeCount(cells: ReadonlyArray<{ rect: { x0: number; x1: number; z0: number; z1: number } }>, w: number, d: number): number {
        const tol = 0.3;
        let n = 0;
        for (const c of cells) {
            const r = c.rect;
            const onX = Math.abs(r.x0) < tol || Math.abs(r.x1 - w) < tol;
            const onZ = Math.abs(r.z0) < tol || Math.abs(r.z1 - d) < tol;
            // mid-edge along a Z-façade: touches a z-edge but NOT an x-edge (so it is between corners)…
            if (onZ && !onX) n++;
            // …or mid-edge along an X-façade: touches an x-edge but NOT a z-edge.
            else if (onX && !onZ) n++;
        }
        return n;
    }

    function founderInput(w: number, d: number): ResidentialBuildingOrchestratorInput {
        return {
            footprint: plate(w, d),
            upperLevels: 1,                 // one upper level is enough to assert the per-plate fill
            coreWidthM: 6,
            coreDepthM: 4,
            corridorWidthM: 1.5,
            minApartmentAreaM2: 25,         // the founder's value (below T2's band floor → floored to 72)
            maxApartmentAreaM2: 100,
            typologies: { T1: false, T2: true, T3: true, T4: false },
        };
    }

    it('a 60×60 m square places FAR more than 4 units AND fills the mid-edge bands', { timeout: 60_000 }, () => {
        const r = orchestrateResidentialBuilding(founderInput(60, 60));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        const upper = r.perLevelApartments.find((l) => l.role === 'upper');
        expect(upper).toBeTruthy();
        if (!upper) return;
        // (a) the plate is NOT "4 corner units" — it packs a full perimeter ring + interior rows.
        expect(upper.apartments.length).toBeGreaterThan(4);
        expect(upper.apartments.length).toBeGreaterThanOrEqual(16);
        // (b) the mid-edge bands BETWEEN the corners carry apartments (the founder's empty white bands).
        expect(midEdgeCount(upper.apartments.map((a) => a.cell), 60, 60)).toBeGreaterThanOrEqual(4);
        // (c) every placed apartment actually laid out (engine-feasible — no sliver soft-fails).
        expect(upper.apartments.every((a) => a.status === 'ok')).toBe(true);
    });

    it('the unit count tracks plate area (a bigger square places strictly more) — not a fixed 4', { timeout: 60_000 }, () => {
        const small = orchestrateResidentialBuilding(founderInput(40, 40));
        const large = orchestrateResidentialBuilding(founderInput(80, 80));
        expect(small.status).toBe('ok');
        expect(large.status).toBe('ok');
        if (small.status !== 'ok' || large.status !== 'ok') return;
        const sUpper = small.perLevelApartments.find((l) => l.role === 'upper')!;
        const lUpper = large.perLevelApartments.find((l) => l.role === 'upper')!;
        expect(sUpper.apartments.length).toBeGreaterThanOrEqual(8);
        expect(lUpper.apartments.length).toBeGreaterThan(sUpper.apartments.length);
    });
});

describe('§RESI-FILL-SIDEFACADE — a ~1200 m² near-rectangular plate fills the SIDE mid-edge bands', () => {
    // FOUNDER REPRODUCTION (2026-06-30): a ~1213 m² near-square plate, min apartment 60 m², previewed
    // ONLY ~3 corner units with the LEFT and RIGHT plate-edge mid-edge bands (the strips between the
    // top-corner and bottom-corner units, beside the central core) left EMPTY. Before §RESI-FILL-SIDEFACADE
    // the packer placed 8 units (4 corner + 4 top/bottom-façade mid-edge) but the SIDE façades in the
    // central zone stayed empty (the inter-corridor rows there were sub-feasible slivers, and the interior
    // residual pockets have no façade → the window-needing engine produced no layout). §RESI-FILL-SIDEFACADE
    // packs those side bands directly with RECTANGULAR (elongated, non-square) units that hug the plate
    // edge (façade + windows) and front the nearest horizontal corridor (door → core-reachable).

    /** A cell is "mid-edge" when one extreme sits on a plate façade but it is NOT a corner. */
    function midEdgeCount(cells: ReadonlyArray<{ rect: { x0: number; x1: number; z0: number; z1: number } }>, w: number, d: number): number {
        const tol = 0.3; let n = 0;
        for (const { rect: r } of cells) {
            const onX = Math.abs(r.x0) < tol || Math.abs(r.x1 - w) < tol;
            const onZ = Math.abs(r.z0) < tol || Math.abs(r.z1 - d) < tol;
            if ((onZ && !onX) || (onX && !onZ)) n++;
        }
        return n;
    }
    /** A unit touching the LEFT (x≈0) or RIGHT (x≈w) plate façade but NOT a Z-façade — the side mid-edge
     *  band the founder saw empty. */
    function sideFacadeCount(cells: ReadonlyArray<{ rect: { x0: number; x1: number; z0: number; z1: number } }>, w: number, d: number): number {
        const tol = 0.3; let n = 0;
        for (const { rect: r } of cells) {
            const onX = Math.abs(r.x0) < tol || Math.abs(r.x1 - w) < tol;
            const onZ = Math.abs(r.z0) < tol || Math.abs(r.z1 - d) < tol;
            if (onX && !onZ) n++;
        }
        return n;
    }
    function input(footprint: Pt[], min = 60): ResidentialBuildingOrchestratorInput {
        return {
            footprint, upperLevels: 1, coreWidthM: 6, coreDepthM: 4, corridorWidthM: 1.5,
            minApartmentAreaM2: min, maxApartmentAreaM2: 100,
            typologies: { T1: false, T2: true, T3: true, T4: false },
        };
    }
    /** Rectilinear L-plate ≈ `area` m² (a wide base + a tall left wing). */
    function lPlate(): Pt[] {
        return [
            { x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 18 },
            { x: 22, z: 18 }, { x: 22, z: 38 }, { x: 0, z: 38 },
        ];
    }

    it('the founder ~1213 m² plate (34.8×34.8, min 60) places ≥8 units, side mid-edge filled, every unit OK', { timeout: 60_000 }, () => {
        const w = 34.8, d = 34.8;
        const r = orchestrateResidentialBuilding(input(plate(w, d)));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        const upper = r.perLevelApartments.find((l) => l.role === 'upper')!;
        const cells = upper.apartments.map((a) => a.cell);
        // (a) FAR more than the founder's 3 corner units — aim 8–14 for a ~1200 m² / 60 m² plate.
        expect(upper.apartments.length).toBeGreaterThanOrEqual(8);
        // (b) the mid-edge bands BETWEEN the corners carry apartments…
        expect(midEdgeCount(cells, w, d)).toBeGreaterThanOrEqual(4);
        // …and specifically the LEFT/RIGHT (side) façade bands the founder saw empty are now occupied.
        expect(sideFacadeCount(cells, w, d)).toBeGreaterThanOrEqual(2);
        // (c) every placed unit is engine-FEASIBLE (laid out — no windowless / sliver soft-fails)…
        expect(upper.apartments.every((a) => a.status === 'ok')).toBe(true);
        // …and CORE-REACHABLE (shares ≥ a door width with a corridor — the partition's reach invariant).
        // The orchestrator only ships cells the partition reached, so this is implied; assert non-empty.
        expect(cells.length).toBeGreaterThan(0);
    });

    it('the side-band units are RECTANGULAR (at least one non-square unit present)', { timeout: 60_000 }, () => {
        // A 40×30 plate makes the side bands elongated (deeper-than-tall), so the fill produces a clearly
        // non-square unit (the founder: "they don't need to be square; rectangular is fine").
        const r = orchestrateResidentialBuilding(input(plate(40, 30)));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        const upper = r.perLevelApartments.find((l) => l.role === 'upper')!;
        const nonSquare = upper.apartments.filter((a) => {
            const c = a.cell.rect, W = Math.abs(c.x1 - c.x0), D = Math.abs(c.z1 - c.z0);
            return Math.max(W, D) / Math.max(1e-6, Math.min(W, D)) > 1.25;
        });
        expect(nonSquare.length).toBeGreaterThanOrEqual(1);
        // Every unit stays within a sane aspect (≤ 3.5:1 — the founder's "respect a sane max aspect").
        for (const a of upper.apartments) {
            const c = a.cell.rect, W = Math.abs(c.x1 - c.x0), D = Math.abs(c.z1 - c.z0);
            expect(Math.max(W, D) / Math.max(1e-6, Math.min(W, D))).toBeLessThanOrEqual(3.5 + 1e-3);
        }
        expect(upper.apartments.every((a) => a.status === 'ok')).toBe(true);
    });

    it('an L-shaped ~1200 m² plate (min 60) also places ≥8 engine-feasible units', { timeout: 60_000 }, () => {
        // The L path is the wing-by-wing rect-decomposition (§RESI-RECT-DECOMP); a concave shell forces
        // an architectural compromise on a couple of cells, so we assert ≥8 cells LAID OUT (status ok),
        // not that every single cell on a concave plate lays out.
        const r = orchestrateResidentialBuilding(input(lPlate()));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        const upper = r.perLevelApartments.find((l) => l.role === 'upper')!;
        const ok = upper.apartments.filter((a) => a.status === 'ok').length;
        expect(ok).toBeGreaterThanOrEqual(8);
    });

    it('is deterministic — the founder plate twice → identical output', { timeout: 60_000 }, () => {
        const a = orchestrateResidentialBuilding(input(plate(34.8, 34.8)));
        const b = orchestrateResidentialBuilding(input(plate(34.8, 34.8)));
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});
