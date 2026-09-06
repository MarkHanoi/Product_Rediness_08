// Shared command-side types for the family-editor constraint commands (S52 D2).
//
// Every constraint command takes the constraint store (for add/remove)
// plus an explicit set of entity ids — the bus is intentionally
// decoupled from the selection store so commands can be replayed from
// a recorded log without a live cursor.
//
// ═══════════════════════════════════════════════════════════════════════════
// §CONSTRAINT-IS-VIEW-SCOPED — the elevation refusal, closed
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ **THIS CONTEXT USED TO BE `{ constraintStore }` — ONE AMBIENT STORE — AND
//    THAT IS WHY THE CONSTRAINT TOOLBAR WAS PLAN-ONLY.** `SketchViewPanel`
//    mounted `elevationConstraintNote()` instead of the toolbar on a vertical
//    work plane, with the reason stated in full: entity ids are minted from a
//    PER-STORE counter, so every sketch document's first point is `pt-0`. A
//    `distance-pp(pt-0, pt-1)` authored on the front elevation is therefore
//    fully "valid against" the plan document too, and the plan's solver —
//    sharing the store — would enforce a storey height on the author's floor
//    outline. Offering the button and deforming the plan is strictly worse
//    than not offering it, so the button was withheld.
//
// ⭐ **The fix is the one that file NAMED as its remainder, not a new one:**
//    *"making `constraint.*` view-aware is one change — `ConstraintCommandDeps`
//    taking a `constraintStoreFor(view)` resolver, exactly as
//    `commands/dimension/index.ts` now does."* That is this. The stores it
//    resolves already existed — `views/viewSketchSet.ts` has minted one per
//    work plane since the shared-store bug was caught — so this is a WIRING
//    change to a capability that was built and unreachable, not a new
//    subsystem. Isolation stays STRUCTURAL: it does not depend on id
//    uniqueness, because a constraint can no longer reach a foreign document's
//    store at all.
//
// ⭐ **`view` is OPTIONAL and its ABSENCE resolves through `activeView()`, not
//    through a literal `'plan'`.** A hidden `'plan'` default in the command
//    layer would reproduce the exact bug above for every dispatcher that
//    forgot the field — the AI tool registry included. The toolbar passes
//    `view` EXPLICITLY (so a recorded log replays onto the plane it was
//    authored on); a caller that omits it is acting on the plane the author is
//    standing on, which is the only other honest reading.

import type { ConstraintStore } from '../../stores/constraintStore.js';
import type { EntityId } from '../../sketch/entities.js';
import { isSketchViewKind, type SketchViewKind } from '../../views/viewProjection.js';

export interface ConstraintCommandContext {
  /**
   * The constraint store of ONE work plane. NOT a single ambient store — see
   * the header, and `commands/dimension/index.ts`'s identical field, whose
   * doc-comment is the same argument written out for dimensions.
   */
  readonly constraintStoreFor: (view: SketchViewKind) => ConstraintStore;
  /** The work plane the author is standing on, for a dispatch that names none. */
  readonly activeView: () => SketchViewKind;
}

/** Args that may name the work plane they act on. Every constraint verb takes
 *  this, so a replayed log lands where it was authored. */
export interface ViewScopedConstraintArgs {
  readonly view?: SketchViewKind;
}

/** Resolve the ONE store this dispatch may write, refusing an unknown plane by
 *  name rather than falling back to a default that would corrupt the plan. */
export function constraintStoreForArgs(
  ctx: ConstraintCommandContext,
  args: ViewScopedConstraintArgs,
  verb: string,
): ConstraintStore {
  const view = args.view ?? ctx.activeView();
  if (!isSketchViewKind(view)) {
    throw new Error(`${verb}: unknown work plane "${String(view)}".`);
  }
  return ctx.constraintStoreFor(view);
}

export interface AddCoincidentArgs extends ViewScopedConstraintArgs {
  readonly p1: EntityId;
  readonly p2: EntityId;
}

export interface AddDistanceArgs extends ViewScopedConstraintArgs {
  readonly p1: EntityId;
  readonly p2: EntityId;
  /** Either a literal mm number OR a parameter name resolved by the
   *  solver via `parameterValues` at solve time. */
  readonly value: number | string;
}

export interface AddParallelArgs extends ViewScopedConstraintArgs {
  readonly l1: EntityId;
  readonly l2: EntityId;
}

export interface AddPerpendicularArgs extends ViewScopedConstraintArgs {
  readonly l1: EntityId;
  readonly l2: EntityId;
}

export interface AddFixedArgs extends ViewScopedConstraintArgs {
  readonly p: EntityId;
  readonly x: number;
  readonly y: number;
}

export const CONSTRAINT_COMMAND_CATEGORY = 'constraint';
