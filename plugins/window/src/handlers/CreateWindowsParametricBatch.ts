// CreateWindowsParametricBatchHandler — §FEAT-WINDOW-PARAMETRIC-CREATE (ADR-0315).
//
// Bus surface for "create a window in the middle of every wall segment" /
// "a 1x2m window every 3 meters in the ground-floor walls". Mirrors the batch
// bridges: the typed bus command is the public entry point (the RAC chat
// dispatches it after its count-preview Confirm card), and the bridge forwards
// to the legacy CommandManager, which owns the undo stack the batch command
// participates in as ONE entry.
//
// The COMMAND (CreateWindowsParametricBatchCommand) owns all honesty: offset
// math with §WINDOW-CORNER-OVERFLOW capping, per-window occupancy skips via
// the proven CreateWallOpeningCommand child, raked-host refusals (C15), and
// the "Created N of M planned — K skipped" report, re-broadcast here as
// `pryzm-window-parametric-report`.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import {
  CreateWindowsParametricBatchCommand,
  type WindowPlacementMode,
} from '@pryzm/command-registry';

export interface CreateWindowsParametricBatchPayload {
  readonly wallIds: readonly string[] | 'all';
  readonly mode: WindowPlacementMode;
  readonly width: number;
  readonly height: number;
  readonly sillHeight?: number;
  readonly systemTypeId?: string;
}

/** Detail shape of the `pryzm-window-parametric-report` CustomEvent. */
export interface WindowParametricReport {
  readonly success: boolean;
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

export const WINDOW_PARAMETRIC_REPORT_EVENT = 'pryzm-window-parametric-report';

export const CreateWindowsParametricBatchHandler: CommandHandler<
  CreateWindowsParametricBatchPayload,
  Record<string, unknown>
> = {
  type: 'window.parametricCreate',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: CreateWindowsParametricBatchPayload,
  ): ValidationResult {
    if (cmd.wallIds !== 'all' && !Array.isArray(cmd.wallIds)) {
      return { valid: false, reason: "wallIds must be 'all' or an array of wall ids" };
    }
    if (cmd.mode?.kind !== 'count' && cmd.mode?.kind !== 'spacing') {
      return { valid: false, reason: "mode must be { kind: 'count' } or { kind: 'spacing' }" };
    }
    if (typeof cmd.width !== 'number' || typeof cmd.height !== 'number') {
      return { valid: false, reason: 'width and height (metres) are required' };
    }
    // Bounds / margin / occupancy policy live in the COMMAND — one site.
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: CreateWindowsParametricBatchPayload,
  ): HandlerResult {
    return withHandlerSpan(
      'window.parametricCreate.handler',
      { 'pryzm.command.type': 'window.parametricCreate' },
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
          const report: WindowParametricReport = {
            success: false,
            info: [
              `'window.parametricCreate' did not run — ${why}. Nothing was changed, and nothing ` +
              `about the model is confirmed.`,
            ],
            affectedElementIds: [],
            outcome: 'indeterminate',
          };
          try {
            window.dispatchEvent(new CustomEvent(WINDOW_PARAMETRIC_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error('[window.parametricCreate.handler] indeterminate report emit failed:', emitErr);
          }
        };
        if (cm) {
          try {
            const result = cm.execute(
              new CreateWindowsParametricBatchCommand({
                wallIds: cmd.wallIds === 'all' ? 'all' : [...cmd.wallIds],
                mode: cmd.mode,
                width: cmd.width,
                height: cmd.height,
                ...(cmd.sillHeight !== undefined ? { sillHeight: cmd.sillHeight } : {}),
                ...(cmd.systemTypeId !== undefined ? { systemTypeId: cmd.systemTypeId } : {}),
              }),
            );
            const report: WindowParametricReport = {
              success: result?.success ?? false,
              info: result?.info ?? [],
              affectedElementIds: result?.affectedElementIds ?? [],
            };
            window.dispatchEvent(
              new CustomEvent(WINDOW_PARAMETRIC_REPORT_EVENT, { detail: report }),
            );
          } catch (e) {
            console.error('[window.parametricCreate.handler] bridge failed:', e);
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
