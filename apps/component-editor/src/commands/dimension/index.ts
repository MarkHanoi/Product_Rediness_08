// Dimension command barrel — the ONLY mutation path into `dimensionStore`
// (P6), lane CE-VIEWS-AND-MEASURE.
//
//   • dimension.place     — place a dimension between two sketch points on the
//                           active work plane, optionally DRIVING the sketch.
//   • dimension.setValue  — change what a dimension says, which moves the
//                           geometry: this is "drive from" in one verb.
//   • dimension.remove    — delete it, and any constraint it was driving.
//
// ─── "DRIVING" REUSES `constraint.addDistance`; IT DOES NOT RIVAL IT ─────────
// A driving dimension is not a new solver concept. It is a `distance-pp`
// constraint — the exact one `commands/constraint/addDistance.ts` already
// authors — with a dimension attached to it so the author can SEE and EDIT
// the number. So `dimension.setValue` writes the same `distance-pp` shape into
// the same `constraintStore`, the same `solverRunner` picks it up, and the
// sketch moves. There is one distance constraint kind in this app, not two.
//
// Its `value` field is `number | string`, where a string is a parameter name
// resolved at solve time (`buildConstraintSet`'s `parameterValues`). These
// commands accept both and validate both, so lane CE-PARAMS-AND-PLANES can
// bind a dimension to a parameter without touching this file.
//
// ─── UNDO ────────────────────────────────────────────────────────────────────
// Every inverse restores the snapshot the author saw before the action —
// including the constraint half. `dimension.setValue` on a driven dimension
// touches TWO stores, so its inverse restores both, in the reverse order it
// wrote them; anything less leaves a dimension reading one number while the
// solver enforces another.
//
// LAYER — L7 chrome-side. No THREE, no DOM, no `(window as any)`.

import type { SketchConstraint } from '@pryzm/constraint-solver';
import type { CommandBus } from '../../app/commandBus.js';
import type { EntityId } from '../../sketch/entities.js';
import type { SketchDocSnapshot } from '../../stores/sketchDocStore.js';
import type { ConstraintStore } from '../../stores/constraintStore.js';
import type { DimensionStore } from '../../stores/dimensionStore.js';
import {
  measureLinearDimension,
  offsetForRank,
  type DimensionId,
  type DimensionStringRank,
  type LinearDimension,
} from '../../measure/dimension.js';
import { isSketchViewKind, type SketchViewKind } from '../../views/viewProjection.js';

export const PLACE_DIMENSION_VERB = 'dimension.place' as const;
export const SET_DIMENSION_VALUE_VERB = 'dimension.setValue' as const;
export const REMOVE_DIMENSION_VERB = 'dimension.remove' as const;

export const DIMENSION_COMMAND_CATEGORY = 'dimension' as const;

/** A literal millimetre value, or the name of a parameter resolved at solve
 *  time. Mirrors `AddDistanceArgs['value']` exactly — see the header. */
export type DimensionValue = number | string;

export interface PlaceDimensionArgs {
  readonly view: SketchViewKind;
  readonly p1: EntityId;
  readonly p2: EntityId;
  /** §12.2 string rank (1/2/3) or `null` for a §12.3 interior dimension. */
  readonly stringRank?: DimensionStringRank;
  /** Overrides the rank's standard offset. Use sparingly — §12.10 wants
   *  consistent offsets, and a per-dimension offset is how bands fragment. */
  readonly offsetMm?: number;
  /**
   * When set, the dimension DRIVES the sketch at this value. Omit for a
   * reporting-only dimension, which reads the geometry without constraining it.
   */
  readonly drive?: DimensionValue;
}

export interface SetDimensionValueArgs {
  readonly id: DimensionId;
  readonly value: DimensionValue;
}

export interface RemoveDimensionArgs {
  readonly id: DimensionId;
}

export interface DimensionCommandDeps {
  readonly dimensionStore: DimensionStore;
  /**
   * The constraint store of ONE work plane.
   *
   * NOT a single ambient store, and the distinction is not cosmetic. Entity
   * ids are minted per document, so EVERY sketch document's first point is
   * `pt-0`; a `distance-pp(pt-0, pt-1)` written into a shared store is
   * "valid against" all three documents at once, and the plan's solver would
   * then enforce an elevation's storey height on the author's floor outline.
   * `views/viewSketchSet.ts` owns these stores, one per work plane.
   */
  readonly constraintStoreFor: (view: SketchViewKind) => ConstraintStore;
  /** Snapshot of the document backing a given work plane. Supplied by the
   *  runtime's `viewSketchSet` so a dimension always measures ITS OWN view. */
  readonly docSnapshotFor: (view: SketchViewKind) => SketchDocSnapshot;
}

function assertValue(value: DimensionValue, verb: string): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${verb}: value must be a non-negative finite mm number (got ${value}).`);
    }
    return;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${verb}: value must be a number or a non-empty parameter name.`);
  }
}

function distanceConstraint(
  id: string,
  p1: EntityId,
  p2: EntityId,
  value: DimensionValue,
): SketchConstraint {
  return { id, kind: 'distance-pp', p1, p2, value } as SketchConstraint;
}

export function registerDimensionCommands(bus: CommandBus, deps: DimensionCommandDeps): void {
  bus.register<PlaceDimensionArgs, DimensionId>({
    verb: PLACE_DIMENSION_VERB,
    handler: {
      category: DIMENSION_COMMAND_CATEGORY,
      execute(args) {
        if (!isSketchViewKind(args.view)) {
          throw new Error(`${PLACE_DIMENSION_VERB}: unknown view "${String(args.view)}".`);
        }
        if (args.p1 === args.p2) {
          throw new Error(`${PLACE_DIMENSION_VERB}: p1 and p2 must differ.`);
        }
        const doc = deps.docSnapshotFor(args.view);
        if (!doc.pointById[args.p1] || !doc.pointById[args.p2]) {
          throw new Error(
            `${PLACE_DIMENSION_VERB}: point(s) "${args.p1}" / "${args.p2}" are not in the ` +
            `"${args.view}" document. A dimension may only span its own work plane.`,
          );
        }
        const rank: DimensionStringRank = args.stringRank ?? null;
        const id = deps.dimensionStore.newId();
        // The driving constraint belongs to the SAME work plane as the
        // dimension — see `DimensionCommandDeps.constraintStoreFor`.
        const constraintStore = deps.constraintStoreFor(args.view);

        let constraintId: string | null = null;
        if (args.drive !== undefined) {
          assertValue(args.drive, PLACE_DIMENSION_VERB);
          constraintId = constraintStore.newId('distance-pp');
          constraintStore.add(
            distanceConstraint(constraintId, args.p1, args.p2, args.drive),
          );
        }

        const dim: LinearDimension = {
          id,
          kind: 'linear',
          view: args.view,
          p1: args.p1,
          p2: args.p2,
          offsetMm: args.offsetMm ?? offsetForRank(rank),
          stringRank: rank,
          drivingConstraintId: constraintId,
        };
        deps.dimensionStore.add(dim);

        return {
          payload: id,
          undo: () => {
            deps.dimensionStore.remove(id);
            if (constraintId !== null) constraintStore.remove(constraintId);
          },
        };
      },
    },
  });

  bus.register<SetDimensionValueArgs, DimensionId>({
    verb: SET_DIMENSION_VALUE_VERB,
    handler: {
      category: DIMENSION_COMMAND_CATEGORY,
      execute(args) {
        assertValue(args.value, SET_DIMENSION_VALUE_VERB);
        const before = deps.dimensionStore.get().byId[args.id];
        if (!before) {
          throw new Error(`${SET_DIMENSION_VALUE_VERB}: unknown dimension "${args.id}".`);
        }

        // Resolved from the DIMENSION's own view, never from whichever view
        // the author happens to be standing on — otherwise undoing after a
        // view switch writes the constraint back into the wrong work plane.
        const constraintStore = deps.constraintStoreFor(before.view);
        const priorConstraintId = before.drivingConstraintId;
        const priorConstraint = priorConstraintId === null
          ? null
          : constraintStore.get().byId[priorConstraintId] ?? null;

        // A reporting-only dimension BECOMES a driving one the first time the
        // author types a value into it. That is the whole "drive from" gesture,
        // and it is why this verb creates the constraint rather than refusing.
        const constraintId = priorConstraintId ?? constraintStore.newId('distance-pp');
        if (priorConstraintId !== null) constraintStore.remove(priorConstraintId);
        constraintStore.add(
          distanceConstraint(constraintId, before.p1, before.p2, args.value),
        );
        if (priorConstraintId === null) {
          deps.dimensionStore.replace({ ...before, drivingConstraintId: constraintId });
        }

        return {
          payload: args.id,
          undo: () => {
            constraintStore.remove(constraintId);
            if (priorConstraint !== null) constraintStore.add(priorConstraint);
            deps.dimensionStore.replace(before);
          },
        };
      },
    },
  });

  bus.register<RemoveDimensionArgs, DimensionId>({
    verb: REMOVE_DIMENSION_VERB,
    handler: {
      category: DIMENSION_COMMAND_CATEGORY,
      execute(args) {
        const before = deps.dimensionStore.get().byId[args.id];
        if (!before) {
          throw new Error(`${REMOVE_DIMENSION_VERB}: unknown dimension "${args.id}".`);
        }
        const constraintStore = deps.constraintStoreFor(before.view);
        const cid = before.drivingConstraintId;
        const priorConstraint = cid === null
          ? null
          : constraintStore.get().byId[cid] ?? null;
        deps.dimensionStore.remove(args.id);
        // Removing the dimension removes the constraint it was driving —
        // leaving an invisible distance constraint behind would freeze the
        // sketch with nothing on screen to explain why.
        if (cid !== null) constraintStore.remove(cid);
        return {
          payload: args.id,
          undo: () => {
            if (priorConstraint !== null) constraintStore.add(priorConstraint);
            deps.dimensionStore.add(before);
          },
        };
      },
    },
  });
}

/**
 * Read a dimension's current value for display: the driving value when it has
 * one, otherwise the measured geometry. Pure — no store writes.
 *
 * Returns `null` when the dimension cannot be measured at all, keeping the
 * failure/empty distinction `measureLinearDimension` established.
 */
export function readDimensionValue(
  deps: DimensionCommandDeps,
  dim: LinearDimension,
): { readonly mm: number; readonly driven: boolean } | null {
  const measured = measureLinearDimension(deps.docSnapshotFor(dim.view), dim);
  if (!measured) return null;
  return { mm: measured.mm, driven: dim.drivingConstraintId !== null };
}
