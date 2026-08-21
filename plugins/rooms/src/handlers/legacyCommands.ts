/**
 * §ROOM-ONE-LEGACY-SEAM — the rooms plugin's single seam to the legacy command layer.
 *
 * @command-gate: not-a-command-bus-handler
 * This file is a PURE RE-EXPORT (see the closing paragraph below: "No behaviour lives
 * here on purpose"). There is no executable path to instrument, so a span here would
 * be a fake — instrumentation theatre over a seam. The marker is PRINTED by
 * check-otel-spans on every run, so this exemption is visible, never silent.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * Every `room.*` bus verb in this directory is a BRIDGE. The detected, rendered and
 * persisted rooms live in the legacy room-topology `RoomStore` (`window.roomStore`,
 * adopted from the ADR-0318 module singleton by `apps/editor/src/engine/initBuilders.ts`),
 * not in this plugin's SDK `RoomsState` — so each handler forwards a
 * `@pryzm/command-registry` command through `window.commandManager` and declares
 * `affectedStores: []`. That is the L-75 / L-79 resolution and it is not in question here.
 *
 * What WAS in question is that the plugin reached the legacy command layer from
 * ELEVEN separate import statements — eleven independent edges out of L6, each one
 * an SDK-facade bypass that `tools/ga-gate/check-layer-boundaries.ts` counts, and
 * eleven places to keep in step when the bridge shape changes. `room.create`
 * (§FIX-ROOM-CREATE-STORE-KEY) would have made it twelve.
 *
 * This module makes it ONE. It re-exports exactly the commands the room bridges
 * forward and nothing else, so:
 *
 *   • the plugin's coupling to the legacy command layer is visible in one file and
 *     reviewable as a single fact, rather than inferred by grepping handlers;
 *   • adding a bridge costs no new edge out of the plugin;
 *   • when the room world migrates off the legacy store (the TODO(F-1.4) every
 *     sibling carries), this file is the checklist — it empties, and the last line
 *     to go deletes the seam.
 *
 * This is a RE-EXPORT and nothing more. No behaviour lives here on purpose: a seam
 * that also holds logic stops being a seam and becomes a layer.
 */

export {
  AssignTemplateToNodeCommand,
  CreateRoomCommand,
  CreateTemplateCommand,
  DeleteRoomCommand,
  RenameRoomCommand,
  SetRoomColourModeCommand,
  SetRoomOccupancyCommand,
  UpdateRoomBoundaryCommand,
  UpdateRoomCommand,
} from '@pryzm/command-registry';
