// UpdateWindowsSystemTypeBatchHandler — §FEAT-WINDOW-TYPE-BATCH (ADR-0315).
//
// Bus surface for "change ALL windows / the selected windows to <type>".
// Mirrors the wall-plugin batch bridges: the typed bus command is the public
// entry point (the RAC chat dispatches it), and the bridge forwards to the
// legacy CommandManager, which owns the undo stack the batch command
// participates in as ONE entry.
//
// WHY THIS BRIDGES instead of `window.setType` (same plugin): that handler
// `produceCommand`s the plugin's DETACHED DTO store — the
// §FIX-MATERIAL-DEAD-DISPATCH disease; nothing that renders, exports or
// persists reads it (§FIX-HOSTED-TYPE-CHANGE, L-620). The geometry
// `windowStore` that WindowBuilder subscribes to is only reachable through the
// legacy command path.
//
// Payload contract (RAC-friendly, symmetric with wall.updateSystemTypeBatch):
//   • `windowIds: 'all'`    — every window in the project, ALL levels; or
//   • `windowIds: string[]` — an explicit id list (e.g. the current selection).
//   • `systemType`          — id or name; the forgiving lookup + honest
//                             unknown-type refusal live in the COMMAND.
//
// Partial-failure policy (§CONTEXT-DATA-HONESTY) lives in the COMMAND
// (`UpdateWindowsSystemTypeBatchCommand`): "Retyped N of M — K skipped". The
// bridge re-broadcasts that report as `pryzm-window-type-batch-report`, and
// nudges the affected HOST WALLS' rebuild so the reveal/lining around each
// opening is re-resolved with the new type's frame depth (the same nudge the
// Inspector's element.changeType route performs).

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateWindowsSystemTypeBatchCommand } from '@pryzm/command-registry';

export interface UpdateWindowsSystemTypeBatchPayload {
  /** 'all' = every window in the project (all levels); or an explicit id list. */
  readonly windowIds: readonly string[] | 'all';
  /** Window system type id or name (forgiving lookup in the command). */
  readonly systemType: string;
}

/** Detail shape of the `pryzm-window-type-batch-report` CustomEvent. */
export interface WindowTypeBatchReport {
  readonly success: boolean;
  /** Human-readable lines: summary first, then grouped skip reasons. */
  readonly info: readonly string[];
  readonly affectedElementIds: readonly string[];
}

export const WINDOW_TYPE_BATCH_REPORT_EVENT = 'pryzm-window-type-batch-report';

export const UpdateWindowsSystemTypeBatchHandler: CommandHandler<
  UpdateWindowsSystemTypeBatchPayload,
  Record<string, unknown>
> = {
  type: 'window.updateSystemTypeBatch',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateWindowsSystemTypeBatchPayload,
  ): ValidationResult {
    if (cmd.windowIds !== 'all' && !Array.isArray(cmd.windowIds)) {
      return { valid: false, reason: "windowIds must be 'all' or an array of window ids" };
    }
    if (typeof cmd.systemType !== 'string' || cmd.systemType.length === 0) {
      return { valid: false, reason: 'systemType (id or name) is required' };
    }
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateWindowsSystemTypeBatchPayload,
  ): HandlerResult {
    return withHandlerSpan(
      'window.updateSystemTypeBatch.handler',
      { 'pryzm.command.type': 'window.updateSystemTypeBatch' },
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
            const batch = new UpdateWindowsSystemTypeBatchCommand({
              windowIds: cmd.windowIds === 'all' ? 'all' : [...cmd.windowIds],
              systemType: cmd.systemType,
            });
            const result = cm.execute(batch);
            // Host-wall reveal/lining re-resolve — same nudge as the Inspector
            // route; the batch reports which walls host a retyped window.
            const hostWalls = batch.affectedWallIds;
            if (result?.success && hostWalls.length > 0) {
              try {
                (window as unknown as {
                  __wallRebuildControl?: { rebuildWalls?: (ids: readonly string[]) => void };
                }).__wallRebuildControl?.rebuildWalls?.(hostWalls);
              } catch (e) {
                console.warn('[window.updateSystemTypeBatch] host-wall rebuild nudge failed:', e);
              }
            }
            const report: WindowTypeBatchReport = {
              success: result?.success ?? false,
              info: result?.info ?? [],
              affectedElementIds: result?.affectedElementIds ?? [],
            };
            window.dispatchEvent(
              new CustomEvent(WINDOW_TYPE_BATCH_REPORT_EVENT, { detail: report }),
            );
          } catch (e) {
            console.error('[window.updateSystemTypeBatch.handler] bridge failed:', e);
          }
        }
        const empty: HandlerResult = { forward: [], inverse: [] };
        return empty;
      },
    ); // withHandlerSpan — C10 §2
  },
};
