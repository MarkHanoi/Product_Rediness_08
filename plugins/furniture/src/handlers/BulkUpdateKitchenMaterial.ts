// BulkUpdateKitchenMaterialHandler — §RACKITCHEN127.
//
// Bus surface for "change carcass / door-front / countertop material for one
// kitchen, every kitchen on a level, or every kitchen in the project" — the
// founder's ask, verbatim: change kitchen materials via RAC "for ALL kitchens
// in a floor, for ALL kitchens in the project, etc." Mirrors the bridge shape
// `UpdateWallsSystemTypeBatch.ts` established: the typed bus command is the
// public entry point, and the bridge forwards to the legacy CommandManager,
// which owns the undo stack the batch command participates in as ONE entry.
//
// Payload contract (deliberately RAC-friendly):
//   • `scope: { kind: 'element', elementId }` — one kitchen.
//   • `scope: { kind: 'level', levelId }`     — every kitchen on that level.
//   • `scope: { kind: 'project' }`            — every kitchen in the project.
//   • `target`      — 'carcass' | 'doorFront' | 'countertop'.
//   • `materialRef` — a STANDARD_MATERIAL_LIBRARY id or label (forgiving
//                     lookup — resolveKitchenMaterialRef, same ladder every
//                     other project catalogue in @pryzm/command-registry uses).
//
// Partial-failure policy (§CONTEXT-DATA-HONESTY) lives in the COMMAND
// (`BulkUpdateKitchenMaterialCommand`): apply to every kitchen the scope
// reaches, refuse-with-reason any that vanish mid-batch, "Changed N of M — K
// skipped" in CommandResult.info, a scope matching ZERO kitchens is a visible
// no-op, never a throw.
//
// The bridge re-broadcasts that report as a `pryzm-kitchen-material-batch-report`
// window CustomEvent so thin UI wrappers can show it without owning any batch
// logic themselves — same discipline as `WALL_TYPE_BATCH_REPORT_EVENT`.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import {
  BulkUpdateKitchenMaterialCommand,
  type KitchenMaterialTarget,
} from '@pryzm/command-registry';

export type BulkUpdateKitchenMaterialScope =
  | { readonly kind: 'element'; readonly elementId: string }
  | { readonly kind: 'level'; readonly levelId: string }
  | { readonly kind: 'project' };

export interface BulkUpdateKitchenMaterialPayload {
  readonly scope: BulkUpdateKitchenMaterialScope;
  readonly target: KitchenMaterialTarget;
  readonly materialRef: string;
}

/** Detail shape of the `pryzm-kitchen-material-batch-report` CustomEvent. */
export interface KitchenMaterialBatchReport {
  readonly success: boolean;
  /** Human-readable lines: summary first, then grouped skip reasons. */
  readonly info: readonly string[];
  readonly affectedElementIds: readonly string[];
  /**
   * The bridge's OWN verdict (§FIX-REPORT-PAYLOAD-DISCARD, W2-B pattern), so
   * the chat layer never has to infer one from a boolean. `'indeterminate'`
   * means THE COMMAND NEVER RAN — the legacy `window.commandManager` sink was
   * absent, or the bridge threw — and nothing about the model is confirmed.
   */
  readonly outcome?: 'applied' | 'refused' | 'indeterminate';
}

export const KITCHEN_MATERIAL_BATCH_REPORT_EVENT = 'pryzm-kitchen-material-batch-report';

function isValidScope(scope: unknown): scope is BulkUpdateKitchenMaterialScope {
  if (typeof scope !== 'object' || scope === null) return false;
  const s = scope as { kind?: unknown; elementId?: unknown; levelId?: unknown };
  if (s.kind === 'element') return typeof s.elementId === 'string' && s.elementId.length > 0;
  if (s.kind === 'level') return typeof s.levelId === 'string' && s.levelId.length > 0;
  if (s.kind === 'project') return true;
  return false;
}

const VALID_TARGETS = new Set<KitchenMaterialTarget>(['carcass', 'doorFront', 'countertop']);

export const BulkUpdateKitchenMaterialHandler: CommandHandler<
  BulkUpdateKitchenMaterialPayload,
  Record<string, unknown>
> = {
  type: 'furniture.bulkUpdateKitchenMaterial',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: BulkUpdateKitchenMaterialPayload,
  ): ValidationResult {
    if (!isValidScope(cmd.scope)) {
      return { valid: false, reason: "scope must be { kind: 'element', elementId } | { kind: 'level', levelId } | { kind: 'project' }" };
    }
    if (!VALID_TARGETS.has(cmd.target)) {
      return { valid: false, reason: "target must be 'carcass', 'doorFront' or 'countertop'" };
    }
    if (typeof cmd.materialRef !== 'string' || cmd.materialRef.length === 0) {
      return { valid: false, reason: 'materialRef must be a non-empty material id or name' };
    }
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: BulkUpdateKitchenMaterialPayload,
  ): HandlerResult {
    return withHandlerSpan(
      'furniture.bulkUpdateKitchenMaterial.handler',
      { 'pryzm.command.type': 'furniture.bulkUpdateKitchenMaterial' },
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
          const report: KitchenMaterialBatchReport = {
            success: false,
            info: [
              `'furniture.bulkUpdateKitchenMaterial' did not run — ${why}. Nothing was changed, and ` +
              `nothing about the model is confirmed.`,
            ],
            affectedElementIds: [],
            outcome: 'indeterminate',
          };
          try {
            window.dispatchEvent(new CustomEvent(KITCHEN_MATERIAL_BATCH_REPORT_EVENT, { detail: report }));
          } catch (emitErr) {
            console.error('[furniture.bulkUpdateKitchenMaterial.handler] indeterminate report emit failed:', emitErr);
          }
        };
        if (cm) {
          try {
            const result = cm.execute(
              new BulkUpdateKitchenMaterialCommand({
                scope: cmd.scope,
                target: cmd.target,
                materialRef: cmd.materialRef,
              }),
            );
            // §BATCH-UNREADABLE-RESULT-IS-NOT-ZERO (C78 §20 · U-INV-4) — see
            // UpdateWallsColorBatch for the full statement: an unreadable result
            // is NOT the same observable as an honestly-empty batch.
            const readable = !!result && Array.isArray(result.affectedElementIds);
            const report: KitchenMaterialBatchReport = readable
              ? {
                  success: result.success ?? false,
                  info: result.info ?? [],
                  affectedElementIds: result.affectedElementIds,
                }
              : {
                  success: false,
                  info: [
                    `'furniture.bulkUpdateKitchenMaterial' RAN but the command manager returned no ` +
                    `readable result. WHICH kitchens changed is not known — this is NOT a report that ` +
                    `none did.`,
                  ],
                  affectedElementIds: [],
                  outcome: 'indeterminate',
                };
            window.dispatchEvent(
              new CustomEvent(KITCHEN_MATERIAL_BATCH_REPORT_EVENT, { detail: report }),
            );
          } catch (e) {
            console.error('[furniture.bulkUpdateKitchenMaterial.handler] bridge failed:', e);
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
