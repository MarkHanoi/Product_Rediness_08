// MoveCubeCommand — the canonical toy handler used to smoke-test the L2
// CommandBus end-to-end (S02 exit criterion #1).
//
// Pipeline exercised:
//   plugin → CommandBus.executeCommand
//          → handler.canExecute (gate)
//          → handler.execute → produceCommand (Immer with patches)
//          → returns forward + inverse patches
//          → PatchEmitter.encode (JSON at S02; MessagePack at S04 per ADR-004)
//          → UndoStack.push
//          → bus returns EventRecord with ULID + audit metadata
//
// Per `§S02-T1` the handler signature is `(ctx, cmd)` (context first).
// `canExecute` is required and pure.

import {
  produceCommand,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';

export interface CubeState {
  x: number;
  y: number;
  z: number;
}

export type CubesState = Record<string, CubeState>;

export interface MoveCubePayload {
  id: string;
  dx: number;
  dy: number;
  dz: number;
}

// `CubeStores` must satisfy `AnyStores = Readonly<Record<string, unknown>>`
// — the bus types its `HandlerContext.stores` against an indexable record so
// every `affectedStores` key is a valid lookup at compile time.  We model it
// as a record type (with the open `unknown` index for the rest of the world)
// rather than an interface to keep the index-signature constraint satisfied.
type CubeStores = Readonly<{ cube: CubesState } & Record<string, unknown>>;

export class MoveCubeCommand implements CommandHandler<MoveCubePayload, CubeStores> {
  readonly type = 'cube.move';
  readonly affectedStores = ['cube'] as const;

  canExecute(_ctx: HandlerContext<CubeStores>, cmd: MoveCubePayload): ValidationResult {
    if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
      return { valid: false, reason: 'cmd.id must be a non-empty string' };
    }
    for (const axis of ['dx', 'dy', 'dz'] as const) {
      const v = cmd[axis];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        return { valid: false, reason: `cmd.${axis} must be a finite number` };
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<CubeStores>, cmd: MoveCubePayload): HandlerResult {
    const current = ctx.stores.cube;
    const [next, forward, inverse] = produceCommand<CubesState>(current, draft => {
      const cube = draft[cmd.id] ?? { x: 0, y: 0, z: 0 };
      cube.x += cmd.dx;
      cube.y += cmd.dy;
      cube.z += cmd.dz;
      draft[cmd.id] = cube;
    });
    return { forward, inverse, nextStates: { cube: next } };
  }
}
