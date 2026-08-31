// BulkUpdateCurtainWallParameterHandler — §CWPROPS152.
//
// Bus surface for "change the mullion size / panel thickness / post spacing /
// transom spacing of one curtain wall, every wall on a level, every wall in
// the project, or an explicit (upstream-resolved) id list — e.g. every wall
// hosted in a west-facing facade." Mirrors the bridge shape
// `BulkUpdateCurtainPanels.ts` (this directory, §RACORIENT145) established:
// the typed bus command is the public entry point, and the bridge forwards to
// the legacy CommandManager, which owns the undo stack the batch command
// participates in as ONE entry.
//
// ⛔ DELIBERATELY NOT `produceCommand` / the new CommandBus context — for the
// SAME reason `BulkUpdateCurtainPanels.ts` states in its own header: the
// legacy `window.commandManager` path is what reaches the REAL
// `context.stores.curtainWallStore` `UpdateCurtainWallCommand` (the child this
// batch composes) already depends on — see that command's own header,
// `packages/command-registry/src/curtainwall/UpdateCurtainWallCommand.ts`.
//
// Payload contract (mirrors §RACORIENT145's proven scope shape, plus the
// `'ids'` arm for an upstream-resolved compass scope):
//   • `scope: { kind: 'element', elementId }`             — one curtain wall.
//   • `scope: { kind: 'level', levelId }`                 — every curtain wall
//                                                            on that level.
//   • `scope: { kind: 'project' }`                        — every curtain wall
//                                                            in the project.
//   • `scope: { kind: 'ids', curtainWallIds }`             — an explicit
//                                                            pre-resolved list
//                                                            (orientation
//                                                            scoping lands
//                                                            here).
//   • `parameter`  — one of `CURTAIN_WALL_PARAMETER_KEYS`
//                     (@pryzm/geometry-curtain-wall): `mullionSize`,
//                     `panelThickness`, `gridXSpacing`, `gridYSpacing`.
//   • `value`      — METRES, always (see the command's own header for the
//                     unit convention and why a bare number is never
//                     interpreted as millimetres).
//
// Partial-failure policy (§CONTEXT-DATA-HONESTY) lives in the COMMAND
// (`BulkUpdateCurtainWallParameterCommand`): apply to every wall the scope
// reaches, refuse-with-reason any that vanish or cannot take the change,
// "Changed N of M — K skipped" in CommandResult.info, a scope matching ZERO
// walls is a visible no-op, never a throw.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import {
  BulkUpdateCurtainWallParameterCommand,
  type CurtainWallParameterBatchScope,
} from '@pryzm/command-registry';

export interface BulkUpdateCurtainWallParameterPayload {
  readonly scope: CurtainWallParameterBatchScope;
  readonly parameter: string;
  readonly value: number;
}

/** Detail shape of the `pryzm-curtain-wall-parameter-batch-report` CustomEvent. */
export interface CurtainWallParameterBatchReport {
  readonly success: boolean;
  readonly info: readonly string[];
  readonly affectedElementIds: readonly string[];
  readonly outcome?: 'applied' | 'refused' | 'indeterminate';
}

export const CURTAIN_WALL_PARAMETER_BATCH_REPORT_EVENT = 'pryzm-curtain-wall-parameter-batch-report';

function isValidScope(scope: unknown): scope is CurtainWallParameterBatchScope {
  if (typeof scope !== 'object' || scope === null) return false;
  const s = scope as { kind?: unknown; elementId?: unknown; levelId?: unknown; curtainWallIds?: unknown };
  if (s.kind === 'element') return typeof s.elementId === 'string' && s.elementId.length > 0;
  if (s.kind === 'level') return typeof s.levelId === 'string' && s.levelId.length > 0;
  if (s.kind === 'project') return true;
  if (s.kind === 'ids') return Array.isArray(s.curtainWallIds) && s.curtainWallIds.every((id) => typeof id === 'string');
  return false;
}

export const BulkUpdateCurtainWallParameterHandler: CommandHandler<
  BulkUpdateCurtainWallParameterPayload,
  Record<string, unknown>
> = {
  type: 'curtain-wall.bulkUpdateParameter',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: BulkUpdateCurtainWallParameterPayload,
  ): ValidationResult {
    if (!isValidScope(cmd.scope)) {
      return {
        valid: false,
        reason:
          "scope must be { kind: 'element', elementId } | { kind: 'level', levelId } | " +
          "{ kind: 'project' } | { kind: 'ids', curtainWallIds }",
      };
    }
    if (typeof cmd.parameter !== 'string' || cmd.parameter.length === 0) {
      return { valid: false, reason: 'parameter must be a non-empty string (mullionSize, panelThickness, gridXSpacing, gridYSpacing)' };
    }
    if (typeof cmd.value !== 'number' || !Number.isFinite(cmd.value)) {
      return { valid: false, reason: 'value must be a finite number, in metres' };
    }
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: BulkUpdateCurtainWallParameterPayload,
  ): HandlerResult {
    return withHandlerSpan(
      'curtain-wall.bulkUpdateParameter.handler',
      { 'pryzm.command.type': 'curtain-wall.bulkUpdateParameter' },
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
        const sayNothingRan = (why: string): void => {
          const report: CurtainWallParameterBatchReport = {
            success: false,
            info: [
              `'curtain-wall.bulkUpdateParameter' did not run — ${why}. Nothing was changed, and ` +
              `nothing about the model is confirmed.`,
            ],
            affectedElementIds: [],
            outcome: 'indeterminate',
          };
          try {
            window.dispatchEvent(new CustomEvent(CURTAIN_WALL_PARAMETER_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error('[curtain-wall.bulkUpdateParameter.handler] indeterminate report emit failed:', emitErr);
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
              new BulkUpdateCurtainWallParameterCommand({
                scope: cmd.scope,
                parameter: cmd.parameter,
                value: cmd.value,
              }),
            );
            // §BATCH-UNREADABLE-RESULT-IS-NOT-ZERO (C78 §20 · U-INV-4) — an
            // unreadable result is NOT the same observable as an honestly-empty
            // batch (see BulkUpdateCurtainPanels / BulkUpdateKitchenMaterial).
            const readable = !!result && Array.isArray(result.affectedElementIds);
            const report: CurtainWallParameterBatchReport = readable
              ? {
                  success: result.success ?? false,
                  info: result.info ?? [],
                  affectedElementIds: result.affectedElementIds,
                }
              : {
                  success: false,
                  info: [
                    `'curtain-wall.bulkUpdateParameter' RAN but the command manager returned no ` +
                    `readable result. WHICH walls changed is not known — this is NOT a report that ` +
                    `none did.`,
                  ],
                  affectedElementIds: [],
                  outcome: 'indeterminate',
                };
            window.dispatchEvent(
              new CustomEvent(CURTAIN_WALL_PARAMETER_BATCH_REPORT_EVENT, { detail: report }),
            );
            // CA-18. Quote the command's OWN sentence — this bridge never
            // invents refusal copy, and never guesses one when `info` is empty.
            if (!report.success) {
              refusal = report.info[0] ?? 'the curtain wall parameter change was refused, and no reason was given';
            }
          } catch (e) {
            console.error('[curtain-wall.bulkUpdateParameter.handler] bridge failed:', e);
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
          throw new Error(`curtain-wall.bulkUpdateParameter: ${refusal}`);
        }
        const empty: HandlerResult = { forward: [], inverse: [] };
        return empty;
      },
    ); // withHandlerSpan — C10 §2
  },
};
