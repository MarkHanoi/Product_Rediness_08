// UpdateSlabsSystemTypeBatchHandler — §FEAT-SLAB-TYPE-BATCH (RAC U7.2).
//
// Bus surface for "change ALL slabs / the selected slabs to <type>". Mirrors the
// door and window plugins' batch bridges: the typed bus command is the public
// entry point (the RAC chat dispatches it), and the bridge forwards to the
// legacy CommandManager, which owns the undo stack the batch participates in as
// ONE entry.
//
// WHY THIS BRIDGES instead of `slab.setType` (same plugin): that handler
// `produceCommand`s the plugin's DETACHED DTO store — its own header says it
// "simply records the type id on the DTO" — and initBusHandlers records the
// founder-visible symptom of routing there ("slab not found: <id>", because the
// plugin store is empty for SlabTool-created slabs). The geometry `slabStore`
// the fragment builders read is only reachable through the legacy command path.
//
// Payload contract (symmetric with door/window.updateSystemTypeBatch):
//   • `slabIds: 'all'`    — every slab in the project, ALL levels; or
//   • `slabIds: string[]` — an explicit id list (e.g. the current selection).
//   • `systemType`        — id or name; the forgiving lookup and the honest
//                           unknown-type refusal (which LISTS the real
//                           catalogue names) live in the COMMAND.
//
// Partial-failure policy (§CONTEXT-DATA-HONESTY) lives in the COMMAND:
// "Retyped N of M — K skipped". The bridge re-broadcasts it as
// `pryzm-slab-type-batch-report`.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateSlabsSystemTypeBatchCommand } from '@pryzm/command-registry';

export interface UpdateSlabsSystemTypeBatchPayload {
  /** 'all' = every slab in the project (all levels); or an explicit id list. */
  readonly slabIds: readonly string[] | 'all';
  /** Slab system type id or name (forgiving lookup in the command). */
  readonly systemType: string;
}

/** Detail shape of the `pryzm-slab-type-batch-report` CustomEvent. */
export interface SlabTypeBatchReport {
  readonly success: boolean;
  /** Human-readable lines: summary first, then grouped skip reasons. */
  readonly info: readonly string[];
  readonly affectedElementIds: readonly string[];
  /**
   * §FIX-REPORT-PAYLOAD-DISCARD (W2-B) — the bridge's OWN verdict, so the chat
   * layer never has to infer one from a boolean.
   *
   * `'indeterminate'` means THE COMMAND NEVER RAN and nothing about the model is
   * confirmed: the legacy `window.commandManager` sink was absent, or the bridge
   * threw. Both of those used to produce NO EVENT AT ALL, and a listener that
   * sees no report cannot tell silence from a clean run (C68 §5.g: "Done" only
   * after a command reports success). Absent ⇒ derived from `success`, which is
   * what the ordinary applied/refused paths still send.
   */
  readonly outcome?: 'applied' | 'refused' | 'indeterminate';
}

export const SLAB_TYPE_BATCH_REPORT_EVENT = 'pryzm-slab-type-batch-report';

export const UpdateSlabsSystemTypeBatchHandler: CommandHandler<
  UpdateSlabsSystemTypeBatchPayload,
  Record<string, unknown>
> = {
  type: 'slab.updateSystemTypeBatch',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateSlabsSystemTypeBatchPayload,
  ): ValidationResult {
    if (cmd.slabIds !== 'all' && !Array.isArray(cmd.slabIds)) {
      return { valid: false, reason: "slabIds must be 'all' or an array of slab ids" };
    }
    if (typeof cmd.systemType !== 'string' || cmd.systemType.length === 0) {
      return { valid: false, reason: 'systemType (id or name) is required' };
    }
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateSlabsSystemTypeBatchPayload,
  ): HandlerResult {
    return withHandlerSpan(
      'slab.updateSystemTypeBatch.handler',
      { 'pryzm.command.type': 'slab.updateSystemTypeBatch' },
      () => {
        const cm = window.commandManager as
          | {
              execute(
                cmd: unknown,
                options?: unknown,
              ): { success: boolean; affectedElementIds: string[]; info?: string[] };
            }
          | undefined;
        // §FIX-REPORT-PAYLOAD-DISCARD (W2-B) — the two paths on which this
        // bridge used to emit NOTHING: no command sink, and a throw that only
        // reached console.error. Silence is indistinguishable from a clean run
        // at every layer above, so both now broadcast an INDETERMINATE report.
        // This is not a failure claim — it is a refusal to claim anything.
        const sayNothingRan = (why: string): void => {
          const report: SlabTypeBatchReport = {
            success: false,
            info: [
              `'slab.updateSystemTypeBatch' did not run — ${why}. Nothing was changed, and nothing ` +
              `about the model is confirmed.`,
            ],
            affectedElementIds: [],
            outcome: 'indeterminate',
          };
          try {
            window.dispatchEvent(new CustomEvent(SLAB_TYPE_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error('[slab.updateSystemTypeBatch.handler] indeterminate report emit failed:', emitErr);
          }
        };
        if (cm) {
          try {
            const batch = new UpdateSlabsSystemTypeBatchCommand({
              slabIds: cmd.slabIds === 'all' ? 'all' : [...cmd.slabIds],
              systemType: cmd.systemType,
            });
            const result = cm.execute(batch);
            const report: SlabTypeBatchReport = {
              success: result?.success ?? false,
              info: result?.info ?? [],
              affectedElementIds: result?.affectedElementIds ?? [],
            };
            window.dispatchEvent(
              new CustomEvent(SLAB_TYPE_BATCH_REPORT_EVENT, { detail: report }),
            );
          } catch (e) {
            console.error('[slab.updateSystemTypeBatch.handler] bridge failed:', e);
            sayNothingRan(`the bridge threw: ${String((e as Error)?.message ?? e)}`);
          }
        } else {
          sayNothingRan('the command manager is not available in this session');
        }
        const empty: HandlerResult = { forward: [], inverse: [] };
        return empty;
      },
    ); // withHandlerSpan — C10 §2
  },
};
