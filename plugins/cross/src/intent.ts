/**
 * cross intent — command IDs for the cross-element cascade plugin (Wave 11 recipe).
 *
 * Cross-element cascade rules fire when a source element command triggers
 * derived updates on dependent elements. Command IDs follow the same
 * `<source>.<verb>` naming convention as element-plugin commands.
 *
 * Spec: ADR-012 cross-element cascade rule registration.
 * Recipe status: [. H . . .] — handlers + intent now present.
 */

export const CROSS_COMMANDS = {
  /** Register all cascade rules with the commandBus cascade registry. */
  REGISTER_RULES: 'cross.registerRules',
  /** Slab geometry changed — cascade to pinned walls. */
  SLAB_WALL_CASCADE: 'cross.slab-wall',
  /** Stair geometry changed — cascade to attached handrails. */
  STAIR_HANDRAIL_CASCADE: 'cross.stair-handrail',
  /** Wall geometry changed — cascade to bounding rooms. */
  WALL_ROOM_CASCADE: 'cross.wall-room',
} as const;

export type CrossCommandId = typeof CROSS_COMMANDS[keyof typeof CROSS_COMMANDS];

export interface CrossRegisterPayload {
  /** If true, overwrite any existing rule registrations. Default: false. */
  force?: boolean;
}
