// §R4-R5-PROJECTION (GENERATIVE-QUALITY-MASTER-TRACKER item 1.7 · SPEC-49 §4) —
// THE EMITTED PLAN, PROJECTED ONTO THE 16 VALIDATORS THAT ALREADY EXIST.
//
// ─── WHAT WAS ACTUALLY MISSING ───────────────────────────────────────────────
// Nothing on this path needed to be written twice. `validators/orchestrator.ts`
// already runs all 16 shipped validator slices (8 G-class dimensional = R4, 8
// A-class topology = R5) in one pass and returns one frozen report;
// `layout-adapter.ts` already converts a `DtglLayoutDto` into the orchestrator's
// input; `validate-and-format.ts` already chains adapter → orchestrator →
// formatter. Every one of those was reachable ONLY from its own test file.
//
// The gap was a single hop: **nothing projected a SHIPPED `LayoutOption` into the
// DTO those modules accept.** `layout-adapter.ts` says so in its own header —
// *"the wire-in from the live AI generation path is a future slice"* — and the
// slice never came. So the tracker's R4 and R5 cells read *"no gate — validators
// exist, unwired as a gate"*: authored-but-unwired, the failure mode this repo
// keeps hitting. This module is that hop and nothing more.
//
// ⚠ IT PROJECTS. IT DECIDES NOTHING. No candidate is dropped, no option is
// re-ranked, no geometry moves. Byte-for-byte the same layout ships. Like §CI-0
// before it, this only stops an answer being unavailable to the layer that needs
// it (ADR-0061 invariant I2 — additive).
//
// ─── ⚠ TWO ADJACENCY GRAPHS, BECAUSE THE A-CLASS RULES ARE NOT ONE QUESTION ──
// `AdjacencyEdge` is documented as *"rooms [that] touch (shared wall) OR are
// connected through a door"* — and the eight A-class rules are NOT all defined
// over the same one. Collapsing them into a single edge set would make half of
// them wrong in a direction nobody could see (C75 §1.2 — two distinct facts must
// never print the same value):
//
//   ACCESS graph (`LayoutRoom.doorAdjacentTo` — a REALISED opening)
//     A-1 mandatory · A-2 preferred · A-4 privacy gradient · A-8 sequencing
//     These are about WALKING: "master must be adjacent to ensuite", "a bedroom
//     must have an edge to circulation", "BFS depth from the entrance". A shared
//     wall with no door satisfies none of them, so evaluating them on the wall
//     graph would let a sealed room pass — the exact §CIRCULATION-COMPLIANCE
//     defect SPEC-49 exists to close.
//
//   NUISANCE graph (`LayoutRoom.adjacentTo` — a shared wall, door or not)
//     A-3 forbidden · A-5 acoustic · A-6 wet-cluster
//     These are about what CROSSES A WALL: smell, noise, and plumbing risers.
//     A wc that shares a wall with the dining room is an A-3 defect whether or
//     not a door connects them; evaluating A-3 on the door graph would report it
//     clean. A-6's whole rationale is a shared riser, i.e. a shared wall.
//
//   NEITHER  A-7 frontage-topology reads no edges at all (it reads
//     `hasExteriorEdge`, which is NOT MEASURED here — see below).
//
// The caller runs the orchestrator TWICE, once per graph, and keeps each class
// from the graph that class is defined over. Both DTOs are returned here, built
// from the same rooms, so the two runs can never disagree about anything except
// the edges.
//
// ─── ⚠ THE VOCABULARY BRIDGE, AND WHY ITS ABSENCE WOULD HAVE BEEN A FALSE PASS ─
// The engine's `RoomType` union spells the entrance lobby `hall`, the principal
// bedroom `master`, the social room `living`. The A-class tables spell them
// `entrance_hall`, `master_bedroom`, `living_room`. `limits.ts` (G-class) already
// carries BOTH spellings and says so in-line; the A-class tables carry only the
// framework one, except A-7 and A-8 which carry both.
//
// So a projection that passed the engine's raw `type` through would have made
// A-1, A-2, A-3, A-4 and A-5 match NOTHING and report a serene zero — a clean
// bill of health minted by a spelling mismatch. That is precisely SPEC-49 §7's
// second recorded instrument defect (`{minX,minZ}` vs `{x0,z0}`: 0/288 on all
// three arms, and only the negative control caught it). `FRAMEWORK_TYPE_OF` is
// therefore EXHAUSTIVE over `RoomType` — a new room type fails to compile — and
// the gate that consumes this module watches each mapped class fire on a planted
// defect before its silence is allowed to mean anything.
//
// ─── ⚠ NOT MEASURED IS NOT ZERO (§L-909(b), C70 §2.2, C78 §1.4) ─────────────
// `externalFrontageM`, `hasExteriorEdge` and `glazedAreaM2` are NOT derivable
// from a `LayoutOption`: it carries `windowCount`, and a COUNT is not an AREA.
// They are left `undefined`, which the orchestrator reads as NOT MEASURED — G-7,
// G-10 and A-7 then SKIP and record a `NotMeasuredNote` rather than firing on a
// defaulted zero. The adapter's own header records what happened the last time
// this was defaulted: the founder's generated apartment carried nine emitted
// windows and printed *"glazed-to-floor ratio 0.000"* ×5. Do not "improve
// coverage" by supplying a placeholder here.
//
// `longestUsableWallM` is likewise not measurable without the opening set, so it
// takes the documented CONSERVATIVE fallback `max(widthM, lengthM)` — the whole
// longest wall assumed free. That direction can only UNDER-report G-5, never
// invent a violation, and it is named in the consuming gate's UNPROVEN block. It
// is a floor, not a reading.
//
// ─── ⚠ ROOM ID IS THE DISPLAY NAME, AND THAT IS A GUARDED RISK, NOT A FIX ────
// `LayoutRoom` carries no id — the emit-time space ids live on `emitGeometry`'s
// parallel `spaceSourceIds` array, which does not travel on `LayoutOption`. So
// the projection keys on `name`, which is safe ONLY because §DUP-NAME-UNIQUE
// mints a unique display name per space. SPEC-49 §7 records that as a GUARD, not
// a fix. This module therefore DETECTS a duplicate rather than trusting the
// guard: `duplicateNames` is non-empty ⇒ the projection is UNSAFE for that
// option and the caller must treat it as a finding, never as a clean reading.
//
// PURE L2: no I/O, no THREE, no DOM, no RNG, no Date. Same option ⇒ same output.

import type { LayoutOption, LayoutRoom, RoomType } from '../types.js';
import type { DtglLayoutDto, DtglLayoutEdge } from './layout-adapter.js';
import {
    polygonBBox,
    principalAxisAngle,
    rectDepth,
    rectWidth,
    rotatePoly,
    type Pt,
} from '../tgl/rectDecomposition.js';

// ── The vocabulary bridge ────────────────────────────────────────────────────

/**
 * Engine `RoomType` → the validator framework's type vocabulary.
 *
 * EXHAUSTIVE BY CONSTRUCTION: typed as `Record<RoomType, string>`, so adding a
 * member to the union breaks the build here rather than silently producing a
 * type no rule matches. Five entries are genuine renames; the rest are identity
 * because the two vocabularies already agree.
 *
 * ⚠ `stair` and `open_plan` map to themselves and appear in NO rule table and
 * NO row of `limits.ts`. Every validator therefore SKIPS them. That is reported
 * by {@link LayoutOptionProjection.unruledTypes} rather than left to read as
 * coverage — a room nobody has a rule for is not a room that passed.
 */
export const FRAMEWORK_TYPE_OF: Readonly<Record<RoomType, string>> = {
    // ── genuine renames — without these, A-1…A-5 match nothing ──────────────
    master: 'master_bedroom',
    living: 'living_room',
    dining: 'dining_room',
    hall: 'entrance_hall',
    utility: 'utility_room',
    study: 'private_office',
    // ── already identical in both vocabularies ─────────────────────────────
    bedroom: 'bedroom',
    kitchen: 'kitchen',
    bathroom: 'bathroom',
    ensuite: 'ensuite',
    wc: 'wc',
    corridor: 'corridor',
    balcony: 'balcony',
    storage: 'storage',
    // ── mapped to themselves; NO rule table and NO limits row covers these ──
    stair: 'stair',
    open_plan: 'open_plan',
};

/** Types that reach the validators but match no rule table and no `limits.ts`
 *  row, so every class skips them. Named so the gate can print them. */
const UNRULED_FRAMEWORK_TYPES: ReadonlySet<string> = new Set(['stair', 'open_plan']);

// ── Plan dimensions, measured from the emitted polygon ───────────────────────

/**
 * A room's plan dimensions can be MEASURED, APPROXIMATED, or neither. The three
 * are different facts and the projection keeps them apart.
 *
 * `measured`     — the polygon is a rectangle in its own principal frame (fill ≥
 *                  {@link RECT_FILL_FLOOR}), so its oriented bounding box IS the
 *                  room. `widthM` / `lengthM` are exact.
 * `approximated` — the polygon is sheared or L-shaped; the oriented bbox strictly
 *                  CONTAINS it, so `widthM` and `lengthM` are both OVER-stated.
 *                  G-2 (width max) can over-report and G-6 (min circulation
 *                  width) can under-report on these. Counted separately, never
 *                  merged into the clean population.
 * `unmeasurable` — no polygon at all. Dimensions are derived from `area` alone,
 *                  which cannot yield a width; the room is carried for the
 *                  A-class graphs (which need only id + type) and its G-class
 *                  dimensions are the area-square fallback, flagged.
 */
export type PlanDimensionQuality = 'measured' | 'approximated' | 'unmeasurable';

/**
 * How completely a room's polygon must fill its oriented bounding box before the
 * bbox is accepted as the room's true plan rectangle.
 *
 * 0.98, not 1.0: `emitGeometry` rounds vertices to micrometre precision and the
 * option is rotated back out of the engine's working frame, so an exact equality
 * would classify every real rectangle as sheared. Chosen ABOVE the engine's own
 * `rectifyConvexQuad` floor of 0.5 deliberately — that floor exists to decide
 * whether to TILE a quad, a far more forgiving question than whether a measured
 * width may be quoted as fact.
 */
export const RECT_FILL_FLOOR = 0.98;

interface PlanDims {
    readonly widthM: number;
    readonly lengthM: number;
    readonly quality: PlanDimensionQuality;
}

/** Shoelace area of a polygon, in the units of its coordinates. */
function polyArea(poly: readonly Pt[]): number {
    let a2 = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
        a2 += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a2) / 2;
}

/**
 * Measure a room's shorter and longer plan dimension from its emitted polygon.
 *
 * The polygon is rotated onto its own dominant-edge frame with the engine's own
 * `principalAxisAngle` (the existing solver — this does not re-derive one) before
 * the bbox is taken, so a room on a rotated plate is measured on its own axes
 * rather than on the world's.
 */
export function planDimensionsOf(room: LayoutRoom): PlanDims {
    const poly = room.polygon;
    if (!poly || poly.length < 3) {
        // No polygon: the only thing known is the area. A square of that area is
        // the least-wrong single number, and it is flagged so no reader mistakes
        // it for a measurement.
        const side = Math.sqrt(Math.max(0, room.area));
        return { widthM: side, lengthM: side, quality: 'unmeasurable' };
    }
    // `Vec2mm` is {x, y} in MILLIMETRES; `Pt` is {x, z} in the caller's units.
    const inM: Pt[] = poly.map((p) => ({ x: p.x / 1000, z: p.y / 1000 }));
    const angle = principalAxisAngle(inM);
    const aligned = angle === 0 ? inM : rotatePoly(inM, -angle);
    const bb = polygonBBox(aligned);
    const w = rectWidth(bb), d = rectDepth(bb);
    const bboxArea = w * d;
    const fill = bboxArea > 0 ? polyArea(aligned) / bboxArea : 0;
    return {
        widthM: Math.min(w, d),
        lengthM: Math.max(w, d),
        quality: fill >= RECT_FILL_FLOOR ? 'measured' : 'approximated',
    };
}

// ── The projection ───────────────────────────────────────────────────────────

/**
 * The result of projecting one shipped `LayoutOption` onto the validator input.
 *
 * Everything that could not be measured is NAMED on this object. A caller that
 * reads only `access` / `nuisance` and ignores the rest gets a report that is
 * quietly narrower than it looks, which is the defect class this whole programme
 * exists to close.
 */
export interface LayoutOptionProjection {
    /** DTO whose edges are the REALISED DOOR graph — feed A-1/A-2/A-4/A-8. */
    readonly access: DtglLayoutDto;
    /** DTO whose edges are the WALL-SHARING graph — feed A-3/A-5/A-6. */
    readonly nuisance: DtglLayoutDto;
    /** Rooms whose plan rectangle was measured exactly. */
    readonly measuredRooms: readonly string[];
    /** Rooms whose dimensions come from an OVER-stating oriented bbox. */
    readonly approximatedRooms: readonly string[];
    /** Rooms with no polygon at all — dimensions are an area-square fallback. */
    readonly unmeasurableRooms: readonly string[];
    /** Framework types present that NO rule table and NO limits row covers. */
    readonly unruledTypes: readonly string[];
    /** ⚠ Non-empty ⇒ the name-keyed projection is UNSAFE for this option
     *  (SPEC-49 §7). Never read a report built from it as a clean result. */
    readonly duplicateNames: readonly string[];
    /** The entrance room id, when exactly one entrance-hall room exists.
     *  `undefined` ⇒ A-8 sequencing SKIPS rather than guessing. */
    readonly entranceRoomId: string | undefined;
}

/** Symmetric, de-duplicated edge list from a per-room neighbour-name field. */
function edgesFrom(
    rooms: readonly LayoutRoom[],
    pick: (r: LayoutRoom) => readonly string[] | undefined,
): DtglLayoutEdge[] {
    const known = new Set(rooms.map((r) => r.name));
    const seen = new Set<string>();
    const out: DtglLayoutEdge[] = [];
    for (const r of rooms) {
        for (const other of pick(r) ?? []) {
            // A neighbour naming a room that is not in this option is dropped:
            // an edge to a room that does not exist is not an adjacency, and
            // inventing the endpoint would let a rule match a phantom.
            if (!known.has(other) || other === r.name) continue;
            const key = r.name < other ? `${r.name} ${other}` : `${other} ${r.name}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ aId: r.name, bId: other });
        }
    }
    return out;
}

/**
 * Project a SHIPPED `LayoutOption` onto the two validator DTOs.
 *
 * Pure and deterministic. Emits no defaults for anything it cannot measure —
 * see the file header on `undefined` vs `0`.
 */
export function projectLayoutOption(option: LayoutOption): LayoutOptionProjection {
    const rooms: readonly LayoutRoom[] = option.rooms ?? [];

    const nameCounts = new Map<string, number>();
    for (const r of rooms) nameCounts.set(r.name, (nameCounts.get(r.name) ?? 0) + 1);
    const duplicateNames = [...nameCounts.entries()]
        .filter(([, n]) => n > 1)
        .map(([n]) => n)
        .sort();

    const measuredRooms: string[] = [];
    const approximatedRooms: string[] = [];
    const unmeasurableRooms: string[] = [];
    const unruled = new Set<string>();

    const dtoRooms = rooms.map((r) => {
        const dims = planDimensionsOf(r);
        if (dims.quality === 'measured') measuredRooms.push(r.name);
        else if (dims.quality === 'approximated') approximatedRooms.push(r.name);
        else unmeasurableRooms.push(r.name);
        const type = FRAMEWORK_TYPE_OF[r.type] ?? r.type;
        if (UNRULED_FRAMEWORK_TYPES.has(type)) unruled.add(type);
        return {
            id: r.name,
            type,
            areaM2: r.area,
            widthM: dims.widthM,
            lengthM: dims.lengthM,
            // The conservative floor, per the header: the whole longest wall
            // assumed unbroken. Under-reports G-5; never invents a violation.
            longestUsableWallM: dims.lengthM,
            // externalFrontageM / hasExteriorEdge / glazedAreaM2 are DELIBERATELY
            // absent — `undefined` is NOT MEASURED and is a different value from 0.
        };
    });

    // A-8 needs the entrance vertex. Exactly one entrance hall ⇒ use it; zero or
    // several ⇒ leave it undefined so the validator SKIPS instead of guessing at
    // the one fact its whole BFS is anchored on.
    const halls = rooms.filter((r) => r.type === 'hall');
    const entranceRoomId = halls.length === 1 ? halls[0]!.name : undefined;

    const base = { rooms: dtoRooms, ...(entranceRoomId ? { entranceRoomId } : {}) };
    return {
        access: { ...base, edges: edgesFrom(rooms, (r) => r.doorAdjacentTo) },
        nuisance: { ...base, edges: edgesFrom(rooms, (r) => r.adjacentTo) },
        measuredRooms,
        approximatedRooms,
        unmeasurableRooms,
        unruledTypes: [...unruled].sort(),
        duplicateNames,
        entranceRoomId,
    };
}

// ── Which graph each A-class rule is defined over ────────────────────────────

/**
 * The class → graph assignment the file header argues for, as data, so the gate
 * and any future runtime consumer cannot drift apart on it.
 *
 * G-class classes are absent because no dimensional validator reads edges: their
 * result is identical on both runs.
 */
export const TOPOLOGY_CLASS_GRAPH: Readonly<Record<string, 'access' | 'nuisance'>> = {
    'A-1': 'access',    // mandatory adjacency — you must be able to WALK there
    'A-2': 'access',    // preferred adjacency — same question, softer
    'A-3': 'nuisance',  // forbidden adjacency — smell/hygiene crosses a WALL
    'A-4': 'access',    // privacy gradient — "reachable only through"
    'A-5': 'nuisance',  // acoustic separation — noise crosses a WALL
    'A-6': 'nuisance',  // wet cluster — a shared plumbing riser IS a shared wall
    'A-7': 'access',    // reads no edges; either run gives the same answer
    'A-8': 'access',    // sequencing — BFS depth from the entrance, through doors
};
