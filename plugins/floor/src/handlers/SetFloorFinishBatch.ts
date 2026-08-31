// SetFloorFinishBatchHandler — §FEAT-FLOOR-SURFACE-FINISH (L-1881).
//
// Bus surface for the founder's *"finish to wooden parquet"* (2026-08-21). Mirrors
// `plugins/wall/src/handlers/SetWallSideFinishBatch.ts` line for line: the typed
// bus command is the public entry point (the RAC chat dispatches it; the property
// panel could too), and the bridge forwards to the legacy CommandManager, which
// owns the undo stack the batch command participates in as ONE entry.
//
// ⛔ WHY THIS IS A NEW VERB AND NOT `floor.setMaterial`.
//
// `floor.setMaterial` is a DECLARED DEAD VERB. `SetFloorMaterial.ts` in this same
// directory returns `{valid:false}` from `canExecute` with the §FIX-DEAD-VERB-REFUSE
// reason: it writes the plugin's DETACHED Immer DTO store, which PluginRegistry
// builds fresh and which no renderer, no 2-D projector, no IFC exporter and no
// persistence path reads. It was RETAINED (not retired) precisely so the chat's
// refusal could keep citing a registered verb. Overloading it now would either
// resurrect the dead write or silently change what an existing verb means — so the
// live capability gets its own name, exactly as `wall.setSideFinishBatch` did
// beside the dead `wall.setColor`.
//
// WHY THIS BRIDGES rather than `produceCommand`-ing: the geometry store the
// fragment builders actually read (`FloorStore`, core-app-model) is only reachable
// through the legacy command path.
//
// Payload contract (symmetric with wall.setSideFinishBatch):
//   • `floorIds: 'all'`    — every floor finish in the project, ALL levels; or
//   • `floorIds: string[]` — an explicit id list (a level/room scope arrives here
//                            already resolved to ids by ctx.resolveScope).
//   • `finish`             — RESOLVED { materialId, materialColor, materialName };
//                            the finish-NAME table lives in the chat resolver.
//
// Partial-failure policy (§CONTEXT-DATA-HONESTY) lives in the COMMAND: "Set the
// finish X on N of M floors — K skipped", all-refused = visible no-op, never a
// throw, and the read-back counts RECORDS rather than successful calls. The bridge
// re-broadcasts that report as a window CustomEvent so thin UI wrappers can show it
// without owning batch logic.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { SetFloorFinishBatchCommand } from '@pryzm/command-registry';

export interface SetFloorFinishBatchPayload {
  /** 'all' = every floor finish in the project (all levels); or an explicit id list. */
  readonly floorIds: readonly string[] | 'all';
  readonly finish: {
    readonly materialId: string;
    readonly materialColor?: string;
    readonly materialName?: string;
  };
}

/** Detail shape of the `pryzm-floor-finish-batch-report` CustomEvent. */
export interface FloorFinishBatchReport {
  readonly success: boolean;
  /** Human-readable lines: summary first, then grouped skip reasons. */
  readonly info: readonly string[];
  readonly affectedElementIds: readonly string[];
  /**
   * §FIX-REPORT-PAYLOAD-DISCARD (W2-B) — the bridge's OWN verdict, so the chat
   * layer never has to infer one from a boolean. `'indeterminate'` means THE
   * COMMAND NEVER RAN and nothing about the model is confirmed.
   */
  readonly outcome?: 'applied' | 'refused' | 'indeterminate';
}

export const FLOOR_FINISH_BATCH_REPORT_EVENT = 'pryzm-floor-finish-batch-report';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const SetFloorFinishBatchHandler: CommandHandler<
  SetFloorFinishBatchPayload,
  Record<string, unknown>
> = {
  type: 'floor.setFinishBatch',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetFloorFinishBatchPayload,
  ): ValidationResult {
    if (cmd.floorIds !== 'all' && !Array.isArray(cmd.floorIds)) {
      return { valid: false, reason: "floorIds must be 'all' or an array of floor ids" };
    }
    if (!cmd.finish || typeof cmd.finish.materialId !== 'string' || cmd.finish.materialId.length === 0) {
      return { valid: false, reason: 'finish.materialId is required' };
    }
    if (cmd.finish.materialColor !== undefined && !HEX_COLOR_RE.test(cmd.finish.materialColor)) {
      return { valid: false, reason: "finish.materialColor must be a '#rrggbb' hex string" };
    }
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetFloorFinishBatchPayload,
  ): HandlerResult {
    return withHandlerSpan(
      'floor.setFinishBatch.handler',
      { 'pryzm.command.type': 'floor.setFinishBatch' },
      () => {
        const cm = window.commandManager as
          | {
              execute(
                cmd: unknown,
                options?: unknown,
              ): { success: boolean; affectedElementIds: string[]; info?: string[] };
            }
          | undefined;

        const sayNothingRan = (why: string): void => {
          const report: FloorFinishBatchReport = {
            success: false,
            info: [
              `'floor.setFinishBatch' did not run — ${why}. Nothing was changed, and ` +
              `nothing about the model is confirmed.`,
            ],
            affectedElementIds: [],
            outcome: 'indeterminate',
          };
          try {
            window.dispatchEvent(
              new CustomEvent(FLOOR_FINISH_BATCH_REPORT_EVENT, { detail: report }),
            );
          } catch (emitErr) {
            console.error('[floor.setFinishBatch.handler] indeterminate report emit failed:', emitErr);
          }
        };

        // §FIX-BATCH-REFUSAL-DISCARDED (L-1141, C16 §5.1 CA-18, C84 §4F.3) —
        // propagated from `plugins/slab/src/handlers/UpdateSlabsSystemTypeBatch.ts`
        // :186-209. Every path used to end in the same `{forward:[],inverse:[]}`,
        // so failure and emptiness were ONE VALUE at the bus boundary. Every
        // throw happens AFTER the CustomEvent, so listeners are unchanged.
        if (!cm) {
          sayNothingRan('the command manager is not available in this session');
          throw new Error(
            'floor.setFinishBatch: the command manager is not available in this session',
          );
        }

        // Set INSIDE the try, thrown AFTER it: throwing in place would be caught
        // by this block's own `catch` and re-labelled "the bridge threw", which
        // would attribute the command's refusal to a transport failure.
        let refusal: string | null = null;
        try {
          const result = cm.execute(
            new SetFloorFinishBatchCommand({
              floorIds: cmd.floorIds === 'all' ? 'all' : [...cmd.floorIds],
              finish: {
                materialId: cmd.finish.materialId,
                ...(cmd.finish.materialColor !== undefined ? { materialColor: cmd.finish.materialColor } : {}),
                ...(cmd.finish.materialName !== undefined ? { materialName: cmd.finish.materialName } : {}),
              },
            }),
          );

          // §BATCH-UNREADABLE-RESULT-IS-NOT-ZERO (C78 §20 · U-INV-4) —
          // `window.commandManager` is a foreign global, so an unreadable return is
          // reachable, and the command may well have MUTATED the model on the way
          // to returning junk. "I could not read the result" is not "nothing
          // happened", and must not wear the same payload.
          const readable = !!result && Array.isArray(result.affectedElementIds);
          const report: FloorFinishBatchReport = readable
            ? {
                success: result.success ?? false,
                info: result.info ?? [],
                affectedElementIds: result.affectedElementIds,
              }
            : {
                success: false,
                info: [
                  `'floor.setFinishBatch' RAN but the command manager returned no readable ` +
                  `result. WHICH floors changed is not known — this is NOT a report that none did.`,
                ],
                affectedElementIds: [],
                outcome: 'indeterminate',
              };
          window.dispatchEvent(
            new CustomEvent(FLOOR_FINISH_BATCH_REPORT_EVENT, { detail: report }),
          );
          // CA-18. Quote the command's OWN sentence — this bridge never invents
          // refusal copy, and never guesses one when `info` is empty.
          if (!report.success) {
            refusal = report.info[0] ?? 'the floor finish change was refused, and no reason was given';
          }
        } catch (e) {
          console.error('[floor.setFinishBatch.handler] bridge failed:', e);
          sayNothingRan(`the bridge threw: ${String((e as Error)?.message ?? e)}`);
          refusal = `the bridge threw: ${String((e as Error)?.message ?? e)}`;
        }
        if (refusal !== null) {
          // Nothing was mutated on any of these paths, so throwing loses no work
          // — it only stops success and refusal being the same observable at the
          // dispatch site.
          throw new Error(`floor.setFinishBatch: ${refusal}`);
        }

        const empty: HandlerResult = { forward: [], inverse: [] };
        return empty;
      },
    ); // withHandlerSpan — C10 §2
  },
};
