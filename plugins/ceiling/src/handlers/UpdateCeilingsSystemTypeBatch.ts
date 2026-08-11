// UpdateCeilingsSystemTypeBatchHandler — §FEAT-CEILING-TYPE-BATCH (RAC U7.2).
//
// Bus surface for "change ALL ceilings / the selected ceilings to <type>". Mirrors
// the door, window and slab batch bridges: the typed bus command is the public
// entry point (the RAC chat dispatches it), and the bridge forwards to the
// legacy CommandManager, which owns the undo stack the batch participates in as
// ONE entry.
//
// WHY THIS BRIDGES instead of the plugin's own `ceiling.updateLayers` handler:
// that one produceCommands the DETACHED plugin Immer ceiling store, which is
// populated ONLY for plan-tool ceilings — initBusHandlers records the
// founder-visible symptom of routing there verbatim ("ceiling not found:
// <id>", because the 3D CeilingTool and the project loader write the LEGACY
// CeilingStore). The geometry store the builders read is only reachable
// through the legacy command path.
//
// Payload contract (symmetric with door/window.updateSystemTypeBatch):
//   • `ceilingIds: 'all'`    — every ceiling in the project, ALL levels; or
//   • `ceilingIds: string[]` — an explicit id list (e.g. the current selection).
//   • `systemType`        — id or name; the forgiving lookup and the honest
//                           unknown-type refusal (which LISTS the real
//                           catalogue names) live in the COMMAND.
//
// Partial-failure policy (§CONTEXT-DATA-HONESTY) lives in the COMMAND:
// "Retyped N of M — K skipped". The bridge re-broadcasts it as
// `pryzm-ceiling-type-batch-report`.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateCeilingsSystemTypeBatchCommand } from '@pryzm/command-registry';

export interface UpdateCeilingsSystemTypeBatchPayload {
  /** 'all' = every ceiling in the project (all levels); or an explicit id list. */
  readonly ceilingIds: readonly string[] | 'all';
  /** Ceiling system type id or name (forgiving lookup in the command). */
  readonly systemType: string;
}

/** Detail shape of the `pryzm-ceiling-type-batch-report` CustomEvent. */
export interface CeilingTypeBatchReport {
  readonly success: boolean;
  /** Human-readable lines: summary first, then grouped skip reasons. */
  readonly info: readonly string[];
  readonly affectedElementIds: readonly string[];
}

export const CEILING_TYPE_BATCH_REPORT_EVENT = 'pryzm-ceiling-type-batch-report';

export const UpdateCeilingsSystemTypeBatchHandler: CommandHandler<
  UpdateCeilingsSystemTypeBatchPayload,
  Record<string, unknown>
> = {
  type: 'ceiling.updateSystemTypeBatch',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateCeilingsSystemTypeBatchPayload,
  ): ValidationResult {
    if (cmd.ceilingIds !== 'all' && !Array.isArray(cmd.ceilingIds)) {
      return { valid: false, reason: "ceilingIds must be 'all' or an array of ceiling ids" };
    }
    if (typeof cmd.systemType !== 'string' || cmd.systemType.length === 0) {
      return { valid: false, reason: 'systemType (id or name) is required' };
    }
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateCeilingsSystemTypeBatchPayload,
  ): HandlerResult {
    return withHandlerSpan(
      'ceiling.updateSystemTypeBatch.handler',
      { 'pryzm.command.type': 'ceiling.updateSystemTypeBatch' },
      () => {
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
            const batch = new UpdateCeilingsSystemTypeBatchCommand({
              ceilingIds: cmd.ceilingIds === 'all' ? 'all' : [...cmd.ceilingIds],
              systemType: cmd.systemType,
            });
            const result = cm.execute(batch);
            const report: CeilingTypeBatchReport = {
              success: result?.success ?? false,
              info: result?.info ?? [],
              affectedElementIds: result?.affectedElementIds ?? [],
            };
            window.dispatchEvent(
              new CustomEvent(CEILING_TYPE_BATCH_REPORT_EVENT, { detail: report }),
            );
          } catch (e) {
            console.error('[ceiling.updateSystemTypeBatch.handler] bridge failed:', e);
          }
        }
        const empty: HandlerResult = { forward: [], inverse: [] };
        return empty;
      },
    ); // withHandlerSpan — C10 §2
  },
};
