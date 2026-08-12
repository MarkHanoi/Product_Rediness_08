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
//
// ─── §FIX-SLAB-BATCH-REFUSAL-DISCARDED (C16 §5.1 CA-18) ──────────────────────
// THE DEFECT THIS FIXES, measured by check-authoritative-state arm S1:
// `slab.updateSystemTypeBatch` resolved the bus dispatch as ok=true while moving
// ZERO authoritative paths. The COMMAND was never the problem — it refuses
// correctly and NAMES its rule ("The slab type catalogue is not available here.",
// UpdateSlabsSystemTypeBatchCommand.ts:210; the unknown-type and empty-scope
// refusals sit beside it at :218 and in canExecute :171-178). This bridge
// COMPUTED that refusal, broadcast it on a CustomEvent, and then returned
// `{ forward: [], inverse: [] }` — which the bus reads as a clean success. The
// truth existed and was destroyed in transit.
//
// C16 §5.1 CA-18 names this exact shape as PROHIBITED: "(b) `{forward:[],
// inverse:[]}` returned as the outcome of a mutation the user asked for".
//
// WHY EXECUTE-TIME AND NOT `canExecute` (the C16 decision, stated):
// CA-18's preferred home is `canExecute`, but it cannot be the home HERE. The
// catalogue is a LEGACY-CONTEXT fact: it lives on `CommandManager`'s
// `CommandContext.stores.slabSystemTypeStore` (initTools.ts:590/:895 thread it),
// which this handler's bus `HandlerContext<Record<string, unknown>>` does not
// carry — the bus ctx and the legacy ctx are different objects with different
// store maps. Reaching it from `canExecute` would mean either importing the
// `@pryzm/geometry-slab` barrel (§SCC-NO-BARREL-ACCESS-AT-MODULE-LOAD, and the
// command's own header at :44 explains why that drags SlabTool + the DOM into
// every consumer) or reaching through `window.commandManager.getContext()` from
// a method the bus contract calls PURE. So `canExecute` stays payload-shape-only
// and store-free, and the refusal is raised at execute time — the identical
// reasoning the three S4-VOICE siblings recorded in this gate's ledger on the
// same day ("existence is a GEOMETRY-STORE fact reachable only at execute time").
//
// WHY THROW: the bus has no other channel. `HandlerResult` (packages/command-bus/
// src/types.ts:85-100) is `{forward, inverse, nextStates?, consequence?}` — there
// is NO success/reason field a handler may populate, so a refusal discovered
// during `execute` can only reach the caller as a rejected promise. Every live
// dispatch site already terminates in a catch: ZeroTokenChatBridge's
// `executeSlice` wraps the single-command path in try/catch (:1141-1145) and the
// multi-command path in `Promise.allSettled` (:1136), turning a rejection into a
// named `dispatch-failed` line; AIPanel.ts:1366 attaches `.catch`.
//
// THE CUSTOMEVENT IS KEPT, UNCHANGED, ON EVERY PATH. It was never the defect —
// the discarded return value was. (Measured: it has no PRODUCTION listener today,
// because `BATCH_REPORT_EVENTS` in apps/editor/src/ui/ai/ZeroTokenChatBridge.ts
// :1021-1064 maps wall/door/window but NOT slab. That omission is a separate
// finding in another lane's territory; removing the emit here would foreclose
// the fix and break the two certification harnesses that DO listen.)

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
        // §FIX-SLAB-BATCH-REFUSAL-DISCARDED — the refusal the bridge must not
        // swallow. Collected here and thrown AFTER the CustomEvent has gone out,
        // so the event-driven listeners keep receiving exactly what they got
        // before and the bus caller additionally learns the truth.
        let refusal: string | null = null;
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
            // CA-18. `CommandManagerImpl.execute` returns a legacy refusal as
            // `{success:false, info:[reason]}` WITHOUT throwing (:172-185), so a
            // bridge that ignores the return value cannot tell a retype from a
            // no-op. Quote the command's OWN sentence — this bridge never
            // invents refusal copy, and never guesses one when `info` is empty.
            if (!report.success) {
              refusal = report.info[0] ?? 'the slab type change was refused, and no reason was given';
            }
          } catch (e) {
            console.error('[slab.updateSystemTypeBatch.handler] bridge failed:', e);
            sayNothingRan(`the bridge threw: ${String((e as Error)?.message ?? e)}`);
            refusal = `the bridge threw: ${String((e as Error)?.message ?? e)}`;
          }
        } else {
          sayNothingRan('the command manager is not available in this session');
          refusal = 'the command manager is not available in this session';
        }
        if (refusal !== null) {
          // Nothing was mutated on any of these paths (S4-STATE was never at
          // risk), so throwing loses no work — it only stops success and refusal
          // being the same observable at the dispatch site.
          throw new Error(`slab.updateSystemTypeBatch: ${refusal}`);
        }
        const empty: HandlerResult = { forward: [], inverse: [] };
        return empty;
      },
    ); // withHandlerSpan — C10 §2
  },
};
