// AddWallLayerBatchHandler — §FEAT-WALL-LAYER-ADD-BATCH (ADR-0315).
//
// Bus surface for "add a 10mm plaster finish to the inner side of the selected
// wall / all walls". Mirrors the rake/colour batch bridges: the typed bus
// command is the public entry point (the RAC chat dispatches it), and the
// bridge forwards to the legacy CommandManager, which owns the undo stack the
// batch command participates in as ONE entry.
//
// WHY THIS BRIDGES instead of `wall.setLayers` (same plugin): that handler
// `produceCommand`s the plugin's DETACHED DTO store — the
// §FIX-MATERIAL-DEAD-DISPATCH disease; nothing that renders, exports or
// persists reads it. The batch command's children run the property panel's
// proven instance-scoped route (UpdateWallSystemTypeCommand → geometry
// wallStore → fragment rebuild), which also carries the L-812 rake gate so a
// raked wall REFUSES the layer instead of crashing.
//
// Payload contract (values arrive RESOLVED — the finish-name vocabulary lives
// in the chat resolver's finishRef table, not here):
//   • `wallIds: 'all'` | string[]
//   • `side: 'interior' | 'exterior'`
//   • `thickness` (metres) · `name` · `materialColor` ('#rrggbb') · `materialId?`
//   • `layerFunction?` (defaults from side)

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { AddWallLayerBatchCommand } from '@pryzm/command-registry';

export interface AddWallLayerBatchPayload {
  readonly wallIds: readonly string[] | 'all';
  readonly side: 'interior' | 'exterior';
  readonly thickness: number;
  readonly name: string;
  readonly materialColor: string;
  readonly materialId?: string;
  readonly layerFunction?: string;
}

/** Detail shape of the `pryzm-wall-layer-batch-report` CustomEvent. */
export interface WallLayerBatchReport {
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

export const WALL_LAYER_BATCH_REPORT_EVENT = 'pryzm-wall-layer-batch-report';

export const AddWallLayerBatchHandler: CommandHandler<
  AddWallLayerBatchPayload,
  Record<string, unknown>
> = {
  type: 'wall.addLayerBatch',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: AddWallLayerBatchPayload,
  ): ValidationResult {
    if (cmd.wallIds !== 'all' && !Array.isArray(cmd.wallIds)) {
      return { valid: false, reason: "wallIds must be 'all' or an array of wall ids" };
    }
    if (cmd.side !== 'interior' && cmd.side !== 'exterior') {
      return { valid: false, reason: "side must be 'interior' or 'exterior'" };
    }
    if (typeof cmd.thickness !== 'number' || !Number.isFinite(cmd.thickness)) {
      return { valid: false, reason: 'thickness (metres) is required' };
    }
    // Bounds / colour-shape / name policy live in the COMMAND — one site.
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: AddWallLayerBatchPayload,
  ): HandlerResult {
    return withHandlerSpan(
      'wall.addLayerBatch.handler',
      { 'pryzm.command.type': 'wall.addLayerBatch' },
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
          const report: WallLayerBatchReport = {
            success: false,
            info: [
              `'wall.addLayerBatch' did not run — ${why}. Nothing was changed, and nothing ` +
              `about the model is confirmed.`,
            ],
            affectedElementIds: [],
            outcome: 'indeterminate',
          };
          try {
            window.dispatchEvent(new CustomEvent(WALL_LAYER_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error('[wall.addLayerBatch.handler] indeterminate report emit failed:', emitErr);
          }
        };
        if (cm) {
          try {
            const result = cm.execute(
              new AddWallLayerBatchCommand({
                wallIds: cmd.wallIds === 'all' ? 'all' : [...cmd.wallIds],
                side: cmd.side,
                thickness: cmd.thickness,
                name: cmd.name,
                materialColor: cmd.materialColor,
                ...(cmd.materialId !== undefined ? { materialId: cmd.materialId } : {}),
                ...(cmd.layerFunction !== undefined ? { layerFunction: cmd.layerFunction } : {}),
              }),
            );
            const report: WallLayerBatchReport = {
              success: result?.success ?? false,
              info: result?.info ?? [],
              affectedElementIds: result?.affectedElementIds ?? [],
            };
            window.dispatchEvent(
              new CustomEvent(WALL_LAYER_BATCH_REPORT_EVENT, { detail: report }),
            );
          } catch (e) {
            console.error('[wall.addLayerBatch.handler] bridge failed:', e);
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
