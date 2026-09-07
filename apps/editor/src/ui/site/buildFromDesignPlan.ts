// §BIM-FROM-THE-DESIGN (lane BIM-FROM-DESIGN, 2026-09-07 · L-13080) — the FOURTH ARM: build BIM
// from the envelopes the user has ALREADY DRAWN, instead of asking him to design a house.
//
// Founder, on the live build, with 7 authored envelopes on screen (one `role:'level'` at 190.23 m²
// and six `role:'room'` totalling 77 m²), after clicking "Take me into BIM" and being shown
// "Design your house — live":
//
//   > "WHEN WE SAY — CREATE BIM — EXCLUDE THIS — WE ALREADY HAVE THE DESIGN."
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE DEFECT WAS ALREADY ADMITTED IN PRODUCTION, IN WRITING, BY THE CODE THAT CAUSES IT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `readLevelEnvelopes` (`createHousePlan.ts:314`) drops every `role:'room'` record before the
// planner sees one — `if (r.role !== 'level') continue;` — and the success arm's own advisory
// (`createHousePlan.ts:263-266`) prints the consequence to the user today: *"The room envelopes
// you have drawn are NOT used as the room programme — the house layout is generated from the
// project brief."* The click therefore runs `generateHouseFromBoundary`, which draws a NEW shell
// and opens the generator. The advisory was true, honest, and describing exactly the behaviour
// the founder is objecting to.
//
// ⛔ NOTHING IN THIS REPO READS `role:'room'` AND DISPATCHES A WALL OR SLAB CREATE. Measured
// 2026-09-07: zero producers, wired or unwired. So this is not a wiring job — the producer had to
// be built. This module is the PURE half of it.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ WHAT THIS MODULE DOES NOT DO, AND WHY EACH OMISSION IS DELIBERATE
// ══════════════════════════════════════════════════════════════════════════════════════════════
//  · IT BUILDS NOTHING. It plans. The dispatch is `parcelLawCreateHouse.ts`, through
//    `wall.batch.create` + `slab.batch.create` — the EXISTING verbs. A parallel builder would be
//    the C84 EI-9 duplication this repo keeps paying for ([[grep-for-the-existing-solver-first]]).
//  · IT DOES NOT REPLACE THE GENERATOR. A project with a level envelope and NO room envelopes
//    refuses here with `no-room-envelopes`, and the host falls through to `planCreateHouse`'s
//    unchanged `ok` arm — same generator, same advisory, word for word. The founder's complaint is
//    that the generator ran when he HAD a design; it is still the right answer when he has not.
//  · IT DOES NOT WEAKEN C80. `planCreateHouse`'s `already-built` arm is consulted FIRST by the
//    host and this planner carries its own copy of the same refusal, so a level already carrying
//    authored walls refuses on BOTH paths and the count is named on both.
//  · IT CREATES NO LEVEL. The walls and the slab land on the ACTIVE level. `AddLevelCommand`
//    executes synchronously while the bus is async (C02 §257-274), so a pass that minted a storey
//    and then read it back in the same beat would read STALE — that is a separate lane's problem
//    and this one does not open it. `willCreate` says so.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ THE HAZARD THIS PLANNER EXISTS TO CATCH: ONE SHORT EDGE KILLS THE WHOLE BATCH
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `CreateWallBatchHandler` (`plugins/wall/src/handlers/CreateWallBatch.ts:152-162`) THROWS
// `WallDimensionsError` on any baseLine whose endpoints are closer than 0.05 m — and it validates
// every wall into `fresh[]` BEFORE touching the store, so one bad edge in room 6 means ZERO walls
// created for rooms 1-5 as well. Refusing at dispatch would therefore be an all-or-nothing failure
// with no diagnosis. So the check happens HERE, per room, and a room that cannot be materialised
// is refused BY NAME with its numbers while the rest still build (§CONTEXT-DATA-HONESTY: a cap
// that drops something says so, with numbers).
//
// ⭐ AND IT REUSES THE EXISTING SOLVER. `weldFootprintForWalls` (lane CREATE-HOUSE-IS-ATOMIC,
// L-13011) already reconciles the POLYGON domain with the WALL domain — it welds coincident
// vertices rather than filtering short edges (a filter leaves the ring OPEN by up to 50 mm), it
// reports what it welded, and it refuses with both numbers when the weld moves the enclosed area.
// Re-deriving that here would have been the second copy of a solved problem.
//
// PURE: no store, no DOM, no THREE, no I/O, no clock, no RNG, no id minting. Deterministic.
// Never throws. The caller mints wall/slab ids and pairs them POSITIONALLY with `plan.walls` /
// `plan.slabs`, which is what lets the semantic-graph link be written from the same pass.

import { trace } from '@opentelemetry/api';
import {
    weldFootprintForWalls,
    WALL_MIN_BASELINE_M,
    type WeldPoint,
} from '../house-layout/weldFootprintForWalls';

const _tracer = trace.getTracer('pryzm.site.buildFromDesignPlan');

/** A footprint vertex as the schema stores it — `y` is always 0 (SpaceEnvelope's own refinement). */
export interface DesignVertex { readonly x: number; readonly z: number }

/**
 * One space envelope, in EITHER authorable role. A projection of `SpaceEnvelope`, never a copy.
 *
 * ⛔ `role` IS CARRIED, unlike `LevelEnvelopeDatum`, and that single field is the whole defect:
 * `readLevelEnvelopes` discards the record before the role can be read, so no downstream planner
 * ever had the chance to treat a room as a room.
 */
export interface DesignEnvelopeDatum {
    readonly id: string;
    readonly levelId: string;
    readonly name: string | null;
    readonly role: 'level' | 'room' | 'maximumBuildable';
    /** The level envelope this room declares it sits within. `null` when undeclared. */
    readonly withinId: string | null;
    readonly baseOffset: number;
    readonly height: number;
    readonly footprint: readonly DesignVertex[];
    readonly footprintAreaM2: number;
    readonly occupancy: string | null;
}

export interface BuildFromDesignInput {
    /**
     * Every space envelope on this site, in any order. `null` means THE STORE COULD NOT BE READ —
     * an admission about PRYZM's wiring, and a different answer from `[]`, which is a finding
     * about the project. The two get different refusals (§CONTEXT-DATA-HONESTY).
     */
    readonly envelopes: readonly DesignEnvelopeDatum[] | null;
    /** The active level id. The walls and slab land here; no new level is created. */
    readonly activeLevelId: string | null | undefined;
    /** C80's question is decided from this number, and the refusal prints it. */
    readonly authoredWallCountOnActiveLevel: number;
    /** Metres. Default 0.2 — the same default `generateHouseFromBoundary` draws its shell at. */
    readonly shellThicknessM?: number;
    /** Metres. Default 0.1 — `DEFAULT_CONSTRAINTS.wallThickness` in the house pipeline is 100 mm. */
    readonly partitionThicknessM?: number;
    /** Metres. Default 0.2 — `CreateSlabBatchHandler`'s own default. */
    readonly slabThicknessM?: number;
}

export type BuildFromDesignRefusalCode =
    | 'envelope-store-unreadable'
    | 'no-level-envelope'
    | 'no-active-level'
    | 'no-room-envelopes'
    | 'ambiguous-ground-plate'
    | 'degenerate-footprint'
    | 'already-built'
    | 'every-room-refused';

export interface BuildFromDesignRefusal {
    readonly code: BuildFromDesignRefusalCode;
    /** ⛔ NAMES BOTH NUMBERS wherever two numbers decided it (§12a, C74). */
    readonly text: string;
}

/** Why ONE room envelope could not become walls. The other rooms still build. */
export type RoomRefusalCode =
    | 'ring-too-few-vertices'
    | 'area-below-floor'
    | 'edges-below-wall-minimum'
    | 'within-unresolved'
    | 'within-ambiguous'
    | 'within-not-on-the-built-plate';

export interface RoomRefusal {
    readonly envelopeId: string;
    readonly name: string;
    readonly code: RoomRefusalCode;
    /** ⛔ Names the room AND its numbers. A refusal that cannot be acted on is not a refusal. */
    readonly text: string;
}

/**
 * ⭐ THE LINK, RECORDED AT PLAN TIME. Which envelope edge this wall's centreline came from.
 *
 * `edgeIndex` indexes the envelope's STORED `footprint` ring, OPEN: edge *i* runs
 * `footprint[i] → footprint[(i + 1) % n]`. When the ring had to be welded before it could become
 * wall baselines, the index is mapped back to the nearest ORIGINAL vertex and `ringWelded` is
 * true — so a consumer is never handed a welded-ring index that silently means something else.
 */
export interface DerivedEdgeRef {
    readonly envelopeId: string;
    readonly envelopeRole: 'level' | 'room';
    readonly edgeIndex: number;
    readonly ringWelded: boolean;
}

export interface PlannedWall {
    /** `shell` = a level-envelope edge. `partition` = a room-envelope edge. */
    readonly kind: 'shell' | 'partition';
    readonly a: DesignVertex;
    readonly b: DesignVertex;
    /** ≥ `WALL_MIN_BASELINE_M` by construction — the weld guarantees it before this is emitted. */
    readonly lengthM: number;
    readonly heightM: number;
    readonly thicknessM: number;
    /** THE PRIMARY LINK. See {@link DerivedEdgeRef}. */
    readonly derivedFrom: DerivedEdgeRef;
    /**
     * The OTHER envelope edges that are the SAME segment — a boundary shared between two rooms is
     * ONE wall, and both rooms' claims on it are recorded. Empty for an unshared edge.
     */
    readonly alsoBounds: readonly DerivedEdgeRef[];
}

export interface PlannedSlab {
    /** OPEN ring, XZ metres — `validateSlabBoundary` refuses a duplicated closing vertex. */
    readonly boundary: readonly DesignVertex[];
    readonly thicknessM: number;
    readonly baseOffsetM: number;
    readonly derivedFrom: DerivedEdgeRef;
}

/** One room that WILL be built, as the sentence before the click names it. */
export interface PlannedRoom {
    readonly envelopeId: string;
    readonly name: string;
    readonly areaM2: number;
    /** How many of its edges survived both reductions and became this room's own partitions. */
    readonly partitionEdgeCount: number;
    /** How many of its edges were dropped because they lie on the shell. */
    readonly edgesOnShellCount: number;
}

export interface BuildFromDesignPlan {
    /** The ACTIVE level. Everything lands here; no level is created. */
    readonly levelId: string;
    readonly sourceEnvelopeId: string;
    readonly sourceEnvelopeName: string | null;
    readonly footprintAreaM2: number;
    readonly floorToFloorM: number;
    /** Always 1. This pass builds the ground plate; see the header. */
    readonly storeyCount: number;
    /** Shell first, then partitions, in a deterministic order. ONE `wall.batch.create`. */
    readonly walls: readonly PlannedWall[];
    readonly shellWallCount: number;
    readonly partitionWallCount: number;
    /** Room edges dropped because they coincide with a shell edge (reduction a). */
    readonly droppedOnShellCount: number;
    /** Room edges merged into an existing partition — a shared boundary (reduction b). */
    readonly dedupedPartitionCount: number;
    /** Exactly one — the floor plate. ONE `slab.batch.create`. */
    readonly slabs: readonly PlannedSlab[];
    readonly rooms: readonly PlannedRoom[];
    /** ⛔ NEVER a silent subset. Every room that could not be built is named here with numbers. */
    readonly refusedRooms: readonly RoomRefusal[];
    readonly roomsAreaM2: number;
    /** Computed per plan — it carries the actual counts, not a generic list. */
    readonly willCreate: readonly string[];
    readonly willNotCreate: readonly string[];
    readonly advisories: readonly string[];
}

export type BuildFromDesignOutcome =
    | { readonly ok: true; readonly plan: BuildFromDesignPlan }
    | { readonly ok: false; readonly refusal: BuildFromDesignRefusal };

/**
 * ⛔ THE HONEST DIFFERENCE between this arm and the generator, printed beside the button.
 *
 * The generator's list (`HOUSE_WILL_CREATE`) contains roofs, stairs, rooms, finishes and ceilings.
 * This arm builds what the user DREW and nothing else — anything more would be PRYZM designing on
 * top of a design he has already made, which is the objection this lane exists to answer.
 */
export const BUILD_FROM_DESIGN_WILL_NOT_CREATE: readonly string[] = Object.freeze([
    'a generated layout — you drew one, and PRYZM builds THAT rather than proposing its own',
    'a roof — the roof form is a separate decision this pass does not take for you',
    'stairs — a single storey needs none, and PRYZM will not invent a second one',
    'doors or windows — no opening is implied by an envelope edge, and guessing where one goes '
        + 'would put holes in walls you did not ask for',
    'columns or beams — PRYZM has no structural-frame engine on this path (the same gap the '
        + 'generator arm names)',
    'room records — the walls enclose your spaces; room detection runs over the built walls and '
        + 'is not pre-empted here',
]);

const MIN_FOOTPRINT_AREA_M2 = 1;
const MIN_ROOM_AREA_M2 = 1;
const DEFAULT_SHELL_THICKNESS_M = 0.2;
const DEFAULT_PARTITION_THICKNESS_M = 0.1;
const DEFAULT_SLAB_THICKNESS_M = 0.2;

/**
 * How close a room edge must lie to a shell edge to be treated as the SAME line (reduction a).
 *
 * ⛔ STATED, NOT TUNED. 10 mm is a fifth of `WALL_MIN_BASELINE_M` (50 mm), so a room edge dropped
 * by this band can never be one that would have become a legal wall of its own — the reduction
 * cannot silently delete a real partition. It is deliberately NOT the mm quantisation used for the
 * shared-boundary key below: coincidence with a LINE and identity of a SEGMENT are two different
 * questions and collapsing them onto one epsilon is how a tolerance starts doing two jobs badly.
 */
export const SHELL_COINCIDENCE_TOL_M = 0.01;

/**
 * The grid the shared-boundary key quantises to, in units per metre. 1000 = millimetres.
 *
 * ⚠ EXACT, NOT FUZZY, AND THE CONSEQUENCE IS STATED IN THE PLAN. Two rooms whose shared boundary
 * was authored from the same solved layout carry byte-identical coordinates and merge to ONE wall.
 * Two rooms drawn by hand to within 3 mm of each other do NOT merge, and produce two parallel
 * partitions 3 mm apart. `dedupedPartitionCount` is reported so that outcome is visible as a
 * number rather than discovered as a doubled wall. A fuzzy merge would move the user's geometry
 * without saying so, which is the worse failure.
 */
const SEGMENT_QUANT_PER_M = 1000;

/** Shoelace area of an OPEN ring on the XZ plane. Absolute, so winding does not decide it. */
function ringAreaM2(ring: readonly DesignVertex[]): number {
    if (ring.length < 3) return 0;
    let twice = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        twice += a.x * b.z - b.x * a.z;
    }
    return Math.abs(twice) / 2;
}

const round1 = (v: number): number => Math.round(v * 10) / 10;
const round2 = (v: number): number => Math.round(v * 100) / 100;
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

function vertexKey(p: DesignVertex): string {
    return `${Math.round(p.x * SEGMENT_QUANT_PER_M)},${Math.round(p.z * SEGMENT_QUANT_PER_M)}`;
}

/** UNDIRECTED — a wall from A to B and a wall from B to A are the same wall. */
function segmentKey(a: DesignVertex, b: DesignVertex): string {
    const ka = vertexKey(a);
    const kb = vertexKey(b);
    return ka <= kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/** Distance from `p` to the CLOSED segment `a→b`. Clamped, so an overshoot past an endpoint is
 *  measured to the endpoint rather than to the infinite line. */
function distanceToSegment(p: DesignVertex, a: DesignVertex, b: DesignVertex): number {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 <= 0) return Math.hypot(p.x - a.x, p.z - a.z);
    let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

/**
 * Reduction (a) — is this room edge COLLINEAR AND COINCIDENT with one shell edge?
 *
 * ⛔ BOTH ENDPOINTS MUST LIE ON THE *SAME* SHELL EDGE. Testing each endpoint against the shell
 * POLYLINE instead would drop a chord across a re-entrant corner — a real partition closing a
 * notch — because both of its ends sit on the perimeter while the edge itself cuts through open
 * space. That is a partition the user drew, deleted for a reason nobody could see.
 */
function edgeLiesOnShell(
    p: DesignVertex,
    q: DesignVertex,
    shell: readonly DesignVertex[],
): boolean {
    for (let i = 0; i < shell.length; i++) {
        const a = shell[i]!;
        const b = shell[(i + 1) % shell.length]!;
        if (distanceToSegment(p, a, b) <= SHELL_COINCIDENCE_TOL_M
            && distanceToSegment(q, a, b) <= SHELL_COINCIDENCE_TOL_M) return true;
    }
    return false;
}

/**
 * Map a WELDED-ring vertex back to the index of the ORIGINAL stored vertex it came from.
 *
 * The weld MERGES coincident vertices, so every surviving vertex is (within the weld's own
 * tolerance) one of the originals. `-1` when no original is within `WALL_MIN_BASELINE_M` — which
 * a caller must treat as "this edge's provenance is not recoverable", never as index 0.
 */
function originalIndexOf(welded: DesignVertex, original: readonly DesignVertex[]): number {
    let best = -1;
    let bestD = WALL_MIN_BASELINE_M;
    for (let i = 0; i < original.length; i++) {
        const d = Math.hypot(welded.x - original[i]!.x, welded.z - original[i]!.z);
        if (d <= bestD) { bestD = d; best = i; }
    }
    return best;
}

/** A ring reconciled with the wall domain, plus how to name its edges' provenance. */
interface WallReadyRing {
    readonly ring: readonly DesignVertex[];
    readonly welded: boolean;
    readonly note: string | null;
    /** welded-edge index → original stored edge index (`-1` when unrecoverable). */
    readonly originalIndex: readonly number[];
}

function toWeldPoints(ring: readonly DesignVertex[]): WeldPoint[] {
    return ring.map((p) => ({ x: p.x, z: p.z }));
}

/** `null` when the ring cannot become wall baselines at all — the caller supplies the sentence. */
function wallReady(ring: readonly DesignVertex[]): { readonly ok: true; readonly value: WallReadyRing }
    | { readonly ok: false; readonly statement: string } {
    const weld = weldFootprintForWalls(toWeldPoints(ring));
    if (!weld.ok) return { ok: false, statement: weld.statement };
    const out = weld.ring.map((p) => ({ x: p.x, z: p.z }));
    return {
        ok: true,
        value: {
            ring: out,
            welded: weld.weldedCount > 0,
            note: weld.note,
            originalIndex: out.map((p) => originalIndexOf(p, ring)),
        },
    };
}

/** The shortest edge of an OPEN ring, walked exactly as the wall batch walks it. */
function minEdgeM(ring: readonly DesignVertex[]): number {
    if (ring.length < 2) return 0;
    let min = Infinity;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        min = Math.min(min, Math.hypot(a.x - b.x, a.z - b.z));
    }
    return min;
}

/**
 * Decide whether "Create BIM from this design" may run, and with exactly what. Pure; total;
 * never throws.
 *
 * ⭐ THE ORDER OF THE ARMS MIRRORS `planCreateHouse` DELIBERATELY, so the two planners cannot
 * disagree about which finding wins. `envelope-store-unreadable` is first because it is the only
 * arm about PRYZM rather than about the project; `already-built` is last of the blocking arms so
 * its sentence can name the plate it would have built — and the host consults `planCreateHouse`
 * FIRST regardless, so C80 fires before this arm is ever offered.
 */
export function planBuildFromDesign(input: BuildFromDesignInput): BuildFromDesignOutcome {
    const span = _tracer.startSpan('pryzm.site.planBuildFromDesign');
    const refuse = (code: BuildFromDesignRefusalCode, text: string): BuildFromDesignOutcome => {
        span.setAttribute('pryzm.buildFromDesign.arm', code);
        return { ok: false, refusal: { code, text } };
    };
    try {
        if (input.envelopes === null) {
            return refuse('envelope-store-unreadable',
                'PRYZM cannot read the space-envelope store in this session, so it does not know what '
                + 'you have drawn. This is a gap in PRYZM\'s wiring — NOT a finding that you have drawn '
                + 'nothing. Nothing has been created.');
        }

        const levels = input.envelopes.filter((e) => e.role === 'level');
        if (levels.length === 0) {
            return refuse('no-level-envelope',
                'No level envelope has been drawn on this site, so there is no floor plate to build '
                + 'inside. Draw a level envelope first — the rooms need a plate to sit on.');
        }

        const activeLevelId = input.activeLevelId ?? null;
        if (!activeLevelId) {
            return refuse('no-active-level',
                'There is no active level, and the walls and slab are created on the active one. '
                + 'Open or create a project level first. Nothing has been created.');
        }

        const rooms = input.envelopes.filter((e) => e.role === 'room');
        if (rooms.length === 0) {
            // ⛔ NOT A DEAD END, AND NOT AN ERROR. The host falls through to the generator arm on
            // this code — which is the correct answer for a project with a plate and no design.
            return refuse('no-room-envelopes',
                'You have drawn a level envelope but no room envelopes, so there is no design for '
                + 'PRYZM to build. The house generator can propose one.');
        }

        // The GROUND plate: lowest by `baseOffset`, then by id, so two envelopes at the same height
        // resolve deterministically rather than by store iteration order. Same rule as
        // `planCreateHouse` — a second rule here would let the two arms build different plates.
        const sortedLevels = [...levels].sort((a, b) => (
            a.baseOffset !== b.baseOffset
                ? a.baseOffset - b.baseOffset
                : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
        ));
        const ground = sortedLevels[0]!;

        const rivals = sortedLevels.filter((e) =>
            e.id !== ground.id
            && e.baseOffset === ground.baseOffset
            && Math.abs(e.footprintAreaM2 - ground.footprintAreaM2) > 0.5);
        if (rivals.length > 0) {
            const r = rivals[0]!;
            return refuse('ambiguous-ground-plate',
                `Two level envelopes sit at the same base height (${round1(ground.baseOffset)} m) with `
                + `different footprints — ${round1(ground.footprintAreaM2)} m² and `
                + `${round1(r.footprintAreaM2)} m². PRYZM will not choose between them, because building `
                + 'the wrong one is indistinguishable from building the right one until you look. Delete '
                + 'or move one, then try again.');
        }

        const groundRing = ground.footprint ?? [];
        const groundArea = ringAreaM2(groundRing);
        if (groundRing.length < 3 || groundArea < MIN_FOOTPRINT_AREA_M2) {
            return refuse('degenerate-footprint',
                `The level envelope's footprint has ${groundRing.length} vertices and encloses `
                + `${round1(groundArea)} m², which is below the ${MIN_FOOTPRINT_AREA_M2} m² a shell can `
                + 'be drawn from. A ring this small is a defect in the envelope, not a small building.');
        }

        const shell = wallReady(groundRing);
        if (!shell.ok) {
            return refuse('degenerate-footprint',
                'The level envelope\'s footprint cannot become wall baselines: ' + shell.statement);
        }
        const shellRing = shell.value.ring;

        // ⛔ C80 — the decisive refusal, unchanged in wording and in force from `planCreateHouse`.
        // It protects the model the user is looking at, and it names the count it refused on.
        if (input.authoredWallCountOnActiveLevel > 0) {
            return refuse('already-built',
                `The active level already carries ${input.authoredWallCountOnActiveLevel} authored `
                + `wall${input.authoredWallCountOnActiveLevel === 1 ? '' : 's'}, and building from your `
                + `design draws a NEW ${round1(groundArea)} m² shell with `
                + `${rooms.length} room envelope${rooms.length === 1 ? '' : 's'} inside it rather than `
                + 'adapting what is there. Running it here would thread a second set of walls through '
                + 'the model you have already built, and PRYZM cannot tell which of the two you meant '
                + 'to keep. Build on an empty level, or delete the existing walls first. Nothing has '
                + 'been created.');
        }

        const shellThickness = input.shellThicknessM ?? DEFAULT_SHELL_THICKNESS_M;
        const partitionThickness = input.partitionThicknessM ?? DEFAULT_PARTITION_THICKNESS_M;
        const slabThickness = input.slabThicknessM ?? DEFAULT_SLAB_THICKNESS_M;
        const floorToFloorM = ground.height > 0 ? ground.height : 3;

        // ── 1. THE SHELL — one wall per level-envelope edge ────────────────────────────────────
        const walls: PlannedWall[] = [];
        const shellKeys = new Set<string>();
        for (let i = 0; i < shellRing.length; i++) {
            const a = shellRing[i]!;
            const b = shellRing[(i + 1) % shellRing.length]!;
            shellKeys.add(segmentKey(a, b));
            walls.push({
                kind: 'shell',
                a, b,
                lengthM: round3(Math.hypot(a.x - b.x, a.z - b.z)),
                heightM: floorToFloorM,
                thicknessM: shellThickness,
                derivedFrom: {
                    envelopeId: ground.id,
                    envelopeRole: 'level',
                    edgeIndex: shell.value.originalIndex[i] ?? -1,
                    ringWelded: shell.value.welded,
                },
                alsoBounds: Object.freeze([]),
            });
        }
        const shellWallCount = walls.length;

        // ── 2. THE PARTITIONS — room-envelope edges, after TWO reductions ──────────────────────
        // Rooms are walked in a deterministic order (by id) so that which of two rooms "owns" a
        // shared boundary — and therefore which claim lands in `derivedFrom` rather than
        // `alsoBounds` — is stable across runs and across store iteration order.
        const orderedRooms = [...rooms].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        const refusedRooms: RoomRefusal[] = [];
        const builtRooms: PlannedRoom[] = [];
        const partitionByKey = new Map<string, number>();   // segment key → index into `walls`
        let droppedOnShellCount = 0;
        let dedupedPartitionCount = 0;
        const weldedRoomNotes: string[] = [];

        for (const room of orderedRooms) {
            const label = room.name ?? room.id;

            // 2a. WHERE DOES IT SIT? An unresolvable seat is a refusal, never a guess.
            const declared = room.withinId !== null && room.withinId.length > 0 ? room.withinId : null;
            if (declared !== null) {
                const seat = levels.find((l) => l.id === declared);
                if (!seat) {
                    refusedRooms.push({
                        envelopeId: room.id, name: label, code: 'within-unresolved',
                        text: `"${label}" declares that it sits within envelope "${declared}", and no level `
                            + `envelope with that id exists on this site (there ${levels.length === 1 ? 'is' : 'are'} `
                            + `${levels.length}). PRYZM will not seat it on a plate it was not assigned to. `
                            + 'This room was not built; the others were.',
                    });
                    continue;
                }
                if (seat.id !== ground.id) {
                    refusedRooms.push({
                        envelopeId: room.id, name: label, code: 'within-not-on-the-built-plate',
                        text: `"${label}" sits within "${seat.name ?? seat.id}" at `
                            + `${round1(seat.baseOffset)} m, and this pass builds only the ground plate `
                            + `"${ground.name ?? ground.id}" at ${round1(ground.baseOffset)} m. Upper storeys `
                            + 'need levels PRYZM does not create here. This room was not built; the others were.',
                    });
                    continue;
                }
            } else if (levels.length > 1) {
                refusedRooms.push({
                    envelopeId: room.id, name: label, code: 'within-ambiguous',
                    text: `"${label}" does not declare which level envelope it sits within, and this site has `
                        + `${levels.length}. PRYZM will not pick one for you, because seating it on the wrong `
                        + 'plate is indistinguishable from seating it on the right one until you look. This '
                        + 'room was not built; the others were.',
                });
                continue;
            }

            // 2b. IS IT A RING AT ALL?
            const raw = room.footprint ?? [];
            if (raw.length < 3) {
                refusedRooms.push({
                    envelopeId: room.id, name: label, code: 'ring-too-few-vertices',
                    text: `"${label}" has ${raw.length} vertices — a wall ring needs at least 3. `
                        + 'This room was not built; the others were.',
                });
                continue;
            }
            const roomArea = ringAreaM2(raw);
            if (roomArea < MIN_ROOM_AREA_M2) {
                refusedRooms.push({
                    envelopeId: room.id, name: label, code: 'area-below-floor',
                    text: `"${label}" encloses ${round2(roomArea)} m², below the ${MIN_ROOM_AREA_M2} m² `
                        + 'PRYZM will draw partitions around. A ring this small is a defect in the envelope, '
                        + 'not a small room. This room was not built; the others were.',
                });
                continue;
            }

            // 2c. ⚠ THE ONE THAT WOULD OTHERWISE KILL THE WHOLE BATCH. See the header.
            const ready = wallReady(raw);
            if (!ready.ok) {
                refusedRooms.push({
                    envelopeId: room.id, name: label, code: 'edges-below-wall-minimum',
                    text: `"${label}" cannot become wall baselines — its shortest edge is `
                        + `${round3(minEdgeM(raw))} m against the ${WALL_MIN_BASELINE_M} m minimum a wall `
                        + `may be. ${ready.statement} This room was not built; the others were — refusing `
                        + 'it here is what stops one bad edge rejecting the entire batch at dispatch.',
                });
                continue;
            }
            const ring = ready.value.ring;
            if (ready.value.note !== null) weldedRoomNotes.push(`"${label}": ${ready.value.note}`);

            // 2d. THE TWO REDUCTIONS.
            let onShell = 0;
            let own = 0;
            for (let i = 0; i < ring.length; i++) {
                const a = ring[i]!;
                const b = ring[(i + 1) % ring.length]!;
                const ref: DerivedEdgeRef = {
                    envelopeId: room.id,
                    envelopeRole: 'room',
                    edgeIndex: ready.value.originalIndex[i] ?? -1,
                    ringWelded: ready.value.welded,
                };
                const k = segmentKey(a, b);

                // (a) collinear-and-coincident with a shell edge → the shell already carries it.
                if (shellKeys.has(k) || edgeLiesOnShell(a, b, shellRing)) {
                    onShell++;
                    droppedOnShellCount++;
                    const shellIdx = walls.findIndex((w) => w.kind === 'shell' && segmentKey(w.a, w.b) === k);
                    if (shellIdx >= 0) {
                        const w = walls[shellIdx]!;
                        walls[shellIdx] = { ...w, alsoBounds: Object.freeze([...w.alsoBounds, ref]) };
                    }
                    continue;
                }

                // (b) a boundary shared with a room already walked → ONE wall, both claims kept.
                const existing = partitionByKey.get(k);
                if (existing !== undefined) {
                    dedupedPartitionCount++;
                    const w = walls[existing]!;
                    walls[existing] = { ...w, alsoBounds: Object.freeze([...w.alsoBounds, ref]) };
                    continue;
                }

                partitionByKey.set(k, walls.length);
                walls.push({
                    kind: 'partition',
                    a, b,
                    lengthM: round3(Math.hypot(a.x - b.x, a.z - b.z)),
                    heightM: floorToFloorM,
                    thicknessM: partitionThickness,
                    derivedFrom: ref,
                    alsoBounds: Object.freeze([]),
                });
                own++;
            }

            builtRooms.push({
                envelopeId: room.id,
                name: label,
                areaM2: round2(roomArea),
                partitionEdgeCount: own,
                edgesOnShellCount: onShell,
            });
        }

        // ⛔ IF NOTHING HE DREW CAN BE BUILT, REFUSE THE GESTURE — never emit a bare shell. A shell
        // with no partitions is not "part of his design", it is the generator's starting plate
        // wearing his design's name, and shipping it would answer the founder's objection with the
        // very thing he objected to.
        if (builtRooms.length === 0) {
            return refuse('every-room-refused',
                `None of the ${rooms.length} room envelope${rooms.length === 1 ? '' : 's'} you drew can be `
                + 'built, so PRYZM will not build the shell on its own — a bare plate is not the design you '
                + 'drew. ' + refusedRooms.map((r) => r.text).join(' ')
                + ' Fix or delete the named room envelope'
                + `${refusedRooms.length === 1 ? '' : 's'} and try again.`);
        }

        const partitionWallCount = walls.length - shellWallCount;
        const roomsAreaM2 = round2(builtRooms.reduce((s, r) => s + r.areaM2, 0));

        // ── 3. THE FLOOR PLATE ─────────────────────────────────────────────────────────────────
        const slabs: readonly PlannedSlab[] = Object.freeze([{
            boundary: Object.freeze([...shellRing]),
            thicknessM: slabThickness,
            baseOffsetM: 0,
            derivedFrom: {
                envelopeId: ground.id,
                envelopeRole: 'level' as const,
                edgeIndex: -1,   // the SLAB derives from the whole ring, not from one edge.
                ringWelded: shell.value.welded,
            },
        }]);

        // ── 4. WHAT THE SENTENCE BEFORE THE CLICK SAYS ─────────────────────────────────────────
        const willCreate: readonly string[] = Object.freeze([
            `1 storey — the ACTIVE level "${activeLevelId}". No new level is created; everything lands here.`,
            `${shellWallCount} exterior shell wall${shellWallCount === 1 ? '' : 's'}, one per edge of `
                + `"${ground.name ?? ground.id}" (${round2(groundArea)} m²), ${round2(shellThickness)} m thick `
                + `× ${round1(floorToFloorM)} m high`,
            `${partitionWallCount} interior partition${partitionWallCount === 1 ? '' : 's'} from `
                + `${builtRooms.length} room envelope${builtRooms.length === 1 ? '' : 's'} `
                + `(${round1(roomsAreaM2)} m²), ${round2(partitionThickness)} m thick`,
            `1 floor slab on the level footprint, ${round2(slabThickness)} m thick`,
        ]);

        const advisories: string[] = [];
        advisories.push(
            'PRYZM builds the design you drew and proposes nothing of its own — no layout is '
            + 'generated, because you already made one.');
        if (droppedOnShellCount > 0) {
            advisories.push(
                `${droppedOnShellCount} room edge${droppedOnShellCount === 1 ? '' : 's'} `
                + `${droppedOnShellCount === 1 ? 'lies' : 'lie'} on the level envelope's perimeter and `
                + `${droppedOnShellCount === 1 ? 'is' : 'are'} already carried by a shell wall — `
                + 'they do not become a second wall in the same place.');
        }
        if (dedupedPartitionCount > 0) {
            advisories.push(
                `${dedupedPartitionCount} boundary shared between two rooms became ONE partition rather `
                + 'than two walls face to face. Two rooms whose shared edge was drawn more than 1 mm '
                + 'apart are NOT merged — PRYZM will not move your geometry to tidy it.');
        }
        if (weldedRoomNotes.length > 0) {
            advisories.push(
                'Some rings were simplified so their edges could become wall baselines — '
                + weldedRoomNotes.join(' '));
        }
        if (refusedRooms.length > 0) {
            advisories.push(
                `${refusedRooms.length} of your ${rooms.length} room envelopes cannot be built and `
                + `${refusedRooms.length === 1 ? 'is' : 'are'} named below. The rest still build.`);
        }
        if (sortedLevels.length > 1) {
            const others = sortedLevels.slice(1).map((l) => `"${l.name ?? l.id}" at ${round1(l.baseOffset)} m`);
            advisories.push(
                `This site has ${sortedLevels.length} level envelopes and this pass builds only the `
                + `lowest. ${others.join(', ')} ${others.length === 1 ? 'is' : 'are'} not built — upper `
                + 'storeys need levels PRYZM does not create here.');
        }
        if (ground.levelId && ground.levelId !== activeLevelId) {
            advisories.push(
                `The level envelope is seated on level "${ground.levelId}", but the walls and slab are `
                + `created on the ACTIVE level "${activeLevelId}". If those are different storeys, switch `
                + 'the active level before building.');
        }
        advisories.push(
            'Undo takes TWO steps, not one: the slab is one command and the walls are another. '
            + 'PRYZM has no batch wall delete, so this is the smallest honest number.');
        advisories.push(
            'Your envelopes are left exactly where they are, so the panel can go on comparing what you '
            + 'intended with what has been built.');

        span.setAttribute('pryzm.buildFromDesign.arm', 'ok');
        span.setAttribute('pryzm.buildFromDesign.shellWalls', shellWallCount);
        span.setAttribute('pryzm.buildFromDesign.partitions', partitionWallCount);
        span.setAttribute('pryzm.buildFromDesign.roomsRefused', refusedRooms.length);
        return {
            ok: true,
            plan: {
                levelId: activeLevelId,
                sourceEnvelopeId: ground.id,
                sourceEnvelopeName: ground.name,
                footprintAreaM2: round2(groundArea),
                floorToFloorM,
                storeyCount: 1,
                walls: Object.freeze(walls),
                shellWallCount,
                partitionWallCount,
                droppedOnShellCount,
                dedupedPartitionCount,
                slabs,
                rooms: Object.freeze(builtRooms),
                refusedRooms: Object.freeze(refusedRooms),
                roomsAreaM2,
                willCreate,
                willNotCreate: BUILD_FROM_DESIGN_WILL_NOT_CREATE,
                advisories: Object.freeze(advisories),
            },
        };
    } finally {
        span.end();
    }
}

/**
 * Read EVERY authorable space envelope out of a raw `spaceEnvelope` store state.
 *
 * ⛔ RETURNS `null` — NEVER `[]` — WHEN THE STORE IS ABSENT OR THROWS, for the same reason
 * `readLevelEnvelopes` does: collapsing the two would make the refusal say "you drew nothing"
 * about a store PRYZM never opened.
 *
 * ⭐ THE DIFFERENCE FROM `readLevelEnvelopes` IS THE WHOLE LANE. That reader drops every record
 * whose role is not `'level'` (`createHousePlan.ts:314`). This one keeps the role and hands it on,
 * so a room envelope can finally reach a planner as a room.
 *
 * `maximumBuildable` records are kept in the returned array with their role intact — the planner
 * filters on `'level'` / `'room'` explicitly, so a solved study can never be mistaken for a plate
 * to build (ADR-0380 D2).
 */
export function readDesignEnvelopes(
    store: { getState?: () => ReadonlyMap<string, unknown> } | null | undefined,
): readonly DesignEnvelopeDatum[] | null {
    if (!store || typeof store.getState !== 'function') return null;
    let state: ReadonlyMap<string, unknown>;
    try {
        state = store.getState();
    } catch {
        return null;
    }
    const out: DesignEnvelopeDatum[] = [];
    for (const raw of state.values()) {
        if (typeof raw !== 'object' || raw === null) continue;
        const r = raw as Record<string, unknown>;
        const role = r.role;
        if (role !== 'level' && role !== 'room' && role !== 'maximumBuildable') continue;
        const fp = Array.isArray(r.footprint) ? r.footprint : [];
        const ring: DesignVertex[] = [];
        for (const v of fp) {
            if (typeof v !== 'object' || v === null) continue;
            const p = v as Record<string, unknown>;
            if (typeof p.x !== 'number' || typeof p.z !== 'number') continue;
            if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
            ring.push({ x: p.x, z: p.z });
        }
        out.push({
            id: typeof r.id === 'string' ? r.id : '',
            levelId: typeof r.levelId === 'string' ? r.levelId : '',
            name: typeof r.name === 'string' && r.name.trim().length > 0 ? r.name.trim() : null,
            role,
            withinId: typeof r.withinId === 'string' && r.withinId.length > 0 ? r.withinId : null,
            baseOffset: typeof r.baseOffset === 'number' && Number.isFinite(r.baseOffset) ? r.baseOffset : 0,
            height: typeof r.height === 'number' && Number.isFinite(r.height) ? r.height : 0,
            footprint: ring,
            footprintAreaM2:
                typeof r.footprintAreaM2 === 'number' && Number.isFinite(r.footprintAreaM2)
                    ? r.footprintAreaM2
                    : ringAreaM2(ring),
            occupancy: typeof r.occupancy === 'string' && r.occupancy.length > 0 ? r.occupancy : null,
        });
    }
    return out;
}
