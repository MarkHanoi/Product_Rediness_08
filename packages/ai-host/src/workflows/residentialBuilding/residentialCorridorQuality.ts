// Residential building (multi-family) — Tracker **P8, THE CORRIDOR SPINE** — the corridor-quality
// GATE (`§DIAG-CORRIDOR-QUALITY`).
//
// ── WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT ────────────────────────────────────────────────
// The tracker's P8.1 row asks for "a public corridor as a Steiner spine (reach every apt door)".
// **That spine already exists in this repo** and a rival one would be a defect, not a delivery:
//   · `platePartition.ts` plans the corridor GRID (a core-straddling run per band line + the
//     transverse spine that ties them to the core) and anchors every packed cell ON its corridor
//     edge, so `doorEdge` is corridor-fronting BY CONSTRUCTION for the packed rows;
//   · `clipCorridorBandsToCore` splits any band crossing the core so each corridor wall BUTTS a
//     core face (§RESI-CORRIDOR-TO-CORE);
//   · `coreConnectedBandSet` is the BFS over the corridor adjacency graph seeded at the core;
//   · `repairCoreCirculation` bridges a serving-but-marooned band back to the core with a minimal
//     L of corridor-width spurs, refusing any leg that would cross a placed unit;
//   · `tagCoreReachability` stamps `cell.coreReachable`;
//   · `singleCoreLanding.ts` is the small-plate typology (ADR-0372) whose landing IS the band.
//
// What did NOT exist was the **gate**: nothing anywhere measured the P8 invariant, rolled it up
// across the levels of a building, or said the words `§DIAG-CORRIDOR-QUALITY`. The per-level number
// was computed and then discarded — `residentialCirculationGraph.ts` even carries a literal
// `void coreReachableCount;   // (kept for a future "N/N core-connected" caption)`. A spine nobody
// measures is exactly the "authored but unwired" shape this repo keeps re-learning, and it is how a
// REAL breach stayed invisible: on a narrow plate every absorbed unit's door was stamped onto an
// EXTERIOR FAÇADE edge (§RESI-ABSORBED-DOOR-EDGE, `platePartition.ts`), so 0 of 6 apartments per
// level connected to the core and the building still returned `status:'ok'` with no complaint.
//
// So P8.1 here is the MEASUREMENT + its diagnostic, consuming the shipped spine. It is PURE
// (zero THREE, zero DOM, zero I/O, zero RNG), it NEVER throws (C50 §1.7 — a gate that throws
// takes the building down with it), and it is ISOLATED: nothing in the default path depends on it.
// Emission is behind its own default-OFF flag per the tracker's "HARD GATE, default-OFF" column;
// P10.2 is the row that promotes this from reported to merge-blocking.
//
// ── THE INVARIANT (ADR-0067 intent-first / ADR-0068 circulation-first; §18/§19/§20 doctrine) ─────
// A resident must be able to walk from the building core to their own front door WITHOUT passing
// through anybody else's apartment. Decomposed into what geometry can actually falsify:
//   R1 REACHED          — the cell's `doorEdge` shares ≥ a door width with SOME public-corridor band
//                         (or with the core itself, the ADR-0372 landing case).
//   R2 CORE-REACHABLE   — that band is in the CORE-CONNECTED component (BFS from the core through
//                         corridors only). Fronting a marooned stub is not circulation.
//   R3 servedThrough=0  — no cell is reachable ONLY through a neighbouring apartment. This is the
//                         half the tracker names explicitly and the half nothing measured at all.
//   R4 orphaned=0       — and none is reachable through nothing whatsoever.
//
// ⭐ R2 is RE-DERIVED FROM GEOMETRY, never read off `cell.coreReachable`. A gate that asks its
// subject to grade itself cannot falsify the subject (memory: "fake more capable than real" — a
// check built from the header cannot fail the header). The stored tag is compared against the
// re-derivation instead, and any disagreement is reported as `tagDisagreements` — a nonzero value
// means the partition's tag and the shipped geometry have drifted apart, which is itself a defect.

import {
    DOOR_WIDTH_M,
    coreConnectedBandSet,
    cellDoorOnConnectedCorridor,
    type ApartmentCell,
} from './platePartition.js';
import type { Rect } from '../apartmentLayout/tgl/rectDecomposition.js';

const EPS = 1e-6;

/** §DIAG-CORRIDOR-QUALITY — the flag that turns the gate's emission ON. Default OFF (the tracker's
 *  "HARD GATE, default-OFF"): production is byte-identical until the founder browser-validates.
 *  P4 — narrow `globalThis` cast, never `(window as any)`. */
export const CORRIDOR_QUALITY_FLAG = '__pryzmResidentialCorridorGate' as const;

/** True when the corridor gate's diagnostic emission is enabled. The ASSESSMENT itself is always
 *  available (a gate its own tests cannot run is not a gate); only the logging is flagged. */
export const corridorQualityGateOn = (): boolean =>
    (globalThis as unknown as { __pryzmResidentialCorridorGate?: boolean }).__pryzmResidentialCorridorGate === true;

/** The minimum this gate needs from one level. `PerLevelApartments` is structurally assignable —
 *  declared locally so this module stays a LEAF (no import of the orchestrator, no cycle). */
export interface CorridorQualityLevel {
    readonly levelIndex: number;
    readonly role: 'ground' | 'upper';
    readonly publicCorridor: readonly Rect[];
    readonly apartments: ReadonlyArray<{ readonly cell: ApartmentCell }>;
}

/** The minimum this gate needs from a building. `ResidentialBuildingOk` is structurally assignable. */
export interface CorridorQualitySubject {
    readonly core: Rect;
    readonly perLevelApartments: readonly CorridorQualityLevel[];
}

/** Why one cell failed R1–R4, so a failure names the unit rather than only the count. */
export type CellCirculationVerdict =
    /** R1 ∧ R2 — door fronts a core-connected band (or the core). The only passing verdict. */
    | 'core-reachable'
    /** R1 ∧ ¬R2 — door fronts a corridor, but that corridor is a stub marooned from the core. */
    | 'stub-only'
    /** ¬R1, but the cell shares ≥ a door width with a neighbouring APARTMENT — served THROUGH it. */
    | 'served-through'
    /** ¬R1 and no neighbour either — the unit is sealed. */
    | 'orphaned';

export interface CellCirculation {
    readonly levelIndex: number;
    readonly index: number;
    readonly typology: string;
    readonly doorEdge: ApartmentCell['doorEdge'];
    readonly verdict: CellCirculationVerdict;
    /** The partition's own `cell.coreReachable` tag (absent ⇒ never stamped). Reported, never trusted. */
    readonly taggedCoreReachable?: boolean;
}

export interface CorridorQualityLevelReport {
    readonly levelIndex: number;
    readonly role: 'ground' | 'upper';
    readonly apartments: number;
    readonly reached: number;
    readonly coreReachable: number;
    readonly servedThrough: number;
    readonly orphaned: number;
    /** R2's precondition: ≥ 1 corridor band is circulation-adjacent to the core (vacuously true on a
     *  level with no apartments, e.g. the commercial ground floor). */
    readonly corridorTouchesCore: boolean;
    /** Cells whose stored `coreReachable` tag disagrees with the re-derived geometry. */
    readonly tagDisagreements: number;
    readonly cells: readonly CellCirculation[];
    readonly pass: boolean;
    readonly diagnostic: string;
}

export interface CorridorQualityReport {
    readonly apartments: number;
    readonly reached: number;
    readonly coreReachable: number;
    readonly servedThrough: number;
    readonly orphaned: number;
    readonly corridorTouchesCore: boolean;
    readonly tagDisagreements: number;
    readonly levels: readonly CorridorQualityLevelReport[];
    /** R1 ∧ R2 ∧ R3 ∧ R4 across EVERY level that carries apartments. */
    readonly pass: boolean;
    /** Every failing cell, so a red gate names units and not just a shortfall. */
    readonly failures: readonly CellCirculation[];
    /** `§DIAG-CORRIDOR-QUALITY apartmentsReached=N/N servedThrough=0 …` (tracker P8.1 wording). */
    readonly diagnostic: string;
}

const n = (r: Rect): Rect => ({
    x0: Math.min(r.x0, r.x1), z0: Math.min(r.z0, r.z1),
    x1: Math.max(r.x0, r.x1), z1: Math.max(r.z0, r.z1),
});

/** The run (m) two axis-aligned rects share along their touching boundary — 0 when they neither
 *  touch nor overlap. Mirrors `corridorsAdjacent`'s coincidence tolerance (0.05 m) so this gate and
 *  the partition's own BFS agree about what "touching" means. */
function sharedRun(a: Rect, b: Rect): number {
    const A = n(a), B = n(b);
    const xo = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
    const zo = Math.min(A.z1, B.z1) - Math.max(A.z0, B.z0);
    if (xo > EPS && zo > EPS) return Math.min(xo, zo);              // interiors overlap
    if (Math.abs(xo) <= 0.05 && zo > 0) return zo;                  // vertical edge-touch
    if (Math.abs(zo) <= 0.05 && xo > 0) return xo;                  // horizontal edge-touch
    return 0;
}

/** Does the cell's DOOR EDGE share ≥ a door width with `r`? The same edge-coincidence test
 *  `cellDoorOnConnectedCorridor` applies to bands, reused here for the CORE (ADR-0372 landing:
 *  a unit whose door opens straight onto the core is served, corridor or no corridor). */
function doorEdgeFronts(cell: ApartmentCell, r: Rect): boolean {
    const c = n(cell.rect), t = n(r);
    const e = cell.doorEdge;
    const horizontal = e === 'z0' || e === 'z1';
    const k = e === 'x0' ? c.x0 : e === 'x1' ? c.x1 : e === 'z0' ? c.z0 : c.z1;
    const lo = horizontal ? c.x0 : c.z0;
    const hi = horizontal ? c.x1 : c.z1;
    if (horizontal) {
        if (!(Math.abs(k - t.z0) < 0.05 || Math.abs(k - t.z1) < 0.05)) return false;
        return Math.min(hi, t.x1) - Math.max(lo, t.x0) >= DOOR_WIDTH_M - EPS;
    }
    if (!(Math.abs(k - t.x0) < 0.05 || Math.abs(k - t.x1) < 0.05)) return false;
    return Math.min(hi, t.z1) - Math.max(lo, t.z0) >= DOOR_WIDTH_M - EPS;
}

/**
 * Assess ONE level against R1–R4. Pure; never throws. A level with no apartments (the commercial
 * ground floor) passes vacuously — there is no door to reach.
 */
export function assessLevelCorridorQuality(
    level: CorridorQualityLevel, core: Rect,
): CorridorQualityLevelReport {
    const bands = level.publicCorridor ?? [];
    const cellsIn = (level.apartments ?? []).map((a) => a.cell).filter((c): c is ApartmentCell => !!c && !!c.rect);
    // R2's graph: the corridor bands reachable from the CORE through corridors only. RE-DERIVED from
    // the shipped band geometry with the partition's OWN BFS — reuse, never a rival implementation.
    const connected = coreConnectedBandSet(bands, core);
    const corridorTouchesCore = connected.size > 0;

    let reached = 0, coreReachable = 0, servedThrough = 0, orphaned = 0, tagDisagreements = 0;
    const cells: CellCirculation[] = cellsIn.map((cell, i) => {
        // R1 — the door edge fronts SOME band, or the core itself (the landing typology).
        const frontsCore = doorEdgeFronts(cell, core);
        const anyBand = bands.some((b) => doorEdgeFronts(cell, b));
        const isReached = anyBand || frontsCore;
        // R2 — …and that band is in the core component. Fronting the core IS core-reachable.
        const isCoreReachable = frontsCore || cellDoorOnConnectedCorridor(cell, bands, connected);

        let verdict: CellCirculationVerdict;
        if (isCoreReachable) verdict = 'core-reachable';
        else if (isReached) verdict = 'stub-only';
        else {
            // R3 vs R4 — is there a neighbouring APARTMENT you would have to walk through?
            const hasNeighbour = cellsIn.some((o, j) => j !== i && sharedRun(cell.rect, o.rect) >= DOOR_WIDTH_M - EPS);
            verdict = hasNeighbour ? 'served-through' : 'orphaned';
        }

        if (isReached) reached++;
        if (isCoreReachable) coreReachable++;
        if (verdict === 'served-through') servedThrough++;
        if (verdict === 'orphaned') orphaned++;
        const tag = cell.coreReachable;
        if (tag !== undefined && tag !== isCoreReachable) tagDisagreements++;

        return {
            levelIndex: level.levelIndex,
            index: i,
            typology: cell.typology,
            doorEdge: cell.doorEdge,
            verdict,
            ...(tag !== undefined ? { taggedCoreReachable: tag } : {}),
        };
    });

    const apartments = cells.length;
    const pass =
        apartments === 0 ||
        (reached === apartments && coreReachable === apartments && servedThrough === 0 && orphaned === 0);
    const diagnostic =
        `§DIAG-CORRIDOR-QUALITY level=${level.levelIndex} apartmentsReached=${reached}/${apartments} ` +
        `servedThrough=${servedThrough} coreReached=${coreReachable}/${apartments} orphaned=${orphaned} ` +
        `corridorTouchesCore=${corridorTouchesCore} tagDisagreements=${tagDisagreements} ` +
        `status=${pass ? 'ok' : 'FAIL'}`;

    return {
        levelIndex: level.levelIndex, role: level.role, apartments, reached, coreReachable,
        servedThrough, orphaned, corridorTouchesCore, tagDisagreements, cells, pass, diagnostic,
    };
}

/**
 * **P8.1 — the corridor-spine gate.** Assess a WHOLE building against R1–R4 and emit
 * `§DIAG-CORRIDOR-QUALITY apartmentsReached=N/N servedThrough=0`.
 *
 * PURE + deterministic + NEVER throws (C50 §1.7): a malformed or empty subject reports an empty,
 * vacuously-passing building rather than taking the caller down. `report.pass === false` is a
 * FINDING for the caller to act on, never an exception.
 */
export function assessCorridorQuality(subject: CorridorQualitySubject): CorridorQualityReport {
    const core = subject?.core;
    const per = subject?.perLevelApartments ?? [];
    if (!core) {
        return {
            apartments: 0, reached: 0, coreReachable: 0, servedThrough: 0, orphaned: 0,
            corridorTouchesCore: false, tagDisagreements: 0, levels: [], pass: true, failures: [],
            diagnostic: '§DIAG-CORRIDOR-QUALITY apartmentsReached=0/0 servedThrough=0 ' +
                'coreReached=0/0 orphaned=0 levels=0 status=ok (no core — nothing to assess)',
        };
    }
    const levels = per.map((l) => assessLevelCorridorQuality(l, core));

    let apartments = 0, reached = 0, coreReachable = 0, servedThrough = 0, orphaned = 0, tagDisagreements = 0;
    const failures: CellCirculation[] = [];
    let corridorTouchesCore = true;
    for (const l of levels) {
        apartments += l.apartments; reached += l.reached; coreReachable += l.coreReachable;
        servedThrough += l.servedThrough; orphaned += l.orphaned; tagDisagreements += l.tagDisagreements;
        // Only a level that HAS apartments can testify about the corridor↔core join.
        if (l.apartments > 0 && !l.corridorTouchesCore) corridorTouchesCore = false;
        for (const c of l.cells) if (c.verdict !== 'core-reachable') failures.push(c);
    }
    const pass = levels.every((l) => l.pass);
    const diagnostic =
        `§DIAG-CORRIDOR-QUALITY apartmentsReached=${reached}/${apartments} ` +
        `servedThrough=${servedThrough} coreReached=${coreReachable}/${apartments} orphaned=${orphaned} ` +
        `corridorTouchesCore=${corridorTouchesCore} tagDisagreements=${tagDisagreements} ` +
        `levels=${levels.length} status=${pass ? 'ok' : 'FAIL'}` +
        (pass ? '' : ` failures=[${failures.slice(0, 8).map((f) => `L${f.levelIndex}#${f.index}:${f.verdict}`).join(',')}` +
            `${failures.length > 8 ? `,+${failures.length - 8}` : ''}]`);

    return {
        apartments, reached, coreReachable, servedThrough, orphaned, corridorTouchesCore,
        tagDisagreements, levels, pass, failures, diagnostic,
    };
}
