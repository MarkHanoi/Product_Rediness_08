// UpdateWallsRakeBatchHandler — §FEAT-WALL-RAKE-BATCH (ADR-0315).
//
// Bus surface for "make ALL walls / these walls angled by 70°". Mirrors the
// §FEAT-WALL-COLOR-BATCH bridge one file over: the typed bus command is the
// public entry point (the RAC chat dispatches it; a future pill can too), and
// the bridge forwards to the legacy CommandManager, which owns the undo stack
// the batch command participates in as ONE entry.
//
// WHY THIS BRIDGES: the one live single-wall rake route is the generic
// `element.updateParameters` (the property panel's path) — single-wall by
// payload, and it does NOT consult `rakeAuthorability`, so a naive chat
// fan-out would report success on walls the store silently refused (curved /
// layered / opening-hosting). The batch COMMAND owns that honesty
// (`UpdateWallsRakeBatchCommand`): "Raked N of M — K skipped: <reason>",
// all-refused = visible no-op, never a throw. The bridge re-broadcasts the
// report as a `pryzm-wall-rake-batch-report` window CustomEvent so thin UI
// wrappers can show it without owning batch logic.
//
// Payload contract (RAC-friendly, symmetric with wall.updateColorBatch):
//   • `wallIds: 'all'`    — every wall in the project, ALL levels; or
//   • `wallIds: string[]` — an explicit id list (selection / level / room).
//   • `rakeAngleDeg`      — degrees, 90 = vertical, range [15, 165].

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateWallsRakeBatchCommand } from '@pryzm/command-registry';

export interface UpdateWallsRakeBatchPayload {
  /** 'all' = every wall in the project (all levels); or an explicit id list. */
  readonly wallIds: readonly string[] | 'all';
  /** Target lean in degrees; 90 = vertical. Range [15, 165]. */
  readonly rakeAngleDeg: number;
}

/** Detail shape of the `pryzm-wall-rake-batch-report` CustomEvent. */
export interface WallRakeBatchReport {
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

export const WALL_RAKE_BATCH_REPORT_EVENT = 'pryzm-wall-rake-batch-report';

export const UpdateWallsRakeBatchHandler: CommandHandler<
  UpdateWallsRakeBatchPayload,
  Record<string, unknown>
> = {
  type: 'wall.updateRakeBatch',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateWallsRakeBatchPayload,
  ): ValidationResult {
    if (cmd.wallIds !== 'all' && !Array.isArray(cmd.wallIds)) {
      return { valid: false, reason: "wallIds must be 'all' or an array of wall ids" };
    }
    if (typeof cmd.rakeAngleDeg !== 'number' || !Number.isFinite(cmd.rakeAngleDeg)) {
      return { valid: false, reason: 'rakeAngleDeg must be a finite number of degrees' };
    }
    // Range policy is judged by the COMMAND via the geometry-wall single gate
    // (isRakeInRange) — not re-typed here, so the bounds live in one place.
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateWallsRakeBatchPayload,
  ): HandlerResult {
    return withHandlerSpan(
      'wall.updateRakeBatch.handler',
      { 'pryzm.command.type': 'wall.updateRakeBatch' },
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
        // §FIX-REPORT-PAYLOAD-DISCARD (W2-B) — the two paths on which this
        // bridge used to emit NOTHING: no command sink, and a throw that only
        // reached console.error. Silence is indistinguishable from a clean run
        // at every layer above, so both now broadcast an INDETERMINATE report.
        // This is not a failure claim — it is a refusal to claim anything.
        const sayNothingRan = (why: string): void => {
          const report: WallRakeBatchReport = {
            success: false,
            info: [
              `'wall.updateRakeBatch' did not run — ${why}. Nothing was changed, and nothing ` +
              `about the model is confirmed.`,
            ],
            affectedElementIds: [],
            outcome: 'indeterminate',
          };
          try {
            window.dispatchEvent(new CustomEvent(WALL_RAKE_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error('[wall.updateRakeBatch.handler] indeterminate report emit failed:', emitErr);
          }
        };
        // §FIX-BATCH-REFUSAL-DISCARDED (L-1141, C16 §5.1 CA-18, C84 §4F.3) —
        // propagated from `plugins/slab/src/handlers/UpdateSlabsSystemTypeBatch.ts`
        // :186-209. Every path used to end in the same `{forward:[],inverse:[]}`,
        // so failure and emptiness were ONE VALUE at the bus boundary. Set inside
        // the try, thrown after it, always AFTER the CustomEvent (L-996 closed).
        let refusal: string | null = null;
        if (cm) {
          try {
            const result = cm.execute(
              new UpdateWallsRakeBatchCommand({
                wallIds: cmd.wallIds === 'all' ? 'all' : [...cmd.wallIds],
                rakeAngleDeg: cmd.rakeAngleDeg,
              }),
            );
            // Visible partial-failure reporting, same contract as the colour
            // batch: a refusal and a success are never the same observable.
            // §BATCH-UNREADABLE-RESULT-IS-NOT-ZERO (C78 §20 · U-INV-4) — see
            // UpdateWallsColorBatch for the full statement. `?? []` announced
            // "zero walls changed" for an unreadable result, which is the same
            // payload an honestly-empty batch emits; the command may have
            // mutated the model before returning junk. Now routed into the
            // `'indeterminate'` outcome this file already carries.
            const readable = !!result && Array.isArray(result.affectedElementIds);
            const report: WallRakeBatchReport = readable
              ? {
                  success: result.success ?? false,
                  info: result.info ?? [],
                  affectedElementIds: result.affectedElementIds,
                }
              : {
                  success: false,
                  info: [
                    `'wall.updateRakeBatch' RAN but the command manager returned no readable ` +
                    `result. WHICH walls changed is not known — this is NOT a report that none did.`,
                  ],
                  affectedElementIds: [],
                  outcome: 'indeterminate',
                };
            window.dispatchEvent(
              new CustomEvent(WALL_RAKE_BATCH_REPORT_EVENT, { detail: report }),
            );
            // CA-18. Quote the command's OWN sentence — this bridge never
            // invents refusal copy, and never guesses one when `info` is empty.
            if (!report.success) {
              refusal = report.info[0] ?? 'the wall rake change was refused, and no reason was given';
            }
          } catch (e) {
            console.error('[wall.updateRakeBatch.handler] bridge failed:', e);
            sayNothingRan(`the bridge threw: ${String((e as Error)?.message ?? e)}`);
            refusal = `the bridge threw: ${String((e as Error)?.message ?? e)}`;
          }
        } else {
          sayNothingRan('the command manager is not available in this session');
          refusal = 'the command manager is not available in this session';
        }
        if (refusal !== null) {
          // Nothing was mutated on any of these paths, so throwing loses no work
          // — it only stops success and refusal being the same observable at the
          // dispatch site.
          throw new Error(`wall.updateRakeBatch: ${refusal}`);
        }
        const empty: HandlerResult = { forward: [], inverse: [] };
        return empty;
      },
    ); // withHandlerSpan — C10 §2
  },
};
