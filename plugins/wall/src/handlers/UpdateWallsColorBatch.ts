// UpdateWallsColorBatchHandler — §FEAT-WALL-COLOR-BATCH (ADR-0314).
//
// Bus surface for "make ALL walls / these walls white". Mirrors the
// §FEAT-WALL-TYPE-BATCH bridge pattern one file over: the typed bus command is
// the public entry point (the RAC chat dispatches it; a future pill can too),
// and the bridge forwards to the legacy CommandManager, which owns the undo
// stack the batch command participates in as ONE entry.
//
// WHY THIS BRIDGES instead of using `wall.bulkSetVisuals` (same plugin): that
// handler `produceCommand`s the plugin's DETACHED DTO store — the
// §FIX-MATERIAL-DEAD-DISPATCH disease; nothing that renders, exports or
// persists reads it (see MaterialDispatch.ts:76-108 and ADR-0314 §Wall colour).
// The geometry store the fragment builders read is only reachable through the
// legacy command path, exactly as for the type batch.
//
// Payload contract (RAC-friendly, symmetric with wall.updateSystemTypeBatch):
//   • `wallIds: 'all'`    — every wall in the project, ALL levels; or
//   • `wallIds: string[]` — an explicit id list (e.g. the current selection).
//   • `materialColor?`    — '#rrggbb' (the resolver owns colour-name → hex).
//   • `materialId?`       — catalogue id, `null` clears the binding.
//
// Partial-failure policy (§CONTEXT-DATA-HONESTY) lives in the COMMAND
// (`UpdateWallsColorBatchCommand`): "Recoloured N of M — K skipped", all-refused
// = visible no-op, never a throw. The bridge re-broadcasts that report as a
// `pryzm-wall-color-batch-report` window CustomEvent so thin UI wrappers can
// show it without owning batch logic.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateWallsColorBatchCommand } from '@pryzm/command-registry';

export interface UpdateWallsColorBatchPayload {
  /** 'all' = every wall in the project (all levels); or an explicit id list. */
  readonly wallIds: readonly string[] | 'all';
  /** New override colour as '#rrggbb'. */
  readonly materialColor?: string;
  /** Catalogue material id, or null to clear. */
  readonly materialId?: string | null;
}

/** Detail shape of the `pryzm-wall-color-batch-report` CustomEvent. */
export interface WallColorBatchReport {
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

export const WALL_COLOR_BATCH_REPORT_EVENT = 'pryzm-wall-color-batch-report';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const UpdateWallsColorBatchHandler: CommandHandler<
  UpdateWallsColorBatchPayload,
  Record<string, unknown>
> = {
  type: 'wall.updateColorBatch',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateWallsColorBatchPayload,
  ): ValidationResult {
    if (cmd.wallIds !== 'all' && !Array.isArray(cmd.wallIds)) {
      return { valid: false, reason: "wallIds must be 'all' or an array of wall ids" };
    }
    if (cmd.materialColor === undefined && cmd.materialId === undefined) {
      return { valid: false, reason: 'at least one of materialColor / materialId is required' };
    }
    if (cmd.materialColor !== undefined && !HEX_COLOR_RE.test(cmd.materialColor)) {
      return { valid: false, reason: "materialColor must be a '#rrggbb' hex string" };
    }
    if (
      cmd.materialId !== undefined &&
      cmd.materialId !== null &&
      (typeof cmd.materialId !== 'string' || cmd.materialId.length === 0)
    ) {
      return { valid: false, reason: 'materialId must be a non-empty string or null' };
    }
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateWallsColorBatchPayload,
  ): HandlerResult {
    return withHandlerSpan(
      'wall.updateColorBatch.handler',
      { 'pryzm.command.type': 'wall.updateColorBatch' },
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
          const report: WallColorBatchReport = {
            success: false,
            info: [
              `'wall.updateColorBatch' did not run — ${why}. Nothing was changed, and nothing ` +
              `about the model is confirmed.`,
            ],
            affectedElementIds: [],
            outcome: 'indeterminate',
          };
          try {
            window.dispatchEvent(new CustomEvent(WALL_COLOR_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error('[wall.updateColorBatch.handler] indeterminate report emit failed:', emitErr);
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
              new UpdateWallsColorBatchCommand({
                wallIds: cmd.wallIds === 'all' ? 'all' : [...cmd.wallIds],
                ...(cmd.materialColor !== undefined ? { materialColor: cmd.materialColor } : {}),
                ...(cmd.materialId !== undefined ? { materialId: cmd.materialId } : {}),
              }),
            );
            // Visible partial-failure reporting, same contract as the type batch:
            // a refusal and a success are never the same observable at the UI.
            // §BATCH-UNREADABLE-RESULT-IS-NOT-ZERO (C78 §20 · U-INV-4).
            // This block read `affectedElementIds: result?.affectedElementIds ?? []`,
            // which announced "this batch changed zero walls" whenever the
            // command manager returned something unreadable — the SAME payload a
            // batch that genuinely changed nothing emits. `window.commandManager`
            // is a foreign global, so that branch is reachable, and the command
            // may well have MUTATED the model on the way to returning junk.
            // "I could not read the result" is not "nothing happened".
            // Routed into the `'indeterminate'` outcome this file already
            // carries for its other two blind paths — no new vocabulary.
            const readable = !!result && Array.isArray(result.affectedElementIds);
            const report: WallColorBatchReport = readable
              ? {
                  success: result.success ?? false,
                  info: result.info ?? [],
                  affectedElementIds: result.affectedElementIds,
                }
              : {
                  success: false,
                  info: [
                    `'wall.updateColorBatch' RAN but the command manager returned no readable ` +
                    `result. WHICH walls changed is not known — this is NOT a report that none did.`,
                  ],
                  affectedElementIds: [],
                  outcome: 'indeterminate',
                };
            window.dispatchEvent(
              new CustomEvent(WALL_COLOR_BATCH_REPORT_EVENT, { detail: report }),
            );
            // CA-18. Quote the command's OWN sentence — this bridge never
            // invents refusal copy, and never guesses one when `info` is empty.
            if (!report.success) {
              refusal = report.info[0] ?? 'the wall colour change was refused, and no reason was given';
            }
          } catch (e) {
            console.error('[wall.updateColorBatch.handler] bridge failed:', e);
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
          throw new Error(`wall.updateColorBatch: ${refusal}`);
        }
        const empty: HandlerResult = { forward: [], inverse: [] };
        return empty;
      },
    ); // withHandlerSpan — C10 §2
  },
};
