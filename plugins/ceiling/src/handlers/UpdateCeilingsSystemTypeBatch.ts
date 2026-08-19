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
        // §FIX-REPORT-PAYLOAD-DISCARD (W2-B) — the two paths on which this
        // bridge used to emit NOTHING: no command sink, and a throw that only
        // reached console.error. Silence is indistinguishable from a clean run
        // at every layer above, so both now broadcast an INDETERMINATE report.
        // This is not a failure claim — it is a refusal to claim anything.
        const sayNothingRan = (why: string): void => {
          const report: CeilingTypeBatchReport = {
            success: false,
            info: [
              `'ceiling.updateSystemTypeBatch' did not run — ${why}. Nothing was changed, and nothing ` +
              `about the model is confirmed.`,
            ],
            affectedElementIds: [],
            outcome: 'indeterminate',
          };
          try {
            window.dispatchEvent(new CustomEvent(CEILING_TYPE_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error('[ceiling.updateSystemTypeBatch.handler] indeterminate report emit failed:', emitErr);
          }
        };
        // §FIX-BATCH-REFUSAL-DISCARDED (L-1141, C16 §5.1 CA-18, C84 §4F.3) — the
        // refusal the bridge must not swallow.
        //
        // ⛔ Until now `execute()` ended with an UNCONDITIONAL
        // `{forward:[], inverse:[]}`, reached identically on FOUR outcomes: N
        // elements retyped; the command REFUSED EVERYTHING
        // (`CommandManagerImpl.execute` returns `{success:false, info:[reason]}`
        // WITHOUT throwing); the bridge THREW; and there was no command manager.
        // FAILURE AND EMPTINESS WERE THE SAME VALUE at the bus boundary — the
        // L-995 defect class.
        //
        // ⭐ The chat transcript was honest only by accident of subscription:
        // `BATCH_REPORT_EVENTS` listens to the CustomEvent below. EVERY OTHER
        // CALLER saw unconditional success. A truthful transcript layered over a
        // lying verb is what let L-995 survive a week.
        //
        // The fix is `plugins/slab/src/handlers/UpdateSlabsSystemTypeBatch.ts:167-209`,
        // applied to the sibling it was never propagated to. The throw happens
        // AFTER the CustomEvent, so listeners receive exactly what they did before.
        let refusal: string | null = null;
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
            // CA-18. Quote the command's OWN sentence — this bridge never
            // invents refusal copy, and never guesses when `info` is empty.
            if (!report.success) {
              refusal = report.info[0] ?? 'the ceiling type change was refused, and no reason was given';
            }
          } catch (e) {
            console.error('[ceiling.updateSystemTypeBatch.handler] bridge failed:', e);
            sayNothingRan(`the bridge threw: ${String((e as Error)?.message ?? e)}`);
            refusal = `the bridge threw: ${String((e as Error)?.message ?? e)}`;
          }
        } else {
          sayNothingRan('the command manager is not available in this session');
          refusal = 'the command manager is not available in this session';
        }
        if (refusal !== null) {
          // Nothing was mutated on any of these paths, so throwing loses no
          // work — it only stops success and refusal being the same
          // observable at the dispatch site.
          throw new Error(`ceiling.updateSystemTypeBatch: ${refusal}`);
        }
        const empty: HandlerResult = { forward: [], inverse: [] };
        return empty;
      },
    ); // withHandlerSpan — C10 §2
  },
};
