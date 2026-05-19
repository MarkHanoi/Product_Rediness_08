// toy-cube handler registration (S02 / dev-only demo).
//
// Wave 12 recipe completion: toy-cube plugin handlers/ (previously missing).
//
// The toy-cube plugin has a single handler: MoveCubeCommand. This barrel
// registers it with a CommandBus and re-exports the handler for direct
// test usage.

import type { CommandBus } from '@pryzm/plugin-sdk';
import { MoveCubeCommand } from '../MoveCubeCommand.js';

export { MoveCubeCommand };
export type { MoveCubePayload, CubeState, CubesState } from '../MoveCubeCommand.js';

export const CUBE_HANDLER_TYPES = ['cube.move'] as const;
export type CubeHandlerType = typeof CUBE_HANDLER_TYPES[number];

/** Register the toy-cube handler set with a CommandBus instance. */
export function registerCubeHandlers(bus: CommandBus): readonly string[] {
  bus.register(new MoveCubeCommand());
  return CUBE_HANDLER_TYPES;
}
