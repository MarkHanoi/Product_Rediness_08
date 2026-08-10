// UpdateWallsSystemTypeBatchHandler — §FEAT-WALL-TYPE-BATCH (RAC prep, 2026-08-10).
//
// Bus surface for "change ALL walls / these walls to <type>". Mirrors the
// F-1.3 bridge pattern of `UpdateWallSystemType.ts`: the typed bus command is
// the public entry point (the AI-panel pills and the coming RAC chat both
// dispatch it), and the bridge forwards to the legacy CommandManager, which
// owns the undo stack the batch command participates in as ONE entry.
//
// Payload contract (deliberately RAC-friendly):
//   • `wallIds: 'all'`      — every wall in the project, ALL levels; or
//   • `wallIds: string[]`   — an explicit id list (e.g. the current selection).
//   • `systemType`          — a wall-type ID or NAME ("interior partition" works:
//                             resolveWallSystemTypeRef is exact-id → exact-name →
//                             case-insensitive name); `null` detaches the type.
//
// Partial-failure policy (§CONTEXT-DATA-HONESTY) lives in the COMMAND
// (`UpdateWallsSystemTypeBatchCommand`): apply to every wall that can accept the
// type, refuse-with-reason the rest, "Changed N of M — K skipped" in
// CommandResult.info, all-refused = visible no-op, never a throw.
//
// The bridge re-broadcasts that report as a `pryzm-wall-type-batch-report`
// window CustomEvent so THIN UI wrappers (the AI-panel pills) can show it
// without owning any batch logic themselves.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateWallsSystemTypeBatchCommand } from '@pryzm/command-registry';

export interface UpdateWallsSystemTypeBatchPayload {
  /** 'all' = every wall in the project (all levels) — the DEFAULT scope for
   *  "change all walls"; or an explicit wall-id list. */
  readonly wallIds: readonly string[] | 'all';
  /** Wall system type id or name; null detaches. */
  readonly systemType: string | null;
}

/** Detail shape of the `pryzm-wall-type-batch-report` CustomEvent. */
export interface WallTypeBatchReport {
  readonly success: boolean;
  /** Human-readable lines: summary first, then grouped skip reasons. */
  readonly info: readonly string[];
  readonly affectedElementIds: readonly string[];
}

export const WALL_TYPE_BATCH_REPORT_EVENT = 'pryzm-wall-type-batch-report';

export const UpdateWallsSystemTypeBatchHandler: CommandHandler<
  UpdateWallsSystemTypeBatchPayload,
  Record<string, unknown>
> = {
  type: 'wall.updateSystemTypeBatch',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateWallsSystemTypeBatchPayload,
  ): ValidationResult {
    if (cmd.wallIds !== 'all' && !Array.isArray(cmd.wallIds)) {
      return { valid: false, reason: "wallIds must be 'all' or an array of wall ids" };
    }
    if (cmd.systemType !== null && (typeof cmd.systemType !== 'string' || cmd.systemType.length === 0)) {
      return { valid: false, reason: 'systemType must be a non-empty type id/name, or null to detach' };
    }
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateWallsSystemTypeBatchPayload,
  ): HandlerResult {
    return withHandlerSpan(
      'wall.updateSystemTypeBatch.handler',
      { 'pryzm.command.type': 'wall.updateSystemTypeBatch' },
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
            const result = cm.execute(
              new UpdateWallsSystemTypeBatchCommand({
                wallIds: cmd.wallIds === 'all' ? 'all' : [...cmd.wallIds],
                systemType: cmd.systemType,
              }),
            );
            // Visible partial-failure reporting: re-broadcast the command's
            // "Changed N of M — K skipped: <reason>" (or the refusal reason when
            // ALL walls declined — CommandManager returns {success:false, info})
            // for the thin UI wrappers. A refusal and a success are therefore
            // never the same observable at the UI either.
            const report: WallTypeBatchReport = {
              success: result?.success ?? false,
              info: result?.info ?? [],
              affectedElementIds: result?.affectedElementIds ?? [],
            };
            window.dispatchEvent(
              new CustomEvent(WALL_TYPE_BATCH_REPORT_EVENT, { detail: report }),
            );
          } catch (e) {
            console.error('[wall.updateSystemTypeBatch.handler] bridge failed:', e);
          }
        }
        const empty: HandlerResult = { forward: [], inverse: [] };
        return empty;
      },
    ); // withHandlerSpan — C10 §2
  },
};
