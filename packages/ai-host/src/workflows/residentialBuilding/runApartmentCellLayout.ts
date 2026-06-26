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
import { apartmentDimensionsFor } from '../apartmentLayout/dimensions/roomDimensions.js';
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
    /** The apartment cell rect (world metres, plan frame { x, z }). Axis-aligned (the bbox of the
     *  cell; for a reshaped non-rect cell this is its bounding box). */
    readonly cell: Rect;
    /** §NONRECT-CELLS-P1 — OPTIONAL real cell footprint polygon (world metres). When supplied (a
     *  reshaped, possibly-concave L-fronting cell) the engine lays out rooms in THIS perimeter via
     *  the polygon-native subdivider. Absent / a plain rect ⇒ the rect ring (byte-identical). */
    readonly cellPolygon?: readonly { readonly x: number; readonly z: number }[];
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
    /** §RESI-ENTRY-INTO-CORRIDOR — which cell edge faces the public corridor (the apartment front
     *  door edge). When given (and no explicit `entry`), the entry anchor is this edge's midpoint, so
     *  the internal corridor routes to it and the front door opens into circulation, not a room. */
    readonly doorEdge?: CellEdge;
    /** §RESI-ENTRY-INTO-CORRIDOR — OPTIONAL explicit entry anchor (cell-frame metres), overriding the
     *  `doorEdge` midpoint. Absent + no doorEdge ⇒ no entry leg (byte-identical to the legacy engine). */
    readonly entry?: { readonly x: number; readonly z: number };
}

/** §RESI-ENTRY-INTO-CORRIDOR — the midpoint of a cell's corridor-facing `doorEdge`, in the cell's
 *  (world-metres) plan frame. This is the apartment front-door point the internal corridor must reach.
 *  Returns undefined when no doorEdge is supplied (⇒ no entry anchor ⇒ legacy spine). Pure. */
function entryFromDoorEdge(cell: Rect, doorEdge?: CellEdge): { x: number; z: number } | undefined {
    if (!doorEdge) return undefined;
    const cx = (cell.x0 + cell.x1) / 2, cz = (cell.z0 + cell.z1) / 2;
    switch (doorEdge) {
        case 'z0': return { x: cx, z: cell.z0 };
        case 'z1': return { x: cx, z: cell.z1 };
        case 'x0': return { x: cell.x0, z: cz };
        case 'x1': return { x: cell.x1, z: cz };
    }
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

// §RESI-CELL-PROGRAM-SCALE (Task 1, 2026-06-23) — THE per-cell rejection ROOT CAUSE +
// CURE. The packer PINS a maximal typology program (T3 ⇒ 3-bed + ensuite + kitchen +
// dining + living + hall = 7 rooms) and the orchestrator handed it VERBATIM to the
// engine. But the partition places cells whose ACTUAL area lands well below the
// typology's grossMin (the founder's T2/T3 cells came out ~55-90 m²). The engine's
// §D3.5 envelope gate (`validateApartmentEnvelope`) then HARD-rejects: a 3-bed needs
// grossMin 85 m², a 2-bed grossMin 60 m² — a 70 m² T3 cell fails the gate, returns []
// → "D-TGL produced no layout for this cell". Even when the envelope passes, a 7-room
// program crammed into a tight cell drops every mandatory room and rejects.
//
// THE CURE (mirrors the house's `scaleProgramToShell` "fewer rooms for a small cell"):
// scale the bedroom COUNT DOWN to what the cell area can hold per the §3.1 envelope
// table, capped at the typology's pinned count. A T3 cell that came out at 70 m² is
// laid out as a 2-bed (70 m² is in the 2-bed [60,120] band) instead of a rejected
// 3-bed; a 50 m² cell becomes a 1-bed (in the 1-bed [42,80] band); a tiny cell becomes
// a studio. The bathroom/en-suite follow the engine's own derivation so the scaled
// program is consistent with what the engine would itself build. Pure + deterministic.
/** The apartment dimension table covers studio(0)..4-bed; we never scale above 4. */
const MAX_SCALE_BEDROOMS = 4;
/** Scale a pinned typology program DOWN to fit a cell of `cellAreaM2` per the §3.1
 *  envelope table. Returns a program whose bedroom count is the LARGEST b ≤ the
 *  pinned count whose envelope band [grossMin,grossMax] admits the cell area (so the
 *  engine's §D3.5 gate passes). Falls back to the smallest count whose grossMin ≤ the
 *  cell (a studio for a tiny cell). Never RAISES the count above the typology pin. */
export function scaleCellProgram(pinned: ApartmentProgram, cellAreaM2: number): ApartmentProgram {
    const pinnedBeds = Math.max(0, Math.min(MAX_SCALE_BEDROOMS, Math.floor(pinned.bedrooms)));
    // Walk DOWN from the pinned count; accept the first b whose envelope admits the
    // cell area (cell ≥ grossMin AND cell ≤ grossMax). A cell larger than the pinned
    // count's grossMax keeps the pinned count (the engine's own envelope-fit growth
    // may then grow it, but never beyond the pin's bedrooms here — we don't request more
    // than the typology asks). A cell below every band's grossMin lands at studio (0).
    // §RESI-PROGRAM-SLACK (founder "over-programmed / 0 apartments", 2026-06-23) — require the
    // cell to exceed the band's grossMin by a CIRCULATION + WALL margin before keeping a bedroom
    // count. A cell sized at EXACTLY grossMin lays the dwelling out at ~100% fill (fillRatio ≈ 1.01),
    // leaving NO room for the comb corridor + partition walls, so the engine drops a mandatory room
    // and HARD-rejects (the founder's "T3 no layout — over-programmed", every cell rejected). The
    // dwelling's habitable gross + its circulation + wall thickness needs ~12% headroom, so we accept
    // a bedroom count only when the cell clears grossMin × SLACK; otherwise we step down (an 85 m²
    // cell whose 3-bed grossMin is 85 becomes a comfortable 2-bed that actually lays out). Studio
    // floor is unchanged. Pure + deterministic.
    // §RESI-PROGRAM-SLACK-2 (founder "0 apartments — units can't fit, all cells rejected",
    // 2026-06-24) — the headroom a program needs GROWS with the bedroom count. A 3-bed adds a
    // comb corridor + an ensuite + more partition walls, so in a DEPTH-CAPPED cell (the rows are
    // ≤ MAX_APARTMENT_DEPTH_M ≈ 9 m) it needs far more than the flat 12% a 1-bed needs. The old
    // flat 1.12 kept ~99 m² cells as 3-beds whose master realised at 11.9 < 12 m² (the §3.1 min)
    // and sealed a room → every orientation hard-failed the min-area + circulation gates → 0
    // apartments (the founder's screenshot: 4 corner cells all hatched ✗). Scale the slack with the
    // count so an over-ambitious cell steps DOWN to the count it can actually lay out — a 99 m²
    // cell becomes a roomy 2-bed that ships, not a rejected 3-bed. (Raising the MAX slider can't
    // help: the cell area is bounded by the corridor-depth cap, not the size band.) Studio keeps
    // its bare floor. Pure + deterministic.
    const slackFor = (b: number): number => b >= 4 ? 1.35 : b === 3 ? 1.28 : b === 2 ? 1.15 : 1.06;
    let beds = pinnedBeds;
    for (let b = pinnedBeds; b >= 0; b--) {
        const d = apartmentDimensionsFor(b);
        const needM2 = b === 0 ? d.grossMin : d.grossMin * slackFor(b);   // studio keeps its bare floor
        if (cellAreaM2 >= needM2 - 1e-6) { beds = b; break; }
        beds = 0; // smaller than even the studio min — clamp to studio, engine soft-fails if truly degenerate
    }
    // A studio (0-bed) request must keep bathrooms ≥ 1 so the program still has a wet
    // room; an n-bed follows the engine's bathrooms = clamp(1..3, floor(beds/2)) rule.
    const bathrooms = Math.min(3, Math.max(1, Math.floor(beds / 2)));
    // §RESI-LEAN-PROGRAM — an apartment cell is a TIGHT plate (an apartment is denser
    // than a whole-storey house: per-storey it carries the FULL dwelling in one cell).
    // A SEPARATE dining room + entrance hall push a small/medium cell over the engine's
    // real room-count budget so the mandatory-gate drops a bedroom and rejects. We:
    //   • fold dining into the KITCHEN (openPlanKitchenDining:false ⇒ one kitchen-diner,
    //     the correct apartment idiom — never a standalone dining room), and
    //   • drop the entrance hall below the 2-bed target band (a compact flat enters
    //     straight into its living/circulation; a generous ≥3-bed keeps the hall).
    // This makes a 64-80 m² 2-bed lay out where the full 8-room program rejected, while
    // a generous cell still reads as a proper multi-room apartment.
    const leanHall = beds >= 3 && cellAreaM2 >= 90;
    return {
        ...pinned,
        bedrooms: beds,
        bathrooms,
        masterEnSuite: beds >= 3 ? pinned.masterEnSuite : false,
        openPlanKitchenDining: false,
        entranceHall: leanHall,
        ...(beds === 0 ? { includeKitchen: true } : {}),
    };
}

/** Build a `ShellAnalysis` from an apartment cell (world metres). The engine reads `perimeter`
 *  (the cell outline) + `netAreaM2`; `faces` is empty (the deterministic engine derives window
 *  faces from the perimeter itself — the analyseShell faces are an AI-prompt hint, not consumed).
 *
 *  §NONRECT-CELLS-P1 — when a non-degenerate `polygon` (≥3 verts, e.g. a reshaped L-fronting cell)
 *  is supplied, it is threaded through as the perimeter so the ALREADY-polygon-native single-
 *  apartment engine (`subdividePolygon`/`tileConcave`) lays out rooms in the NON-RECT unit. Absent
 *  / a 4-corner rect polygon ⇒ the axis-aligned rect ring (byte-identical to the pre-P1 behaviour).
 */
export function shellFromCell(cell: Rect, polygon?: readonly { readonly x: number; readonly z: number }[]): ShellAnalysis {
    const w = Math.max(0, cell.x1 - cell.x0);
    const d = Math.max(0, cell.z1 - cell.z0);
    // The cell outline: the supplied polygon (non-rect cells), else the 4-corner rect ring.
    const perimeter = polygon && polygon.length >= 3
        ? polygon.map(p => ({ x: p.x, z: p.z }))
        : [
            { x: cell.x0, z: cell.z0 },
            { x: cell.x1, z: cell.z0 },
            { x: cell.x1, z: cell.z1 },
            { x: cell.x0, z: cell.z1 },
        ];
    // Net area = the polygon's real area (a reshaped cell is smaller than its bbox w·d).
    const netAreaM2 = polygon && polygon.length >= 3 ? polygonAreaOf(perimeter) : w * d;
    return { netAreaM2, widthM: w, depthM: d, perimeter, faces: [] };
}

/** Shoelace area (abs, m²) of a closed polygon — the reshaped cell's real footprint. */
function polygonAreaOf(poly: readonly { x: number; z: number }[]): number {
    let a = 0;
    for (let i = 0, n = poly.length; i < n; i++) {
        const p = poly[i]!, q = poly[(i + 1) % n]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
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
    const { cell, program: pinnedProgram } = input;
    const facade: ReadonlySet<CellEdge> =
        input.facadeEdges instanceof Set ? input.facadeEdges : new Set(input.facadeEdges ?? []);
    const blindEdges = ALL_EDGES.filter((e) => !facade.has(e));

    // §NONRECT-CELLS-P1 — a reshaped cell carries its real polygon; the engine lays out rooms in it.
    // A plain rect cell (polygon = its 4 corners, or absent) takes the byte-identical rect path.
    const isRectPoly = !input.cellPolygon || input.cellPolygon.length === 4;
    const shell = shellFromCell(cell, isRectPoly ? undefined : input.cellPolygon);
    if (shell.widthM <= 0 || shell.depthM <= 0 || shell.netAreaM2 <= 0) {
        return { status: 'rejected', reason: 'cell is degenerate (zero width/depth)' };
    }

    // §RESI-CELL-PROGRAM-SCALE — scale the PINNED typology program DOWN to fit the cell's
    // actual area per the §3.1 envelope table, so the engine's §D3.5 envelope gate admits
    // the cell instead of hard-rejecting a too-rich program (the per-cell rejection root
    // cause). A T3 cell that lands at 70 m² lays out as a 2-bed; a tiny cell as a studio.
    const program = scaleCellProgram(pinnedProgram, shell.netAreaM2);

    const constraints = input.constraints ?? RESI_APARTMENT_CONSTRAINTS;
    const weights = input.weights ?? RESI_SCORING_WEIGHTS;
    const count = input.count ?? RESI_LAYOUT_COUNT;

    // §RESI-ENTRY-INTO-CORRIDOR — the front-door / entry anchor: the MIDPOINT of the cell's
    // corridor-facing `doorEdge`, in the cell's (world-metres, axis-aligned) plan frame. Fed to the
    // engine so the internal corridor spine REACHES this edge (an L/T when the corridor's main run is
    // perpendicular to it) → the apartment front door opens INTO circulation, never a bedroom. The
    // cell is axis-aligned (angle === 0 inside the engine), so this passes straight through unrotated.
    const entryWorld = input.entry ?? entryFromDoorEdge(cell, input.doorEdge);

    // Run the FROZEN engine. No keep-out / residual-exclude rects (the apartment cell is a
    // clean plate — the core is OUTSIDE it). Solar is threaded when supplied. §RESI-ENTRY-INTO-
    // CORRIDOR threads `entryWorld` (the LAST positional param) so the corridor reaches the entry.
    const options = generateDeterministicLayouts(
        shell,
        program,
        constraints,
        weights,
        count,
        undefined,            // windowSpansWorld — none (no pre-existing exterior windows)
        undefined,            // doorSpansWorld — none
        input.solar,          // optional climate-driven window orientation
        undefined,            // envelopeValidator
        undefined,            // keepOutRectsWorld
        undefined,            // tuning
        undefined,            // residualExcludeRectsWorld
        undefined,            // style
        undefined,            // keepOutRectsLayout
        undefined,            // residualExcludeRectsLayout
        undefined,            // lockBedroomCount
        undefined,            // spineFirst
        entryWorld,           // §RESI-ENTRY-INTO-CORRIDOR — front-door anchor (world metres)
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
