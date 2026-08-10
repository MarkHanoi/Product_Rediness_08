// UpdateDoorsSystemTypeBatchHandler — §FEAT-DOOR-TYPE-BATCH (RAC U4.3).
//
// Bus surface for "change ALL doors / the selected doors to <type>".
// Mirrors the window plugin's UpdateWindowsSystemTypeBatch bridge: the typed
// bus command is the public entry point (the RAC chat dispatches it), and the
// bridge forwards to the legacy CommandManager, which owns the undo stack the
// batch command participates in as ONE entry.
//
// WHY THIS BRIDGES instead of `door.setType` (same plugin): that handler
// `produceCommand`s the plugin's DETACHED DTO store — the
// §FIX-MATERIAL-DEAD-DISPATCH disease; nothing that renders, exports or
// persists reads it (§FIX-HOSTED-TYPE-CHANGE, L-620). The geometry
// `doorStore` that DoorBuilder subscribes to is only reachable through the
// legacy command path.
//
// Payload contract (RAC-friendly, symmetric with window.updateSystemTypeBatch):
//   • `doorIds: 'all'`    — every door in the project, ALL levels; or
//   • `doorIds: string[]` — an explicit id list (e.g. the current selection).
//   • `systemType`        — id or name; the forgiving lookup + honest
//                           unknown-type refusal live in the COMMAND.
//
// Partial-failure policy (§CONTEXT-DATA-HONESTY) lives in the COMMAND
// (`UpdateDoorsSystemTypeBatchCommand`): "Retyped N of M — K skipped". The
// bridge re-broadcasts that report as `pryzm-door-type-batch-report`, and
// nudges the affected HOST WALLS' rebuild so the reveal/lining around each
// opening is re-resolved with the new type's frame depth (the same nudge the
// window batch bridge performs).

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateDoorsSystemTypeBatchCommand } from '@pryzm/command-registry';

export interface UpdateDoorsSystemTypeBatchPayload {
  /** 'all' = every door in the project (all levels); or an explicit id list. */
  readonly doorIds: readonly string[] | 'all';
  /** Door system type id or name (forgiving lookup in the command). */
  readonly systemType: string;
}

/** Detail shape of the `pryzm-door-type-batch-report` CustomEvent. */
export interface DoorTypeBatchReport {
  readonly success: boolean;
  /** Human-readable lines: summary first, then grouped skip reasons. */
  readonly info: readonly string[];
  readonly affectedElementIds: readonly string[];
}

export const DOOR_TYPE_BATCH_REPORT_EVENT = 'pryzm-door-type-batch-report';

export const UpdateDoorsSystemTypeBatchHandler: CommandHandler<
  UpdateDoorsSystemTypeBatchPayload,
  Record<string, unknown>
> = {
  type: 'door.updateSystemTypeBatch',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateDoorsSystemTypeBatchPayload,
  ): ValidationResult {
    if (cmd.doorIds !== 'all' && !Array.isArray(cmd.doorIds)) {
      return { valid: false, reason: "doorIds must be 'all' or an array of door ids" };
    }
    if (typeof cmd.systemType !== 'string' || cmd.systemType.length === 0) {
      return { valid: false, reason: 'systemType (id or name) is required' };
    }
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateDoorsSystemTypeBatchPayload,
  ): HandlerResult {
    return withHandlerSpan(
      'door.updateSystemTypeBatch.handler',
      { 'pryzm.command.type': 'door.updateSystemTypeBatch' },
      () => {
        // CommandManagerImpl.execute always returns a CommandResult (validation
        // refusals arrive as { success:false, info:[reason] }, never a throw).
        const cm = window.commandManager as
          | {
              execute(
                cmd: unknown,
                options?: unknown,
              ): { success: boolean; affectedElementIds: string[]; info?: string[] };
            }
          | undefined;
        if (cm) {
          try {
            const batch = new UpdateDoorsSystemTypeBatchCommand({
              doorIds: cmd.doorIds === 'all' ? 'all' : [...cmd.doorIds],
              systemType: cmd.systemType,
            });
            const result = cm.execute(batch);
            // Host-wall reveal/lining re-resolve — same nudge as the window
            // route; the batch reports which walls host a retyped door.
            const hostWalls = batch.affectedWallIds;
            if (result?.success && hostWalls.length > 0) {
              try {
                (window as unknown as {
                  __wallRebuildControl?: { rebuildWalls?: (ids: readonly string[]) => void };
                }).__wallRebuildControl?.rebuildWalls?.(hostWalls);
              } catch (e) {
                console.warn('[door.updateSystemTypeBatch] host-wall rebuild nudge failed:', e);
              }
            }
            const report: DoorTypeBatchReport = {
              success: result?.success ?? false,
              info: result?.info ?? [],
              affectedElementIds: result?.affectedElementIds ?? [],
            };
            window.dispatchEvent(
              new CustomEvent(DOOR_TYPE_BATCH_REPORT_EVENT, { detail: report }),
            );
          } catch (e) {
            console.error('[door.updateSystemTypeBatch.handler] bridge failed:', e);
          }
        }
        const empty: HandlerResult = { forward: [], inverse: [] };
        return empty;
      },
    ); // withHandlerSpan — C10 §2
  },
};
