// UpdateDoorsSystemTypeBatchHandler — §FEAT-DOOR-TYPE-BATCH (RAC U4.3).
//
// Bus surface for "change ALL doors / the selected doors to <type>".
// Mirrors the window plugin's UpdateWindowsSystemTypeBatch bridge: the typed
// bus command is the public entry point (the RAC chat dispatches it), and the
// bridge forwards to the legacy CommandManager, which owns the undo stack the
// batch command participates in as ONE entry.
//
// WHY THIS BRIDGES instead of `door.setType` (same plugin): that handler
// `produceCommand`s the plugin's DETACHED DTO store — the
// §FIX-MATERIAL-DEAD-DISPATCH disease; nothing that renders, exports or
// persists reads it (§FIX-HOSTED-TYPE-CHANGE, L-620). The geometry
// `doorStore` that DoorBuilder subscribes to is only reachable through the
// legacy command path.
//
// Payload contract (RAC-friendly, symmetric with window.updateSystemTypeBatch):
//   • `doorIds: 'all'`    — every door in the project, ALL levels; or
//   • `doorIds: string[]` — an explicit id list (e.g. the current selection).
//   • `systemType`        — id or name; the forgiving lookup + honest
//                           unknown-type refusal live in the COMMAND.
//
// Partial-failure policy (§CONTEXT-DATA-HONESTY) lives in the COMMAND
// (`UpdateDoorsSystemTypeBatchCommand`): "Retyped N of M — K skipped". The
// bridge re-broadcasts that report as `pryzm-door-type-batch-report`, and
// nudges the affected HOST WALLS' rebuild so the reveal/lining around each
// opening is re-resolved with the new type's frame depth (the same nudge the
// window batch bridge performs).

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateDoorsSystemTypeBatchCommand } from '@pryzm/command-registry';

export interface UpdateDoorsSystemTypeBatchPayload {
  /** 'all' = every door in the project (all levels); or an explicit id list. */
  readonly doorIds: readonly string[] | 'all';
  /** Door system type id or name (forgiving lookup in the command). */
  readonly systemType: string;
}

/** Detail shape of the `pryzm-door-type-batch-report` CustomEvent. */
export interface DoorTypeBatchReport {
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

export const DOOR_TYPE_BATCH_REPORT_EVENT = 'pryzm-door-type-batch-report';

export const UpdateDoorsSystemTypeBatchHandler: CommandHandler<
  UpdateDoorsSystemTypeBatchPayload,
  Record<string, unknown>
> = {
  type: 'door.updateSystemTypeBatch',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateDoorsSystemTypeBatchPayload,
  ): ValidationResult {
    if (cmd.doorIds !== 'all' && !Array.isArray(cmd.doorIds)) {
      return { valid: false, reason: "doorIds must be 'all' or an array of door ids" };
    }
    if (typeof cmd.systemType !== 'string' || cmd.systemType.length === 0) {
      return { valid: false, reason: 'systemType (id or name) is required' };
    }
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: UpdateDoorsSystemTypeBatchPayload,
  ): HandlerResult {
    return withHandlerSpan(
      'door.updateSystemTypeBatch.handler',
      { 'pryzm.command.type': 'door.updateSystemTypeBatch' },
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
          const report: DoorTypeBatchReport = {
            success: false,
            info: [
              `'door.updateSystemTypeBatch' did not run — ${why}. Nothing was changed, and nothing ` +
              `about the model is confirmed.`,
            ],
            affectedElementIds: [],
            outcome: 'indeterminate',
          };
          try {
            window.dispatchEvent(new CustomEvent(DOOR_TYPE_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error('[door.updateSystemTypeBatch.handler] indeterminate report emit failed:', emitErr);
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
            const batch = new UpdateDoorsSystemTypeBatchCommand({
              doorIds: cmd.doorIds === 'all' ? 'all' : [...cmd.doorIds],
              systemType: cmd.systemType,
            });
            const result = cm.execute(batch);
            // Host-wall reveal/lining re-resolve — same nudge as the window
            // route; the batch reports which walls host a retyped door.
            const hostWalls = batch.affectedWallIds;
            if (result?.success && hostWalls.length > 0) {
              try {
                (window as unknown as {
                  __wallRebuildControl?: { rebuildWalls?: (ids: readonly string[]) => void };
                }).__wallRebuildControl?.rebuildWalls?.(hostWalls);
              } catch (e) {
                console.warn('[door.updateSystemTypeBatch] host-wall rebuild nudge failed:', e);
              }
            }
            const report: DoorTypeBatchReport = {
              success: result?.success ?? false,
              info: result?.info ?? [],
              affectedElementIds: result?.affectedElementIds ?? [],
            };
            window.dispatchEvent(
              new CustomEvent(DOOR_TYPE_BATCH_REPORT_EVENT, { detail: report }),
            );
            // CA-18. Quote the command's OWN sentence — this bridge never
            // invents refusal copy, and never guesses when `info` is empty.
            if (!report.success) {
              refusal = report.info[0] ?? 'the door type change was refused, and no reason was given';
            }
          } catch (e) {
            console.error('[door.updateSystemTypeBatch.handler] bridge failed:', e);
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
          throw new Error(`door.updateSystemTypeBatch: ${refusal}`);
        }
        const empty: HandlerResult = { forward: [], inverse: [] };
        return empty;
      },
    ); // withHandlerSpan — C10 §2
  },
};
