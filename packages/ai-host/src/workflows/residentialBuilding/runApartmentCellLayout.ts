// Residential building (multi-family) — Slice B / Tracker P7 — RUN D-TGL PER CELL.
//
// A PURE deterministic L2 function (zero THREE, zero DOM, zero I/O, zero RNG). Given
// ONE placed apartment cell (an axis-aligned rect, world metres) + its program, it runs
// the FROZEN apartment engine `generateDeterministicLayouts` (the SAME entry the apartment
// generator + the house orchestrator use, `apartmentLayout/tgl/runDeterministicLayout.ts`)
// to subdivide the cell into rooms + windows + doors, then returns the BEST `LayoutOption`.
//
// Each apartment cell is its own CLEAN plate: the stair + lift are in the building CORE
// (outside every apartment cell — see `residentialBuildingOrchestrator.ts`), so there is
// NO stair keep-out inside the cell. This is therefore the SIMPLEST D-TGL use — identical
// to the apartment generator (no keep-out rects, no multi-storey enrich), just run the
// engine on a rectangular shell.
//
// ── §DIAG-PARTY-WALL / audit §7 (BLIND PARTY WALLS) ─────────────────────────────────────
// A wall SHARED between two adjacent apartments — or between an apartment and the public
// corridor / the core — is a PARTY wall: it must NOT carry windows (the neighbour, the
// corridor or the lift shaft is on the other side, not open air). Only TRUE EXTERIOR
// FAÇADE edges (cell edges that lie on the building footprint perimeter) get windows.
//
// The engine emits windows on the cell's perimeter (it treats the whole shell as exterior).
// We suppress, POST-ENGINE, every emitted window whose host wall lies on a BLIND cell edge
// (= any cell edge that is NOT a true façade edge). The caller passes the set of façade
// edges it computed from the plate geometry (an edge is a façade iff it coincides with the
// footprint boundary AND is not the door/corridor edge); everything else is blind. This is
// the pure-orchestrator analogue of the executor-side `resolveAllShellWindows`
// `blindFacadeWallIds` suppression (shellWallMatch.ts) — same intent, applied here on the
// engine's `LayoutOption` directly because the orchestrator has no shell-wall ids yet.
//
// Soft-fail (C50 §1.7): a cell too small / degenerate for D-TGL → the engine returns [] →
// we return `{ status: 'rejected' }`; the caller reports it on that apartment and continues
// the others. NEVER throws on a feasibility miss.
//
// Contracts: audit §6 (T1–T4) + §7 (blind party walls); HE.0 FROZEN engine (NOT modified —
// P7 only CALLS it); C50 §1.7 (soft-fail); C53 (generative engine); P8 (≥1 span / exported fn).

import { trace } from '@opentelemetry/api';
import { generateDeterministicLayouts } from '../apartmentLayout/tgl/runDeterministicLayout.js';
import type { ShellAnalysis } from '../apartmentLayout/shellAnalysis.js';
import type {
    ApartmentConstraints,
    ApartmentProgram,
    ScoringWeights,
    ScoredLayoutOption,
    LayoutOption,
    LayoutWindow,
    LayoutWall,
} from '../apartmentLayout/types.js';
import type { Rect } from '../apartmentLayout/tgl/rectDecomposition.js';

const _tracer = trace.getTracer('@pryzm/ai-host', '0.1.0');

/** Which axis-aligned edge of a cell rect. */
export type CellEdge = 'x0' | 'x1' | 'z0' | 'z1';

/** Default per-apartment layout-engine constraints (mm) — sensible residential values,
 *  mirroring the apartment generator's defaults. */
export const RESI_APARTMENT_CONSTRAINTS: ApartmentConstraints = {
    minCorridorWidth: 900,    // mm — internal apartment corridor clear width
    wallThickness: 100,       // mm — interior partition
    floorToCeiling: 2700,     // mm
    wallTypeId: 'partition',
};

/** Default scoring weights — balanced residential preference (natural light + privacy
 *  slightly favoured), reused from the apartment generator's neutral profile. */
export const RESI_SCORING_WEIGHTS: ScoringWeights = {
    naturalLight: 1,
    privacy: 1,
    kitchenWorkflow: 1,
    corridorEfficiency: 1,
};

/** How many candidate layouts the engine enumerates per cell. We keep the best (#0). */
export const RESI_LAYOUT_COUNT = 3;

export interface ApartmentCellLayoutInput {
    /** The apartment cell rect (world metres, plan frame { x, z }). Axis-aligned. */
    readonly cell: Rect;
    /** The apartment program (bedrooms pinned by the typology — from the packer). */
    readonly program: ApartmentProgram;
    /**
     * The set of TRUE EXTERIOR FAÇADE edges of this cell — the edges that get windows.
     * Every OTHER cell edge is treated as a BLIND party wall (no windows). Computed by the
     * orchestrator from the plate geometry (footprint boundary minus the corridor/door
     * edge). When empty, NO edge gets a window (a fully landlocked cell — every wall blind).
     */
    readonly facadeEdges: ReadonlySet<CellEdge> | readonly CellEdge[];
    /** OPTIONAL site latitude (decimal degrees) → climate-driven window orientation.
     *  Absent ⇒ pure-length window placement (byte-identical to no-solar). */
    readonly solar?: { readonly latDeg: number; readonly weight?: number };
    /** OPTIONAL engine-constraint override (defaults to RESI_APARTMENT_CONSTRAINTS). */
    readonly constraints?: ApartmentConstraints;
    /** OPTIONAL scoring-weights override (defaults to RESI_SCORING_WEIGHTS). */
    readonly weights?: ScoringWeights;
    /** OPTIONAL candidate count (defaults to RESI_LAYOUT_COUNT). */
    readonly count?: number;
}

export interface ApartmentCellLayoutOk {
    readonly status: 'ok';
    /** The best (rank #0) layout option for this cell, with blind-edge windows removed. */
    readonly layout: ScoredLayoutOption;
    /** Count of rooms in the chosen layout (> 0). */
    readonly roomCount: number;
    /** Count of windows kept (after blind-edge suppression). */
    readonly windowCount: number;
    /** Count of windows the blind party-wall pass suppressed. */
    readonly blindSuppressed: number;
    /** The blind cell edges (every edge NOT in `facadeEdges`). */
    readonly blindEdges: readonly CellEdge[];
}

export interface ApartmentCellLayoutRejected {
    readonly status: 'rejected';
    readonly reason: string;
}

export type ApartmentCellLayoutResult = ApartmentCellLayoutOk | ApartmentCellLayoutRejected;

const ALL_EDGES: readonly CellEdge[] = ['x0', 'x1', 'z0', 'z1'];

/** mm → m (the engine emits walls in plan-mm; cells are world metres). */
const MM_TO_M = 1e-3;
/** Tolerance (m) for matching an emitted wall to a cell edge. The cell is axis-aligned
 *  and angle === 0 inside the engine, so the perimeter walls land exactly on the edges —
 *  a generous 1 cm absorbs float rounding from the ×1000 mm round-trip. */
const EDGE_TOL_M = 0.05;

/**
 * Classify which cell EDGE (if any) an emitted EXTERNAL wall lies on. A wall lies on an
 * edge when it is (a) axis-aligned along that edge's axis and (b) within EDGE_TOL_M of the
 * edge's constant coordinate, with its span overlapping the cell extent. Returns null when
 * the wall is not on any cell edge (an interior partition flagged external, or off-edge).
 */
function wallEdge(wall: LayoutWall, cell: Rect): CellEdge | null {
    const ax = wall.start.x * MM_TO_M, az = wall.start.y * MM_TO_M;
    const bx = wall.end.x * MM_TO_M, bz = wall.end.y * MM_TO_M;
    const dx = Math.abs(bx - ax), dz = Math.abs(bz - az);
    if (dx <= EDGE_TOL_M && dz <= EDGE_TOL_M) return null; // degenerate
    // Vertical wall (constant x) → left (x0) / right (x1) edge.
    if (dz > dx) {
        const x = (ax + bx) / 2;
        if (Math.abs(x - cell.x0) <= EDGE_TOL_M) return 'x0';
        if (Math.abs(x - cell.x1) <= EDGE_TOL_M) return 'x1';
        return null;
    }
    // Horizontal wall (constant z) → near (z0) / far (z1) edge.
    const z = (az + bz) / 2;
    if (Math.abs(z - cell.z0) <= EDGE_TOL_M) return 'z0';
    if (Math.abs(z - cell.z1) <= EDGE_TOL_M) return 'z1';
    return null;
}

/**
 * Suppress every window hosted on a BLIND cell edge (not in `facadeEdges`). Pure: returns
 * a NEW option with the filtered window list (+ how many were removed); the input is left
 * intact. A window survives ONLY when its host wall is external AND lies on a façade edge.
 * A window whose host wall is interior (not on any cell edge) is LEFT as-is (it is an
 * internal-only window the engine emitted between two of the apartment's own rooms — never
 * a façade/party-wall concern).
 */
function suppressBlindWindows(
    option: LayoutOption,
    cell: Rect,
    facade: ReadonlySet<CellEdge>,
): { option: LayoutOption; suppressed: number } {
    const windows = option.windows;
    if (!windows || windows.length === 0) return { option, suppressed: 0 };
    const kept: LayoutWindow[] = [];
    let suppressed = 0;
    for (const win of windows) {
        const host = option.walls[win.wallRef];
        if (!host || host.isExternal !== true) {
            // Interior-hosted window (between the apartment's own rooms) — keep it.
            kept.push(win);
            continue;
        }
        const edge = wallEdge(host, cell);
        if (edge === null) {
            // External wall not resolvable to a cell edge — conservatively keep it
            // (the engine flagged it a façade; we have no evidence it abuts a neighbour).
            kept.push(win);
            continue;
        }
        if (facade.has(edge)) {
            kept.push(win);            // true façade edge → window allowed.
        } else {
            suppressed++;              // BLIND party wall → suppress.
        }
    }
    if (suppressed === 0) return { option, suppressed: 0 };
    return { option: { ...option, windows: kept }, suppressed };
}

/** Build a `ShellAnalysis` from an axis-aligned cell rect (world metres). The engine reads
 *  `perimeter` (the 4 cell corners) + `netAreaM2`; `faces` is empty (the engine derives
 *  window faces from the perimeter itself — the apartment generator's analyseShell faces are
 *  a hint for the AI prompt, not consumed by the deterministic engine's window emission). */
export function shellFromCell(cell: Rect): ShellAnalysis {
    const w = Math.max(0, cell.x1 - cell.x0);
    const d = Math.max(0, cell.z1 - cell.z0);
    return {
        netAreaM2: w * d,
        widthM: w,
        depthM: d,
        // CCW ring starting at (x0,z0). angle === 0 for an axis-aligned rect → the engine
        // runs unrotated and emits perimeter walls exactly on these edges.
        perimeter: [
            { x: cell.x0, z: cell.z0 },
            { x: cell.x1, z: cell.z0 },
            { x: cell.x1, z: cell.z1 },
            { x: cell.x0, z: cell.z1 },
        ],
        faces: [],
    };
}

/**
 * Run the FROZEN apartment D-TGL engine on ONE apartment cell and return the best layout
 * with blind party-wall windows suppressed. PURE + DETERMINISTIC. Soft-fails (never throws)
 * when the cell is too small/degenerate for the engine (engine returns []).
 */
export function runApartmentCellLayout(input: ApartmentCellLayoutInput): ApartmentCellLayoutResult {
    return _tracer.startActiveSpan(
        'pryzm.ai.workflow.residentialBuilding.runApartmentCellLayout',
        (span) => {
            try {
                const out = _run(input);
                span.setAttribute('pryzm.resi.cell.status', out.status);
                if (out.status === 'ok') {
                    span.setAttribute('pryzm.resi.cell.rooms', out.roomCount);
                    span.setAttribute('pryzm.resi.cell.windows', out.windowCount);
                    span.setAttribute('pryzm.resi.cell.blindSuppressed', out.blindSuppressed);
                }
                span.end();
                return out;
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        },
    ) as ApartmentCellLayoutResult;
}

function _run(input: ApartmentCellLayoutInput): ApartmentCellLayoutResult {
    const { cell, program } = input;
    const facade: ReadonlySet<CellEdge> =
        input.facadeEdges instanceof Set ? input.facadeEdges : new Set(input.facadeEdges ?? []);
    const blindEdges = ALL_EDGES.filter((e) => !facade.has(e));

    const shell = shellFromCell(cell);
    if (shell.widthM <= 0 || shell.depthM <= 0 || shell.netAreaM2 <= 0) {
        return { status: 'rejected', reason: 'cell is degenerate (zero width/depth)' };
    }

    const constraints = input.constraints ?? RESI_APARTMENT_CONSTRAINTS;
    const weights = input.weights ?? RESI_SCORING_WEIGHTS;
    const count = input.count ?? RESI_LAYOUT_COUNT;

    // Run the FROZEN engine. No keep-out / residual-exclude rects (the apartment cell is a
    // clean plate — the core is OUTSIDE it). Solar is threaded when supplied.
    const options = generateDeterministicLayouts(
        shell,
        program,
        constraints,
        weights,
        count,
        undefined,            // windowSpansWorld — none (no pre-existing exterior windows)
        undefined,            // doorSpansWorld — none
        input.solar,          // optional climate-driven window orientation
    );

    if (!options || options.length === 0) {
        // C50 §1.7 soft-fail: cell too small/degenerate for the engine.
        return { status: 'rejected', reason: 'D-TGL produced no layout for this cell' };
    }

    // Best-first: the engine returns options ranked, #0 is the chosen layout.
    const best = options[0]!;
    if (!best.rooms || best.rooms.length === 0) {
        return { status: 'rejected', reason: 'D-TGL layout has no rooms' };
    }

    // §DIAG-PARTY-WALL — suppress windows on blind (non-façade) cell edges.
    const { option: cleaned, suppressed } = suppressBlindWindows(best, cell, facade);
    const layout: ScoredLayoutOption = { ...(cleaned as ScoredLayoutOption), score: best.score };

    return {
        status: 'ok',
        layout,
        roomCount: layout.rooms.length,
        windowCount: layout.windows?.length ?? 0,
        blindSuppressed: suppressed,
        blindEdges,
    };
}
