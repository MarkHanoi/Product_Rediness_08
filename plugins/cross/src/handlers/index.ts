/**
 * cross handler set (Wave 11 recipe completion).
 *
 * Registers all three cross-element cascade rules with the commandBus
 * cascade registry, completing the plugin's recipe.
 *
 * Spec: ADR-012 cross-element cascade rule registration.
 * Recipe status: [. H . . .] — handlers now wired.
 */

import type { CommandBus } from '@pryzm/plugin-sdk';
import {
  buildSlabWallCascadeRule,
  type SlabWallCascadeDeps,
} from '../slab-wall.js';
import {
  buildStairHandrailCascadeRule,
  type StairHandrailCascadeDeps,
} from '../stair-handrail.js';
import {
  buildWallRoomCascadeRule,
  type WallRoomCascadeDeps,
} from '../wall-room.js';
import { CROSS_COMMANDS } from '../intent.js';

export type { CrossCommandId } from '../intent.js';
export { CROSS_COMMANDS };

/** Combined deps for all three cascade rules. */
export interface CrossHandlerDeps
  extends SlabWallCascadeDeps,
    StairHandrailCascadeDeps,
    WallRoomCascadeDeps {}

export const CROSS_HANDLER_TYPES = [CROSS_COMMANDS.REGISTER_RULES] as const;
export type CrossHandlerType = typeof CROSS_HANDLER_TYPES[number];

/**
 * Register the cross-element cascade rules with the commandBus.
 *
 * The cascade registry is the `bus.cascades` surface (added in Phase 1B,
 * ADR-012). Each rule declares the trigger command IDs it fires on via
 * `rule.triggers` and performs the derived update in `rule.apply`.
 */
export function registerCrossHandlers(
  bus: CommandBus,
  deps: CrossHandlerDeps,
): void {
  if (typeof (bus as unknown as { registerCascade?: unknown }).registerCascade !== 'function') {
    console.warn('[cross] bus.registerCascade not available — cascade rules skipped.');
    return;
  }

  const cascadeBus = bus as unknown as {
    registerCascade(rule: { triggers: readonly string[]; apply(cmd: unknown, ctx: unknown): unknown }): void;
  };

  cascadeBus.registerCascade(buildSlabWallCascadeRule(deps));
  cascadeBus.registerCascade(buildStairHandrailCascadeRule(deps));
  cascadeBus.registerCascade(buildWallRoomCascadeRule(deps));
}
