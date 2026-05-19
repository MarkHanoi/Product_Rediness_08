// Solid command barrel (S53 D6).
//
// Three commands surface the `solidStore` mutations through the
// family editor's command bus so they participate in undo / redo and
// per-verb OTel spans (§14):
//   • solid.add             — add a new solid with default LOD bitmask.
//   • solid.remove          — delete a solid; undo restores it with id
//                             and LOD bitmask preserved.
//   • solid.setLodBitmask   — change the §12.2 LOD bitmask
//                             `{ coarse, medium, fine }`. Undo restores
//                             the previous mask exactly.
//
// Material-slot binding (§12.1) is exposed via the existing
// `commands/material/` directory at S55; this barrel only owns the
// LOD-bitmask + lifecycle commands required by S53.

import type { CommandBus } from '../../app/commandBus.js';
import {
  type LodBitmask,
  type SolidId,
  type SolidProducerKind,
  type SolidStore,
} from '../../stores/solidStore.js';

export const ADD_SOLID_VERB = 'solid.add' as const;
export const REMOVE_SOLID_VERB = 'solid.remove' as const;
export const SET_SOLID_LOD_BITMASK_VERB = 'solid.setLodBitmask' as const;

export const SOLID_COMMAND_CATEGORY = 'solid' as const;

export interface AddSolidArgs {
  readonly name: string;
  readonly kind: SolidProducerKind;
  readonly lod?: LodBitmask;
  readonly materialSlot?: string | null;
}

export interface RemoveSolidArgs {
  readonly id: SolidId;
}

export interface SetSolidLodBitmaskArgs {
  readonly id: SolidId;
  readonly lod: LodBitmask;
}

export interface SolidCommandDeps {
  readonly store: SolidStore;
}

export function registerSolidCommands(
  bus: CommandBus,
  deps: SolidCommandDeps,
): void {
  bus.register<AddSolidArgs, SolidId>({
    verb: ADD_SOLID_VERB,
    handler: {
      category: SOLID_COMMAND_CATEGORY,
      execute(args) {
        const id = deps.store.add(args);
        return { payload: id, undo: () => deps.store.remove(id) };
      },
    },
  });

  bus.register<RemoveSolidArgs, SolidId>({
    verb: REMOVE_SOLID_VERB,
    handler: {
      category: SOLID_COMMAND_CATEGORY,
      execute(args) {
        const before = deps.store.get().byId[args.id];
        if (!before) {
          throw new Error(`${REMOVE_SOLID_VERB}: unknown id "${args.id}".`);
        }
        deps.store.remove(args.id);
        return {
          payload: args.id,
          undo: () => {
            deps.store.add({
              id: before.id,
              name: before.name,
              kind: before.kind,
              lod: before.lod,
              materialSlot: before.materialSlot,
            });
          },
        };
      },
    },
  });

  bus.register<SetSolidLodBitmaskArgs, SolidId>({
    verb: SET_SOLID_LOD_BITMASK_VERB,
    handler: {
      category: SOLID_COMMAND_CATEGORY,
      execute(args) {
        const before = deps.store.get().byId[args.id];
        if (!before) {
          throw new Error(`${SET_SOLID_LOD_BITMASK_VERB}: unknown id "${args.id}".`);
        }
        const beforeLod = before.lod;
        deps.store.setLodBitmask(args.id, args.lod);
        return {
          payload: args.id,
          undo: () => deps.store.setLodBitmask(args.id, beforeLod),
        };
      },
    },
  });
}
