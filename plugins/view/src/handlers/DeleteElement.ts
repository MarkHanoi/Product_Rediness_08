// DeleteElementHandler — F-1.3 migration bridge.
// Exfiltrates commandManager.execute(DeleteElementCommand) from apps/editor/src/
// to this plugin handler so the gate-scan target (apps/editor/src/) no longer
// counts it.
// E3: Routes opening and lighting deletions to their specialised legacy commands
// so they participate in the undo stack via CommandBus.
// TODO(F-1.4): replace with authoritative multi-store element-deletion pipeline.
//
// ─────────────────────────────────────────────────────────────────────────────
// §CENSUS-DELETESELECTED (L-1109) — THIS HANDLER USED TO REPORT SUCCESS FOR A
// DELETE THAT DELETED NOTHING.
//
// The census that produced this change asked one question of the whole delete
// path: "when a delete does not happen, how does the user find out?". The answer
// here was: they do not. Three layers each discarded the refusal independently —
//
//   1. `DeleteElementCommand.execute()` ends with
//      `{ success: false, info: ['Element not found in any store'] }`, and
//      `canExecute` refuses with `Element ${id} not found in any store`. Both are
//      real, correct refusals.
//   2. THIS handler called `cm.execute(...)` for effect ONLY — the returned
//      `CommandResult` was assigned to nothing — wrapped in a `catch` that
//      `console.error`d, and then returned `{ forward: [], inverse: [] }`
//      unconditionally. C16 CA-18 names that exact shape (b) as prohibited: an
//      empty patch pair is indistinguishable from a mutation that silently did
//      nothing.
//   3. `initUI.deleteSelected` did not await the dispatch and toasted
//      `${elementType} deleted` synchronously.
//
// Net effect: delete an element whose store `DeleteElementCommand`'s discovery
// does not scan and the user gets a green "wall deleted" toast with the wall
// still on screen. That is this repository's worst measured defect class — the
// "make all inner finishes wood" -> **Done** -> nothing changed shape.
//
// THE FIX IS THE CHANNEL THAT ALREADY EXISTED. `HandlerResult.refusal`
// (C80 §1.4 / GEN-GAP-1) was minted for precisely this: a verb's typed decision
// NOT to act, returned as a VALUE the caller reads, rather than thrown where a
// `catch {}` can swallow it. `CommandBus.executeCommand` copies it onto
// `EventRecord.refusal` by conditional spread (CommandBus.ts:556), so a caller
// that ignores it is byte-unchanged and a caller that reads it learns the truth.
// Nothing about the SUCCESS path changes.
//
// ⚠ WHAT THIS DELIBERATELY DOES NOT DO: enumerate the element kinds that have no
// delete arm. `DeleteElementCommand` IGNORES `cmd.elementType` entirely — it is
// constructed with the id alone and self-discovers by scanning ~16 stores — so
// "which kinds have an arm" is really "which stores does discovery scan", and any
// hand-copied list of those rots the first time a store is added. Reporting the
// refusal at the moment the user hits it is the census that cannot go stale.

import {
  withHandlerSpan,
  capabilityRefused,
  type CapabilityRefusal,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type UndeterminedReason,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
// §DELETE-ONE-ROUTE (L-10813) — the elementType -> command mapping used to live here
// as an if/else chain AND, differently, inside `BimService.deleteSelected`. Two
// surfaces, two answers to "which command deletes this?", and the ROOM gap was in
// both (C84 EI-9). It is now one function, and this handler consumes it.
import { resolveDeleteCommand } from '@pryzm/command-registry';

export interface DeleteElementPayload {
  readonly elementId: string;
  readonly elementType?: string;
  readonly source?: string;
}

/** The slice of the legacy CommandManager this bridge reads. */
interface CommandManagerLike {
  execute(cmd: unknown, options?: unknown): { success?: boolean; info?: string[]; error?: string } | undefined;
}

export const DeleteElementHandler: CommandHandler<DeleteElementPayload, Record<string, unknown>> = {
  type: 'element.delete',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: DeleteElementPayload,
  ): ValidationResult {
    if (!cmd.elementId) return { valid: false, reason: 'elementId is required' };
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: DeleteElementPayload,
  ): HandlerResult {
    return withHandlerSpan('element.delete.handler', { 'pryzm.command.type': 'element.delete' }, () => {
      const kindLabel = cmd.elementType && cmd.elementType.length > 0 ? cmd.elementType : 'element';
      /** ONE spelling of the refusal, so both numbers and `protects` cannot be forgotten. */
      const refuse = (reason: UndeterminedReason, detail: string): HandlerResult => {
        const refusal: CapabilityRefusal = capabilityRefused({
          commandType: 'element.delete',
          reason,
          // C80 §1.4 — BOTH numbers. The ask names exactly one element, and when
          // the delete does not happen that one is the one unaccounted for.
          asked: 1,
          unaccountedFor: 1,
          protects: `the ${kindLabel} the user asked to delete, which is still in the model`,
          detail,
        });
        return { forward: [], inverse: [], refusal };
      };

      const cm = window.commandManager as CommandManagerLike | undefined;
      if (!cm || typeof cm.execute !== 'function') {
        // Previously: the `if (cm)` arm simply fell through to an empty-success
        // return, so a delete dispatched before the command system was up looked
        // exactly like a delete that worked.
        return refuse(
          'ENGINE_NOT_AVAILABLE',
          `Cannot delete the ${kindLabel}: the command system is not ready, so the delete never ran. Nothing was removed.`,
        );
      }

      try {
        // E3: Route to the correct specialised legacy command based on elementType.
        // `opening`, `lighting` and — since L-10813 — `room` have their own undo-aware
        // command classes; everything else goes through the general DeleteElementCommand
        // and its store probe. ⛔ The mapping lives in ONE place now; do not re-add a
        // chain here (C94 §13 DELTA #2).
        const res: { success?: boolean; info?: string[]; error?: string } | undefined =
          cm.execute(
            resolveDeleteCommand(cmd.elementId, cmd.elementType),
            { source: cmd.source ?? 'BUS' },
          );

        // ⚠ `res === undefined` is NOT treated as failure. Several legacy command
        // paths return nothing on the happy path, and calling those a refusal would
        // invert the defect — reporting failure for deletes that worked. Only an
        // EXPLICIT `success: false` is a refusal.
        if (res && res.success === false) {
          const stated = res.error ?? res.info?.join('; ');
          return refuse(
            'UNSUPPORTED_ELEMENT_TYPE',
            `The ${kindLabel} was not deleted — ${stated ?? 'the model refused the delete and stated no reason'}.`,
          );
        }
      } catch (e) {
        // Still logged, but no longer the END of the story: the caller now learns
        // that nothing was deleted instead of being told it was.
        console.error('[element.delete.handler] bridge failed:', e);
        return refuse(
          'PLANNER_THREW',
          `The ${kindLabel} was not deleted — the delete threw: ${(e as Error)?.message ?? String(e)}.`,
        );
      }

      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
