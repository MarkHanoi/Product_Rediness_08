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
//  · IT CREATES NO LEVEL, AND IT NO LONGER NEEDS TO. `AddLevelCommand` executes synchronously
//    while the bus is async (C02 §257-274), so a pass that minted a storey and read it back in
//    the same beat would read STALE. It does not have to: every storey a level envelope names
//    ALREADY EXISTS by the time this runs — `envelopeAuthoringPlan` mints one `role:'level'`
//    envelope per project storey and writes `levelId: level.id` onto it. So the geometry is
//    seated on the PLATE'S OWN storey, and a plate naming a storey PRYZM cannot see is refused
//    by name rather than having a level invented under it. `willCreate` says so.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ §BUILD-EVERY-STOREY (2026-09-07, L-13185..L-13189) — WHAT THIS MODULE USED TO GET WRONG
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The founder hit `not ready to build` TWICE, with two different designs:
//   A — 7 rooms, all seated on "Level envelope · Level 4 · 366 m²" at 12 m;
//   B — 8 rooms, all seated on "Level envelope · Level 1 · 92 m²" at 3 m.
// Both were refused in FULL, and instance B is what killed the working theory. It is not the
// last-created level, not the area and not the design. The invariant was simply: THE ROOM
// PROGRAMME SEATS ROOMS ON THE PLATE OF THE ACTIVE STOREY (`pickHostLevelEnvelope` rung 2), AND
// THIS BUILDER BUILT THE PLATE OF THE LOWEST STOREY (`const ground = sortedLevels[0]!`). They
// coincide only when the active storey happens to be Ground, and after the storey-creation offer
// it never is — `AddLevelCommand.execute` re-points `projectContext.activeLevelId` at every
// storey it mints, and nothing ever `level.add`s L0 "Ground" because BimKernel seeds it.
//
// Three defects, kept separate because they have three different fixes:
//   A — the refusal CONTRADICTED ITSELF. See `roomSetOutcomeSentence`.
//   B — the refusal named a cause that WAS NOT THE CAUSE: *"Upper storeys need levels PRYZM does
//       not create here."* The levels existed as project storeys AND as `role:'level'` envelopes
//       — the refusal string was BUILT from one of them (it interpolated the seat's own name and
//       base offset). A misleading diagnostic is a real defect here, not cosmetics: it sends
//       every future reader after a level-creation bug that does not exist.
//   C — the build was GROUND-ONLY. Now every plate is a storey; see `PlannedStorey`.
//
// ⚠ THE UPSTREAM DEFECT IS LOGGED, NOT FIXED HERE (L-13189). `AddLevelCommand` writing
// `projectContext.activeLevelId` makes the off-ground seat UNAVOIDABLE, but it is not what made
// it a failure: a user who deliberately authors rooms on Level 2 — which the room programme
// fully supports — was refused just the same. That is this module's bug, and it is fixed here.
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
// ⭐ THE RESI PIPELINE'S OWN CLEAR-HEIGHT SOLVER, NOT A SECOND COPY (C84 EI-9). It lives in its
// own pure module precisely so this planner can reach it without dragging `@pryzm/core-app-model`,
// `@pryzm/ai-host` and THREE in behind `CeilingLayoutExecutor`.
import { clearCeilingHeightFromFtf } from '../ceiling-layout/clearCeilingHeight';

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
    /**
     * C80's question for the ACTIVE storey, and the answer for any storey the map below does
     * not carry a key for. Kept because `planCreateHouse` is asked the same question in the
     * same words and the two arms must not disagree about whether a level is empty.
     */
    readonly authoredWallCountOnActiveLevel: number;
    /**
     * ⭐ C80 §3, PER STOREY — `levelId` → authored wall count on that project level.
     *
     * ⛔ REQUIRED THE MOMENT THIS PASS TOUCHES MORE THAN ONE STOREY. A multi-storey build that
     * asked only about the ACTIVE level would thread new walls through a storey the user has
     * already built on — the precise failure C80 exists to prevent, re-created by the fix for a
     * different defect. Optional in the TYPE so a harness that builds one storey need not
     * restate the census, never optional in production: `parcelLawCreateHouse` supplies a key
     * for every storey it can see. A level absent from the map reads 0 — the same permissive
     * direction `countAuthoredWallsOnLevel` already declares for a store that throws.
     */
    readonly authoredWallCountByLevelId?: Readonly<Record<string, number>>;
    /** Metres. Default 0.2 — the same default `generateHouseFromBoundary` draws its shell at. */
    readonly shellThicknessM?: number;
    /** Metres. Default 0.1 — `DEFAULT_CONSTRAINTS.wallThickness` in the house pipeline is 100 mm. */
    readonly partitionThicknessM?: number;
    /** Metres. Default 0.2 — `CreateSlabBatchHandler`'s own default. */
    readonly slabThicknessM?: number;
    /** Metres. Default 0.05 — `CreateCeilingBatchHandler`'s own default. */
    readonly ceilingThicknessM?: number;
}

export type BuildFromDesignRefusalCode =
    | 'envelope-store-unreadable'
    | 'no-level-envelope'
    | 'no-active-level'
    | 'no-room-envelopes'
    | 'ambiguous-ground-plate'
    | 'storeys-share-a-level'
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
    /**
     * ⭐ THE PROJECT STOREY THIS WALL LANDS ON — carried PER WALL, never inherited from the batch
     * default. `CreateWallBatchHandler` reads `w.levelId ?? defaultLevelId`
     * (`CreateWallBatch.ts:132`), which is what lets EVERY storey of a multi-storey design be
     * built by ONE `wall.batch.create` and therefore ONE undo entry. A loop over storeys would
     * have cost one entry per floor for no geometric gain.
     */
    readonly levelId: string;
    /** Index into {@link BuildFromDesignPlan.storeys}. */
    readonly storeyIndex: number;
    /** THE PRIMARY LINK. See {@link DerivedEdgeRef}. */
    readonly derivedFrom: DerivedEdgeRef;
    /**
     * The OTHER envelope edges that are the SAME segment — a boundary shared between two rooms is
     * ONE wall, and both rooms' claims on it are recorded. Empty for an unshared edge.
     *
     * ⛔ SCOPED TO ONE STOREY. Two rooms on DIFFERENT storeys whose rings are identical — the
     * ordinary case for a stacked building — are two different walls, and merging them would put
     * the upper floor's partitions on the ground floor and leave the upper floor open.
     */
    readonly alsoBounds: readonly DerivedEdgeRef[];
}

export interface PlannedSlab {
    /** OPEN ring, XZ metres — `validateSlabBoundary` refuses a duplicated closing vertex. */
    readonly boundary: readonly DesignVertex[];
    readonly thicknessM: number;
    /**
     * Relative to the STOREY's own datum, so it is 0 on every floor. World Y is resolved from the
     * level's elevation at projection — the same convention
     * `HouseLayoutExecutor._createStorageSlab` builds its per-storey plates on.
     */
    readonly baseOffsetM: number;
    readonly levelId: string;
    readonly storeyIndex: number;
    readonly derivedFrom: DerivedEdgeRef;
}

/**
 * One finished ceiling, over ONE room envelope.
 *
 * ⭐ IT NEEDS NO ROOM RECORD. `CeilingLayoutExecutor` reads the room store because it runs AFTER a
 * detect pass; here the room the user DREW is the boundary, so the ceiling is a direct geometric
 * consequence of the ring and the storey height and nothing is invented. The clear height comes
 * from `clearCeilingHeightFromFtf` — the SAME producer the resi pipeline uses (C84 EI-9), never
 * the raw floor-to-floor, which would put the ceiling flush against the slab above.
 */
export interface PlannedCeiling {
    readonly boundary: readonly DesignVertex[];
    /** The finished CLEAR height above the storey datum — always ≤ the storey's floor-to-floor. */
    readonly ceilingHeightM: number;
    readonly thicknessM: number;
    readonly levelId: string;
    readonly storeyIndex: number;
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
    readonly storeyIndex: number;
    readonly levelId: string;
}

/**
 * ⭐ ONE STOREY OF THE BUILD — the unit this pass now works in.
 *
 * Until 2026-09-07 there was no such thing: `ground = sortedLevels[0]` bound the LOWEST plate and
 * every later stage read only that one, so a design whose rooms sat on any other storey was
 * refused in full. Two founder reproductions (7 rooms on Level 4 @ 12 m; 8 rooms on Level 1 @ 3 m)
 * failed identically, which is what proved the pin was structural rather than design-specific.
 */
export interface PlannedStorey {
    readonly index: number;
    readonly plateEnvelopeId: string;
    readonly plateName: string | null;
    /** The PROJECT level the geometry lands on. */
    readonly levelId: string;
    /**
     * `plate` — the level envelope's own `levelId`, which `envelopeAuthoringPlan` writes as
     * `level.id` (one envelope per storey). `active-level` — the plate carried none and there is
     * exactly ONE plate, so the active storey is the only defensible seat; it is REPORTED, because
     * seating geometry on a storey the user did not name is something they must be able to see.
     */
    readonly levelIdSource: 'plate' | 'active-level';
    readonly baseOffsetM: number;
    readonly floorToFloorM: number;
    readonly footprintAreaM2: number;
    readonly shellWallCount: number;
    readonly partitionWallCount: number;
    readonly roomCount: number;
}

/**
 * A level envelope that could NOT become a storey. Its rooms are refused BY NAME carrying THIS
 * reason, so the user is never told that a room failed for a reason belonging to its plate.
 */
export interface RefusedStorey {
    readonly plateEnvelopeId: string;
    readonly plateName: string | null;
    readonly baseOffsetM: number;
    readonly code: 'degenerate-plate-ring' | 'already-built';
    readonly text: string;
}

export interface BuildFromDesignPlan {
    /**
     * The batch DEFAULT level — the lowest built storey's. Every wall, slab and ceiling also
     * carries its own `levelId`, and the handlers read the per-entry field first, so this is a
     * fallback that production never depends on.
     */
    readonly levelId: string;
    /** The lowest built storey's plate. */
    readonly sourceEnvelopeId: string;
    readonly sourceEnvelopeName: string | null;
    /** The lowest built storey's enclosed area. Per-storey areas are on {@link storeys}. */
    readonly footprintAreaM2: number;
    /** The lowest built storey's floor-to-floor. Per-storey heights are on {@link storeys}. */
    readonly floorToFloorM: number;
    /** How many storeys this pass builds. NOT hard-coded — one per built level envelope. */
    readonly storeyCount: number;
    /** ⭐ Every storey this pass builds, lowest first. */
    readonly storeys: readonly PlannedStorey[];
    /** Level envelopes that could NOT be built, each with its own reason. Never a silent drop. */
    readonly refusedStoreys: readonly RefusedStorey[];
    /** ALL shells (storey by storey) first, then ALL partitions. ONE `wall.batch.create`. */
    readonly walls: readonly PlannedWall[];
    readonly shellWallCount: number;
    readonly partitionWallCount: number;
    /** Room edges dropped because they coincide with their OWN storey's shell edge (reduction a). */
    readonly droppedOnShellCount: number;
    /** Room edges merged into an existing partition ON THE SAME STOREY — a shared boundary (b). */
    readonly dedupedPartitionCount: number;
    /** One per built storey. ONE `slab.batch.create`. */
    readonly slabs: readonly PlannedSlab[];
    /** One per built room. ONE `ceiling.batch.create`. */
    readonly ceilings: readonly PlannedCeiling[];
    readonly rooms: readonly PlannedRoom[];
    /** ⛔ NEVER a silent subset. Every room that could not be built is named here with numbers. */
    readonly refusedRooms: readonly RoomRefusal[];
    readonly roomsAreaM2: number;
    /**
     * ⛔ COMPUTED PER PLAN, NEVER A CONSTANT (C16 §8.6 B-6). It was the literal "TWO" while the
     * pass emitted exactly two commands; it is now one per batch actually dispatched, so the
     * number the panel prints before the click cannot drift from the number of commands.
     */
    readonly undoStepCount: number;
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
    'new project levels — every storey your plates name already exists, so this pass builds onto '
        + 'them. A plate that names a storey PRYZM cannot find is refused BY NAME rather than '
        + 'having a level invented under it',
    'a ROOF — no space envelope carries a roof form. `SpaceEnvelope` has footprint, base offset, '
        + 'height, role and occupancy and no shape, pitch or overhang field, so any roof built here '
        + 'would be PRYZM choosing a form you did not draw. Ask for one on the house arm, where the '
        + 'form is an input you give',
    'FLOOR FINISHES — `floor.create` is a SINGULAR verb (there is no `floor.batch.create` in this '
        + 'repo), so one finish per room would cost one undo step per room, and the finish spec is '
        + 'chosen from a room\'s occupancy, which needs room RECORDS this pass deliberately does '
        + 'not create',
    'STAIRS, and no void is punched through the slabs — a room you named "Stair" becomes four '
        + 'partitions and a solid plate above it. PRYZM will not invent a stair geometry you did '
        + 'not draw, and it says so rather than leaving you to find the closed shaft where your stairs should be',
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
const DEFAULT_CEILING_THICKNESS_M = 0.05;

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
 *
 * ⛔ IT RETURNS THE EDGE'S INDEX, NOT A BOOLEAN, AND THAT IS THE WHOLE POINT (found by
 * `buildFromDesignPlan.spec.ts`, 2026-09-07). This used to answer yes/no, and the caller then
 * looked the shell wall up by EXACT SEGMENT KEY in order to record the room's claim on it. A room
 * flush against a façade almost never spans the WHOLE façade — it covers part of it — so the keys
 * did not match, the lookup returned -1, and the claim was DROPPED SILENTLY: the edge disappeared
 * (correctly) and nothing recorded that the room had ever bounded that wall. The link the cascade
 * depends on was missing for exactly the rooms most likely to have one.
 */
function shellEdgeIndexOf(
    p: DesignVertex,
    q: DesignVertex,
    shell: readonly DesignVertex[],
): number {
    for (let i = 0; i < shell.length; i++) {
        const a = shell[i]!;
        const b = shell[(i + 1) % shell.length]!;
        if (distanceToSegment(p, a, b) <= SHELL_COINCIDENCE_TOL_M
            && distanceToSegment(q, a, b) <= SHELL_COINCIDENCE_TOL_M) return i;
    }
    return -1;
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
 * ⭐ THE ONE PRODUCER OF THE SET-LEVEL SENTENCE — "how did the ROOM SET as a whole fare?"
 *
 * ⛔ THIS EXISTS BECAUSE THE ANSWER USED TO BE WRITTEN FIVE TIMES, PER ROOM, AS AN EXCEPTION.
 * Every per-room refusal ended with the literal *"This room was not built; the others were."* —
 * five copies at what were lines 564 / 574 / 595 / 605 / 617 (C84 EI-9, one fact, one producer).
 * The clause is a statement about the SET, and it was attached to a member of the set, so in the
 * all-fail case the founder read *"None of the 7 room envelopes … can be built"* followed by seven
 * assertions that the others were. It was false N times, and worse than untidy: it told him to
 * *"Fix or delete the named room envelopes"* while implying the rest had succeeded, so it
 * misdirected the repair.
 *
 * A `RoomRefusal.text` now states ONLY what is wrong with THAT room and its numbers. The set-level
 * fact is composed HERE, once, and is correct in all three cases — none refused, some refused, and
 * every one refused.
 */
export function roomSetOutcomeSentence(refusedCount: number, totalRooms: number): string {
    if (refusedCount <= 0) {
        return `Every one of your ${totalRooms} room envelope${totalRooms === 1 ? '' : 's'} will be built.`;
    }
    if (refusedCount >= totalRooms) {
        return `None of the ${totalRooms} room envelope${totalRooms === 1 ? '' : 's'} you drew can be built.`;
    }
    return `${refusedCount} of your ${totalRooms} room envelopes cannot be built and `
        + `${refusedCount === 1 ? 'is' : 'are'} named below. The rest still build.`;
}

/** A level envelope that resolved into a buildable storey, plus everything the emit stages need. */
interface StoreyBuild {
    readonly plate: DesignEnvelopeDatum;
    readonly index: number;
    readonly levelId: string;
    readonly levelIdSource: 'plate' | 'active-level';
    readonly ring: readonly DesignVertex[];
    readonly welded: boolean;
    readonly originalIndex: readonly number[];
    readonly areaM2: number;
    readonly floorToFloorM: number;
    /** Index into `walls` of this storey's FIRST shell wall. Shell walls are contiguous. */
    shellStart: number;
    /** Segment key → index into `walls`. ⛔ PER STOREY — see `PlannedWall.alsoBounds`. */
    readonly partitionByKey: Map<string, number>;
    partitionCount: number;
    readonly rooms: PlannedRoom[];
}

/**
 * Decide whether "Create BIM from this design" may run, and with exactly what. Pure; total;
 * never throws.
 *
 * ⭐ THE ORDER OF THE ARMS MIRRORS `planCreateHouse` DELIBERATELY, so the two planners cannot
 * disagree about which finding wins. `envelope-store-unreadable` is first because it is the only
 * arm about PRYZM rather than about the project; the C80 arm is asked PER STOREY and only becomes
 * a whole-gesture refusal when it has refused every storey — the host consults `planCreateHouse`
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
                'There is no active level, and a plate that does not name its own storey is built on '
                + 'the active one. Open or create a project level first. Nothing has been created.');
        }

        const rooms = input.envelopes.filter((e) => e.role === 'room');
        // ⛔⛔ §SHELL-WITHOUT-ROOMS (L-13250) — A PLATE WITH NO ROOMS IS A BUILDABLE DESIGN, AND
        // REFUSING IT WAS WRONG.
        //
        // This used to `refuse('no-room-envelopes')` outright. FOUNDER, via chat: *"Create
        // perimeter wall on envelope"* → *"Nothing was changed — You have drawn a level envelope
        // but no room envelopes, so there is no design for PRYZM to build"* → *"but doesnt work -
        // it should work for walls/slabs, minimum"*. He is right, and the code below already
        // proves it: SHELL WALLS are `s.ring.length` off the LEVEL plate's own ring, and SLABS are
        // one per built STOREY off that same ring. Neither reads a room. Only PARTITIONS
        // (`walls.length - shellWallCount`) and CEILINGS (`builtRooms.map`) need rooms, and zero of
        // either is a correct answer, not a failure — a shell and a floor plate is exactly what
        // "minimum" means.
        //
        // ⭐ THE PANEL'S GENERATOR FALL-THROUGH IS PRESERVED, AND DELIBERATELY MOVED RATHER THAN
        // DROPPED. `parcelLawCreateHouse.ts` offered the house generator on this refusal code —
        // the right product answer for a plate with no design on THAT surface, and not something
        // this lane should change silently. It now reads `plan.rooms.length === 0` instead, so the
        // panel behaves exactly as before while every other caller (the chat seam, which is where
        // the founder was) gets the shell it asked for. A refusal is the wrong carrier for
        // "this surface prefers a different offer": it denied the build to everyone.
        //
        // `willNotCreate` below already names partitions and ceilings as not built, so nothing is
        // silently absent — the plan states the shell it IS building and what it is not.

        // Storeys are walked LOWEST FIRST, then by id so two plates at one height resolve
        // deterministically rather than by store iteration order.
        const sortedLevels = [...levels].sort((a, b) => (
            a.baseOffset !== b.baseOffset
                ? a.baseOffset - b.baseOffset
                : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
        ));

        // ── ⛔ TWO PLATES AT ONE ELEVATION IS A RIVALRY, NOT A STACK ───────────────────────────
        // Storeys are distinguished by their elevation. Two level envelopes at the SAME elevation
        // are two answers to one question, and PRYZM will not pick.
        //
        // ⭐ WIDENED 2026-09-07. The old rule only refused when the two areas differed by more than
        // 0.5 m²; two plates at one height with the SAME area fell through and only `sortedLevels[0]`
        // was built, so the second authored plate was DROPPED SILENTLY. A cap that drops something
        // must say so (§CONTEXT-DATA-HONESTY), and "identical" is exactly the case where building
        // the wrong one is invisible.
        for (let i = 1; i < sortedLevels.length; i++) {
            const prev = sortedLevels[i - 1]!;
            const here = sortedLevels[i]!;
            if (Math.abs(here.baseOffset - prev.baseOffset) > 0.001) continue;
            return refuse('ambiguous-ground-plate',
                `Two level envelopes sit at the same base height (${round1(prev.baseOffset)} m) — `
                + `"${prev.name ?? prev.id}" enclosing ${round1(prev.footprintAreaM2)} m² and `
                + `"${here.name ?? here.id}" enclosing ${round1(here.footprintAreaM2)} m². A storey is `
                + 'one plate, and PRYZM will not choose between them, because building the wrong one is '
                + 'indistinguishable from building the right one until you look. Delete or move one, '
                + 'then try again. Nothing has been created.');
        }

        const shellThickness = input.shellThicknessM ?? DEFAULT_SHELL_THICKNESS_M;
        const partitionThickness = input.partitionThicknessM ?? DEFAULT_PARTITION_THICKNESS_M;
        const slabThickness = input.slabThicknessM ?? DEFAULT_SLAB_THICKNESS_M;
        const ceilingThickness = input.ceilingThicknessM ?? DEFAULT_CEILING_THICKNESS_M;

        /**
         * C80's question, asked PER STOREY.
         *
         * ⛔ THE PERMISSIVE DIRECTION IS STATED, not hidden. A level whose wall census the host
         * could not take is absent from the map and reads 0 here, which means the C80 arm does NOT
         * fire for it — the same direction `countAuthoredWallsOnLevel` already documents for a
         * store that is absent or throws. Production supplies a key for every storey it can see.
         */
        const byLevel = input.authoredWallCountByLevelId;
        const authoredWallsOn = (levelId: string): number => {
            if (byLevel && Object.prototype.hasOwnProperty.call(byLevel, levelId)) {
                const v = byLevel[levelId];
                return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
            }
            return levelId === activeLevelId ? input.authoredWallCountOnActiveLevel : 0;
        };

        // ── 1. EVERY PLATE BECOMES A STOREY, OR IS REFUSED BY NAME WITH ITS OWN REASON ─────────
        const built: StoreyBuild[] = [];
        const builtByPlateId = new Map<string, StoreyBuild>();
        const refusedStoreys: RefusedStorey[] = [];
        const refusedStoreyByPlateId = new Map<string, RefusedStorey>();
        const weldedPlateNotes: string[] = [];

        for (const plate of sortedLevels) {
            const label = plate.name ?? plate.id;
            const declineStorey = (code: RefusedStorey['code'], text: string): void => {
                const row: RefusedStorey = {
                    plateEnvelopeId: plate.id,
                    plateName: plate.name,
                    baseOffsetM: round1(plate.baseOffset),
                    code,
                    text,
                };
                refusedStoreys.push(row);
                refusedStoreyByPlateId.set(plate.id, row);
            };

            const raw = plate.footprint ?? [];
            const area = ringAreaM2(raw);
            if (raw.length < 3 || area < MIN_FOOTPRINT_AREA_M2) {
                declineStorey('degenerate-plate-ring',
                    `"${label}" at ${round1(plate.baseOffset)} m has ${raw.length} vertices and encloses `
                    + `${round1(area)} m², which is below the ${MIN_FOOTPRINT_AREA_M2} m² a shell can be `
                    + 'drawn from. A ring this small is a defect in the envelope, not a small building.');
                continue;
            }
            const ready = wallReady(raw);
            if (!ready.ok) {
                declineStorey('degenerate-plate-ring',
                    `"${label}" at ${round1(plate.baseOffset)} m cannot become wall baselines: `
                    + ready.statement);
                continue;
            }
            if (ready.value.note !== null) weldedPlateNotes.push(`"${label}": ${ready.value.note}`);

            // ⭐ THE STOREY THE GEOMETRY LANDS ON IS THE PLATE'S OWN, NOT THE ACTIVE ONE.
            // `envelopeAuthoringPlan` writes `levelId: level.id` — one level envelope per project
            // storey — so the plate already knows its floor. Reading the ACTIVE storey instead is
            // how the whole design used to land on whichever level was last created.
            const levelIdSource: 'plate' | 'active-level' =
                plate.levelId.length > 0 ? 'plate' : 'active-level';
            const levelId = levelIdSource === 'plate' ? plate.levelId : activeLevelId;

            // ⛔ C80 §3 — ASKED PER STOREY, and this is required rather than tidy: a build that
            // asked once about the active level would thread new walls through a storey the user
            // has already built on, which is the precise failure C80 exists to prevent, re-created
            // by the fix for a different defect.
            const priorWalls = authoredWallsOn(levelId);
            if (priorWalls > 0) {
                declineStorey('already-built',
                    `"${label}" at ${round1(plate.baseOffset)} m sits on a level that already carries `
                    + `${priorWalls} authored wall${priorWalls === 1 ? '' : 's'}. Building here would `
                    + 'thread a second set of walls through the model you have already built, and PRYZM '
                    + 'cannot tell which of the two you meant to keep. Build on an empty storey, or '
                    + 'delete the existing walls on this one first.');
                continue;
            }

            const storey: StoreyBuild = {
                plate,
                index: built.length,
                levelId,
                levelIdSource,
                ring: ready.value.ring,
                welded: ready.value.welded,
                originalIndex: ready.value.originalIndex,
                areaM2: area,
                floorToFloorM: plate.height > 0 ? plate.height : 3,
                shellStart: -1,
                partitionByKey: new Map<string, number>(),
                partitionCount: 0,
                rooms: [],
            };
            built.push(storey);
            builtByPlateId.set(plate.id, storey);
        }

        // ⛔ TWO STOREYS MAY NOT LAND ON ONE PROJECT LEVEL. Reachable when two plates at different
        // elevations both name the same level, or when more than one plate carries no level of its
        // own and falls back to the active storey. Stacking them would put two floors of walls at
        // one elevation and report success.
        const seenLevelIds = new Map<string, StoreyBuild>();
        for (const s of built) {
            const rival = seenLevelIds.get(s.levelId);
            if (rival) {
                return refuse('storeys-share-a-level',
                    `"${s.plate.name ?? s.plate.id}" at ${round1(s.plate.baseOffset)} m and `
                    + `"${rival.plate.name ?? rival.plate.id}" at ${round1(rival.plate.baseOffset)} m `
                    + `both build on project level "${s.levelId}". Two storeys cannot share one level — `
                    + 'the second would land on top of the first at the same elevation and PRYZM would '
                    + 'report success. Seat each level envelope on its own storey, then try again. '
                    + 'Nothing has been created.');
            }
            seenLevelIds.set(s.levelId, s);
        }

        // ⛔ NO STOREY AT ALL — the whole gesture refuses, carrying every plate's OWN reason. The
        // code is chosen by what actually stopped them, so the sentence never names a cause that is
        // not the cause.
        if (built.length === 0) {
            const allAlreadyBuilt = refusedStoreys.every((r) => r.code === 'already-built');
            const reasons = refusedStoreys.map((r) => r.text).join(' ');
            if (allAlreadyBuilt) {
                return refuse('already-built',
                    `Every level envelope you drew sits on a storey that already carries authored walls, `
                    + `so PRYZM will not build. ${reasons} Nothing has been created.`);
            }
            return refuse('degenerate-footprint',
                `None of the ${sortedLevels.length} level envelope${sortedLevels.length === 1 ? '' : 's'} `
                + `on this site can become a shell. ${reasons} Nothing has been created.`);
        }

        // ── 2. THE SHELLS — one wall per level-envelope edge, on EVERY built storey ────────────
        // All shells are emitted before any partition, so `walls.slice(0, shellWallCount)` is the
        // shell set and a storey's shell edges are contiguous from `shellStart`.
        const walls: PlannedWall[] = [];
        for (const s of built) {
            s.shellStart = walls.length;
            for (let i = 0; i < s.ring.length; i++) {
                const a = s.ring[i]!;
                const b = s.ring[(i + 1) % s.ring.length]!;
                walls.push({
                    kind: 'shell',
                    a, b,
                    lengthM: round3(Math.hypot(a.x - b.x, a.z - b.z)),
                    heightM: s.floorToFloorM,
                    thicknessM: shellThickness,
                    levelId: s.levelId,
                    storeyIndex: s.index,
                    derivedFrom: {
                        envelopeId: s.plate.id,
                        envelopeRole: 'level',
                        edgeIndex: s.originalIndex[i] ?? -1,
                        ringWelded: s.welded,
                    },
                    alsoBounds: Object.freeze([]),
                });
            }
        }
        const shellWallCount = walls.length;

        // ── 3. THE PARTITIONS — room-envelope edges, after TWO reductions, ON THEIR OWN STOREY ─
        // Rooms are walked in a deterministic order (by id) so that which of two rooms "owns" a
        // shared boundary — and therefore which claim lands in `derivedFrom` rather than
        // `alsoBounds` — is stable across runs and across store iteration order.
        const orderedRooms = [...rooms].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        const refusedRooms: RoomRefusal[] = [];
        const builtRooms: PlannedRoom[] = [];
        let droppedOnShellCount = 0;
        let dedupedPartitionCount = 0;
        const weldedRoomNotes: string[] = [];

        for (const room of orderedRooms) {
            const label = room.name ?? room.id;

            // 3a. WHICH PLATE DOES IT SIT ON? An unresolvable seat is a refusal, never a guess.
            const declared = room.withinId !== null && room.withinId.length > 0 ? room.withinId : null;
            let seatPlateId: string;
            if (declared !== null) {
                const seat = levels.find((l) => l.id === declared);
                if (!seat) {
                    refusedRooms.push({
                        envelopeId: room.id, name: label, code: 'within-unresolved',
                        text: `"${label}" declares that it sits within envelope "${declared}", and no level `
                            + `envelope with that id exists on this site (there ${levels.length === 1 ? 'is' : 'are'} `
                            + `${levels.length}). PRYZM will not seat it on a plate it was not assigned to.`,
                    });
                    continue;
                }
                seatPlateId = seat.id;
            } else if (levels.length === 1) {
                seatPlateId = levels[0]!.id;
            } else {
                refusedRooms.push({
                    envelopeId: room.id, name: label, code: 'within-ambiguous',
                    text: `"${label}" does not declare which level envelope it sits within, and this site has `
                        + `${levels.length}. PRYZM will not pick one for you, because seating it on the wrong `
                        + 'plate is indistinguishable from seating it on the right one until you look.',
                });
                continue;
            }

            // ⭐ THE ARM THAT USED TO REFUSE THE FOUNDER'S ENTIRE DESIGN, AND WHAT IT NOW MEANS.
            // It read `if (seat.id !== ground.id)` — every room not on the LOWEST plate — and told
            // the user *"Upper storeys need levels PRYZM does not create here."* Both halves were
            // false: the storeys existed as project levels and the plates existed as `role:'level'`
            // envelopes, and the sentence was BUILT from one of them. It now fires only when the
            // room's own plate could not become a storey, and it carries THAT plate's real reason.
            const storey = builtByPlateId.get(seatPlateId);
            if (!storey) {
                const why = refusedStoreyByPlateId.get(seatPlateId);
                refusedRooms.push({
                    envelopeId: room.id, name: label, code: 'within-not-on-the-built-plate',
                    text: `"${label}" sits within a level envelope that could not be built, so it has no `
                        + `plate to stand on. ${why?.text ?? 'That envelope was refused by this pass.'}`,
                });
                continue;
            }

            // 3b. IS IT A RING AT ALL?
            const raw = room.footprint ?? [];
            if (raw.length < 3) {
                refusedRooms.push({
                    envelopeId: room.id, name: label, code: 'ring-too-few-vertices',
                    text: `"${label}" has ${raw.length} vertices — a wall ring needs at least 3.`,
                });
                continue;
            }
            const roomArea = ringAreaM2(raw);
            if (roomArea < MIN_ROOM_AREA_M2) {
                refusedRooms.push({
                    envelopeId: room.id, name: label, code: 'area-below-floor',
                    text: `"${label}" encloses ${round2(roomArea)} m², below the ${MIN_ROOM_AREA_M2} m² `
                        + 'PRYZM will draw partitions around. A ring this small is a defect in the envelope, '
                        + 'not a small room.',
                });
                continue;
            }

            // 3c. ⚠ THE ONE THAT WOULD OTHERWISE KILL THE WHOLE BATCH. See the header.
            const ready = wallReady(raw);
            if (!ready.ok) {
                refusedRooms.push({
                    envelopeId: room.id, name: label, code: 'edges-below-wall-minimum',
                    text: `"${label}" cannot become wall baselines — its shortest edge is `
                        + `${round3(minEdgeM(raw))} m against the ${WALL_MIN_BASELINE_M} m minimum a wall `
                        + `may be. ${ready.statement} Refusing it here is what stops one bad edge `
                        + 'rejecting the entire batch at dispatch.',
                });
                continue;
            }
            const ring = ready.value.ring;
            if (ready.value.note !== null) weldedRoomNotes.push(`"${label}": ${ready.value.note}`);

            // 3d. THE TWO REDUCTIONS — both scoped to THIS ROOM'S OWN STOREY.
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

                // (a) collinear-and-coincident with a shell edge OF THIS STOREY → the shell already
                // carries it. ⭐ THE SAME TEST DECIDES THE DROP AND NAMES THE WALL THAT ABSORBS THE
                // CLAIM. This storey's shell walls were pushed in ring order from `shellStart`, so
                // ring edge `i` IS `walls[shellStart + i]` — which is why the room's claim can be
                // recorded on a shell wall it only PARTLY covers.
                const shellIdx = shellEdgeIndexOf(a, b, storey.ring);
                if (shellIdx >= 0) {
                    onShell++;
                    droppedOnShellCount++;
                    const w = walls[storey.shellStart + shellIdx];
                    if (w && w.kind === 'shell') {
                        walls[storey.shellStart + shellIdx] =
                            { ...w, alsoBounds: Object.freeze([...w.alsoBounds, ref]) };
                    }
                    continue;
                }

                // (b) a boundary shared with a room already walked ON THE SAME STOREY → ONE wall,
                // both claims kept. ⛔ The key map is the STOREY's, never the plan's: two rooms with
                // identical rings on different floors are two walls, and merging them would leave
                // the upper floor open.
                const existing = storey.partitionByKey.get(k);
                if (existing !== undefined) {
                    dedupedPartitionCount++;
                    const w = walls[existing]!;
                    walls[existing] = { ...w, alsoBounds: Object.freeze([...w.alsoBounds, ref]) };
                    continue;
                }

                storey.partitionByKey.set(k, walls.length);
                walls.push({
                    kind: 'partition',
                    a, b,
                    lengthM: round3(Math.hypot(a.x - b.x, a.z - b.z)),
                    heightM: storey.floorToFloorM,
                    thicknessM: partitionThickness,
                    levelId: storey.levelId,
                    storeyIndex: storey.index,
                    derivedFrom: ref,
                    alsoBounds: Object.freeze([]),
                });
                own++;
                storey.partitionCount++;
            }

            const plannedRoom: PlannedRoom = {
                envelopeId: room.id,
                name: label,
                areaM2: round2(roomArea),
                partitionEdgeCount: own,
                edgesOnShellCount: onShell,
                storeyIndex: storey.index,
                levelId: storey.levelId,
            };
            builtRooms.push(plannedRoom);
            storey.rooms.push(plannedRoom);
        }

        // ⛔ IF NOTHING HE DREW CAN BE BUILT, REFUSE THE GESTURE — never emit a bare shell. A shell
        // with no partitions is not "part of his design", it is the generator's starting plate
        // wearing his design's name, and shipping it would answer the founder's objection with the
        // very thing he objected to.
        //
        // ⭐ THE SENTENCE IS COMPOSED ONCE. See `roomSetOutcomeSentence` for why five per-room
        // copies of the set-level clause was the defect and not the style.
        // ⭐ §SHELL-WITHOUT-ROOMS (L-13250) — `rooms.length > 0` IS THE WHOLE OF THE CHANGE HERE.
        // The guard above is RIGHT when the user DREW rooms and every one of them failed: building
        // a bare shell then really would be the generator's plate wearing his design's name. It is
        // WRONG when he drew NONE — there is no design being substituted, the shell IS the ask
        // (founder: *"it should work for walls/slabs, minimum"*), and `0 of 0 rooms refused` is not
        // a failure to report. Note the old sentence it produced: *"Every one of your 0 room
        // envelopes will be built"* — the arithmetic was already telling us this branch was being
        // asked a question that did not apply.
        if (rooms.length > 0 && builtRooms.length === 0) {
            return refuse('every-room-refused',
                `${roomSetOutcomeSentence(refusedRooms.length, rooms.length)} PRYZM will not build the `
                + 'shell on its own — a bare plate is not the design you drew. '
                + refusedRooms.map((r) => r.text).join(' ')
                + ' Fix or delete the named room envelope'
                + `${refusedRooms.length === 1 ? '' : 's'} and try again. Nothing has been created.`);
        }

        const partitionWallCount = walls.length - shellWallCount;
        const roomsAreaM2 = round2(builtRooms.reduce((s, r) => s + r.areaM2, 0));

        // ── 4. THE FLOOR PLATES — one per built storey, on the storey's own level ─────────────
        const slabs: readonly PlannedSlab[] = Object.freeze(built.map((s) => ({
            boundary: Object.freeze([...s.ring]),
            thicknessM: slabThickness,
            baseOffsetM: 0,
            levelId: s.levelId,
            storeyIndex: s.index,
            derivedFrom: {
                envelopeId: s.plate.id,
                envelopeRole: 'level' as const,
                edgeIndex: -1,   // the SLAB derives from the whole ring, not from one edge.
                ringWelded: s.welded,
            },
        })));

        // ── 5. THE CEILINGS — one per built room, at its storey's CLEAR height ────────────────
        // ⛔ NOT THE RAW FLOOR-TO-FLOOR. `clearCeilingHeightFromFtf` is the resi pipeline's own
        // producer and reserves the service zone below the slab above; passing the storey height
        // verbatim is the exact defect §RESI-CEILING-CLEARHEIGHT was written to remove.
        const ceilings: readonly PlannedCeiling[] = Object.freeze(builtRooms.map((r) => {
            const s = built[r.storeyIndex]!;
            const src = orderedRooms.find((e) => e.id === r.envelopeId)!;
            const ready = wallReady(src.footprint ?? []);
            const boundary = ready.ok ? ready.value.ring : (src.footprint ?? []);
            return {
                boundary: Object.freeze([...boundary]),
                ceilingHeightM: round3(clearCeilingHeightFromFtf(s.floorToFloorM)),
                thicknessM: ceilingThickness,
                levelId: s.levelId,
                storeyIndex: s.index,
                derivedFrom: {
                    envelopeId: r.envelopeId,
                    envelopeRole: 'room' as const,
                    edgeIndex: -1,   // a ceiling derives from the whole ring, not from one edge.
                    ringWelded: ready.ok ? ready.value.welded : false,
                },
            };
        }));

        const storeys: readonly PlannedStorey[] = Object.freeze(built.map((s) => ({
            index: s.index,
            plateEnvelopeId: s.plate.id,
            plateName: s.plate.name,
            levelId: s.levelId,
            levelIdSource: s.levelIdSource,
            baseOffsetM: round1(s.plate.baseOffset),
            floorToFloorM: s.floorToFloorM,
            footprintAreaM2: round2(s.areaM2),
            shellWallCount: s.ring.length,
            partitionWallCount: s.partitionCount,
            roomCount: s.rooms.length,
        })));

        const lowest = built[0]!;
        const storeyLabel = (s: PlannedStorey): string =>
            `"${s.plateName ?? s.plateEnvelopeId}" (${s.footprintAreaM2} m²) at ${s.baseOffsetM} m `
            + `on level "${s.levelId}"`;

        // ⛔ ONE ENTRY PER BATCH ACTUALLY DISPATCHED — computed, never the literal "TWO". Walls,
        // slabs and ceilings are each ONE command however many storeys, because all three batch
        // handlers honour a PER-ENTRY `levelId`.
        const undoStepCount =
            (walls.length > 0 ? 1 : 0) + (slabs.length > 0 ? 1 : 0) + (ceilings.length > 0 ? 1 : 0);

        // ── 6. WHAT THE SENTENCE BEFORE THE CLICK SAYS ────────────────────────────────────────
        const willCreate: readonly string[] = Object.freeze([
            `${storeys.length} storey${storeys.length === 1 ? '' : 's'} — `
                + `${storeys.map(storeyLabel).join(', ')}. No NEW project level is created: every storey `
                + 'you drew already exists, and this pass builds onto the ones your plates name.',
            `${shellWallCount} exterior shell wall${shellWallCount === 1 ? '' : 's'} across `
                + `${storeys.length} storey${storeys.length === 1 ? '' : 's'}, one per edge of each level `
                + `envelope, ${round2(shellThickness)} m thick`,
            `${partitionWallCount} interior partition${partitionWallCount === 1 ? '' : 's'} from `
                + `${builtRooms.length} room envelope${builtRooms.length === 1 ? '' : 's'} `
                + `(${round1(roomsAreaM2)} m²), ${round2(partitionThickness)} m thick`,
            `${slabs.length} floor slab${slabs.length === 1 ? '' : 's'} — one on each storey's own `
                + `footprint, ${round2(slabThickness)} m thick`,
            `${ceilings.length} ceiling${ceilings.length === 1 ? '' : 's'} — one over each room you drew, `
                + `at its storey's finished clear height (${round2(ceilings[0]?.ceilingHeightM ?? 0)} m on `
                + `the lowest storey), ${round2(ceilingThickness)} m thick`,
        ]);

        const advisories: string[] = [];
        advisories.push(
            'PRYZM builds the design you drew and proposes nothing of its own — no layout is '
            + 'generated, because you already made one.');
        if (storeys.length > 1) {
            advisories.push(
                `Every storey you drew is built, each on its own project level and at its own `
                + `floor-to-floor: ${storeys.map((s) => `${s.plateName ?? s.plateEnvelopeId} `
                    + `(${s.roomCount} room${s.roomCount === 1 ? '' : 's'}, ${round1(s.floorToFloorM)} m)`)
                    .join(', ')}.`);
        }
        if (droppedOnShellCount > 0) {
            advisories.push(
                `${droppedOnShellCount} room edge${droppedOnShellCount === 1 ? '' : 's'} `
                + `${droppedOnShellCount === 1 ? 'lies' : 'lie'} on their level envelope's perimeter `
                + `and `
                + `${droppedOnShellCount === 1 ? 'is' : 'are'} already carried by a shell wall — `
                + 'they do not become a second wall in the same place.');
        }
        if (dedupedPartitionCount > 0) {
            advisories.push(
                `${dedupedPartitionCount} boundary shared between two rooms on the same storey became ONE `
                + 'partition rather than two walls face to face. Two rooms whose shared edge was drawn '
                + 'more than 1 mm apart are NOT merged — PRYZM will not move your geometry to tidy it. '
                + 'Rooms on DIFFERENT storeys are never merged, however identical their rings.');
        }
        if (weldedPlateNotes.length > 0 || weldedRoomNotes.length > 0) {
            advisories.push(
                'Some rings were simplified so their edges could become wall baselines — '
                + [...weldedPlateNotes, ...weldedRoomNotes].join(' '));
        }
        if (refusedRooms.length > 0) {
            advisories.push(roomSetOutcomeSentence(refusedRooms.length, rooms.length));
        }
        if (refusedStoreys.length > 0) {
            advisories.push(
                `${refusedStoreys.length} of your ${sortedLevels.length} level envelopes `
                + `${refusedStoreys.length === 1 ? 'is' : 'are'} NOT built: `
                + refusedStoreys.map((r) => r.text).join(' '));
        }
        const seatedOnActive = storeys.filter((s) => s.levelIdSource === 'active-level');
        if (seatedOnActive.length > 0) {
            advisories.push(
                `${seatedOnActive.length} level envelope${seatedOnActive.length === 1 ? '' : 's'} `
                + `${seatedOnActive.length === 1 ? 'names' : 'name'} no storey of its own, so it is built `
                + `on the ACTIVE level "${activeLevelId}". If that is not the storey you meant, switch `
                + 'the active level before building.');
        }
        advisories.push(
            `Undo takes ${undoStepCount === 1 ? 'ONE step' : `${undoStepCount} steps`}, not one gesture: `
            + 'the walls are one command, the slabs are another and the ceilings are a third. Each is a '
            + 'single batch however many storeys it covers, so the count does not grow with the '
            + 'building. This is the smallest honest number.');
        advisories.push(
            'Your envelopes are left exactly where they are, so the panel can go on comparing what you '
            + 'intended with what has been built.');

        span.setAttribute('pryzm.buildFromDesign.arm', 'ok');
        span.setAttribute('pryzm.buildFromDesign.storeys', storeys.length);
        span.setAttribute('pryzm.buildFromDesign.shellWalls', shellWallCount);
        span.setAttribute('pryzm.buildFromDesign.partitions', partitionWallCount);
        span.setAttribute('pryzm.buildFromDesign.slabs', slabs.length);
        span.setAttribute('pryzm.buildFromDesign.ceilings', ceilings.length);
        span.setAttribute('pryzm.buildFromDesign.roomsRefused', refusedRooms.length);
        span.setAttribute('pryzm.buildFromDesign.storeysRefused', refusedStoreys.length);
        return {
            ok: true,
            plan: {
                levelId: lowest.levelId,
                sourceEnvelopeId: lowest.plate.id,
                sourceEnvelopeName: lowest.plate.name,
                footprintAreaM2: round2(lowest.areaM2),
                floorToFloorM: lowest.floorToFloorM,
                storeyCount: storeys.length,
                storeys,
                refusedStoreys: Object.freeze(refusedStoreys),
                walls: Object.freeze(walls),
                shellWallCount,
                partitionWallCount,
                droppedOnShellCount,
                dedupedPartitionCount,
                slabs,
                ceilings,
                rooms: Object.freeze(builtRooms),
                refusedRooms: Object.freeze(refusedRooms),
                roomsAreaM2,
                undoStepCount,
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
