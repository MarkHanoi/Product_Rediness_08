// Reference-plane command barrel (S53 D5).
//
// Four commands surface the `referencePlaneStore` mutations through
// the family editor's command bus so they participate in undo / redo
// and per-verb OTel spans (§14):
//   • referencePlane.add       — add a named plane.
//   • referencePlane.update    — patch any subset of {name, origin, normal}.
//   • referencePlane.reorient  — atomic origin + normal change. The verb
//                                exists separately from `update` because
//                                "reorient" is a first-class authoring
//                                action (the user grabbing the plane and
//                                rotating it) and deserves its own OTel
//                                span + a tightly-scoped undo closure
//                                that only restores (origin, normal)
//                                without touching the name.
//   • referencePlane.remove    — delete a plane.
//
// Each command returns the affected id; the inverse closure replays
// the prior state so undo always restores the snapshot the user saw
// before the action.

import type { CommandBus } from '../../app/commandBus.js';
import {
  type ReferencePlane,
  type ReferencePlaneId,
  type ReferencePlaneStore,
  type Vec3,
} from '../../stores/referencePlaneStore.js';

export const ADD_REFERENCE_PLANE_VERB = 'referencePlane.add' as const;
export const UPDATE_REFERENCE_PLANE_VERB = 'referencePlane.update' as const;
export const REORIENT_REFERENCE_PLANE_VERB = 'referencePlane.reorient' as const;
export const REMOVE_REFERENCE_PLANE_VERB = 'referencePlane.remove' as const;

export const REFERENCE_PLANE_COMMAND_CATEGORY = 'referencePlane' as const;

export interface AddReferencePlaneArgs {
  readonly name: string;
  readonly origin: Vec3;
  readonly normal: Vec3;
}

export interface UpdateReferencePlaneArgs {
  readonly id: ReferencePlaneId;
  readonly patch: Partial<Omit<ReferencePlane, 'id'>>;
}

export interface ReorientReferencePlaneArgs {
  readonly id: ReferencePlaneId;
  readonly origin: Vec3;
  readonly normal: Vec3;
}

export interface RemoveReferencePlaneArgs {
  readonly id: ReferencePlaneId;
}

export interface ReferencePlaneCommandDeps {
  readonly store: ReferencePlaneStore;
}

export function registerReferencePlaneCommands(
  bus: CommandBus,
  deps: ReferencePlaneCommandDeps,
): void {
  bus.register<AddReferencePlaneArgs, ReferencePlaneId>({
    verb: ADD_REFERENCE_PLANE_VERB,
    handler: {
      category: REFERENCE_PLANE_COMMAND_CATEGORY,
      execute(args) {
        const id = deps.store.add(args);
        return { payload: id, undo: () => deps.store.remove(id) };
      },
    },
  });

  bus.register<UpdateReferencePlaneArgs, ReferencePlaneId>({
    verb: UPDATE_REFERENCE_PLANE_VERB,
    handler: {
      category: REFERENCE_PLANE_COMMAND_CATEGORY,
      execute(args) {
        const before = deps.store.get().byId[args.id];
        if (!before) {
          throw new Error(`${UPDATE_REFERENCE_PLANE_VERB}: unknown id "${args.id}".`);
        }
        deps.store.update(args.id, args.patch);
        return {
          payload: args.id,
          undo: () => deps.store.update(args.id, {
            name: before.name,
            origin: before.origin,
            normal: before.normal,
          }),
        };
      },
    },
  });

  bus.register<ReorientReferencePlaneArgs, ReferencePlaneId>({
    verb: REORIENT_REFERENCE_PLANE_VERB,
    handler: {
      category: REFERENCE_PLANE_COMMAND_CATEGORY,
      execute(args) {
        const before = deps.store.get().byId[args.id];
        if (!before) {
          throw new Error(`${REORIENT_REFERENCE_PLANE_VERB}: unknown id "${args.id}".`);
        }
        const beforeOrigin = before.origin;
        const beforeNormal = before.normal;
        deps.store.update(args.id, {
          origin: args.origin,
          normal: args.normal,
        });
        return {
          payload: args.id,
          undo: () => deps.store.update(args.id, {
            origin: beforeOrigin,
            normal: beforeNormal,
          }),
        };
      },
    },
  });

  bus.register<RemoveReferencePlaneArgs, ReferencePlaneId>({
    verb: REMOVE_REFERENCE_PLANE_VERB,
    handler: {
      category: REFERENCE_PLANE_COMMAND_CATEGORY,
      execute(args) {
        const before = deps.store.get().byId[args.id];
        if (!before) {
          throw new Error(`${REMOVE_REFERENCE_PLANE_VERB}: unknown id "${args.id}".`);
        }
        deps.store.remove(args.id);
        return {
          payload: args.id,
          undo: () => {
            deps.store.add({
              id: before.id,
              name: before.name,
              origin: before.origin,
              normal: before.normal,
            });
          },
        };
      },
    },
  });
}
