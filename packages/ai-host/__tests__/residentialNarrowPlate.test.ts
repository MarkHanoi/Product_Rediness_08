// §RESI-NARROW-PLATE-SIDE-CORE (founder 2026-08-01 — L-668; the SECOND report of this class,
// after §RESI-SMALL-PLATE-CORE-SCALE / founder 2026-06-24).
//
// FOUNDER REPORT: *"check why a plot of 674 m² is too small? What is the ceiling? Reduce the
// ceiling — you could even build a resi building in a plot of 150 m²."*
//
// MEASURED ROOT CAUSE. There is NO plot-AREA gate anywhere in this engine. The quantity that
// binds is the plate's WIDTH. Sweeps against the real orchestrator, BEFORE the fix:
//     16 m × 45 m = 720 m²  → REJECTED
//     16.5 m × 16.5 m = 272 m² → builds
// A 720 m² plate refused while a 272 m² plate built, so area is orthogonal to the gate — and the
// product's "needs roughly ≥400 m² of plate" copy was measuring a quantity the engine never
// evaluated (covered by `residentialError.test.ts`).
//
// WHY §RESI-SMALL-PLATE-CORE-SCALE DID NOT CLOSE THE CLASS. That fix had exactly one lever —
// shrink the core — and no fallback for when shrinking is not enough. `effectiveCoreSize`
// computed `wByRuns = plateW − 2·MIN_SIDE_RUN_M` and returned
// `max(MIN_CORE_DIM_M, min(requested, wByRuns))`. Once `wByRuns < MIN_CORE_DIM_M` — i.e. once
// `plateW < 2·8.5 + 2.6 = 19.6 m` — the MIN_CORE_DIM_M floor won and the two-usable-runs goal the
// function documents was silently abandoned: it returned a core it had already proven unusable,
// the partition placed zero, and the orchestrator refused. A real stair + lift has a size floor,
// so no further tuning of that constant could ever have reached this class. What was missing was
// an alternative ARRANGEMENT, not a smaller number.
//
// THE FIX. The centred (double-loaded) plan is still attempted FIRST on every plate — so nothing
// that builds today changes. Only when it places zero apartments does the engine retry with the
// standard narrow-plot typology: a SIDE core flush to one plate edge serving a SINGLE-LOADED run.
// That needs one run, not two, dropping the derived width floor from 19.6 m to
// `MIN_CORE_DIM_M + MIN_SIDE_RUN_M` = 2.6 + 8.5 = 11.1 m (`MIN_PLATE_WIDTH_M`).
//
// Every test below FAILS without the fix.

import { describe, it, expect } from 'vitest';
import {
    orchestrateResidentialBuilding,
    MIN_PLATE_WIDTH_M,
    MIN_CENTRED_CORE_PLATE_WIDTH_M,
    type ResidentialBuildingOrchestratorInput,
} from '../src/workflows/residentialBuilding/residentialBuildingOrchestrator.js';
import { MAX_RECT_ASPECT } from '../src/workflows/residentialBuilding/platePartition.js';
import type { Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';

const rect = (w: number, d: number): Pt[] => [
    { x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d },
];

/** The founder's live defaults from the onboarding setup step: 5 upper levels, 60–100 m², T2+T3. */
function input(over: Partial<ResidentialBuildingOrchestratorInput> = {}): ResidentialBuildingOrchestratorInput {
    return {
        footprint: rect(30, 30),
        upperLevels: 5,
        coreWidthM: 6,
        coreDepthM: 4,
        corridorWidthM: 1.5,
        minApartmentAreaM2: 60,
        maxApartmentAreaM2: 100,
        typologies: { T1: false, T2: true, T3: true, T4: false },
        ...over,
    };
}

const upperApartments = (r: ReturnType<typeof orchestrateResidentialBuilding>) =>
    r.status === 'ok' ? (r.perLevelApartments[1]?.apartments ?? []) : [];

describe('§RESI-NARROW-PLATE-SIDE-CORE — the derived floor is a WIDTH, not an area', () => {
    it('the exported floor is DERIVED from the engine constants, not chosen (2.6 + 8.5 = 11.1 m)', () => {
        expect(MIN_PLATE_WIDTH_M).toBeCloseTo(11.1, 6);
        expect(MIN_CENTRED_CORE_PLATE_WIDTH_M).toBeCloseTo(19.6, 6);
    });

    it('FOUNDER CASE — a 674 m² NARROW plate (15 × 44.9 m) now BUILDS (was "too small")', () => {
        const r = orchestrateResidentialBuilding(input({ footprint: rect(15, 44.9) }));
        expect(r.status).toBe('ok');
        const apts = upperApartments(r);
        expect(apts.length).toBeGreaterThanOrEqual(1);
        // The apartments must be REAL, not slivers bought to make the build succeed.
        for (const a of apts) expect(a.targetAreaM2).toBeGreaterThanOrEqual(60);
        expect(apts.filter((a) => a.status === 'ok').length).toBeGreaterThanOrEqual(1);
    });

    it('FOUNDER TARGET — a ~150 m² plot (12 × 12.5 m) builds a real single-loaded block', () => {
        const r = orchestrateResidentialBuilding(input({ footprint: rect(12, 12.5) }));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        const apts = upperApartments(r);
        expect(apts.length).toBeGreaterThanOrEqual(1);
        expect(apts.filter((a) => a.status === 'ok').length).toBeGreaterThanOrEqual(1);
        // §RESI-NARROW-PLATE-SIDE-CORE — the core sits FLUSH to the x0 plate edge (single-loaded),
        // not on the plate centroid, so the whole remaining width is one apartment run.
        expect(r.core.x0).toBeCloseTo(0, 3);
        expect(r.diagnostic).toContain('corePlacement=side');
    });

    it('AREA IS NOT THE GATE — a 720 m² plate that used to refuse builds, and every emitted cell is contained', () => {
        const r = orchestrateResidentialBuilding(input({ footprint: rect(16, 45) }));
        expect(r.status).toBe('ok');
        for (const a of upperApartments(r)) {
            const q = a.cell.rect;
            expect(q.x0).toBeGreaterThanOrEqual(-1e-6);
            expect(q.z0).toBeGreaterThanOrEqual(-1e-6);
            expect(q.x1).toBeLessThanOrEqual(16 + 1e-6);
            expect(q.z1).toBeLessThanOrEqual(45 + 1e-6);
        }
    });
});

describe('§RESI-NARROW-PLATE-SIDE-CORE — the refusal below the floor is TRUE and names the real quantity', () => {
    it('an 11 m-wide plate the CORRIDOR typology refuses at any area names the measured width and the derived threshold — and, since §RESI-SINGLE-CORE-LANDING, the landing typology is measured too', () => {
        // ⚠ Corrected 2026-08-25 (lane SMALLPLATE68, ADR-0372): "refuses AT ANY AREA" was true of the
        // ONE typology this engine knew. An 11 × 20 m plate now BUILDS: one apartment per floor off a
        // rear-corner core + landing (no corridor), the rear bay explained as stranded. The deep 11 m
        // plates still refuse — the landing typology's only front cell would exceed the engine's
        // proven width — and the refusal now names BOTH typologies with their numbers (C74).
        for (const [w, d] of [[11, 45], [11, 100]] as const) {
            const r = orchestrateResidentialBuilding(input({ footprint: rect(w, d) }));
            expect(r.status).toBe('rejected');
            if (r.status !== 'rejected') continue;
            expect(r.reason).toContain('too narrow');
            expect(r.reason).toContain(`${w} m across its short side`);   // the MEASURED quantity
            expect(r.reason).toContain(`${MIN_PLATE_WIDTH_M} m`);          // the DERIVED threshold
            expect(r.reason).toContain('single-core landing');             // the SECOND typology, measured
            // ⚠ THE DEFECT BEING FIXED: the corridor refusal never quotes a plot AREA as the reason.
            // (The landing half quotes its measured CELLS in m² — a different, honest number.)
            expect(r.reason.split(' — and the single-core landing')[0]).not.toContain('m²');
        }
        const built = orchestrateResidentialBuilding(input({ footprint: rect(11, 20) }));
        expect(built.status).toBe('ok');
        if (built.status !== 'ok') return;
        expect(built.circulationTypology).toBe('single-core-landing');
        expect(upperApartments(built).length).toBe(1);
        expect(built.perLevelApartments[1]?.stranded).toBeDefined();
    });

    it('the refusal is self-consistent — the measured value is below the threshold it quotes', () => {
        const r = orchestrateResidentialBuilding(input({ footprint: rect(9, 30) }));
        expect(r.status).toBe('rejected');
        if (r.status !== 'rejected') return;
        const measured = Number(/measures ([\d.]+) m/.exec(r.reason)?.[1]);
        const threshold = Number(/at least ([\d.]+) m/.exec(r.reason)?.[1]);
        expect(Number.isFinite(measured)).toBe(true);
        expect(Number.isFinite(threshold)).toBe(true);
        expect(measured).toBeLessThan(threshold);
    });

    it('the capacity-miss reject carries the MEASURED plate dimensions (so no plot area is ever quoted)', () => {
        // 40 × 8 m: wide enough, but too SHALLOW — the single-loaded fallback could only produce
        // ribbons, so it is correctly refused (see the ribbon guard below).
        const r = orchestrateResidentialBuilding(input({ footprint: rect(40, 8) }));
        expect(r.status).toBe('rejected');
        if (r.status !== 'rejected') return;
        expect(r.reason).toMatch(/on a [\d.]+ m × [\d.]+ m plate/);
    });
});

describe('§RESI-NARROW-PLATE-SIDE-CORE — the fallback must not buy a build with junk', () => {
    it('RIBBON GUARD — a shallow 40 × 8 m plate still refuses rather than emitting 9.4 : 1 cells', () => {
        // Measured: without the guard the single-loaded plan emits 34.0 m × 3.6 m "apartments".
        // The partition's own ceiling for a rectangular unit is MAX_RECT_ASPECT (3.5 : 1).
        const r = orchestrateResidentialBuilding(input({ footprint: rect(40, 8) }));
        expect(r.status).toBe('rejected');
    });

    it('every cell on every plate the fallback DOES accept is within the engine aspect ceiling', () => {
        for (const [w, d] of [[12, 12.5], [15, 44.9], [12, 10], [16, 45]] as const) {
            const r = orchestrateResidentialBuilding(input({ footprint: rect(w, d) }));
            expect(r.status).toBe('ok');
            for (const a of upperApartments(r)) {
                const q = a.cell.rect;
                const cw = q.x1 - q.x0, cd = q.z1 - q.z0;
                expect(Math.max(cw, cd) / Math.min(cw, cd)).toBeLessThanOrEqual(MAX_RECT_ASPECT + 1e-6);
            }
        }
    });
});

describe('§RESI-NARROW-PLATE-SIDE-CORE — R-CENTRE is preserved wherever it still works', () => {
    it('every plate that built with a CENTRED core before still builds with a CENTRED core', { timeout: 120_000 }, () => {
        // These all built pre-fix; the fallback must be unreachable for them (measured counts kept).
        // Every upper level is identical, so one upper level is enough and keeps the sweep cheap.
        const cases: Array<readonly [number, number, number]> = [
            [16.5, 16.5, 2], [17, 17, 2], [18, 18, 2], [19, 19, 4],
            [20, 20, 4], [26, 25.9, 4], [30, 22.5, 4], [20, 33.7, 6],
        ];
        for (const [w, d, expected] of cases) {
            const r = orchestrateResidentialBuilding(input({ footprint: rect(w, d), upperLevels: 1 }));
            expect(r.status).toBe('ok');
            if (r.status !== 'ok') continue;
            expect(r.diagnostic).toContain('corePlacement=centre');
            expect(upperApartments(r).length).toBe(expected);
        }
    });

    it('a large plate keeps the centred core exactly on the plate centroid (R-CENTRE unchanged)', () => {
        const r = orchestrateResidentialBuilding(input({ footprint: rect(38, 43), upperLevels: 1 }));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expect((r.core.x0 + r.core.x1) / 2).toBeCloseTo(19, 3);
        expect(r.diagnostic).toContain('corePlacement=centre');
    });
});
