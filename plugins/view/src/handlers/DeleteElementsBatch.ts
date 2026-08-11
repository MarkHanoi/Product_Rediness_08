// DeleteElementsBatchHandler — §FEAT-SCOPED-DELETE (RAC U9.2).
//
// Bus surface for "delete all furniture in the kitchen" / "remove every window
// on level 2". The sibling of `element.delete`, and it exists for exactly one
// reason that verb cannot serve: N dispatches of `element.delete` are N UNDO
// ENTRIES, so undoing a mistaken "delete every window on level 2" would mean
// forty Ctrl-Zs. This bridges to `DeleteElementsBatchCommand`, which composes
// the same `DeleteElementCommand` children into ONE entry (ADR-0314: never by
// holding a batch open).
//
// Payload contract:
//   • `elementIds: string[]` — an EXPLICIT list, always. There is deliberately
//     no `'all'` form: the chat resolves the scope to ids first so the Confirm
//     card can state the real COUNT before the user agrees to it. A destructive
//     verb that promises to find out how much it deletes afterwards is not a
//     verb this repository ships.
//   • `elementKind?` — the noun for the report copy only; it never filters.
//
// Partial-failure policy (§CONTEXT-DATA-HONESTY) lives in the COMMAND:
// "Deleted 40 of 42 furnitures — 2 skipped: …". The bridge re-broadcasts it as
// `pryzm-delete-batch-report`, the same shape the type batches use.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { DeleteElementsBatchCommand } from '@pryzm/command-registry';

export interface DeleteElementsBatchPayload {
  /** The resolved ids to delete. Never 'all' — see the header. */
  readonly elementIds: readonly string[];
  /** Noun for the report copy ("furniture", "window"); never a filter. */
  readonly elementKind?: string;
}

/** Detail shape of the `pryzm-delete-batch-report` CustomEvent. */
export interface DeleteBatchReport {
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
   * threw. Both of those used to produce NO EVENT AT ALL, and
   * ZeroTokenChatBridge read "no report" as `{ ok: true }` and printed "Done"
   * over a model nothing had touched (C68 §5.g: "Done" only after a command
   * reports success). Absent ⇒ derived from `success`, which is what the
   * ordinary applied/refused paths still send.
   */
  readonly outcome?: 'applied' | 'refused' | 'indeterminate';
}

export const DELETE_BATCH_REPORT_EVENT = 'pryzm-delete-batch-report';

export const DeleteElementsBatchHandler: CommandHandler<
  DeleteElementsBatchPayload,
  Record<string, unknown>
> = {
  type: 'element.deleteBatch',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: DeleteElementsBatchPayload,
  ): ValidationResult {
    if (!Array.isArray(cmd.elementIds)) {
      return { valid: false, reason: 'elementIds must be an array of element ids' };
    }
    if (cmd.elementIds.length === 0) {
      return { valid: false, reason: 'elementIds must not be empty' };
    }
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: DeleteElementsBatchPayload,
  ): HandlerResult {
    return withHandlerSpan(
      'element.deleteBatch.handler',
      { 'pryzm.command.type': 'element.deleteBatch' },
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
          const report: DeleteBatchReport = {
            success: false,
            info: [
              `'element.deleteBatch' did not run — ${why}. Nothing was changed, and nothing ` +
              `about the model is confirmed.`,
            ],
            affectedElementIds: [],
            outcome: 'indeterminate',
          };
          try {
            window.dispatchEvent(new CustomEvent(DELETE_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error('[element.deleteBatch.handler] indeterminate report emit failed:', emitErr);
          }
        };
        if (cm) {
          try {
            const batch = new DeleteElementsBatchCommand({
              elementIds: [...cmd.elementIds],
              ...(cmd.elementKind !== undefined ? { elementKind: cmd.elementKind } : {}),
            });
            const result = cm.execute(batch);
            const report: DeleteBatchReport = {
              success: result?.success ?? false,
              info: result?.info ?? [],
              affectedElementIds: result?.affectedElementIds ?? [],
            };
            window.dispatchEvent(
              new CustomEvent(DELETE_BATCH_REPORT_EVENT, { detail: report }),
            );
          } catch (e) {
            console.error('[element.deleteBatch.handler] bridge failed:', e);
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
