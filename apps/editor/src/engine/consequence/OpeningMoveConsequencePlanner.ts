// OpeningMoveConsequencePlanner — the THIRD row of the golden-operation matrix
// (docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md, "The golden-operation matrix"):
//
//     | **wall.move**        | R2 | R3 | R6 | R4 | R5 | R7 |
//     | wall.create          | ✓  | ✓  | ✓  | ✓  | ✓  | —  |
//     | opening.move         | —  | —  | —  | —  | —  | —  |     ← THIS FILE
//     | room.regenerate      | —  | —  | —  | —  | —  | —  |
//     | furniture.generate   | —  | —  | —  | —  | —  | —  |
//
// ── WHY THIS ROW IS A DIFFERENT QUESTION FROM THE FIRST TWO ──────────────────────────
// `wall.move` and `wall.create` both reason about a HOST. This row reasons about a HOSTED
// element — a door or window that has NO independent world coordinate at all. C15 §2 is
// explicit: a hosted element's position is `baseLine[0] + offset × wallDir`, evaluated from
// its host wall; the store holds a scalar `offset` and nothing else. So "move the opening"
// is not a translation, it is a re-parameterisation ALONG a host that does not itself move.
//
// That inverts every branch relative to the two wall rows:
//
//   • the HOST does not change shape, so there is no junction diff, no mitre re-cut, and no
//     room-boundary question. A room's polygon is traced from wall CENTRELINES (C15 §2 —
//     openings are voids cut into the wall solid, not boundary geometry), so sliding a door
//     along a wall cannot move a room's ring. That is a DETERMINED-EMPTY answer — a real
//     positive verdict — and it is stated as such rather than declared a blind spot.
//   • the questions that DO arise are the host↔hosted ones C15 §5 and §8.1 name: does the
//     opening still fit inside the host's extent, does it collide with a SIBLING opening on
//     the same host, and does the host's remaining structure stay valid.
//
// ── C70 F-INV-3 IS THE BINDING RULE, AND IT IS THE POINT OF THIS PLANNER ─────────────
// "host mutation re-validates hosted state: refit where it fits, refuse naming BOTH numbers
// where it does not, never delete a hosted element to make room."
//
// Read literally F-INV-3 names HOST mutation. This row is the mirror: the HOSTED element
// mutates against a fixed host. The three clauses transfer exactly, and the third is the one
// that constrains the design hardest:
//
//   refit   — an offset that lands outside the host's extent but whose WIDTH still fits is
//             CLAMPED back inside (C15 §5's `clamp(projected − width/2, 0, wallLength −
//             width)`, which is `clampToWall`'s horizontal arm). The element is reported in
//             `changed` with the clamped offset as a `MetricTransition`, and the clamp is
//             declared — a silent clamp would be a plan that promised the user's requested
//             offset and committed a different one.
//   refuse  — an opening whose own authored WIDTH exceeds the host, or whose requested span
//             overlaps a SIBLING, is REFUSED with both numbers (required vs available;
//             requested span vs occupied span). Never narrowed, never nudged past the
//             sibling.
//   never   — no branch of this planner emits a `topology.removed` entry, ever. There is no
//             code path here that resolves a collision by removing the other opening, and
//             the alternative (moving the sibling out of the way) is equally forbidden: it
//             would mutate an element the command never named. `topology.removed` is
//             hard-coded `[]` in `assemble` and there is no parameter that could populate it.
//
// ── THE FOUR C78 §6.4 DISPOSITIONS, ASSIGNED ─────────────────────────────────────────
// C78 §6.3 calls move "the unmeasured lifecycle phase" and §6.4 requires that, per
// relationship, "A moved" resolve to exactly one of four dispositions, declared in source.
// For `opening.move`, with A = the hosted opening:
//
//   host wall (`hostedBy`)     → (ii) re-evaluated and MAY BREAK. The host's own geometry is
//                                untouched, but the host↔hosted RELATIONSHIP is exactly what
//                                is re-evaluated: fit, and sibling occupancy. This is the
//                                branch that can refuse.
//   sibling openings           → (ii) re-evaluated and may break — the collision question.
//                                A sibling that does NOT collide is `excluded`
//                                (considered-and-determined-unchanged), never omitted.
//   host wall STRUCTURE        → (ii) re-evaluated via the violation diff (the mined
//                                clone→apply→validate core), which is what answers "does the
//                                remaining structure stay valid".
//   rooms bounded by the host  → (iii) UNAFFECTED BY CONSTRUCTION. Room rings trace wall
//                                centrelines; an opening is a void in the solid, not a
//                                boundary segment. Declared, with its reason, rather than
//                                left as an absence a reader must interpret.
//   the frame/void MESH        → (i) B's geometry RE-DERIVES — `WallFragmentBuilder` re-bakes
//                                the void from `offset` (C15 §2/§3). Render-side, below the
//                                consequence contract's element grain, so it is stated here
//                                and not minted as a fake element id.
//   the DOOR/WINDOW store row  → (iv) UNDETERMINED. C15 §8.1's dual-store rule means the
//                                authoritative offset lives in TWO places (`wall.openings[i]`
//                                and `doorStore`/`windowStore`), and this planner reads the
//                                wall store only. Whether the standalone row will be written
//                                in the same transaction is a property of the HANDLER, not
//                                of state this planner can read. Declared, never assumed.
//
// ── WHY THIS FILE LIVES IN apps/editor/src/engine (the composition layer) ────────────
// Identical to the two wall planners' reason, restated so it is not inferred: the consequence
// CONTRACT is `@pryzm/command-bus` (L1) so anything may implement it, but this PLANNER must
// reach `@pryzm/geometry-wall` (L2, the occupancy seed) and `@pryzm/constraint-solver` (L2,
// the violation core). A planner in command-bus (L1) importing those would be an UPWARD
// import — the exact violation `tools/ga-gate/check-layer-boundaries.ts` exits 3 on.
// apps/editor is L7 (the top), so every edge is DOWNWARD and this placement adds zero layer
// violations. Every heavyweight collaborator is INJECTED and every package import in this
// file is `import type` (erased at runtime), so the planner constructs and runs with no deps
// at all, in a plain node env, with no `window.*` and no singletons at import.
//
// ── THE INVARIANT THIS FILE MUST PROVE (ADR-0322 §2, restated) ───────────────────────
// A `ConsequencePlanner` MUST NOT mutate authoritative state. Every read is over the
// caller-supplied read-only `PlanningContext` views or over CLONES; the proposed offset is
// applied to a FRESH candidate wall built from a copy of the host's opening list, never to
// the live record. G-REASON-01 (purity) and G-REASON-02 (determinism) are the gates.

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
import type { WallData, ClampToWallResult, OpeningDims } from '@pryzm/geometry-wall';
import type { ValidationResult, ConstraintContext } from '@pryzm/constraint-solver/compliance';

// The ONE stable serialisation, shared with the two wall planners so all three hash with the
// same algorithm and the execution service's read-back fingerprint means the same thing on
// every row of the matrix (ADR-0322 §6's one-algorithm rule applied to hashing).
import { stableStringify } from './WallMoveConsequencePlanner.js';

// ─── The command this planner answers for ────────────────────────────────────────────

/**
 * `opening.move` as a SEMANTIC operation — slide the hosted element `id` along its host wall
 * so its LEFT-EDGE offset becomes `offset` (C15 §1: the offset is the left edge of the span
 * `[offset, offset + width]`, per §OPENING-OFFSET-LEFTEDGE-UNIFY; the element CENTRE sits at
 * `offset + width/2`).
 *
 * The LIVE bus verbs are `door.setOffset` and `window.setOffset` (initBusHandlers.ts, bridging
 * `SetDoorOffsetCommand` / `SetWindowOffsetCommand`). There is no `opening.move` verb on the
 * bus, exactly as there is no live `wall.move` verb — `wall.updateBaseline` is the live
 * mutation there. Both rows follow the same rule: the planner reasons about the SEMANTIC
 * operation and the normaliser registry maps the live verbs onto it, so a door and a window
 * are one consequence question rather than two near-identical planners.
 *
 * `wallId` is OPTIONAL because neither live verb carries it — `SetDoorOffsetCommand(doorId,
 * newOffset, prevOffset)` names the element only. When it is absent the planner RESOLVES the
 * host by scanning the wall store for the wall whose `openings[]` contains the element. That
 * scan can fail, and its failure is a typed `RELATIONSHIP_NOT_READABLE` (C78 §4.2–§4.3: the
 * `hostedBy` edge is written but has no reverse index) — never a guess at which wall it meant.
 */
export interface OpeningMoveCommand {
  readonly type: 'opening.move';
  readonly payload: {
    /** The hosted element id (door/window id) — `Opening.elementId`, not `Opening.id`. */
    readonly id: string;
    /** The proposed LEFT-EDGE offset along the host baseline, metres. */
    readonly offset: number;
    /** The host wall, when the caller knows it. Absent ⇒ resolved by reverse scan. */
    readonly wallId?: string;
    /** Carried by the live verbs for undo; consequence-irrelevant but hashed with the payload. */
    readonly prevOffset?: number;
  };
}

// ─── Injected collaborators (the substrate, supplied by the composition root) ─────────

/**
 * The CLAMP — `WallOccupancyStore.clampToWall`, the pure predicate that decides whether a
 * hosted element's four degrees of freedom fit inside a host's extent.
 *
 * This is the REFIT half of F-INV-3, and it is the SAME function `planOpeningRefit` calls
 * per-opening on the wall-move row. Reusing it is what keeps "does this fit?" one rule with
 * one epsilon and one answer across both rows: a wall-move refit and an opening-move refit
 * that disagreed about the same door on the same wall would be two rival implementations of
 * C15 §5's clamp, which is the copy-drift defect §FIX-RAKE-REFUSAL-IS-NOT-A-CRASH names.
 */
export interface OpeningClampReader {
  clampToWall(wall: WallData, dims: OpeningDims): ClampToWallResult;
}

/**
 * The COLLISION check — `WallOccupancyStore.canPlace`, 1-D span overlap along the host
 * centreline with the element's OWN pre-move slot excluded (§MOVE-EXCLUDE-SELF: `excludeId`
 * matches both `Opening.id` and `Opening.elementId`, precisely so a small in-place nudge is
 * not rejected as a self-conflict).
 *
 * Kept as a SEPARATE seam from the clamp even though production supplies one object for both,
 * because they answer different questions with different failure modes — fit-against-host
 * versus collide-with-sibling — and a plan that could not distinguish them would refuse with
 * the wrong pair of numbers.
 */
export interface OpeningCollisionReader {
  canPlace(
    wall: WallData,
    offsetM: number,
    widthM: number,
    excludeId?: string,
  ): { valid: boolean; conflictIds: string[]; reason?: string };
}

/** The mined violation core — `constraintEngine.validateAll` (clone → apply → diff). */
export interface ViolationValidator {
  validateAll(ctx: ConstraintContext): ValidationResult[];
}

/**
 * Everything the planner needs beyond the read-only `PlanningContext`. ALL OPTIONAL: an
 * ABSENT collaborator is the honest `ENGINE_NOT_AVAILABLE` case, declared as `undetermined`,
 * NOT silently skipped. The planner constructs and runs with `{}` — which is the configuration
 * the reachability suite drives, so the refusal paths are executable and not merely typed.
 */
export interface OpeningMovePlannerDeps {
  readonly clamp?: OpeningClampReader;
  readonly collision?: OpeningCollisionReader;
  readonly validator?: ViolationValidator;
}

// ─── Deterministic hashing (G-REASON-02) ──────────────────────────────────────────────

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

// ─── The opening record, as this planner reads it ─────────────────────────────────────

/**
 * The shape of `wall.openings[i]` this planner depends on (C15 §1). Deliberately a LOCAL
 * structural type rather than geometry-wall's `Opening`: this planner must survive an opening
 * record that is missing fields (a partially-migrated project), and the store view hands back
 * `unknown`. Every field is read defensively and a missing one becomes a typed UNDETERMINED,
 * never a `?? 0` that would silently plan against a fabricated width.
 */
interface OpeningRecord {
  readonly id?: string;
  readonly elementId?: string;
  readonly type?: 'window' | 'door';
  readonly offset?: number;
  readonly width?: number;
  readonly height?: number;
  readonly sillHeight?: number;
}

/** Is `v` a finite number? Rejects NaN/Infinity, which would poison every downstream compare. */
function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** The element id an opening is known by on the bus — `elementId` first, `id` as fallback. */
function openingElementId(o: OpeningRecord): string | undefined {
  return o.elementId ?? o.id;
}

// ─── The planner ──────────────────────────────────────────────────────────────────────

export class OpeningMoveConsequencePlanner implements ConsequencePlanner<OpeningMoveCommand> {
  constructor(private readonly deps: OpeningMovePlannerDeps = {}) {}

  async plan(command: OpeningMoveCommand, context: PlanningContext): Promise<ConsequencePlan> {
    const { id, offset } = command.payload;

    const wallView = context.getStore('wall');
    const allWalls = wallView ? ([...wallView.getAll()] as WallData[]) : [];

    // State hash — over exactly the authoritative state the plan is computed from, so a stale
    // approval (R6) is detectable. Deterministic (stableStringify) by construction.
    //
    // The WHOLE wall list is hashed, not just the host: a sibling opening added to the host by
    // another actor changes the collision answer, and an approval must not survive that. The
    // two wall planners hash the same way and for the same reason.
    const stateHash = fnv1a(stableStringify({ openingMove: command.payload, walls: allWalls }));

    const undetermined: UndeterminedImpact[] = [];
    const refused: ConsequenceRefusal[] = [];
    const changed: string[] = [];
    const excluded: string[] = [];
    const topologyModified: string[] = [];
    const metrics: MetricTransition[] = [];

    // The moved opening is always the DIRECT subject. Whether it actually ends up in `changed`
    // depends on the branches below — a REFUSED move changes nothing, and saying otherwise
    // would make predicted-vs-actual (R4) score a divergence the plan itself caused.
    const direct = determined([id]);

    // ── Branch 0: resolve the host (C78 §4.2 — the reverse edge with no index) ────────
    const host = this.resolveHost(wallView, allWalls, command.payload.wallId, id);
    if (host.kind === 'undetermined') {
      undetermined.push(host.undetermined);
      undetermined.push(this.roomsUnaffected(id));
      undetermined.push(this.dualStoreUndetermined(id));
      undetermined.push(this.regenerationUndetermined(id));
      return this.assemble({
        command,
        stateHash,
        direct,
        indirect: {
          kind: 'undetermined',
          scope: `indirect impact (host wall + sibling openings) of moving opening ${id}`,
          reason: host.undetermined.reason,
          ...(host.undetermined.subReason !== undefined
            ? { subReason: host.undetermined.subReason }
            : {}),
          detail: host.undetermined.detail,
        },
        changed,
        excluded,
        topologyModified,
        refused,
        undetermined,
        metrics,
        validation: { violationsCreated: [], violationsResolved: [] },
      });
    }

    const { wall, opening, siblings } = host;
    const wallId = String(wall.id);

    // ── Branch 0b: the opening's own dimensions must be READABLE ─────────────────────
    // Every branch below compares the proposed span `[offset, offset + width]` against
    // something. A record with no width cannot be compared at all, and defaulting it to zero
    // would produce a span of length 0 that trivially fits and trivially collides with
    // nothing — a confident PASS manufactured from missing data (the overstatement-on-
    // partial-data defect). Refuse to answer instead.
    if (!num(opening.width)) {
      undetermined.push({
        scope: `fit and collision of opening ${id} on host wall ${wallId}`,
        reason: 'STALE_DERIVED_STATE',
        detail:
          `the opening record for ${id} on wall ${wallId} carries no numeric width, so the ` +
          `proposed span [${offset}, offset + width] cannot be formed. Neither the host-fit ` +
          'question nor the sibling-collision question can be posed against an unknown extent, ' +
          'and a zero-width default would fit everywhere and collide with nothing — a PASS ' +
          'invented from absent data.',
      });
      undetermined.push(this.roomsUnaffected(id));
      undetermined.push(this.dualStoreUndetermined(id));
      undetermined.push(this.regenerationUndetermined(id));
      return this.assemble({
        command,
        stateHash,
        direct,
        indirect: {
          kind: 'undetermined',
          scope: `indirect impact (host wall + sibling openings) of moving opening ${id}`,
          reason: 'STALE_DERIVED_STATE',
          detail: `opening ${id} carries no numeric width`,
        },
        changed,
        excluded,
        topologyModified,
        refused,
        undetermined,
        metrics,
        validation: { violationsCreated: [], violationsResolved: [] },
      });
    }

    const width = opening.width;
    const beforeOffset = num(opening.offset) ? opening.offset : undefined;

    // Guard: a non-finite requested offset is the CALLER's defect, and `INVALID_REQUEST` is
    // the member C78 §8.1 minted for exactly that — the first member that describes the
    // request rather than the system's capability.
    if (!num(offset)) {
      undetermined.push({
        scope: `the requested offset for opening ${id}`,
        reason: 'INVALID_REQUEST',
        detail:
          `the payload's offset is not a finite number (${String(offset)}), so no span can be ` +
          'formed and no branch can be evaluated. This is a malformed request, not a gap in ' +
          'what the system can answer.',
      });
      undetermined.push(this.roomsUnaffected(id));
      undetermined.push(this.dualStoreUndetermined(id));
      undetermined.push(this.regenerationUndetermined(id));
      return this.assemble({
        command,
        stateHash,
        direct,
        indirect: {
          kind: 'undetermined',
          scope: `indirect impact (host wall + sibling openings) of moving opening ${id}`,
          reason: 'INVALID_REQUEST',
          detail: 'the requested offset is not a finite number',
        },
        changed,
        excluded,
        topologyModified,
        refused,
        undetermined,
        metrics,
        validation: { violationsCreated: [], violationsResolved: [] },
      });
    }

    // ── Branch 1: HOST FIT — the refit/refuse arm of F-INV-3 ─────────────────────────
    const fit = this.hostFitBranch(wall, opening, offset, width, id, wallId);
    if (fit.kind === 'undetermined') {
      undetermined.push(fit.undetermined);
    } else if (fit.kind === 'refused') {
      // REFUSED: the opening's own authored width/height cannot exist on this host at ANY
      // offset. F-INV-3's second clause — refuse naming BOTH numbers — and its third: the
      // element is NOT removed and NOT narrowed. It simply does not move.
      refused.push(fit.refusal);
    }

    // The offset the move would ACTUALLY land on: the clamped value when the clamp is
    // composed and moved it, the requested value otherwise. Everything downstream (collision,
    // violations, metrics) reasons about THIS number, so a clamped move is never checked for
    // collision at a position it will not occupy.
    const effectiveOffset = fit.kind === 'determined' ? fit.effectiveOffset : offset;
    const clampApplied = fit.kind === 'determined' && fit.clamped;

    // ── Branch 2: SIBLING COLLISION — the second F-INV-3 refusal shape ───────────────
    // Runs only when the host-fit branch did not already refuse: an opening that cannot exist
    // on this wall at any offset has no meaningful collision question, and reporting two
    // refusals for one cause would double-count the same fact in the plan.
    let collisionRefused = false;
    if (fit.kind !== 'refused') {
      const collision = this.collisionBranch(
        wall,
        opening,
        siblings,
        effectiveOffset,
        width,
        id,
        wallId,
      );
      if (collision.kind === 'undetermined') {
        undetermined.push(collision.undetermined);
      } else {
        for (const r of collision.refusals) refused.push(r);
        collisionRefused = collision.refusals.length > 0;
        // Siblings that were CHECKED and found clear are `excluded` — a positive verdict
        // (ADR-0322 §6: `excluded` is considered-and-determined-unchanged, which is a
        // different thing from "not visited"). Colliding siblings are NOT excluded; they
        // carry a refusal instead.
        for (const sid of collision.clear) excluded.push(sid);
      }
    }

    // Does the move PROCEED? Only if nothing refused it. A refused move changes nothing, and
    // the plan must say so — `changed: []` for the subject is the honest prediction, and it
    // is what makes the R4 predicted-vs-actual comparison meaningful rather than a formality.
    const proceeds = refused.length === 0 && !collisionRefused;

    if (proceeds) {
      changed.push(id);
      // The HOST changes too: `wall.openings[i].offset` is a field of the WALL record (C15
      // §1/§6 — the openings array lives on the wall, and the void is baked into the wall
      // mesh from it). A consumer diffing predicted-vs-actual over the wall store would
      // otherwise see the host mutate unexpectedly.
      changed.push(wallId);
      // The host's TOPOLOGY is modified in the C15 §6 sense: the opening/childrenIds pairing
      // and the void span it describes are what `_assertOpeningsChildrenInvariant` guards.
      // Nothing is ADDED and — F-INV-3's third clause — nothing is ever REMOVED.
      topologyModified.push(wallId);

      // The typed BEFORE→AFTER line (R5). `offset` is a member of the closed `MetricName`
      // union and `'m'` of `MetricUnit`, so this needs no contract edit. `before` is
      // `undefined` when the stored record carries no prior offset — a DETERMINED absence,
      // distinct from the UNDETERMINED entries above (consequence.ts's MetricTransition doc).
      metrics.push({
        elementId: id,
        metric: 'offset',
        before: beforeOffset,
        after: effectiveOffset,
        unit: 'm',
      });

      // A CLAMPED move is declared, not silently applied. The user asked for one offset and
      // the plan promises another; `metrics` alone carries the landing number but not the
      // fact that it differs from the ask, and a consumer comparing the payload's offset
      // against the metric would have to infer the clamp. Inference is what the UNDETERMINED
      // discipline exists to remove — so the refit is stated, with both numbers.
      if (clampApplied) {
        undetermined.push({
          scope: `the exact landing offset of opening ${id} on host wall ${wallId}`,
          reason: 'GEOMETRY_UNPREDICTABLE',
          detail:
            `the requested offset ${offset.toFixed(3)} m would place the ${width.toFixed(3)} m ` +
            `span outside the host's extent, so it is REFIT (C15 §5 clamp, C70 F-INV-3 clause 1) ` +
            `to ${effectiveOffset.toFixed(3)} m. The element is NOT narrowed and NOT removed; ` +
            'it lands at a different offset than the one requested, and this plan promises the ' +
            'CLAMPED value.',
        });
      }
    }

    // ── Branch 3: HOST STRUCTURE — the violation diff over the proposed host ─────────
    // "does the host wall's remaining structure stay valid?" — the mined SpeculativeEngine
    // core, clone → apply the new offset to the CLONE → validateAll before/after → diff.
    // Runs even when the move is refused, because `violationsResolved` on a refused move is
    // still a fact worth carrying: it says what the refusal is protecting.
    const violation = this.violationsBranch(context, wallId, opening, effectiveOffset, proceeds);
    if (violation.kind === 'undetermined') undetermined.push(violation.undetermined);

    // ── Branch 4: rooms — disposition (iii), UNAFFECTED BY CONSTRUCTION ─────────────
    undetermined.push(this.roomsUnaffected(id));

    // ── Branch 5: the dual-store row — disposition (iv) ─────────────────────────────
    undetermined.push(this.dualStoreUndetermined(id));

    // ── Branch 6: regeneration (declared blind spot, as on both wall rows) ──────────
    undetermined.push(this.regenerationUndetermined(id));

    // ── indirect impact ──────────────────────────────────────────────────────────────
    // Everything reached NOT via the payload's own subject: the host wall, and the siblings
    // whose occupancy was consulted. DETERMINED here, because both are read from the ONE
    // record the host branch already resolved — there is no second index that could be stale.
    const indirect: ImpactDetermination = proceeds
      ? determined([wallId])
      : determined([]);

    return this.assemble({
      command,
      stateHash,
      direct,
      indirect,
      changed,
      excluded,
      topologyModified,
      refused,
      undetermined,
      metrics,
      validation: violation.validation,
    });
  }

  // ── Branch helpers ─────────────────────────────────────────────────────────────────

  /**
   * Resolve the HOST wall and the moved opening's record.
   *
   * Two paths, and the difference between them is the whole C78 §4.2–§4.3 point:
   *
   *   • `wallId` SUPPLIED — a direct `getById`. Still fallible: the wall may be absent from
   *     the view, or may not host this element at all (a caller naming the wrong host).
   *   • `wallId` ABSENT — the REVERSE traversal `element → host`, which has NO INDEX. The
   *     `hostedBy` edge is written (every opening carries its element id) but nothing reads
   *     it in that direction, which is precisely `RELATIONSHIP_NOT_READABLE`. The planner
   *     performs a LINEAR SCAN of the wall store as the honest substitute, and — critically —
   *     declares the AMBIGUOUS case rather than taking the first hit: an element appearing in
   *     two walls' opening arrays is a corrupt `hostedBy` edge, and picking one would make the
   *     plan a coin flip dressed as a determination.
   */
  private resolveHost(
    wallView: ReturnType<PlanningContext['getStore']>,
    allWalls: readonly WallData[],
    wallId: string | undefined,
    elementId: string,
  ):
    | {
        kind: 'determined';
        wall: WallData;
        opening: OpeningRecord;
        siblings: readonly OpeningRecord[];
      }
    | { kind: 'undetermined'; undetermined: UndeterminedImpact } {
    if (!wallView) {
      return {
        kind: 'undetermined',
        undetermined: {
          scope: `the host wall of opening ${elementId}`,
          reason: 'STALE_DERIVED_STATE',
          detail:
            'no wall store view is available; a hosted element has no independent world ' +
            'position (C15 §2), so with no host record there is nothing to reason about at all.',
        },
      };
    }

    const openingsOf = (w: WallData): readonly OpeningRecord[] =>
      Array.isArray((w as { openings?: unknown }).openings)
        ? ((w as unknown as { openings: OpeningRecord[] }).openings)
        : [];

    const find = (w: WallData): OpeningRecord | undefined =>
      openingsOf(w).find((o) => openingElementId(o) === elementId);

    if (wallId !== undefined) {
      const wall = wallView.getById(wallId) as WallData | null | undefined;
      if (!wall) {
        return {
          kind: 'undetermined',
          undetermined: {
            scope: `the host wall ${wallId} of opening ${elementId}`,
            reason: 'STALE_DERIVED_STATE',
            detail: `the payload names host wall ${wallId}, which the wall store view does not hold`,
          },
        };
      }
      const opening = find(wall);
      if (!opening) {
        // The caller named a host that does NOT host this element. That is a broken
        // `hostedBy` claim, not a missing index — and it must not silently fall back to a
        // scan, because a fallback would let a wrong `wallId` produce a confident plan.
        return {
          kind: 'undetermined',
          undetermined: {
            scope: `the hosting of opening ${elementId} by wall ${wallId}`,
            reason: 'RELATIONSHIP_NOT_RECORDED',
            detail:
              `the payload names wall ${wallId} as the host of ${elementId}, but that wall's ` +
              `openings[] does not contain it. The hostedBy edge the command asserts is not ` +
              'recorded on the host, so the move cannot be planned against it. No fallback ' +
              'search is performed: silently re-hosting the element onto whichever wall does ' +
              'contain it would plan a move the caller never asked for.',
          },
        };
      }
      return {
        kind: 'determined',
        wall,
        opening,
        siblings: openingsOf(wall).filter((o) => openingElementId(o) !== elementId),
      };
    }

    // ── The reverse traversal, with no index (C78 §4.2–§4.3) ────────────────────────
    // Sorted by id first, so the scan order — and therefore which ambiguity is reported
    // first — is deterministic (G-REASON-02). The store's iteration order is not
    // contractually stable.
    const ordered = allWalls
      .filter((w) => typeof (w as { id?: unknown }).id === 'string')
      .slice()
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    const hits: { wall: WallData; opening: OpeningRecord }[] = [];
    for (const w of ordered) {
      const o = find(w);
      if (o) hits.push({ wall: w, opening: o });
    }

    if (hits.length === 0) {
      return {
        kind: 'undetermined',
        undetermined: {
          scope: `the host wall of opening ${elementId}`,
          reason: 'RELATIONSHIP_NOT_READABLE',
          // NO `subReason` — and the absence is deliberate, not an omission.
          //
          // This branch carried `subReason: 'element-unknown-to-joinedTo-writer'` until it was
          // measured against the contract. That pairing is INVALID: consequence.ts's
          // `UNDETERMINED_SUB_REASON_PARENT` — C78 §8.3's "single, exhaustive, reviewable
          // statement of ownership" — assigns that sub-reason the parent
          // `RELATIONSHIP_NOT_RECORDED`, not `RELATIONSHIP_NOT_READABLE`, and C78 §8.2's table
          // row confirms it. Emitting the pair would have made a producer contradict the very
          // map that exists to make sub-reasons reviewable. It is also the wrong FAMILY: that
          // sub-reason is core-app-model's `joinedTo` writer (wall↔wall joins) with the family
          // name stripped, and it says nothing about host↔hosted lookup.
          //
          // The parent is kept, because the parent is RIGHT: consequence.ts documents
          // `RELATIONSHIP_NOT_READABLE` as "the edge is written but has no typed reader / no
          // reverse index in the direction the query needs (C78 §4.2–§4.3; `hostedBy`,
          // `sitsOn`)" — it names `hostedBy`, which is exactly this edge. `subReason` is
          // optional in the contract, so the honest answer is the correct parent ALONE plus a
          // full `detail`, rather than a borrowed sub-reason that would be precise and wrong.
          //
          // ⚠ GAP RECORDED (not silently worked around): NOTHING enforces producer-side
          // pairing. `refusal-vocabulary.test.ts` validates the MAP (every sub-reason has a
          // parent in the union) but no gate checks that an emitted `{reason, subReason}` pair
          // AGREES with it, which is why this survived a passing 52-test suite. A
          // `hostedBy`-specific sub-reason would be the fuller fix, and minting one means
          // adding a member to the closed union in `packages/command-bus/src/consequence.ts`
          // AND its parent entry in the same commit — a change to the shared L1 vocabulary,
          // out of this lane's scope, so it is reported rather than smuggled in.
          detail:
            `no wall in the store view carries ${elementId} in its openings[]. The hostedBy ` +
            'edge is written host-side only (C15 §1) and has no reverse index (C78 §4.2–§4.3), ' +
            'so this planner performed a linear scan of the wall store — the honest substitute ' +
            'for the missing index — and found no host. The element may be absent, may be ' +
            'hosted on a level not loaded in this view, or the edge may never have been ' +
            'written. Which of those it is, is NOT determined.',
        },
      };
    }

    if (hits.length > 1) {
      const ids = sortedUnique(hits.map((h) => String(h.wall.id)));
      return {
        kind: 'undetermined',
        undetermined: {
          scope: `the host wall of opening ${elementId}`,
          reason: 'RELATIONSHIP_NOT_READABLE',
          detail:
            `${ids.length} walls (${ids.join(', ')}) each carry ${elementId} in their openings[]. ` +
            'A hosted element has exactly ONE host by contract (C15 §1), so this is a corrupt ' +
            'hostedBy edge. The planner does NOT pick one: an offset is measured along a ' +
            "specific host's baseLine (C15 §2), so choosing arbitrarily would produce a " +
            'confident plan for a world position that is a coin flip.',
        },
      };
    }

    const hit = hits[0]!;
    return {
      kind: 'determined',
      wall: hit.wall,
      opening: hit.opening,
      siblings: openingsOf(hit.wall).filter((o) => openingElementId(o) !== elementId),
    };
  }

  /**
   * HOST FIT — F-INV-3's refit/refuse decision, delegated to the ONE clamp.
   *
   * Three outcomes, and they are the three F-INV-3 permits:
   *
   *   determined + clamped=false — the requested offset fits as asked.
   *   determined + clamped=true  — REFIT. The span is pushed back inside the host's extent at
   *                                its authored WIDTH. This is a real move to a different
   *                                number, declared by the caller.
   *   refused                    — the authored WIDTH (or HEIGHT) itself exceeds the host, so
   *                                no offset can work. Both numbers are named. The element is
   *                                neither narrowed nor removed.
   *
   * The width/height distinction is the clamp's own: `clampToWall` shrinks `width` ONLY when
   * the width exceeds the whole wall, and otherwise preserves it by shifting the offset. So
   * "the clamp changed the width" is exactly the condition under which no offset can work —
   * the same reading `planOpeningRefit` makes on the wall-move row, deliberately, so one
   * door's fit verdict does not depend on which row asked.
   */
  private hostFitBranch(
    wall: WallData,
    opening: OpeningRecord,
    requestedOffset: number,
    width: number,
    elementId: string,
    wallId: string,
  ):
    | { kind: 'determined'; effectiveOffset: number; clamped: boolean }
    | { kind: 'refused'; refusal: ConsequenceRefusal }
    | { kind: 'undetermined'; undetermined: UndeterminedImpact } {
    if (!this.deps.clamp) {
      return {
        kind: 'undetermined',
        undetermined: {
          scope: `whether opening ${elementId} still fits host wall ${wallId} at offset ${requestedOffset}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail:
            'no host-fit clamp is composed in this runtime (WallOccupancyStore.clampToWall). ' +
            'Whether the proposed span lies inside the host extent is NOT checked — not ' +
            '"checked and clear". C70 F-INV-3 cannot be honoured without it, so the plan ' +
            'declares the gap rather than proceeding as if the fit had been verified.',
        },
      };
    }

    const height = num(opening.height) ? opening.height : 0;
    const sillHeight = num(opening.sillHeight) ? opening.sillHeight : 0;

    let clamped: ClampToWallResult;
    try {
      clamped = this.deps.clamp.clampToWall(wall, {
        offset: requestedOffset,
        width,
        height,
        sillHeight,
      });
    } catch {
      // A clamp that threw is not "it fits" — it is a check that could not run.
      return {
        kind: 'undetermined',
        undetermined: {
          scope: `whether opening ${elementId} still fits host wall ${wallId} at offset ${requestedOffset}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail: 'the host-fit clamp threw while evaluating the proposed offset',
        },
      };
    }

    // WIDTH changed ⇒ the opening cannot exist on this host at ANY offset. Refuse with BOTH
    // numbers (C70 F-INV-3 clause 2, G-INV-4: "a refused mutation names the rule and both
    // numbers"). The available figure is the clamp's own ceiling for width — the host's
    // centreline extent — read back from the clamp rather than re-derived here, so the
    // sentence cannot drift from the rule that produced the verdict.
    if (clamped.width !== width) {
      return {
        kind: 'refused',
        refusal: {
          elementId,
          reason:
            `C15 §5 host-fit (C70 F-INV-3): ${opening.type ?? 'opening'} ${elementId} needs ` +
            `${width.toFixed(3)} m of host length; wall ${wallId} offers ` +
            `${clamped.width.toFixed(3)} m. The move is REFUSED — the opening is not narrowed ` +
            'to fit and is not removed to make room.',
        },
      };
    }

    // HEIGHT changed ⇒ the same argument on the vertical axis. A move along the wall cannot
    // change an opening's height, so this fires only when the record was ALREADY out of
    // bounds vertically — which is a real refusal, and reporting it here is how a pre-existing
    // invalid state stops being invisible.
    if (num(opening.height) && clamped.height !== opening.height) {
      return {
        kind: 'refused',
        refusal: {
          elementId,
          reason:
            `C15 §5 host-fit (C70 F-INV-3): ${opening.type ?? 'opening'} ${elementId} is ` +
            `${opening.height.toFixed(3)} m tall; wall ${wallId} offers ` +
            `${clamped.height.toFixed(3)} m. The move is REFUSED — the opening is not shortened ` +
            'to fit and is not removed to make room.',
        },
      };
    }

    return {
      kind: 'determined',
      effectiveOffset: clamped.offset,
      clamped: clamped.offset !== requestedOffset,
    };
  }

  /**
   * SIBLING COLLISION — does the proposed span overlap another opening on the SAME host?
   *
   * `canPlace` is given the element's own id as `excludeId`, which is §MOVE-EXCLUDE-SELF's
   * whole reason for existing: a 5 cm nudge produces a span that overlaps the element's OWN
   * pre-move slot, and without the exclusion every small move would be refused as a
   * self-conflict. The store matches `excludeId` against BOTH `Opening.id` and
   * `Opening.elementId`, so passing the element id is correct.
   *
   * `clear` — the siblings CHECKED and found not to collide — is returned separately from the
   * refusals so the caller can put them in `excluded`. That is the positive half of the
   * verdict, and omitting it would make a checked-and-clear sibling indistinguishable from one
   * the planner never looked at (ADR-0322 §6).
   */
  private collisionBranch(
    wall: WallData,
    opening: OpeningRecord,
    siblings: readonly OpeningRecord[],
    effectiveOffset: number,
    width: number,
    elementId: string,
    wallId: string,
  ):
    | { kind: 'determined'; refusals: readonly ConsequenceRefusal[]; clear: readonly string[] }
    | { kind: 'undetermined'; undetermined: UndeterminedImpact } {
    if (!this.deps.collision) {
      return {
        kind: 'undetermined',
        undetermined: {
          scope: `collision between opening ${elementId} and its sibling openings on wall ${wallId}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail:
            'no occupancy reader is composed in this runtime (WallOccupancyStore.canPlace). ' +
            'Whether the proposed span overlaps another opening on the same host is NOT ' +
            'checked — not "checked and clear".',
        },
      };
    }

    let result: { valid: boolean; conflictIds: string[]; reason?: string };
    try {
      result = this.deps.collision.canPlace(wall, effectiveOffset, width, elementId);
    } catch {
      return {
        kind: 'undetermined',
        undetermined: {
          scope: `collision between opening ${elementId} and its sibling openings on wall ${wallId}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail: 'the occupancy reader threw while evaluating the proposed span',
        },
      };
    }

    // Sibling ids as the plan names them. `canPlace` reports `Opening.id` in `conflictIds`;
    // the plan speaks in ELEMENT ids, so the conflicts are mapped back through the sibling
    // list. A conflict whose opening id matches no sibling is carried under its raw id rather
    // than dropped — an unmappable conflict is still a conflict.
    const byOpeningId = new Map<string, OpeningRecord>();
    for (const s of siblings) if (s.id !== undefined) byOpeningId.set(s.id, s);

    const conflictElementIds = sortedUnique(
      result.conflictIds.map((cid) => {
        const s = byOpeningId.get(cid);
        return (s ? openingElementId(s) : undefined) ?? cid;
      }),
    );
    const conflictSet = new Set(conflictElementIds);

    if (!result.valid) {
      const proposedEnd = effectiveOffset + width;
      const refusals: ConsequenceRefusal[] = [];

      if (conflictElementIds.length === 0) {
        // `valid:false` with NO conflict ids is `canPlace`'s BOUNDS arm — offset before the
        // wall start, span past the wall end, zero-length or raked host. The clamp branch
        // above normally catches those first, so reaching here means the two rules disagreed;
        // the refusal is carried VERBATIM from the store rather than reworded, so the sentence
        // the user reads is the sentence the rule authored (§FIX-RAKE-REFUSAL-IS-NOT-A-CRASH's
        // lesson) and the disagreement is visible rather than smoothed over.
        refusals.push({
          elementId,
          reason:
            `C15 §5 occupancy (C70 F-INV-3): ${opening.type ?? 'opening'} ${elementId} cannot ` +
            `occupy [${effectiveOffset.toFixed(3)} m, ${proposedEnd.toFixed(3)} m] on wall ` +
            `${wallId}. ${result.reason ?? 'the occupancy check refused without a stated reason'}`,
        });
      } else {
        // One refusal PER colliding sibling, each naming both spans. A single merged sentence
        // would force a consumer to parse a list out of prose to know which element to
        // highlight; the per-element form is what makes the refusal actionable.
        for (const cid of conflictElementIds) {
          const s = siblings.find((x) => openingElementId(x) === cid || x.id === cid);
          const sOff = s && num(s.offset) ? s.offset : undefined;
          const sW = s && num(s.width) ? s.width : undefined;
          const occupied =
            sOff !== undefined && sW !== undefined
              ? `[${sOff.toFixed(3)} m, ${(sOff + sW).toFixed(3)} m]`
              : 'a span this planner could not read from the sibling record';
          refusals.push({
            elementId,
            reason:
              `C15 §5 occupancy (C70 F-INV-3): ${opening.type ?? 'opening'} ${elementId} would ` +
              `occupy [${effectiveOffset.toFixed(3)} m, ${proposedEnd.toFixed(3)} m] on wall ` +
              `${wallId}, which overlaps ${s?.type ?? 'opening'} ${cid} at ${occupied}. The move ` +
              'is REFUSED — the sibling is neither moved aside nor removed to make room.',
          });
        }
      }

      // Even on a refusal, siblings that did NOT conflict were genuinely checked and are
      // genuinely clear. Reporting them is the positive verdict half.
      const clear = sortedUnique(
        siblings
          .map((s) => openingElementId(s))
          .filter((sid): sid is string => sid !== undefined && !conflictSet.has(sid)),
      );
      return { kind: 'determined', refusals, clear };
    }

    const clear = sortedUnique(
      siblings.map((s) => openingElementId(s)).filter((sid): sid is string => sid !== undefined),
    );
    return { kind: 'determined', refusals: [], clear };
  }

  /**
   * The before/after violation diff for the host's remaining structure: clone stores → apply
   * the new offset to the CLONED host's openings array → validateAll before/after → diff.
   * Structurally the two wall planners' branch, with the mutation aimed at a nested array
   * element instead of a top-level field.
   *
   * `apply` is FALSE when the move is refused. A refused move mutates nothing, so an
   * after-clone carrying the new offset would diff a future that will not happen — and a
   * `violationsCreated` entry for a move the plan refuses is a fabricated consequence. The
   * branch still RUNS in that case (before === after), which is not a wasted call: it proves
   * the validator was reachable, and `violationsResolved` stays honestly empty rather than
   * absent.
   */
  private violationsBranch(
    context: PlanningContext,
    wallId: string,
    opening: OpeningRecord,
    effectiveOffset: number,
    apply: boolean,
  ):
    | {
        kind: 'determined';
        validation: { violationsCreated: ViolationRef[]; violationsResolved: ViolationRef[] };
      }
    | {
        kind: 'undetermined';
        undetermined: UndeterminedImpact;
        validation: { violationsCreated: ViolationRef[]; violationsResolved: ViolationRef[] };
      } {
    const empty = {
      violationsCreated: [] as ViolationRef[],
      violationsResolved: [] as ViolationRef[],
    };
    if (!this.deps.validator) {
      return {
        kind: 'undetermined',
        undetermined: {
          scope: `constraint validation of moving opening ${opening.elementId ?? opening.id} on wall ${wallId}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail:
            'no constraint validator is composed in this runtime; whether the host wall\'s ' +
            'remaining structure stays valid cannot be computed',
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
    const targetOpeningId = opening.id ?? opening.elementId;

    // The AFTER clone: the host wall with a FRESH openings array in which exactly the moved
    // entry carries the new offset. The array is rebuilt rather than spliced, so the live
    // array object is never shared into the clone (a shallow `{...wall}` would have.)
    const afterWalls = apply
      ? beforeWalls.map((w) => {
          if (String(w.id) !== wallId) return w;
          const list = Array.isArray(w.openings) ? (w.openings as OpeningRecord[]) : [];
          return {
            ...w,
            openings: list.map((o) =>
              (o.id ?? o.elementId) === targetOpeningId ? { ...o, offset: effectiveOffset } : { ...o },
            ),
          };
        })
      : beforeWalls;

    const rooms = clone('room');
    const doors = clone('door');
    const windows = clone('window');
    const stairs = clone('stair');

    const makeStore = (items: Record<string, unknown>[]) => ({
      getAll: () => items,
      getById: (eid: string) => items.find((i) => i.id === eid) ?? null,
      filter: (fn: (x: unknown) => boolean) => items.filter(fn),
    });

    const baseCtx = {
      roomStore: makeStore(rooms),
      doorStore: makeStore(doors),
      windowStore: makeStore(windows),
      stairStore: makeStore(stairs),
      bimManager: undefined,
    };
    const beforeCtx = {
      ...baseCtx,
      wallStore: makeStore(beforeWalls),
    } as unknown as ConstraintContext;
    const afterCtx = {
      ...baseCtx,
      wallStore: makeStore(afterWalls),
    } as unknown as ConstraintContext;

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
          scope: `constraint validation of moving opening ${opening.elementId ?? opening.id} on wall ${wallId}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail: 'the constraint validator threw while diffing the opening move',
        },
        validation: empty,
      };
    }

    const key = (r: ValidationResult): string => `${r.ruleId}:${r.elementId}`;
    const beforeKeys = new Set(beforeResults.map(key));
    const afterKeys = new Set(afterResults.map(key));
    const toRef = (r: ValidationResult): ViolationRef => ({
      ruleId: r.ruleId,
      elementId: r.elementId,
      message: r.message,
    });
    const byKey = (x: ViolationRef, y: ViolationRef): number =>
      `${x.ruleId}:${x.elementId}`.localeCompare(`${y.ruleId}:${y.elementId}`);

    const violationsCreated = afterResults
      .filter((r) => !beforeKeys.has(key(r)))
      .map(toRef)
      .sort(byKey);
    const violationsResolved = beforeResults
      .filter((r) => !afterKeys.has(key(r)))
      .map(toRef)
      .sort(byKey);
    return { kind: 'determined', validation: { violationsCreated, violationsResolved } };
  }

  /**
   * C78 §6.4 disposition (iii) — rooms are UNAFFECTED BY CONSTRUCTION, declared.
   *
   * ⚠ WHY A DETERMINED FACT IS CARRIED IN `undetermined`, and why that is not an abuse: it is
   * not. Read the field's contract (consequence.ts): an `UndeterminedImpact` states WHAT
   * question went unanswered and WHY. §6.4 requires the disposition be "declared in source and
   * decidable by a program" — and it IS declared in source, in this file's header and here.
   * What travels in the plan is the statement that the room question was CONSIDERED and
   * resolved structurally, so a reader cannot mistake the absence of rooms from `changed` for
   * a branch nobody ran. `AGGREGATE_SCOPE_UNSUPPORTED` is the closest honest member: the room
   * relationship is level-global (C78 §5.5) and no per-element edge from an opening to a room
   * exists to express it — because there is no such relationship to express.
   *
   * The alternative — emitting nothing — is precisely the C70 L-INV-1 defect: silence and
   * "determined no impact" printing the same value.
   */
  private roomsUnaffected(elementId: string): UndeterminedImpact {
    return {
      scope: `room boundaries and areas under the move of opening ${elementId}`,
      reason: 'AGGREGATE_SCOPE_UNSUPPORTED',
      detail:
        'DISPOSITION (iii), C78 §6.4 — UNAFFECTED BY CONSTRUCTION, and stated rather than left ' +
        'as an absence. A room ring is traced from wall CENTRELINES; a hosted opening is a void ' +
        'cut into the wall SOLID (C15 §2) and contributes no boundary segment. Sliding it along ' +
        'its host therefore cannot move any room polygon, area or perimeter. No room-geometry ' +
        'predictor is consulted, deliberately: running one would produce a prediction whose ' +
        'agreement with reality would prove nothing about this operation.',
    };
  }

  /**
   * C78 §6.4 disposition (iv) — the dual-store row, UNDETERMINED with its reason.
   *
   * C15 §8.1 (Fix DW-14) makes the offset authoritative in TWO places: `wall.openings[i].offset`
   * (which the void geometry reads) and `doorStore`/`windowStore` (which the frame mesh reads).
   * The rule is that every offset mutation writes BOTH — and the named root cause of DW-14 is a
   * command that wrote only one, leaving the void and the frame at different world positions.
   *
   * This planner reads the WALL store. Whether the handler will honour the dual-write is a
   * property of the HANDLER, not of any state a planner can read, so the plan says so. This is
   * the difference between a blind spot that is declared and one that is discovered in
   * production: the R4 read-back CAN measure it, and this entry is what tells the report where
   * to look.
   */
  private dualStoreUndetermined(elementId: string): UndeterminedImpact {
    return {
      scope: `the standalone door/window store row for ${elementId} (the C15 §8.1 dual-write)`,
      reason: 'RELATIONSHIP_NOT_READABLE',
      detail:
        'DISPOSITION (iv), C78 §6.4. C15 §8.1 requires every offset mutation to write BOTH ' +
        'wall.openings[i].offset AND the standalone doorStore/windowStore row — the DW-14 root ' +
        'cause was a command that wrote only the first, leaving the void and the frame mesh at ' +
        'different world positions. This planner reasons over the WALL store; whether the ' +
        'dispatched handler performs the paired write is a property of the handler, not of ' +
        'readable state, so it is NOT predicted here. The R4 independent read-back can measure ' +
        'it; this entry is the declaration of where to look.',
    };
  }

  /**
   * Regeneration is a declared blind spot, exactly as on both wall rows and for the same two
   * source-verified reasons: `DependencyResolver.getAffected`'s non-delete branch returns
   * `{status:'determined'}` UNCONDITIONALLY (so it would answer a confident empty set), and it
   * WRITES `this._captured` on every query (so a planner may not call it at all — ADR-0322 §2,
   * with `check-preview-purity` as the gate).
   *
   * One addition specific to this row, and it is a real regeneration consequence rather than a
   * restatement: the void geometry and the frame mesh DO re-derive (C78 §6.4 disposition (i)),
   * via `WallRebuildCoordinator` → `WallFragmentBuilder` (C15 §2/§3). That is render-side and
   * below the consequence contract's element grain — there is no element id for "the void" —
   * so it is named here rather than minted as a fake entry in `regeneration.required`.
   */
  private regenerationUndetermined(elementId: string): UndeterminedImpact {
    return {
      scope: `regeneration of elements dependent on opening ${elementId}`,
      reason: 'NO_DEPENDENCY_INDEX',
      detail:
        'the dependency index (roadmap Phase 5) that would resolve regeneration impact is not ' +
        'wired. DependencyResolver.getAffected is NOT consulted: its non-delete branch returns a ' +
        'DETERMINED result unconditionally, and it mutates its own capture map on every query, ' +
        'which a planner may not do (ADR-0322 §2). KNOWN and NOT element-grained: the opening ' +
        'void re-bakes and the door/window frame mesh repositions (C78 §6.4 disposition (i), ' +
        'C15 §2/§3 — WallRebuildCoordinator → WallFragmentBuilder). Those are render artefacts ' +
        'with no element id, so they are named here rather than invented as regeneration entries.',
    };
  }

  // ── Assembly + hashing ───────────────────────────────────────────────────────────────

  private assemble(input: {
    command: OpeningMoveCommand;
    stateHash: string;
    direct: ImpactDetermination;
    indirect: ImpactDetermination;
    changed: string[];
    excluded: string[];
    topologyModified: string[];
    refused: ConsequenceRefusal[];
    undetermined: UndeterminedImpact[];
    metrics: MetricTransition[];
    validation: { violationsCreated: ViolationRef[]; violationsResolved: ViolationRef[] };
  }): ConsequencePlan {
    const changed = sortedUnique(input.changed);
    // An element that CHANGES is never also "considered unchanged".
    const changedSet = new Set(changed);
    const excluded = sortedUnique(input.excluded.filter((e) => !changedSet.has(e)));
    const topologyModified = sortedUnique(input.topologyModified);
    // Deterministic order — the plan hash covers this array (G-REASON-02).
    const metrics = input.metrics
      .slice()
      .sort((a, b) => a.elementId.localeCompare(b.elementId) || a.metric.localeCompare(b.metric));

    const body = {
      command: { type: input.command.type, payload: input.command.payload },
      direct: input.direct,
      indirect: input.indirect,
      changed,
      excluded,
      topology: {
        // C70 F-INV-3 clause 3, structural: `removed` is a literal `[]` with NO parameter
        // that could populate it. This planner physically cannot plan the deletion of a
        // hosted element to make room, and that is a property of the code rather than of
        // the author's care.
        added: [] as ElementId[],
        removed: [] as ElementId[],
        modified: topologyModified,
      },
      validation: input.validation,
      // Regeneration means REGENERATION: this planner performs none and skips none — the
      // whole branch is a declared UNDETERMINED (`regenerationUndetermined`).
      regeneration: { required: [] as ElementId[], skipped: [] as { id: ElementId; reason: string }[] },
      // R5 — the typed metric transitions, in the HASHED body. Omitted (not empty) when the
      // move does not proceed, so a refused plan and a proceeding one cannot collide on a
      // field that means "this quantity moves".
      ...(metrics.length > 0 ? { metrics } : {}),
      refused: input.refused,
      undetermined: input.undetermined,
    };

    const planHash = fnv1a(stableStringify({ ...body, stateHash: input.stateHash }));
    // Deterministic planId — derived from content so two plans over the same state are
    // byte-identical (G-REASON-02). A random id would be the only differing byte.
    const planId = `plan-opening.move-${planHash}`;

    return {
      planId,
      planHash,
      stateHash: input.stateHash,
      ...body,
    };
  }
}
