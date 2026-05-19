// plugins/cross/wall-room.ts — wall → room cascade rule (S26 / ADR-0023).
//
// Lifts the implicit PRYZM 1 coupling between walls and the rooms they
// bound (`src/elements/rooms/RoomBoundaryRecomputer.ts`) into the L4
// cascade-rule registry per
// `code-level ADR docs/architecture/adr/0012-cross-element-cascade-rule-registration.md`,
// completing the S25 deferred work item logged at the bottom of
// `phases/PHASE-2A-Q1-M13-M14.md`.
//
// CONTRACT — same shape as the other rules in this folder:
//   • PURE — deterministic for a given lookup snapshot,
//   • UNIT-TESTABLE in isolation (no Store imports),
//   • DECOUPLED from the wall plugin — the rule never imports the wall
//     handlers' payload types directly; it accepts everything via
//     `payload.wallId` (which is the convention every wall command in
//     `plugins/wall/src/handlers/` already follows).
//
// FIRES FOR
// ---------
//   • wall.create        → rooms on the wall's level may have gained a
//                          new edge; recompute every room the lookup
//                          returns.
//   • wall.delete        → rooms that previously included the wall in
//                          their `boundingWallIds` need to recompute.
//   • wall.move          → translation re-routes the boundary loop.
//   • wall.transform     → covers cascaded translations from
//                          `cross.slab-wall`, plus user-issued resize/
//                          rotate.
//   • wall.setDimensions → length/height/thickness changes.
//   • wall.changeLevel   → may add or remove the wall from a room's
//                          loop on either the source or the dest level.
//
// DOES NOT FIRE FOR
// -----------------
//   • wall.setColor / wall.bulkSetVisuals / wall.setLayers /
//     wall.setSystemType — material-only edits, no boundary motion.
//   • wall.cut / wall.createOpening — opening geometry doesn't change
//     the room loop in S26 (openings live inside the wall outline,
//     and `analyseRoom` ignores them at this milestone).
//   • wall.join — purely a topology bookkeeping op, no boundary motion.
//
// The rule is wired at bootstrap time per ADR-012:
//
// ```ts
// cascadeRunner.register(buildWallRoomCascadeRule({
//   roomsAffectedByWall: (wallId) => roomRegistry.roomsForWall(wallId),
// }));
// ```

import type { CascadeCommand, CascadeContext, CascadeRule } from '@pryzm/plugin-sdk';

const WALL_CREATE = 'wall.create';
const WALL_DELETE = 'wall.delete';
const WALL_MOVE = 'wall.move';
const WALL_TRANSFORM = 'wall.transform';
const WALL_SET_DIMENSIONS = 'wall.setDimensions';
const WALL_CHANGE_LEVEL = 'wall.changeLevel';

const APPLIES_TO: ReadonlySet<string> = new Set([
  WALL_CREATE,
  WALL_DELETE,
  WALL_MOVE,
  WALL_TRANSFORM,
  WALL_SET_DIMENSIONS,
  WALL_CHANGE_LEVEL,
]);

export interface WallRoomCascadeDeps {
  /** Returns the ids of every room that *might* need to recompute its
   *  boundary in response to a change on this wall.  Caller usually
   *  implements this as
   *  `roomStore.byLevel(wallStore.get(wallId).levelId).map(r => r.id)`,
   *  with a snapshot taken before the cascade for `wall.delete` /
   *  `wall.changeLevel` so the now-orphaned-from-this-level rooms are
   *  still visited.  The cascade runner calls the function once per
   *  `wall.*` command. */
  readonly roomsAffectedByWall: (wallId: string) => readonly string[];

  /** Optional rule key override — defaults to `'cross.wall-room'`. */
  readonly key?: string;
}

/** Extracts the wall id from any cascade payload this rule fires for.
 *  Every wall handler in `plugins/wall/src/handlers/` carries the id
 *  under `payload.wallId` — see the per-handler tests for the
 *  convention. */
function extractWallId(cmd: CascadeCommand): string {
  const p = cmd.payload as { wallId?: unknown; id?: unknown };
  if (typeof p.wallId === 'string' && p.wallId.length > 0) return p.wallId;
  // wall.create uses `payload.id` (the freshly-minted wall id).
  if (typeof p.id === 'string' && p.id.length > 0) return p.id;
  throw new Error(
    `[cross.wall-room] cmd.type=${cmd.type} has no string payload.wallId / payload.id — ` +
      `cannot route wall→room cascade`,
  );
}

export function buildWallRoomCascadeRule(deps: WallRoomCascadeDeps): CascadeRule {
  if (typeof deps.roomsAffectedByWall !== 'function') {
    throw new Error('[cross.wall-room] roomsAffectedByWall must be a function');
  }

  return {
    key: deps.key ?? 'cross.wall-room',

    appliesTo(cmdType: string): boolean {
      return APPLIES_TO.has(cmdType);
    },

    extractEntityId: extractWallId,

    resolveAffected(cmd: CascadeCommand, _ctx: CascadeContext): readonly string[] {
      const wallId = extractWallId(cmd);
      return deps.roomsAffectedByWall(wallId);
    },

    synthesize(affectedRoomId: string, rootCmd: CascadeCommand, _ctx: CascadeContext): CascadeCommand {
      // Single synthesised command shape, regardless of trigger — the
      // RecomputeRoomBoundaryHandler in plugins/rooms reads the live
      // wall snapshot itself via `ctx.stores.wall`, so we don't need
      // to thread any wall geometry through the payload.
      return {
        type: 'room.recomputeBoundary',
        payload: {
          roomId: affectedRoomId,
          cascadedFrom: rootCmd.type,
          wallId: extractWallId(rootCmd),
        },
      };
    },
  };
}

/** Symbolic listing of the wall command types that cascade to rooms.
 *  Exported for tests + bootstrap-time assertions. */
export const WALL_ROOM_CASCADE_TRIGGERS = [
  WALL_CREATE,
  WALL_DELETE,
  WALL_MOVE,
  WALL_TRANSFORM,
  WALL_SET_DIMENSIONS,
  WALL_CHANGE_LEVEL,
] as const;
