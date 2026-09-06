// Residential building — Tracker **P8.1, THE CORRIDOR SPINE** — the corridor-quality gate.
//
// TEST-FIRST per the tracker's P8 instruction ("build this in a FRESH focused context, test-first,
// GATED default-OFF"). Covers the acceptance row verbatim:
//   "every apt main door opens onto corridor; corridor reaches core"
//   `§DIAG-CORRIDOR-QUALITY apartmentsReached=N/N servedThrough=0`
//
// Two halves, deliberately separate:
//   A. UNIT — hand-built plates that FORCE each verdict (core-reachable / stub-only / served-through
//      / orphaned). A gate that has never been shown going RED has not been shown to work at all.
//   B. END-TO-END — the real `orchestrateResidentialBuilding` output on real plates, INCLUDING the
//      two narrow plates that measured 0/6 core-reachable before §RESI-ABSORBED-DOOR-EDGE.

import { describe, it, expect } from 'vitest';
import {
    assessCorridorQuality,
    assessLevelCorridorQuality,
    corridorQualityGateOn,
    type CorridorQualityLevel,
    type CorridorQualitySubject,
} from '../residentialCorridorQuality';
import { rectPolygon, type ApartmentCell } from '../platePartition';
import {
    orchestrateResidentialBuilding,
    type ResidentialBuildingOrchestratorInput,
} from '../residentialBuildingOrchestrator';
import type { Pt, Rect } from '../../apartmentLayout/tgl/rectDecomposition';

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────

const R = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x0, z0, x1, z1 });

function cell(rect: Rect, doorEdge: ApartmentCell['doorEdge'], over: Partial<ApartmentCell> = {}): ApartmentCell {
    return {
        typology: 'T2', rect, areaM2: (rect.x1 - rect.x0) * (rect.z1 - rect.z0),
        doorEdge, polygon: rectPolygon(rect), ...over,
    };
}

/** A textbook double-loaded plate: core in the middle of a horizontal corridor band, two units
 *  above and two below, every door edge on the band. */
function healthyLevel(): { level: CorridorQualityLevel; core: Rect } {
    const core = R(9, 9, 15, 11);
    const band = R(0, 9, 24, 11);                     // full-width corridor through the core
    const level: CorridorQualityLevel = {
        levelIndex: 1, role: 'upper', publicCorridor: [band],
        apartments: [
            { cell: cell(R(0, 0, 12, 9), 'z1') },     // north-west, door on its z1 (== band.z0)
            { cell: cell(R(12, 0, 24, 9), 'z1') },    // north-east
            { cell: cell(R(0, 11, 12, 20), 'z0') },   // south-west, door on its z0 (== band.z1)
            { cell: cell(R(12, 11, 24, 20), 'z0') },  // south-east
        ],
    };
    return { level, core };
}

function poly(w: number, d: number): Pt[] {
    return [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
}

function buildingInput(over: Partial<ResidentialBuildingOrchestratorInput> = {}): ResidentialBuildingOrchestratorInput {
    return {
        footprint: poly(30, 18), upperLevels: 2,
        coreWidthM: 6, coreDepthM: 5, corridorWidthM: 1.5,
        minApartmentAreaM2: 45, maxApartmentAreaM2: 120,
        typologies: { T1: false, T2: true, T3: true, T4: false },
        ...over,
    };
}

// ── A. UNIT — each verdict is forced, RED and GREEN both demonstrated ────────────────────────────

describe('P8.1 §DIAG-CORRIDOR-QUALITY — the invariant, forced', () => {
    it('a healthy double-loaded plate passes R1–R4 and reports apartmentsReached=N/N servedThrough=0', () => {
        const { level, core } = healthyLevel();
        const r = assessLevelCorridorQuality(level, core);
        expect(r.apartments).toBe(4);
        expect(r.reached).toBe(4);
        expect(r.coreReachable).toBe(4);
        expect(r.servedThrough).toBe(0);
        expect(r.orphaned).toBe(0);
        expect(r.corridorTouchesCore).toBe(true);
        expect(r.pass).toBe(true);
        expect(r.cells.every((c) => c.verdict === 'core-reachable')).toBe(true);
        // The tracker's literal wording must appear in the diagnostic.
        expect(r.diagnostic).toContain('§DIAG-CORRIDOR-QUALITY');
        expect(r.diagnostic).toContain('apartmentsReached=4/4');
        expect(r.diagnostic).toContain('servedThrough=0');
    });

    it('RED — a unit whose door edge is an EXTERIOR façade is NOT reached (the §RESI-ABSORBED-DOOR-EDGE class)', () => {
        // Exactly the shipped defect: the plate is fine, but one cell's doorEdge points at the
        // outside wall (z0 of the whole plate) instead of the corridor it actually abuts.
        const { level, core } = healthyLevel();
        const broken: CorridorQualityLevel = {
            ...level,
            apartments: [
                { cell: cell(R(0, 0, 12, 9), 'z0') },   // ← door on the EXTERIOR edge, not the band
                ...level.apartments.slice(1),
            ],
        };
        const r = assessLevelCorridorQuality(broken, core);
        expect(r.pass).toBe(false);
        expect(r.reached).toBe(3);
        expect(r.coreReachable).toBe(3);
        // It abuts its neighbour, so the only way in would be THROUGH that neighbour.
        expect(r.servedThrough).toBe(1);
        expect(r.cells[0]!.verdict).toBe('served-through');
        expect(r.diagnostic).toContain('apartmentsReached=3/4');
        expect(r.diagnostic).toContain('servedThrough=1');
        expect(r.diagnostic).toContain('status=FAIL');
    });

    it('RED — a unit fronting only a MAROONED corridor stub is stub-only, never core-reachable', () => {
        const core = R(9, 9, 15, 11);
        const level: CorridorQualityLevel = {
            levelIndex: 1, role: 'upper',
            publicCorridor: [
                R(0, 9, 24, 11),                       // the real, core-touching band
                R(0, 30, 24, 32),                      // a stub far away, touching nothing
            ],
            apartments: [
                { cell: cell(R(0, 0, 12, 9), 'z1') },  // on the real band  → core-reachable
                { cell: cell(R(0, 32, 12, 40), 'z0') },// on the stub only  → stub-only
            ],
        };
        const r = assessLevelCorridorQuality(level, core);
        expect(r.reached).toBe(2);                     // R1 holds: it does front A corridor…
        expect(r.coreReachable).toBe(1);               // …but R2 does not: the stub is marooned.
        expect(r.cells[1]!.verdict).toBe('stub-only');
        expect(r.pass).toBe(false);
    });

    it('RED — a unit with no corridor and no neighbour is ORPHANED, not merely unreached', () => {
        const core = R(9, 9, 15, 11);
        const level: CorridorQualityLevel = {
            levelIndex: 1, role: 'upper', publicCorridor: [R(0, 9, 24, 11)],
            apartments: [
                { cell: cell(R(0, 0, 12, 9), 'z1') },
                { cell: cell(R(40, 40, 50, 50), 'z0') },   // detached island
            ],
        };
        const r = assessLevelCorridorQuality(level, core);
        expect(r.orphaned).toBe(1);
        expect(r.servedThrough).toBe(0);
        expect(r.cells[1]!.verdict).toBe('orphaned');
        expect(r.pass).toBe(false);
    });

    it('ADR-0372 — a landing unit whose door opens straight onto the CORE counts as core-reachable', () => {
        // The single-core-landing typology has no corridor grid; the landing IS the band and some
        // units abut the core itself. The gate must not read that as a failure.
        const core = R(10, 14, 16, 20);
        const level: CorridorQualityLevel = {
            levelIndex: 1, role: 'upper', publicCorridor: [],
            apartments: [{ cell: cell(R(2, 6, 10, 14), 'x1') }],  // x1 == core.x0, shares z 6→14? no…
        };
        // Make the shared run real: the cell's x1 edge (z 6→14) vs the core's x0 face (z 14→20) —
        // they meet only at a point, so this must FAIL. Then widen the cell to overlap the core's Z.
        expect(assessLevelCorridorQuality(level, core).coreReachable).toBe(0);

        const touching: CorridorQualityLevel = {
            ...level,
            apartments: [{ cell: cell(R(2, 14, 10, 20), 'x1') }],  // x1 == core.x0, shares z 14→20
        };
        const r = assessLevelCorridorQuality(touching, core);
        expect(r.reached).toBe(1);
        expect(r.coreReachable).toBe(1);
        expect(r.pass).toBe(true);
    });

    it('the gate REPORTS the cell tag but never TRUSTS it (a self-graded subject cannot fail)', () => {
        const { level, core } = healthyLevel();
        const lying: CorridorQualityLevel = {
            ...level,
            apartments: [
                // Geometry says unreachable (door on the exterior edge); the tag claims otherwise.
                { cell: cell(R(0, 0, 12, 9), 'z0', { coreReachable: true }) },
                ...level.apartments.slice(1),
            ],
        };
        const r = assessLevelCorridorQuality(lying, core);
        expect(r.coreReachable).toBe(3);            // geometry wins
        expect(r.tagDisagreements).toBe(1);         // and the drift is reported, not swallowed
        expect(r.cells[0]!.taggedCoreReachable).toBe(true);
        expect(r.pass).toBe(false);
    });

    it('a level with NO apartments (the commercial ground floor) passes vacuously', () => {
        const r = assessLevelCorridorQuality(
            { levelIndex: 0, role: 'ground', publicCorridor: [], apartments: [] }, R(9, 9, 15, 11),
        );
        expect(r.apartments).toBe(0);
        expect(r.pass).toBe(true);
        expect(r.diagnostic).toContain('apartmentsReached=0/0');
    });

    it('C50 §1.7 — never throws on a malformed subject; reports instead', () => {
        expect(() => assessCorridorQuality({} as unknown as CorridorQualitySubject)).not.toThrow();
        const r = assessCorridorQuality({} as unknown as CorridorQualitySubject);
        expect(r.pass).toBe(true);
        expect(r.apartments).toBe(0);
        expect(r.diagnostic).toContain('§DIAG-CORRIDOR-QUALITY');
    });

    it('rolls the levels up and names the failing units in the building diagnostic', () => {
        const { level, core } = healthyLevel();
        const bad: CorridorQualityLevel = {
            ...level, levelIndex: 2,
            apartments: [{ cell: cell(R(0, 0, 12, 9), 'z0') }, ...level.apartments.slice(1)],
        };
        const r = assessCorridorQuality({ core, perLevelApartments: [level, bad] });
        expect(r.apartments).toBe(8);
        expect(r.reached).toBe(7);
        expect(r.servedThrough).toBe(1);
        expect(r.levels.length).toBe(2);
        expect(r.levels[0]!.pass).toBe(true);
        expect(r.levels[1]!.pass).toBe(false);
        expect(r.pass).toBe(false);
        expect(r.failures.length).toBe(1);
        expect(r.diagnostic).toContain('failures=[L2#0:served-through]');
    });

    it('is deterministic — the same subject twice gives the identical diagnostic', () => {
        const { level, core } = healthyLevel();
        const a = assessCorridorQuality({ core, perLevelApartments: [level] });
        const b = assessCorridorQuality({ core, perLevelApartments: [level] });
        expect(a.diagnostic).toBe(b.diagnostic);
    });

    it('the emission flag is DEFAULT-OFF (tracker P8 gate column: production byte-identical)', () => {
        const g = globalThis as unknown as { __pryzmResidentialCorridorGate?: boolean };
        expect(g.__pryzmResidentialCorridorGate).toBeUndefined();
        expect(corridorQualityGateOn()).toBe(false);
        g.__pryzmResidentialCorridorGate = true;
        try { expect(corridorQualityGateOn()).toBe(true); }
        finally { delete g.__pryzmResidentialCorridorGate; }
        expect(corridorQualityGateOn()).toBe(false);
    });
});

// ── B. END-TO-END — the REAL orchestrator output, on the plates that were measured RED ───────────

describe('P8.1 §DIAG-CORRIDOR-QUALITY — real buildings', () => {
    it('a 30×18 plate: every apartment on every level reaches the core, servedThrough=0', () => {
        const out = orchestrateResidentialBuilding(buildingInput());
        expect(out.status).toBe('ok');
        if (out.status !== 'ok') return;
        const q = assessCorridorQuality(out);
        expect(q.apartments).toBeGreaterThan(0);
        expect(q.servedThrough).toBe(0);
        expect(q.orphaned).toBe(0);
        expect(q.reached).toBe(q.apartments);
        expect(q.coreReachable).toBe(q.apartments);
        expect(q.corridorTouchesCore).toBe(true);
        expect(q.pass).toBe(true);
    }, 60_000);

    // §RESI-ABSORBED-DOOR-EDGE — THE REGRESSION PIN. Measured BEFORE the fix (2026-09-06):
    //   22×14 → coreTagged 0/6, every absorbed cell stamped `doorEdge:'z0'` (an exterior façade);
    //   16×12 → coreTagged 0/6, likewise. Both still returned `status:'ok'` with no complaint.
    // On these plates the corridor spine runs along Z beside the core, so the fronting edge is
    // x0/x1 and NEVER z0. If this ever goes red again, the hard-coded literal is back.
    it.each([
        ['22x14', 22, 14, 45, 95],
        ['16x12', 16, 12, 40, 90],
    ])('§RESI-ABSORBED-DOOR-EDGE — the narrow plate %s connects EVERY unit to the core', (_n, w, d, mn, mx) => {
        const out = orchestrateResidentialBuilding(buildingInput({
            footprint: poly(w as number, d as number), upperLevels: 3,
            minApartmentAreaM2: mn as number, maxApartmentAreaM2: mx as number,
        }));
        expect(out.status).toBe('ok');
        if (out.status !== 'ok') return;
        const q = assessCorridorQuality(out);
        expect(q.apartments).toBeGreaterThan(0);
        expect(q.coreReachable).toBe(q.apartments);   // was 0/6 — the whole point of the pin
        expect(q.servedThrough).toBe(0);
        expect(q.orphaned).toBe(0);
        expect(q.tagDisagreements).toBe(0);           // the partition's tag now agrees with geometry
        expect(q.pass).toBe(true);
        // No absorbed unit may keep the hard-coded 'z0' on a Z-running spine.
        for (const lvl of out.perLevelApartments) {
            for (const a of lvl.apartments) {
                expect(['x0', 'x1']).toContain(a.cell.doorEdge);
            }
        }
    }, 90_000);

    it('a rotated (off-axis) parcel still reaches the core on every level', () => {
        // The orchestrator plans in the principal-axis LOCAL frame and the gate reads that same
        // frame (core + cells + bands are all LOCAL), so rotation must be a no-op for circulation.
        const th = Math.PI / 7, c = Math.cos(th), s = Math.sin(th);
        const rot = (p: Pt): Pt => ({ x: p.x * c - p.z * s, z: p.x * s + p.z * c });
        const out = orchestrateResidentialBuilding(buildingInput({ footprint: poly(30, 18).map(rot) }));
        expect(out.status).toBe('ok');
        if (out.status !== 'ok') return;
        const q = assessCorridorQuality(out);
        expect(q.pass).toBe(true);
        expect(q.servedThrough).toBe(0);
    }, 60_000);
});

// ── C. THE PLATE CORPUS — the sweep that FOUND the breach, promoted from probe to regression net ──
//
// A gate proven on three hand-picked plates has been proven on three hand-picked plates. This is the
// 15-plate corpus the P8 investigation actually swept (squat, elongated both ways, near-square, tiny,
// deep) — FIXED, never generated, so it cannot drift under the fix it guards (memory: "corpus never
// jittered"). Measured 2026-09-06 on this corpus, 3 upper levels each:
//   · BEFORE §RESI-ABSORBED-DOOR-EDGE — redPlates 3/15: 22x14 → 0/6 orphaned, 16x12 → 0/6 orphaned,
//     15x15 → 0/3 orphaned. All three still returned `status:'ok'`, which is why nothing caught it.
//   · AFTER  — redPlates 0/15, 291/291 apartments core-reachable, servedThrough 0, tagDisagreements 0.
// The assertion is on the SET of red plates, not on a count, so a regression names the plate.
describe('P8.1 §DIAG-CORRIDOR-QUALITY — the 15-plate corpus', () => {
    const CORPUS: ReadonlyArray<readonly [string, number, number, number, number]> = [
        ['30x18', 30, 18, 45, 120], ['40x22', 40, 22, 55, 130], ['22x14', 22, 14, 45, 95],
        ['60x16', 60, 16, 50, 120], ['18x30', 18, 30, 45, 110], ['26x26', 26, 26, 50, 120],
        ['35x25', 35, 25, 60, 140], ['16x12', 16, 12, 40, 90], ['50x30', 50, 30, 60, 150],
        ['12x40', 12, 40, 45, 100], ['37x29', 37, 29, 70, 150], ['20x20', 20, 20, 50, 110],
        ['45x12', 45, 12, 40, 95], ['28x40', 28, 40, 65, 140], ['15x15', 15, 15, 40, 85],
    ];

    it('every plate in the corpus reaches EVERY apartment from the core (redPlates 3/15 → 0/15)', () => {
        const red: string[] = [];
        const rejected: string[] = [];
        let apartments = 0;
        let coreReachable = 0;
        for (const [name, w, d, mn, mx] of CORPUS) {
            const out = orchestrateResidentialBuilding(buildingInput({
                footprint: poly(w, d), upperLevels: 3,
                minApartmentAreaM2: mn, maxApartmentAreaM2: mx,
            }));
            // A REFUSAL is a legitimate answer for a plate that cannot take a building; it is not a
            // corridor failure, so it is recorded separately rather than silently counted as green.
            if (out.status !== 'ok') { rejected.push(name); continue; }
            const q = assessCorridorQuality(out);
            apartments += q.apartments;
            coreReachable += q.coreReachable;
            if (!q.pass) red.push(`${name}: ${q.diagnostic}`);
        }
        expect(red).toEqual([]);
        // …and the corpus must still be doing work: an all-refusing corpus would pass vacuously.
        expect(rejected).toEqual([]);
        expect(apartments).toBeGreaterThan(200);
        expect(coreReachable).toBe(apartments);
    }, 300_000);
});

// ── D. REACHABILITY — the gate must fire at the layer the FOUNDER uses, not merely exist ─────────
//
// "Committed is not reachable" is a standing lesson here: four fixes once landed in one session and
// ran nowhere. `assessCorridorQuality` being green in a unit test proves nothing about the browser.
// The founder's path is `ResidentialBuildingController` -> `orchestrateResidentialBuilding`, so THIS
// is the seam that has to be shown working: flip `__pryzmResidentialCorridorGate` and the diagnostic
// must appear on the console of a real generate; leave it off and NOTHING may change.
describe('P8.1 §DIAG-CORRIDOR-QUALITY — reachable from the orchestrator the editor calls', () => {
    function captureLog(fn: () => void): string[] {
        const lines: string[] = [];
        const orig = console.log;
        console.log = (...args: unknown[]) => { lines.push(args.map((a) => String(a)).join(' ')); };
        try { fn(); } finally { console.log = orig; }
        return lines;
    }

    it('flag ON — a real generate prints §DIAG-CORRIDOR-QUALITY through the orchestrator', () => {
        const g = globalThis as unknown as { __pryzmResidentialCorridorGate?: boolean };
        g.__pryzmResidentialCorridorGate = true;
        let lines: string[] = [];
        try { lines = captureLog(() => { orchestrateResidentialBuilding(buildingInput()); }); }
        finally { delete g.__pryzmResidentialCorridorGate; }
        const diag = lines.filter((l) => l.includes('§DIAG-CORRIDOR-QUALITY'));
        expect(diag.length).toBe(1);
        expect(diag[0]).toContain('apartmentsReached=');
        expect(diag[0]).toContain('servedThrough=0');
        expect(diag[0]).toContain('status=ok');
    }, 60_000);

    it('flag OFF — the SAME generate prints nothing (the gate column: production byte-identical)', () => {
        const g = globalThis as unknown as { __pryzmResidentialCorridorGate?: boolean };
        expect(g.__pryzmResidentialCorridorGate).toBeUndefined();
        const lines = captureLog(() => { orchestrateResidentialBuilding(buildingInput()); });
        expect(lines.filter((l) => l.includes('§DIAG-CORRIDOR-QUALITY'))).toEqual([]);
    }, 60_000);
});
