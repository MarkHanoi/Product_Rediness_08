/**
 * stairByWalls — §FEAT-STAIR-BY-WALLS (founder, 2026-08-19), L-1455.
 *
 * THE FOUNDER, verbatim: *"…or **select 2 walls** [and] create the stair in
 * **L shape against the walls**."*
 *
 * ── THIS IS `By Slab`, FOR STAIRS. IT IS NOT A NEW IDEA. ─────────────────────
 *
 * The wall tool (`elementCreationMatrix` :248) and the railing (:390) already ship
 * `{ id: 'byslab', …, isAction: true }`: a pill that DERIVES the sketch from geometry
 * that already exists instead of from clicks. `bywall` is that pattern, mirrored —
 * same lowercase no-hyphen id form, same `isAction`, same pre-activation SELECTION
 * SNAPSHOT (`captureHandrailBySlabSelection`'s twin), for the same reason L-1103
 * records: `ToolManager.activateTool` calls `selectionManager.setEnabled(false)`, so a
 * By-* mode that reads the LIVE selection after activation is asking a question whose
 * answer activation destroyed — unsatisfiable, not flaky.
 *
 * ── WHY THIS MODULE RECORDS **NO RELATIONSHIP** ON THE CREATED STAIR ─────────
 *
 * ⭐ MEASURED, not assumed. Neither wall's nor railing's `byslab` records an edge back
 * to the source slab: `handrailAuthoring.setHandrailBySlabTarget` holds a transient
 * `_pendingBySlabId` that is consumed at creation and discarded, and the created
 * elements carry no `sourceSlabId`. By Slab is an AUTHORING-TIME derivation, not a
 * persisted association, and `bywall` mirrors it exactly.
 *
 * That is also what the contracts require. [C78](../../../../../../docs/02-decisions/contracts/C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md)
 * §3.1 states that **C71 owns the relationship vocabulary and C78 owns nothing of it**,
 * so the question routes to [C71](../../../../../../docs/02-decisions/contracts/C71-GRAPH-AND-TOPOLOGY.md)
 * §2 — the REQUIRED nine plus the PARKED twelve. **None of the nine is
 * "the walls this stair was authored against"**: `boundedBy` is room ↔ wall,
 * `hostedBy` is the opening-in-host pair, `sitsOn` is dependency scheduling.
 * Minting a new member would fall under C71 §2.6, which requires a writer, a **typed
 * reader**, a rebuild disposition and a delete behaviour **in one PR** — and C71 §2.5
 * rules a writer-first addition *"a defect, not progress"*. There is no reader for this
 * edge, so **the correct action is to record nothing**, which is also the precedent.
 * ⛔ Do not add a `sourceWallIds` field here without a reader; that would be C78 §3.3's
 * forbidden third state — a field naming a dependency that nothing honours.
 *
 * ── REFUSALS CARRY BOTH NUMBERS ─────────────────────────────────────────────
 *
 * Founder's standing direction: open language, and safety is rule gates refusing with
 * BOTH numbers — the value found AND the value required. Every refusal below carries
 * `found` and `required` as machine-readable fields, and the message states both, in
 * the units an architect thinks in.
 *
 * Pure: no DOM, no THREE, no store reads, no I/O — the caller supplies the walls.
 */

import { resolveStairGeometryLimits } from '@pryzm/geometry-stair';

/** A point in the world XZ plane. Y is the level elevation and is not used here. */
export interface PlanPoint {
    readonly x: number;
    readonly z: number;
}

/** The slice of a wall record this planner needs. */
export interface ByWallsWall {
    readonly id: string;
    /** `WallData.baseLine` — a horizontal `[Point3D, Point3D]` tuple. */
    readonly baseLine: readonly [{ x: number; z: number }, { x: number; z: number }];
    /** Wall thickness in metres. Absent ⇒ treated as 0 (the stair hugs the centreline). */
    readonly thickness?: number;
}

export interface ByWallsRequest {
    /** The walls the architect had selected when the tool was activated. */
    readonly walls: readonly ByWallsWall[];
    /** Floor-to-floor height the stair must climb, in metres. */
    readonly storeyHeight: number;
    /** Stair width in metres — sets how far off each wall face the runs sit. */
    readonly stairWidth: number;
}

export type ByWallsRefusalCode =
    | 'WALL_COUNT'
    | 'NOT_PERPENDICULAR'
    | 'NO_SHARED_CORNER'
    | 'RUN_TOO_SHORT';

export interface ByWallsRefusal {
    readonly ok: false;
    readonly code: ByWallsRefusalCode;
    /** The value MEASURED. */
    readonly found: number;
    /** The value REQUIRED. Both are stated in `message`; both are here for callers. */
    readonly required: number;
    /** The unit both numbers are in, so a caller never has to guess. */
    readonly unit: 'walls' | 'degrees' | 'metres';
    readonly message: string;
}

export interface ByWallsPlan {
    readonly ok: true;
    /** Always `L` — two runs against two perpendicular walls IS an L-shaped stair. */
    readonly shape: 'L';
    /**
     * The three sketch points, in click order: the START of run 1, the LANDING at the
     * inner corner, and the END of run 2. Feeding these to the stair-path tool is
     * byte-identical to the architect clicking them, so By Walls inherits the solver,
     * the geometry limits and the refusals of the hand-drawn path (C84 EI-3: the mode
     * cannot offer a stair the command would reject, because it uses the same commit).
     */
    readonly points: readonly [PlanPoint, PlanPoint, PlanPoint];
    /**
     * ⭐ DERIVED, NOT CHOSEN — and this answers a real design question. In the
     * hand-drawn flow the architect picks the second run's side from the param panel.
     * Against two walls there is only one quadrant the stair can occupy, so the side
     * follows from the corner's handedness. A picker offering a choice the geometry
     * has already made is a control that lies.
     */
    readonly secondRunSide: 'left' | 'right';
    /** Run lengths actually planned, metres — reported so a caller can explain itself. */
    readonly run1Length: number;
    readonly run2Length: number;
}

export type ByWallsOutcome = ByWallsPlan | ByWallsRefusal;

/**
 * How far from 90° two walls may be and still take an L-shaped stair.
 *
 * ⚠ THIS IS A DOMAIN BAND, NOT AN EPSILON (C73 §2.1). Walls drawn in the wall tool's
 * ORTHO mode are exactly 90° apart; walls drawn in LINEAR mode are whatever the
 * architect drew, and a 3 mm mouse tremor over a 6 m wall is ~0.03°. 5° tolerates the
 * hand and refuses the intent: at 85° the two runs still meet in a rectangular
 * landing, at 80° they do not.
 */
export const BY_WALLS_PERPENDICULAR_TOLERANCE_DEG = 5;

/**
 * How far the two walls' baselines may miss each other and still be called a corner.
 * A DOMAIN BAND again: two walls that meet are typically welded to a shared junction
 * (`joinedTo`, C71 §3) and miss by 0; 0.5 m tolerates a wall drawn short of its
 * neighbour without accepting two walls across the room from each other.
 */
export const BY_WALLS_CORNER_TOLERANCE_M = 0.5;

/** Clear space kept between the stair and the far end of each wall. */
const RUN_END_SETBACK_M = 0.0;

const sub = (a: PlanPoint, b: PlanPoint): PlanPoint => ({ x: a.x - b.x, z: a.z - b.z });
const len = (v: PlanPoint): number => Math.hypot(v.x, v.z);
const unit = (v: PlanPoint): PlanPoint => {
    const l = len(v);
    return l < 1e-12 ? { x: 0, z: 0 } : { x: v.x / l, z: v.z / l };
};
const dot = (a: PlanPoint, b: PlanPoint): number => a.x * b.x + a.z * b.z;
const cross = (a: PlanPoint, b: PlanPoint): number => a.x * b.z - a.z * b.x;
const add = (a: PlanPoint, b: PlanPoint, s = 1): PlanPoint => ({ x: a.x + b.x * s, z: a.z + b.z * s });
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Nearest point on segment `[a,b]` to `p`, and the distance to it. */
function distanceToSegment(p: PlanPoint, a: PlanPoint, b: PlanPoint): number {
    const ab = sub(b, a);
    const l2 = dot(ab, ab);
    if (l2 < 1e-12) return len(sub(p, a));
    const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
    return len(sub(p, add(a, ab, t)));
}

/**
 * Plan an L-shaped stair standing in the corner of two perpendicular walls.
 *
 * Returns EITHER a three-point sketch OR a refusal carrying both numbers. It never
 * throws and never returns a partial plan: "these walls will not take a stair" and
 * "here is the stair" are different values, never the same empty one.
 */
export function planStairByWalls(req: ByWallsRequest): ByWallsOutcome {
    // ── 1. Exactly two walls ─────────────────────────────────────────────────
    if (req.walls.length !== 2) {
        return {
            ok: false,
            code: 'WALL_COUNT',
            found: req.walls.length,
            required: 2,
            unit: 'walls',
            message:
                `By Walls builds an L-shaped stair in the corner of TWO walls — ` +
                `${req.walls.length} ${req.walls.length === 1 ? 'is' : 'are'} selected, 2 are required. ` +
                `Select both walls before activating the stair tool: activating it clears the selection.`,
        };
    }

    const [w1, w2] = req.walls;
    const a1 = { x: w1.baseLine[0].x, z: w1.baseLine[0].z };
    const b1 = { x: w1.baseLine[1].x, z: w1.baseLine[1].z };
    const a2 = { x: w2.baseLine[0].x, z: w2.baseLine[0].z };
    const b2 = { x: w2.baseLine[1].x, z: w2.baseLine[1].z };

    const d1 = unit(sub(b1, a1));
    const d2 = unit(sub(b2, a2));

    // ── 2. Perpendicular, within the band ────────────────────────────────────
    // acos(|d1·d2|) is the UNSIGNED angle between the two lines in [0°, 90°]:
    // 90° = perpendicular, 0° = parallel. Direction of drawing is irrelevant, which
    // is why the absolute value is taken — a wall drawn "backwards" is the same wall.
    const between = Math.acos(Math.min(1, Math.abs(dot(d1, d2)))) * (180 / Math.PI);
    if (Math.abs(90 - between) > BY_WALLS_PERPENDICULAR_TOLERANCE_DEG) {
        return {
            ok: false,
            code: 'NOT_PERPENDICULAR',
            found: round2(between),
            required: 90,
            unit: 'degrees',
            message:
                `These two walls meet at ${round2(between)}°, and an L-shaped stair against them ` +
                `requires 90° (± ${BY_WALLS_PERPENDICULAR_TOLERANCE_DEG}°). ` +
                `An L-stair's landing is a rectangle: against walls ${round2(between)}° apart there is ` +
                `no square corner for it to sit in, so the run that turns would leave the wall it is ` +
                `meant to follow. Draw the walls in Orthogonal mode, or draw the stair by hand.`,
        };
    }

    // ── 3. They actually share a corner ──────────────────────────────────────
    // Intersect the two infinite lines, then require the crossing to lie ON (or very
    // near) BOTH segments. Two perpendicular walls at opposite ends of a building
    // still intersect as LINES; that is not a corner and must not read as one.
    const denom = cross(d1, d2);
    // |denom| = |sin(between)| >= sin(85°) ≈ 0.996 after the check above, so this
    // cannot divide by ~0. The guard is kept because the invariant lives one branch away.
    if (Math.abs(denom) < 1e-9) {
        return {
            ok: false,
            code: 'NOT_PERPENDICULAR',
            found: round2(between),
            required: 90,
            unit: 'degrees',
            message: `These two walls are parallel (${round2(between)}° apart, 90° required) and form no corner.`,
        };
    }
    const t = cross(sub(a2, a1), d2) / denom;
    const corner: PlanPoint = add(a1, d1, t);

    const miss = Math.max(distanceToSegment(corner, a1, b1), distanceToSegment(corner, a2, b2));
    if (miss > BY_WALLS_CORNER_TOLERANCE_M) {
        return {
            ok: false,
            code: 'NO_SHARED_CORNER',
            found: round2(miss),
            required: BY_WALLS_CORNER_TOLERANCE_M,
            unit: 'metres',
            message:
                `These two walls are perpendicular but do not meet: their corner falls ${round2(miss)} m ` +
                `away from the nearer wall, and ${BY_WALLS_CORNER_TOLERANCE_M} m is the most that can be ` +
                `treated as one corner. By Walls builds the stair IN a corner; there is no corner here.`,
        };
    }

    // ── 4. Which way does each run travel, and how much wall is there? ───────
    // Away from the corner, toward each wall's FAR end. This is derivation, not a
    // choice: the wall exists on exactly one side of the corner.
    const far1 = len(sub(b1, corner)) >= len(sub(a1, corner)) ? b1 : a1;
    const far2 = len(sub(b2, corner)) >= len(sub(a2, corner)) ? b2 : a2;
    const u1 = unit(sub(far1, corner));
    const u2 = unit(sub(far2, corner));

    // The stair sits in the quadrant both walls bound, offset off each wall's FACE by
    // half its thickness plus half the stair's width.
    const off1 = (w1.thickness ?? 0) / 2 + req.stairWidth / 2;   // off wall 1, along u2
    const off2 = (w2.thickness ?? 0) / 2 + req.stairWidth / 2;   // off wall 2, along u1
    const inner = add(add(corner, u1, off2), u2, off1);

    const avail1 = Math.max(0, len(sub(far1, corner)) - off2 - RUN_END_SETBACK_M);
    const avail2 = Math.max(0, len(sub(far2, corner)) - off1 - RUN_END_SETBACK_M);

    // ── 5. Will the stair FIT? Both numbers, from the ONE limit authority ────
    // ⛔ The minima are NOT re-declared here. `resolveStairGeometryLimits()` is
    // §STAIR-ONE-LIMIT-AUTHORITY (L-1430) — the same module the sketch solver and
    // `CreateStairCommand.canExecute` read, so a plan this function accepts cannot be
    // refused downstream for a tread the two layers measured differently. That was a
    // live C84 EI-3 breach in this very family.
    const limits = resolveStairGeometryLimits();
    const midRiser = (limits.minRiserHeight + limits.maxRiserHeight) / 2;
    const risers = Math.max(2, Math.round(req.storeyHeight / midRiser));
    // An L-stair's landing consumes one going's worth of plan depth at the turn.
    const goings = Math.max(1, risers - 1);

    const minGoing = goings * limits.minTreadDepth;
    const maxGoing = goings * limits.maxTreadDepth;
    const availTotal = avail1 + avail2;

    if (availTotal < minGoing) {
        return {
            ok: false,
            code: 'RUN_TOO_SHORT',
            found: round2(availTotal),
            required: round2(minGoing),
            unit: 'metres',
            message:
                `There is ${round2(availTotal)} m of wall to run against, and this stair needs ` +
                `${round2(minGoing)} m. Climbing ${round2(req.storeyHeight)} m takes ${risers} risers, and ` +
                `${goings} goings at the ${Math.round(limits.minTreadDepth * 1000)} mm minimum tread ` +
                `is ${round2(minGoing)} m. Use longer walls, or draw the stair by hand across the room.`,
        };
    }

    // Spend the available wall, but never more going than the maximum tread allows —
    // an over-long run is refused by the command for tread depth, so producing one
    // here would be offering a stair the pipeline rejects.
    const totalGoing = Math.min(availTotal, maxGoing);
    // Split proportionally to what each wall offers, then clamp to what it has.
    const share1 = Math.min(avail1, totalGoing * (avail1 / availTotal));
    const run1Length = share1;
    const run2Length = Math.min(avail2, totalGoing - share1);

    return {
        ok: true,
        shape: 'L',
        points: [
            add(inner, u1, run1Length),   // start of run 1, out along wall 1
            inner,                        // the landing, in the corner
            add(inner, u2, run2Length),   // end of run 2, out along wall 2
        ],
        // Handedness of the corner: positive cross ⇒ run 2 turns one way, negative the
        // other. Derived from the walls, never asked of the architect.
        secondRunSide: cross(u1, u2) > 0 ? 'right' : 'left',
        run1Length,
        run2Length,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// §FEAT-STAIR-BY-WALLS — THE ARM (L-1456), added 2026-08-20.
//
// The planner above answers "what stair do these two walls imply?". Everything
// below is how the architect's two clicks reach it, and how the result reaches the
// tool that already knows how to commit a stair.
//
// ⭐ THE BLOCKER THAT DID NOT BIND, RECORDED BECAUSE THE MEASUREMENT WAS RIGHT AND
// THE CONCLUSION FROM IT WAS WRONG. This module first shipped WITHOUT an arm, on the
// measured ground that "there is no multi-select id accessor" —
// `selectionManager.selectedObject` is singular and `grep selectedElementIds` across
// `apps/` + `packages/` returns ONE hit, in a Zod schema. Both facts hold.
//
// But they block ONE of the two routes, not the feature. They block the SNAPSHOT
// route — "read the two walls the architect had already selected". They do not touch
// the PICK route, and `_pickSlabThen` — this lane's own cited precedent — already
// picks ONE object SEQUENTIALLY AFTER activation. Two sequential picks are a
// TWO-STEP version of a one-step flow that exists, not a capability that does not.
//
// ⚠ The general lesson, which is why this paragraph is here and not in a commit
// message: *a measurement that is true can still be the wrong measurement.* "No
// multi-select API" was true, and it answered a question the feature never asked.
// ─────────────────────────────────────────────────────────────────────────────

/** What a pick offer did — reported so the caller can update its prompt honestly. */
export type ByWallsPickOutcome =
    | 'ignored'    // not a wall, or no id — the click was not about us
    | 'duplicate'  // the SAME wall clicked twice; the count must not advance
    | 'accepted'   // counted, more still needed
    | 'complete';  // counted, and the session now has everything it needs

/**
 * The two-step pick state machine, extracted from the DOM so it can be tested
 * without one.
 *
 * ⭐ DUPLICATE REJECTION IS THE WHOLE REASON THIS IS A CLASS AND NOT A COUNTER.
 * `bim-selection-changed` fires on re-selection, and a wall the architect clicks
 * twice (or that the scene re-emits) would otherwise fill both slots with ONE wall —
 * and `planStairByWalls` would then be handed a "pair" of a wall with itself, whose
 * angle is 0° and which refuses as NOT_PERPENDICULAR. That refusal would be true and
 * completely misleading: the architect picked one wall, not two crooked ones. The
 * count must mean two DISTINCT walls or it means nothing.
 */
export class ByWallsPickSession {
    private readonly _ids: string[] = [];

    constructor(private readonly _required: number = 2) {}

    /** Ids picked so far, in click order. */
    get ids(): readonly string[] { return [...this._ids]; }
    get remaining(): number { return Math.max(0, this._required - this._ids.length); }
    get isComplete(): boolean { return this._ids.length >= this._required; }

    /**
     * Offer a clicked element. `elementType` is compared case-INSENSITIVELY: the
     * fragment builders write `'Wall'` while callers here have historically checked
     * `'wall'`, and `_pickSlabThen` carries the identical note for slabs (C15 §12).
     */
    offer(id: string | undefined, elementType: string | undefined): ByWallsPickOutcome {
        if (this.isComplete) return 'ignored';
        if (!id) return 'ignored';
        if ((elementType ?? '').toLowerCase() !== 'wall') return 'ignored';
        if (this._ids.includes(id)) return 'duplicate';
        this._ids.push(id);
        return this.isComplete ? 'complete' : 'accepted';
    }
}

/**
 * The one-shot handoff between the By-Walls ACTION and the stair-path tool.
 *
 * ⭐ WHY A PENDING PLAN AND NOT A DIRECT COMMAND DISPATCH. The obvious shortcut is to
 * build a `CreateStairCommand` here from the three points. That would mean
 * re-implementing `StairPathAdapter` — the solver, the riser split, the landing, the
 * tread derivation — beside the one that already exists, which is the
 * enumerated-rather-than-derived defect this repo has recorded all week, and it is
 * exactly how the family acquired its 220 mm/250 mm EI-3 breach in the first place.
 * Handing the tool three POINTS makes By Walls byte-identical to the architect
 * clicking them, so it inherits the solver, the geometry limits, the refusals and the
 * undo grouping for free, and cannot drift from the hand-drawn path.
 *
 * ⭐ IT MIRRORS A PATTERN ALREADY IN THE CONSUMER. `StairPathPlanToolHandler` already
 * holds a `_pendingShapeHint` consumed once at activation; this is that, for points.
 *
 * ONE-SHOT BY CONSTRUCTION: `consume` clears. A plan left standing would re-draw a
 * stair the next time the tool activated for any reason — a By-Walls click echoing
 * into an unrelated hand-drawn stair ten minutes later.
 */
let _pendingPlan: ByWallsPlan | null = null;

export function setPendingStairByWallsPlan(plan: ByWallsPlan | null): void {
    _pendingPlan = plan;
}

/** Read AND clear. There is deliberately no peek: a peek invites a double-apply. */
export function consumePendingStairByWallsPlan(): ByWallsPlan | null {
    const p = _pendingPlan;
    _pendingPlan = null;
    return p;
}

/** Test seam + project-switch reset (C48 project isolation). */
export function __resetStairByWallsForTests(): void {
    _pendingPlan = null;
}

export type ByWallsExecution =
    | { readonly ok: true; readonly plan: ByWallsPlan }
    | { readonly ok: false; readonly message: string; readonly code: ByWallsRefusalCode };

/**
 * THE ACTION, as one function: plan, and on success arm the tool.
 *
 * Kept out of `ToolsAreaLayout` on purpose — that file can only be exercised with a
 * whole editor around it, so logic living there is logic no test can reach. The glue
 * left up there is the DOM pick overlay and one activation call; everything that can
 * REFUSE is here, and is tested.
 */
export function executeStairByWalls(req: ByWallsRequest): ByWallsExecution {
    const outcome = planStairByWalls(req);
    if (outcome.ok === false) {
        setPendingStairByWallsPlan(null);   // never leave a stale plan armed after a refusal
        return { ok: false, message: outcome.message, code: outcome.code };
    }
    setPendingStairByWallsPlan(outcome);
    return { ok: true, plan: outcome };
}
