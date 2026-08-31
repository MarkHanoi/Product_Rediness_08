// BulkUpdateCurtainPanelsHandler — §RACORIENT145.
//
// Bus surface for "change the type / material of one curtain-wall panel,
// every panel on a level, every panel in the project, or an explicit
// (upstream-resolved) id list — e.g. every panel hosted in a west-facing
// curtain wall." Mirrors the bridge shape `UpdateWallsSystemTypeBatch.ts` /
// `BulkUpdateKitchenMaterial.ts` established: the typed bus command is the
// public entry point, and the bridge forwards to the legacy CommandManager,
// which owns the undo stack the batch command participates in as ONE entry.
//
// ⛔ DELIBERATELY NOT `produceCommand` / the new CommandBus context — that is
// the SAME dead-on-arrival path `ReplacePanelHandler` (`./ReplacePanel.ts`)
// documents in its own header (§L-1054): `ctx.stores['curtainPanelStore']`
// is never populated on that context, so `canExecute` refuses on EVERY
// dispatch. Routing through `window.commandManager` (the legacy path) is what
// makes this verb actually reach the geometry `CurtainPanelStore` the builder
// re-renders from — the single-panel `ReplacePanelTypeCommand` already proves
// that route works (`command-registry/src/types.ts:467`'s real
// `context.stores.curtainPanelStore`).
//
// Payload contract (mirrors §RACKITCHEN127's proven scope shape, plus the
// `'ids'` arm for an upstream-resolved compass scope):
//   • `scope: { kind: 'element', elementId }` — one panel.
//   • `scope: { kind: 'level', levelId }`     — every panel hosted in a
//                                                curtain wall on that level.
//   • `scope: { kind: 'project' }`            — every panel in the project.
//   • `scope: { kind: 'ids', panelIds }`       — an explicit pre-resolved list
//                                                (orientation scoping lands
//                                                here — see the command's
//                                                own header).
//   • `change: { kind: 'type', panelType }`    — a `PanelType` union member.
//   • `change: { kind: 'material', materialRef }` — a STANDARD_MATERIAL_LIBRARY
//                                                     id or name (forgiving lookup).
//
// Partial-failure policy (§CONTEXT-DATA-HONESTY) lives in the COMMAND
// (`BulkUpdateCurtainPanelsCommand`): apply to every panel the scope reaches,
// refuse-with-reason any that vanish or cannot take the change, "Changed N of
// M — K skipped" in CommandResult.info, a scope matching ZERO panels is a
// visible no-op, never a throw.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import {
  BulkUpdateCurtainPanelsCommand,
  type CurtainPanelBatchScope,
  type CurtainPanelBatchChange,
} from '@pryzm/command-registry';

export interface BulkUpdateCurtainPanelsPayload {
  readonly scope: CurtainPanelBatchScope;
  readonly change: CurtainPanelBatchChange;
}

/** Detail shape of the `pryzm-curtain-panel-batch-report` CustomEvent. */
export interface CurtainPanelBatchReport {
  readonly success: boolean;
  readonly info: readonly string[];
  readonly affectedElementIds: readonly string[];
  readonly outcome?: 'applied' | 'refused' | 'indeterminate';
}

export const CURTAIN_PANEL_BATCH_REPORT_EVENT = 'pryzm-curtain-panel-batch-report';

function isValidScope(scope: unknown): scope is CurtainPanelBatchScope {
  if (typeof scope !== 'object' || scope === null) return false;
  const s = scope as { kind?: unknown; elementId?: unknown; levelId?: unknown; panelIds?: unknown };
  if (s.kind === 'element') return typeof s.elementId === 'string' && s.elementId.length > 0;
  if (s.kind === 'level') return typeof s.levelId === 'string' && s.levelId.length > 0;
  if (s.kind === 'project') return true;
  if (s.kind === 'ids') return Array.isArray(s.panelIds) && s.panelIds.every((id) => typeof id === 'string');
  return false;
}

function isValidChange(change: unknown): change is CurtainPanelBatchChange {
  if (typeof change !== 'object' || change === null) return false;
  const c = change as { kind?: unknown; panelType?: unknown; materialRef?: unknown };
  if (c.kind === 'type') return typeof c.panelType === 'string' && c.panelType.length > 0;
  if (c.kind === 'material') return typeof c.materialRef === 'string' && c.materialRef.length > 0;
  return false;
}

export const BulkUpdateCurtainPanelsHandler: CommandHandler<
  BulkUpdateCurtainPanelsPayload,
  Record<string, unknown>
> = {
  type: 'curtain-wall.bulkUpdatePanels',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: BulkUpdateCurtainPanelsPayload,
  ): ValidationResult {
    if (!isValidScope(cmd.scope)) {
      return {
        valid: false,
        reason:
          "scope must be { kind: 'element', elementId } | { kind: 'level', levelId } | " +
          "{ kind: 'project' } | { kind: 'ids', panelIds }",
      };
    }
    if (!isValidChange(cmd.change)) {
      return {
        valid: false,
        reason: "change must be { kind: 'type', panelType } | { kind: 'material', materialRef }",
      };
    }
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: BulkUpdateCurtainPanelsPayload,
  ): HandlerResult {
    return withHandlerSpan(
      'curtain-wall.bulkUpdatePanels.handler',
      { 'pryzm.command.type': 'curtain-wall.bulkUpdatePanels' },
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
          const report: CurtainPanelBatchReport = {
            success: false,
            info: [
              `'curtain-wall.bulkUpdatePanels' did not run — ${why}. Nothing was changed, and ` +
              `nothing about the model is confirmed.`,
            ],
            affectedElementIds: [],
            outcome: 'indeterminate',
          };
          try {
            window.dispatchEvent(new CustomEvent(CURTAIN_PANEL_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error('[curtain-wall.bulkUpdatePanels.handler] indeterminate report emit failed:', emitErr);
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
              new BulkUpdateCurtainPanelsCommand({ scope: cmd.scope, change: cmd.change }),
            );
            // §BATCH-UNREADABLE-RESULT-IS-NOT-ZERO (C78 §20 · U-INV-4) — an
            // unreadable result is NOT the same observable as an honestly-empty
            // batch (see UpdateWallsColorBatch / BulkUpdateKitchenMaterial).
            const readable = !!result && Array.isArray(result.affectedElementIds);
            const report: CurtainPanelBatchReport = readable
              ? {
                  success: result.success ?? false,
                  info: result.info ?? [],
                  affectedElementIds: result.affectedElementIds,
                }
              : {
                  success: false,
                  info: [
                    `'curtain-wall.bulkUpdatePanels' RAN but the command manager returned no ` +
                    `readable result. WHICH panels changed is not known — this is NOT a report that ` +
                    `none did.`,
                  ],
                  affectedElementIds: [],
                  outcome: 'indeterminate',
                };
            window.dispatchEvent(
              new CustomEvent(CURTAIN_PANEL_BATCH_REPORT_EVENT, { detail: report }),
            );
            // CA-18. Quote the command's OWN sentence — this bridge never
            // invents refusal copy, and never guesses one when `info` is empty.
            if (!report.success) {
              refusal = report.info[0] ?? 'the curtain panel change was refused, and no reason was given';
            }
          } catch (e) {
            console.error('[curtain-wall.bulkUpdatePanels.handler] bridge failed:', e);
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
          throw new Error(`curtain-wall.bulkUpdatePanels: ${refusal}`);
        }
        const empty: HandlerResult = { forward: [], inverse: [] };
        return empty;
      },
    ); // withHandlerSpan — C10 §2
  },
};
