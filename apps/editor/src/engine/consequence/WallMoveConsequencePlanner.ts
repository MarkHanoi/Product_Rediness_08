// WallMoveConsequencePlanner — R2 of docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md.
//
// The aggregate `wall.move` planner: the SEED (`planOpeningRefit`) generalised into
// the one consequence contract (ADR-0322 §7, `packages/command-bus/src/consequence.ts`),
// composing five branches — opening-refit · junction · violations · regeneration ·
// room-boundary — each returning into the `ConsequencePlan` vocabulary, and each HONEST
// about the branches the substrate cannot yet support (a typed `UNDETERMINED`, never `[]`).
//
// ── WHY THIS FILE LIVES IN apps/editor/src/engine (the composition layer) ────────────
// The consequence CONTRACT lives in `@pryzm/command-bus` (L1) so anything may implement
// it. The `wall.move` PLANNER, however, must reach its inputs:
//   • `planOpeningRefit`     — `@pryzm/geometry-wall`      (L2)
//   • the joinedTo index     — `@pryzm/core-app-model`     (L2, SemanticGraph)
//   • the violation core     — `@pryzm/constraint-solver`  (L2, the mined SpeculativeEngine)
//   • room-boundary          — room store views + RoomTopologyObserver knowledge (L2/L3)
// A planner in command-bus (L1) importing any of those would be an UPWARD import — the
// exact violation `tools/ga-gate/check-layer-boundaries.ts` exits 3 on. apps/editor is L7
// (the top): every one of those edges is DOWNWARD, so this placement adds zero layer
// violations. All heavyweight collaborators are INJECTED (see the interfaces below), so
// the planner is a pure function of (command, context, deps) and is testable with doubles
// in a plain node env — no `window.*`, no singletons at import (only erased `import type`).
//
// ── THE INVARIANT THIS FILE MUST PROVE (ADR-0322 §2, restated) ───────────────────────
// A `ConsequencePlanner` MUST NOT mutate authoritative state. Every read here is over the
// caller-supplied read-only `PlanningContext` views or over CLONES; the move is applied to
// a clone for validation, never to the live record. G-REASON-01 (purity) and G-REASON-02
// (determinism) are the gates; see __tests__/WallMoveConsequencePlanner.spec.ts.
//
// ── PHASE 6b (2026-08-12): the room-boundary branch can now PREDICT AREAS ────────────
// Two changes, both in the room-boundary branch:
//   1. The membership scan read `boundaryWallIds | wallIds | sourceWallIds`. The CANONICAL
//      persisted field is `boundingWallIds` (RoomDataSchema, required). None of the three
//      it scanned is on the stored record, so the branch declared STALE_DERIVED_STATE for
//      a linkage that was in fact present on every real project. Fixed; the old spellings
//      are retained as tolerated aliases (import DTOs use `boundaryWallIds`).
//   2. The branch now consumes an INJECTED pure predictor (`predictRoomGeometry`,
//      @pryzm/room-topology) and feeds the predicted `computed.area` into the AFTER clone
//      of the violations branch — which previously cloned PRE-MOVE rooms on both sides, so
//      `ROOM_MIN_AREA` could never fire on a wall move.
//
// ── R5 (2026-08-12): the metric stopgap is RETIRED ───────────────────────────────────
// Phase 6b's predicted area transition had no typed home, so it rode in
// `regeneration.skipped[].reason` — a field whose NAME means "regeneration we deliberately
// did not perform". `ConsequencePlan` now carries `metrics?: readonly MetricTransition[]`
// (R5, command-bus/src/consequence.ts) and the transitions live THERE, typed
// (`{ elementId, metric, before, after, unit }`), never as a formatted sentence.
// `regeneration.skipped` is back to meaning only what its name says, and is EMPTY for this
// planner — regeneration is a declared blind spot (see `regenerationUndetermined`).

import type {
  ConsequencePlan,
  ConsequencePlanner,
  PlanningContext,
  ImpactDetermination,
  UndeterminedImpact,
  ConsequenceRefusal,
  ViolationRef,
  ElementId,
  MetricTransition,
} from '@pryzm/command-bus';

// Type-only — erased at runtime, so importing them couples nothing and touches no window.
import type { WallData, WallBaseline, OpeningRefitPlan } from '@pryzm/geometry-wall';
import type { JoinedWallsQuery } from '@pryzm/core-app-model';
import type { ValidationResult, ConstraintContext } from '@pryzm/constraint-solver/compliance';
// Phase 6b — the PURE room-geometry recompute. Type-only here; the FUNCTION arrives by
// injection (see `RoomGeometryPredictor`), so the planner stays constructible without it.
import type {
  PredictWall,
  PredictRoom,
  ProposedWallMove,
  PredictRoomGeometryResult,
  RoomGeometryPrediction,
} from '@pryzm/room-topology';

// ─── The command this planner answers for ────────────────────────────────────────────

/**
 * `wall.move` as a SEMANTIC operation — move wall `id` so its centreline becomes
 * `baseLine`. (The `wall.move` bus VERB is a deliberately-refused dead path, L-49 /
 * §FIX-DEAD-MOVE-VERB-REFUSE; the live mutation is `wall.updateBaseline`. The planner
 * reasons about the operation regardless of which verb ultimately dispatches it — the
 * plan is consumed by the executor in R4, it does not dispatch.)
 */
export interface WallMoveCommand {
  readonly type: 'wall.move';
  readonly payload: {
    readonly id: string;
    readonly baseLine: WallBaseline;
  };
}

// ─── Injected collaborators (the substrate, supplied by the composition root) ─────────

/** The opening-refit seed — `WallOccupancyStore.planOpeningRefit`, wrapped, never rewritten. */
export interface OpeningRefitReader {
  planOpeningRefit(candidate: WallData): OpeningRefitPlan;
}

/** The retained junction index reader — `SemanticGraphManager.getJoinedWalls` (ADR-0321). */
export interface JoinedWallsReader {
  getJoinedWalls(wallId: string): JoinedWallsQuery;
}

/** The mined violation core — `constraintEngine.validateAll` (clone → apply → diff). */
export interface ViolationValidator {
  validateAll(ctx: ConstraintContext): ValidationResult[];
}

/**
 * Everything the planner needs beyond the read-only `PlanningContext`. All optional:
 * an ABSENT collaborator is the honest `ENGINE_NOT_AVAILABLE` case, declared as
 * `undetermined`, NOT silently skipped.
 *
 * The pure room-geometry recompute — `predictRoomGeometry` from `@pryzm/room-topology`
 * (Phase 6b). INJECTED, not imported as a value: the planner must stay constructible
 * without it, and an ABSENT predictor is `undetermined{ENGINE_NOT_AVAILABLE}` on the
 * room-boundary branch, never an empty room set.
 */
export type RoomGeometryPredictor = (
  walls: readonly PredictWall[],
  move: ProposedWallMove,
  rooms: readonly PredictRoom[],
) => PredictRoomGeometryResult;

/**
 * Everything the planner needs beyond the read-only `PlanningContext`. All optional:
 * an ABSENT collaborator is the honest `ENGINE_NOT_AVAILABLE` case, declared as
 * `undetermined`, NOT silently skipped.
 */
export interface WallMovePlannerDeps {
  readonly occupancy: OpeningRefitReader;
  readonly joinedWalls?: JoinedWallsReader;
  readonly validator?: ViolationValidator;
  readonly predictRoomGeometry?: RoomGeometryPredictor;
}

// ─── Deterministic hashing (G-REASON-02) ──────────────────────────────────────────────

/**
 * Stable stringify — object keys sorted recursively so equal content hashes equal.
 * Exported (R4): the execution service fingerprints its independent read-back with
 * the SAME serialisation the plan hashed with, so "changed" means the same thing on
 * both sides of the predicted-vs-actual comparison (one algorithm, two consumers —
 * ADR-0322 §6's rule applied to hashing).
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** FNV-1a 32-bit → 8-hex-char string. Deterministic, dependency-free. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Unique + sorted — the ONLY way element sets enter the plan, so ordering is stable. */
function sortedUnique(ids: readonly string[]): ElementId[] {
  return Array.from(new Set(ids)).sort();
}

const determined = (elements: readonly string[]): ImpactDetermination => ({
  kind: 'determined',
  elements: sortedUnique(elements),
});

// ─── The planner ──────────────────────────────────────────────────────────────────────

export class WallMoveConsequencePlanner implements ConsequencePlanner<WallMoveCommand> {
  constructor(private readonly deps: WallMovePlannerDeps) {}

  async plan(command: WallMoveCommand, context: PlanningContext): Promise<ConsequencePlan> {
    const { id, baseLine } = command.payload;

    const wallView = context.getStore('wall');
    const currentWall = wallView?.getById(id) as WallData | null | undefined;

    // State hash — over exactly the authoritative state the plan is computed from, so a
    // stale approval (R6) is detectable. Deterministic (stableStringify) by construction.
    const stateHash = fnv1a(
      stableStringify({
        wall: currentWall ?? null,
        target: baseLine,
        walls: wallView ? [...wallView.getAll()] : [],
      }),
    );

    const undetermined: UndeterminedImpact[] = [];
    const refused: ConsequenceRefusal[] = [];
    const changed: string[] = [];
    const excluded: string[] = [];
    const topologyModified: string[] = [];

    // The moved wall itself always changes.
    changed.push(id);

    // Guard: the payload names a wall the view does not hold. `direct` still names it
    // (the payload's own subject), but every branch that reads the record cannot answer.
    if (!currentWall) {
      undetermined.push({
        scope: `opening-refit / junction / room-boundary of wall ${id}`,
        reason: 'STALE_DERIVED_STATE',
        detail: `wall ${id} is not present in the wall store view; its consequences cannot be read`,
      });
      undetermined.push(this.regenerationUndetermined(id));
      return this.assemble({
        command,
        stateHash,
        direct: determined([id]),
        indirect: { kind: 'undetermined', scope: `indirect impact of moving wall ${id}`, reason: 'STALE_DERIVED_STATE', detail: 'wall record absent' },
        changed,
        excluded,
        topologyModified,
        refused,
        undetermined,
        validation: { violationsCreated: [], violationsResolved: [] },
      });
    }

    // The candidate wall — the record AS IT WOULD BE after the move: new baseLine, same
    // openings. A fresh object; the live record is never touched (purity).
    const candidate: WallData = { ...currentWall, baseLine };

    // ── Branch 1: opening-refit (wrap planOpeningRefit) ──────────────────────────────
    // openings that no longer fit → `refused` WITH their numbers (the refusal carries
    // them); openings that must relocate → `changed`; openings that survive in place →
    // `excluded` (considered-and-determined-unchanged, a positive verdict).
    const refit = this.deps.occupancy.planOpeningRefit(candidate);
    const relocatedIds = new Set<string>();
    for (const r of refit.relocations) {
      const eid = r.opening.elementId ?? r.opening.id;
      relocatedIds.add(eid);
      changed.push(eid);
    }
    const refusedIds = new Set<string>();
    for (const ref of refit.refusals) {
      refusedIds.add(ref.elementId ?? ref.openingId);
      // The seed's OpeningRefusal.reason already names both quantities (required vs
      // available). Carry it verbatim — never flatten to a generic failure string.
      refused.push({ elementId: ref.elementId ?? ref.openingId, reason: ref.reason });
    }
    for (const o of currentWall.openings ?? []) {
      const eid = o.elementId ?? o.id;
      if (!relocatedIds.has(eid) && !refusedIds.has(eid)) excluded.push(eid);
    }

    // ── Branch 2: junction (read the retained joinedTo index) ────────────────────────
    // A move changes the join topology of every wall this one is joined to. FAILURE ≠
    // EMPTINESS (C71 §4.4): a cache the flush has not refreshed cannot answer, and that
    // is `undetermined{ENGINE_NOT_AVAILABLE}`, NEVER an empty change set.
    const junctionResult = this.junctionBranch(id);
    if (junctionResult.kind === 'determined') {
      for (const wid of junctionResult.elements) {
        changed.push(wid);
        topologyModified.push(wid);
      }
    } else {
      undetermined.push(junctionResult);
    }

    // ── Branch 5 (runs BEFORE 3 on purpose): room-boundary + geometry prediction ─────
    // Phase 6b. The predicted room areas are an INPUT to the violation diff below —
    // ROOM_MIN_AREA reads `room.computed.area`, so a violations branch that clones
    // PRE-MOVE room records can never see a wall move change a room's area. Ordering
    // this branch first is what closes that.
    const room = this.roomBoundaryBranch(context, id, currentWall.levelId, baseLine);
    const roomResult = room.membership;
    if (roomResult.kind === 'determined') {
      for (const rid of roomResult.elements) changed.push(rid);
    } else {
      undetermined.push(roomResult);
    }
    if (room.geometryUndetermined) undetermined.push(room.geometryUndetermined);

    // Per-room refusals from the predictor are declared INDIVIDUALLY — a room whose
    // geometry could not be predicted must not read as "no violation" (see below).
    const unpredicted: string[] = [];
    for (const p of room.predictions) {
      if (p.kind === 'undetermined') {
        unpredicted.push(p.roomId);
        undetermined.push({
          scope: `predicted polygon + area of room ${p.roomId} under the move of wall ${id}`,
          reason: p.reason === 'TOPOLOGY_CHANGE_POSSIBLE' ? 'NO_DEPENDENCY_INDEX' : 'STALE_DERIVED_STATE',
          detail: `${p.reason}: ${p.detail}. Its area-based rules (e.g. ROOM_MIN_AREA) were NOT re-evaluated for this move.`,
        });
      }
    }

    // ── Branch 3: violations (the mined SpeculativeEngine core) ──────────────────────
    // clone stores → apply the move to the clone → validateAll before/after → diff.
    // This is where the MINE disposition executes (SpeculativeEngine is deprecated-in-
    // place; its clone-and-validate algorithm is lifted here, fed by PlanningContext,
    // not window.*). The predicted room areas are folded into the AFTER clone only.
    const violation = this.violationsBranch(context, id, baseLine, room.predictions);
    if (violation.kind === 'undetermined') undetermined.push(violation.undetermined);

    // ── The founder's BEFORE→AFTER line, in the TYPED field (R5) ─────────────────────
    // `ConsequencePlan.metrics` is the home for a per-element metric transition. A room
    // with a DETERMINED prediction contributes its AREA; `before` is `undefined` when the
    // room record carries no prior value — a determined absence, distinct from the per-room
    // UNDETERMINED already declared above for rooms that could not be predicted at all.
    // Nothing is formatted here: rendering is the report surface's job, and a number
    // stringified into the plan could not be compared against the actual.
    //
    // ONLY area, deliberately. The predictor also returns a perimeter, but the room record
    // exposes no `perimeterBefore` to this planner, so every such entry would carry
    // `before: undefined` — a column of blanks that adds bytes to the plan hash and tells a
    // reader nothing. A metric is emitted when the transition is the point, not because the
    // number happens to be to hand.
    const metrics: MetricTransition[] = [];
    for (const p of room.predictions) {
      if (p.kind !== 'determined') continue;
      metrics.push({ elementId: p.roomId, metric: 'area', before: p.areaBefore, after: p.area, unit: 'm2' });
    }
    // Deterministic order — the plan hash covers this array (G-REASON-02).
    metrics.sort((a, b) => a.elementId.localeCompare(b.elementId) || a.metric.localeCompare(b.metric));

    // ── Branch 4: regeneration (declared blind spot until Phase 5) ───────────────────
    // The dependency substrate that would answer "what regenerates" is NOT wired
    // (roadmap Phase 5). Declared UNDETERMINED — NOT faked. A planner that pretended
    // completeness here is the defect ADR-0322 exists to prevent.
    undetermined.push(this.regenerationUndetermined(id));

    // ── indirect impact ──────────────────────────────────────────────────────────────
    // The union of everything reached NOT via the payload's own subject. If any indirect
    // branch is undetermined, the indirect reach is incomplete, so `indirect` is
    // undetermined (honest) rather than a partial determined set.
    const indirect: ImpactDetermination =
      junctionResult.kind === 'undetermined'
        ? { kind: 'undetermined', scope: 'indirect impact (junction + room-boundary) of wall ' + id, reason: junctionResult.reason, detail: junctionResult.detail }
        : roomResult.kind === 'undetermined'
          ? { kind: 'undetermined', scope: 'indirect impact (junction + room-boundary) of wall ' + id, reason: roomResult.reason, detail: roomResult.detail }
          : determined([...junctionResult.elements, ...roomResult.elements]);

    return this.assemble({
      command,
      stateHash,
      direct: determined([id]),
      indirect,
      changed,
      excluded,
      topologyModified,
      refused,
      undetermined,
      validation: violation.validation,
      metrics,
    });
  }

  // ── Branch helpers ─────────────────────────────────────────────────────────────────

  private junctionBranch(id: string): ImpactDetermination {
    if (!this.deps.joinedWalls) {
      return {
        kind: 'undetermined',
        scope: `junction refit of wall ${id}`,
        reason: 'ENGINE_NOT_AVAILABLE',
        detail: 'no joinedTo index reader is composed in this runtime; junction impact cannot be read',
      };
    }
    const probe = this.deps.joinedWalls.getJoinedWalls(id);
    if (probe.ok) {
      // A positive answer — including an empty one ("covered, joins nothing").
      return determined(probe.joinedWallIds);
    }
    // Typed refusal: the junction→graph writer has never covered this id (no flush has
    // run over its level since load). NOT zero junctions — no answer.
    return {
      kind: 'undetermined',
      scope: `junction refit of wall ${id}`,
      reason: 'ENGINE_NOT_AVAILABLE',
      detail: probe.detail,
    };
  }

  private violationsBranch(
    context: PlanningContext,
    id: string,
    baseLine: WallBaseline,
    /**
     * Phase 6b — predicted room geometry, applied to the AFTER clone ONLY.
     * `beforeCtx` stays exactly as it was, so the diff is a true before→after.
     * A room with an UNDETERMINED prediction is deliberately left UNCHANGED in the
     * after-clone: we must not invent an area for it. The planner declares that its
     * area rules were not re-evaluated (see the per-room UNDETERMINED entries in
     * `plan()`), so an unpredicted room never silently reads as "no violation".
     */
    predictions: readonly RoomGeometryPrediction[] = [],
  ): { kind: 'determined'; validation: { violationsCreated: ViolationRef[]; violationsResolved: ViolationRef[] } }
    | { kind: 'undetermined'; undetermined: UndeterminedImpact; validation: { violationsCreated: ViolationRef[]; violationsResolved: ViolationRef[] } } {
    const empty = { violationsCreated: [] as ViolationRef[], violationsResolved: [] as ViolationRef[] };
    if (!this.deps.validator) {
      return {
        kind: 'undetermined',
        undetermined: {
          scope: `constraint validation of moving wall ${id}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail: 'no constraint validator is composed in this runtime; violation delta cannot be computed',
        },
        validation: empty,
      };
    }

    // Snapshot the stores as PLAIN CLONES — no references to the live views (purity).
    const clone = (storeId: string): Record<string, unknown>[] => {
      const view = context.getStore(storeId);
      if (!view) return [];
      return view.getAll().map((item) => ({ ...(item as Record<string, unknown>) }));
    };
    const beforeWalls = clone('wall');
    const afterWalls = beforeWalls.map((w) => (w.id === id ? { ...w, baseLine } : w));
    const beforeRooms = clone('room');
    const beforeDoors = clone('door');
    const beforeWindows = clone('window');
    const beforeStairs = clone('stair');

    const makeStore = (items: Record<string, unknown>[]) => ({
      getAll: () => items,
      getById: (eid: string) => items.find((i) => i.id === eid) ?? null,
      filter: (fn: (x: unknown) => boolean) => items.filter(fn),
    });

    // Phase 6b — the AFTER room clone carries the PREDICTED `computed` metrics + boundary.
    // Without this, `ROOM_MIN_AREA` (which reads `room.computed.area`) evaluated the SAME
    // pre-move areas on both sides of the diff and could never fire on a wall move.
    // Rooms with no determined prediction are copied through UNCHANGED — never invented.
    const predictedById = new Map<string, RoomGeometryPrediction>();
    for (const p of predictions) predictedById.set(p.roomId, p);
    const afterRooms = beforeRooms.map((r) => {
      const p = predictedById.get(String(r.id));
      if (!p || p.kind !== 'determined') return r;
      const boundary = (r.boundary ?? {}) as Record<string, unknown>;
      const computed = (r.computed ?? {}) as Record<string, unknown>;
      const height = typeof boundary.height === 'number' ? boundary.height : 0;
      return {
        ...r,
        boundary: { ...boundary, polygon: p.polygon },
        computed: {
          ...computed,
          area: p.area,
          grossArea: p.area,
          perimeter: p.perimeter,
          volume: p.area * height,
          centroid: p.centroid,
          boundingBox: p.boundingBox,
        },
      };
    });

    const baseCtx = {
      doorStore: makeStore(beforeDoors),
      windowStore: makeStore(beforeWindows),
      stairStore: makeStore(beforeStairs),
      bimManager: undefined,
    };
    const beforeCtx = { ...baseCtx, roomStore: makeStore(beforeRooms), wallStore: makeStore(beforeWalls) } as unknown as ConstraintContext;
    const afterCtx = { ...baseCtx, roomStore: makeStore(afterRooms), wallStore: makeStore(afterWalls) } as unknown as ConstraintContext;

    let beforeResults: ValidationResult[] = [];
    let afterResults: ValidationResult[] = [];
    try {
      beforeResults = this.deps.validator.validateAll(beforeCtx);
      afterResults = this.deps.validator.validateAll(afterCtx);
    } catch {
      // A validator that threw is not an empty delta — it is a read that could not run.
      return {
        kind: 'undetermined',
        undetermined: {
          scope: `constraint validation of moving wall ${id}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail: 'the constraint validator threw while diffing the move',
        },
        validation: empty,
      };
    }

    const key = (r: ValidationResult): string => `${r.ruleId}:${r.elementId}`;
    const beforeKeys = new Set(beforeResults.map(key));
    const afterKeys = new Set(afterResults.map(key));
    const toRef = (r: ValidationResult): ViolationRef => ({ ruleId: r.ruleId, elementId: r.elementId, message: r.message });
    const byKey = (a: ViolationRef, b: ViolationRef): number =>
      `${a.ruleId}:${a.elementId}`.localeCompare(`${b.ruleId}:${b.elementId}`);

    const violationsCreated = afterResults.filter((r) => !beforeKeys.has(key(r))).map(toRef).sort(byKey);
    const violationsResolved = beforeResults.filter((r) => !afterKeys.has(key(r))).map(toRef).sort(byKey);
    return { kind: 'determined', validation: { violationsCreated, violationsResolved } };
  }

  private regenerationUndetermined(id: string): UndeterminedImpact {
    return {
      scope: `regeneration of elements dependent on wall ${id}`,
      reason: 'NO_DEPENDENCY_INDEX',
      detail: 'the dependency index (roadmap Phase 5) that would resolve regeneration impact is not wired',
    };
  }

  /**
   * Rooms whose boundary this move changes, AND — when the pure predictor is composed —
   * their predicted polygon + area (Phase 6b).
   *
   * MEMBERSHIP. DETERMINED only when a room record structurally links to the wall. The
   * CANONICAL persisted field is **`boundingWallIds`** (`RoomDataSchema`, required on
   * every stored room, read throughout `RoomContentsService`). This branch previously
   * scanned only `boundaryWallIds | wallIds | sourceWallIds` — none of which is on the
   * stored record; `boundaryWallIds` exists only on the DETECTION-ENGINE's internal DTO
   * and on floorplan-import DTOs. So the branch declared STALE_DERIVED_STATE for a
   * linkage that was in fact present, on every real project. The alias spellings are
   * RETAINED as tolerated inputs (harmless, and the import DTOs do use them).
   *
   * When NO room carries any of those arrays, the answer stays UNDETERMINED: membership
   * would only be knowable by re-running detection (a mutation the planner must not
   * perform), and the observer SUPPRESSES refreshing derived membership on
   * graph-authoritative levels (ADR-0069). Reading that as "no rooms change" is the
   * overstatement-on-partial-data defect. That refusal must survive this fix.
   *
   * GEOMETRY. With `deps.predictRoomGeometry` composed, each linked room additionally
   * gets a predicted ring/area — or a per-room typed refusal. The predictor is PURE and
   * does NOT re-run detection; a move that would split/merge rooms comes back
   * `TOPOLOGY_CHANGE_POSSIBLE`. Without the predictor, membership is still determined but
   * geometry is `ENGINE_NOT_AVAILABLE` — never a silently empty prediction set.
   */
  private roomBoundaryBranch(
    context: PlanningContext,
    wallId: string,
    levelId: string,
    baseLine: WallBaseline,
  ): {
    membership: ImpactDetermination;
    predictions: readonly RoomGeometryPrediction[];
    /** An UNDETERMINED to append when geometry could not be predicted at all. */
    geometryUndetermined?: UndeterminedImpact;
  } {
    const roomView = context.getStore('room');
    if (!roomView) {
      return {
        membership: {
          kind: 'undetermined',
          scope: `room-boundary impact of wall ${wallId} on level ${levelId}`,
          reason: 'STALE_DERIVED_STATE',
          detail: 'no room store view is available; wall→room boundary membership is the observer\'s derived state and cannot be read here',
        },
        predictions: [],
      };
    }

    const rooms = [...roomView.getAll()] as PredictRoom[];
    const linked: string[] = [];
    let anyStructuralLink = false;
    for (const item of rooms) {
      const room = item as unknown as {
        id?: string; boundingWallIds?: unknown; boundaryWallIds?: unknown; wallIds?: unknown; sourceWallIds?: unknown;
      };
      // `boundingWallIds` FIRST — it is the canonical persisted field.
      const lists = [room.boundingWallIds, room.boundaryWallIds, room.wallIds, room.sourceWallIds];
      for (const list of lists) {
        if (Array.isArray(list)) {
          anyStructuralLink = true;
          if (list.includes(wallId) && room.id) linked.push(room.id);
        }
      }
    }
    if (!anyStructuralLink) {
      // The honest blind spot — preserved verbatim. A real refusal must not become a
      // false empty just because the field-name defect above was fixed.
      return {
        membership: {
          kind: 'undetermined',
          scope: `room-boundary impact of wall ${wallId} on level ${levelId}`,
          reason: 'STALE_DERIVED_STATE',
          detail: 'rooms carry no explicit wall linkage; boundary membership is derived by RoomTopologyObserver detection, which a move invalidates and which is suppressed on graph-authoritative levels (ADR-0069)',
        },
        predictions: [],
      };
    }

    const membership = determined(linked);

    if (!this.deps.predictRoomGeometry) {
      return {
        membership,
        predictions: [],
        geometryUndetermined: {
          scope: `room polygon + area under the move of wall ${wallId} on level ${levelId}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail: 'no room-geometry predictor is composed in this runtime; rooms are known to be affected but their predicted areas cannot be computed',
        },
      };
    }

    const wallView = context.getStore('wall');
    if (!wallView) {
      return {
        membership,
        predictions: [],
        geometryUndetermined: {
          scope: `room polygon + area under the move of wall ${wallId} on level ${levelId}`,
          reason: 'STALE_DERIVED_STATE',
          detail: 'no wall store view is available; the room boundaries cannot be re-derived',
        },
      };
    }

    const walls = [...wallView.getAll()] as unknown as PredictWall[];
    const result = this.deps.predictRoomGeometry(
      walls,
      { wallId, baseLine: baseLine as unknown as ProposedWallMove['baseLine'] },
      rooms,
    );
    return { membership, predictions: result.rooms };
  }

  // ── Assembly + hashing ───────────────────────────────────────────────────────────────

  private assemble(input: {
    command: WallMoveCommand;
    stateHash: string;
    direct: ImpactDetermination;
    indirect: ImpactDetermination;
    changed: string[];
    excluded: string[];
    topologyModified: string[];
    refused: ConsequenceRefusal[];
    undetermined: UndeterminedImpact[];
    validation: { violationsCreated: ViolationRef[]; violationsResolved: ViolationRef[] };
    /** R5 — per-element PREDICTED metric transitions, already sorted by the caller. */
    metrics?: MetricTransition[];
  }): ConsequencePlan {
    const changed = sortedUnique(input.changed);
    // An element that RELOCATES/CHANGES is never also "considered unchanged".
    const changedSet = new Set(changed);
    const excluded = sortedUnique(input.excluded.filter((e) => !changedSet.has(e)));
    const topologyModified = sortedUnique(input.topologyModified);

    const body = {
      command: { type: input.command.type, payload: input.command.payload },
      direct: input.direct,
      indirect: input.indirect,
      changed,
      excluded,
      topology: { added: [] as ElementId[], removed: [] as ElementId[], modified: topologyModified },
      validation: input.validation,
      // Regeneration means REGENERATION again (R5): this planner performs none and skips
      // none — the whole branch is a declared UNDETERMINED (`regenerationUndetermined`).
      regeneration: { required: [] as ElementId[], skipped: [] as { id: ElementId; reason: string }[] },
      // R5 — the typed metric transitions. Included in the hashed body, so the same state +
      // command yields the same predicted areas (G-REASON-02) and a changed prediction
      // invalidates a stale approval (R6) exactly as a changed element set does.
      ...(input.metrics !== undefined ? { metrics: input.metrics } : {}),
      refused: input.refused,
      undetermined: input.undetermined,
    };

    const planHash = fnv1a(stableStringify({ ...body, stateHash: input.stateHash }));
    // Deterministic planId — derived from content so two plans over the same state are
    // byte-identical (G-REASON-02). A random id would be the only differing byte.
    const planId = `plan-wall.move-${planHash}`;

    return {
      planId,
      planHash,
      stateHash: input.stateHash,
      ...body,
    };
  }
}
