// ReplacePanelHandler — TASK-07 Phase B (MASTER-IMPL-PLAN-2026-05-18 BUG-7).
//
// P6 fix: Removed window.commandManager bridge. The panel store is now accessed
// directly via ctx.stores.curtainPanelStore.
//
// ⛔ §L-1054 (MEASURED 2026-08-19) — "injected by EngineBootstrap at
// apps/editor/src/engine/engineLauncher.ts" WAS FALSE, AND IT IS WHY THIS VERB HAS
// NEVER ONCE EXECUTED. `ctx.stores` is `storesAsRecordView(stores)`
// (`apps/editor/src/bootstrap.ts:94,148-159`), and `stores` is filled ONLY by
// `stores[plugin.storeKey] = store` over `ALL_PLUGINS`
// (`apps/editor/src/bootstrap.everything.ts:145`). No descriptor declares a
// `curtainPanelStore` key — the curtain-wall plugin's storeKey is `'curtainwall'`,
// and the `'curtain-panel'` spelling at `initStores.ts:119` belongs to the LEGACY
// registry, a different map. `composeRuntime.ts:889` passes no `stores` override.
// And `CommandBus.buildContext` (`:285-293`) never falls back to a global by
// design (ADR-002 §3 / R1A-16). So `canExecute` below has returned
// `{valid:false, reason:'curtainPanelStore not available in handler context'}` on
// EVERY dispatch, and `execute`'s store write at the bottom of this file is
// unreachable.
//
// THIS REFUTES C87 §11 ROW 2 AS WRITTEN. That row ranks this verb the family's
// second-worst defect on the strength of an irreversible L6 WRITE. The source
// observations are all correct; the write does not happen. The real defect is the
// other kind: `CurtainPanelEditor.ts:250` and `CurtainSubElementPanel.ts:319` both
// dispatch this verb from the property panel and `ChatCommandClassification.ts:109`
// exposes it to chat, so changing a curtain-wall panel's type does NOTHING and
// says so only in a console.warn naming an internal variable. That is C84 EI-3 /
// EI-7a's residual defect — an offered control whose verb refuses.
//
// Pinned by `apps/editor/__tests__/CurtainReplacePanelIsDead.test.ts`.
// THE FIX IS A ROUTING DECISION, NOT A PATCH, and is owed: C87 CW-P-2's two exits
// are (a) route the write per C16 CA-17 — the L2 `ReplacePanelTypeCommand` DOES
// receive a real `context.stores.curtainPanelStore` (`command-registry/src/types.ts:467`)
// and now snapshots correctly (§L-1050), so repointing the two panels at it is the
// short path — or (b) disable the controls while the verb refuses.
//
// BUG-7 partial fix: produceCommand generates structurally valid Immer patches
// against a minimal snapshot of the two mutable fields (panelType, materialOverride).
// These patches are RFC-6902 compliant and will be routeable once CurtainPanelStore
// migrates to the standard Store<CurtainPanelData> pattern with key 'curtainpanel',
// allowing the CommandBus undo applicator to call applyPatches on Immer-managed state.
//
// TODO(E.5.x): after CurtainPanelStore → Store<CurtainPanelData> migration:
//   1. Change affectedStores to ['curtainpanel'].
//   2. Replace snapshot workaround with:
//        const panelsState = ctx.stores.curtainpanel as CurtainPanelsState;
//        const [next, fwd, inv] = produceCommand<CurtainPanelsState>(panelsState, draft => {
//          const p = draft[cmd.panelId]; if (!p) return;
//          p.panelType = cmd.newPanelType as PanelType;
//          if (cmd.materialOverride !== undefined) p.materialOverride = cmd.materialOverride ?? undefined;
//        });
//
// ReplacePanelTypeCommand in packages/command-registry/ is now orphaned by P6 path.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import {
  isValidPanelType,
  VALID_PANEL_TYPES,
  type CurtainPanelData,
  type PanelType,
  CurtainPanelStore,
} from '@pryzm/geometry-curtain-wall';

export interface ReplacePanelPayload {
  readonly panelId: string;
  readonly newPanelType: string;
  readonly materialOverride?: string | null;
}

// Minimal snapshot type used for patch generation against the two mutable fields.
// Replace with CurtainPanelsState = Record<string, CurtainPanelData> after store migration.
// TODO(E.5.x): remove after CurtainPanelStore migration.
type PanelFieldSnapshot = Record<string, { panelType: PanelType; materialOverride?: string }>;

// CurtainPanelStore is a custom class (not Store<T>), so the stores generic is
// typed as Record<string, unknown> and the panel store is accessed via cast below.
// TODO(E.5.x): tighten to Readonly<{ curtainpanel: CurtainPanelsState } & Record<string, unknown>>
//              after CurtainPanelStore migration.
type ReplacePanelHandlerStores = Record<string, unknown>;

export const ReplacePanelHandler: CommandHandler<ReplacePanelPayload, ReplacePanelHandlerStores> = {
  type: 'curtain-wall.replacePanel',
  /** §FIX-COMMAND-NAMESPACE (L-796) — deprecated pre-migration spelling. */
  aliases: ['curtainwall.replacePanel'] as const,

  // affectedStores is empty pending CurtainPanelStore → Store<CurtainPanelData> migration.
  // Set to ['curtainpanel'] once the store migration lands so the CommandBus undo
  // applicator can route inverse patches to an Immer-managed panel state.
  // TODO(E.5.x): set to ['curtainpanel'] after CurtainPanelStore migration.
  affectedStores: [] as const,

  canExecute(
    ctx: HandlerContext<ReplacePanelHandlerStores>,
    cmd: ReplacePanelPayload,
  ): ValidationResult {
    if (!cmd.panelId) return { valid: false, reason: 'panelId is required' };
    if (!cmd.newPanelType) return { valid: false, reason: 'newPanelType is required' };
    if (!isValidPanelType(cmd.newPanelType)) {
      return {
        valid: false,
        // §CW-Voc-3 (C87 §9) — GENERATED, NOT TRANSCRIBED. This used to name three
        // members while `isValidPanelType` validated against THIRTEEN, so a user
        // told "valid values: Glass, Opaque, Empty" could not discover the ten
        // that would have worked. A hand-written copy of a union is C84 EI-8a's
        // failure mode; the union is the only place that knows its own members.
        reason: `'${cmd.newPanelType}' is not a valid PanelType. ` +
          `Valid values: ${VALID_PANEL_TYPES.join(', ')}`,
      };
    }
    const panelStore = ctx.stores['curtainPanelStore'] as CurtainPanelStore | undefined;
    if (!panelStore) return { valid: false, reason: 'curtainPanelStore not available in handler context' };
    if (!panelStore.get(cmd.panelId)) return { valid: false, reason: `panel not found: ${cmd.panelId}` };
    return { valid: true };
  },

  execute(
    ctx: HandlerContext<ReplacePanelHandlerStores>,
    cmd: ReplacePanelPayload,
  ): HandlerResult {
    return withHandlerSpan(
      'curtain-wall.replacePanel.handler',
      { 'pryzm.command.type': 'curtain-wall.replacePanel' },
      () => {
        const panelStore = ctx.stores['curtainPanelStore'] as CurtainPanelStore | undefined;
        if (!panelStore) {
          console.error('[curtain-wall.replacePanel] curtainPanelStore not available in handler context');
          return { forward: [], inverse: [] };
        }

        const panel = panelStore.get(cmd.panelId);
        if (!panel) {
          console.error('[curtain-wall.replacePanel] panel not found in store:', cmd.panelId);
          return { forward: [], inverse: [] };
        }

        // Snapshot the two mutable fields before mutation.
        // produceCommand generates structurally valid RFC-6902 patches:
        //   forward: [{ op:'replace', path:'/panelId123/panelType', value:'SystemPanel_Glass' }]
        //   inverse: [{ op:'replace', path:'/panelId123/panelType', value:'SystemPanel_Opaque' }]
        // These become meaningful undo ops once CurtainPanelStore exposes an
        // Immer-managed Record<string, CurtainPanelData> state (see TODO above).
        const snapshot: PanelFieldSnapshot = {
          [cmd.panelId]: {
            panelType: panel.panelType,
            ...(panel.materialOverride !== undefined && { materialOverride: panel.materialOverride }),
          },
        };

        const [, forward, inverse] = produceCommand<PanelFieldSnapshot>(snapshot, draft => {
          const p = draft[cmd.panelId];
          if (!p) return;
          p.panelType = cmd.newPanelType as PanelType;
          if (cmd.materialOverride !== undefined) {
            // null → clear override (undefined); string → set override.
            p.materialOverride = cmd.materialOverride ?? undefined;
          }
        });

        // Apply mutation to the live CurtainPanelStore via its own update API.
        //
        // §L-1055 — THE CASCADE SUBSCRIBER, LOCATED. C87 §8 and §11 row 11 record
        // this comment's claim as a C84 EI-12 violation — "a trigger whose
        // dispatcher is unproven", NOT LOCATED by a grep of `apps/editor/src` for
        // `curtain-panel`. The subscriber EXISTS, at
        // `apps/editor/src/engine/initUI.ts:2263-2287` (§MI-02 FIX,
        // "CurtainPanelStore → CurtainWallBuilder rebuild subscriber"), and it does
        // exactly what this comment promised: on an 'update' event it resolves the
        // parent wall via `cwStore.getReadOnly(panel.curtainWallId)` and calls
        // `cwBuilder.updateCurtainWall(cw)`.
        //
        // THE GREP MISSED IT BECAUSE THIS COMMENT NAMED THE WRONG MECHANISM AND THE
        // WRONG FILE. The subscriber attaches to `CurtainPanelStore.subscribe()` —
        // the store's OWN listener list (`CurtainPanelStore.ts:284-291`), driven from
        // `emit()` at `:295-299` — not to `storeEventBus`, so the string
        // `'curtain-panel'` never appears at the subscription site. And it lives in
        // `initUI.ts`, not `EngineBootstrap`. A search for the named mechanism could
        // not find the real one.
        //
        // ⚠ The cascade is nonetheless UNREACHABLE TODAY, for the separate reason in
        // the file header (§L-1054): `execute` never runs, so nothing reaches
        // `panelStore.update()` by this route. The L2 `ReplacePanelTypeCommand`
        // reaches the SAME subscriber and does run — which is what §MI-02 was written
        // for. C87 CW-X-1 is discharged by citation; C87 §11 row 11 is refuted.
        const updates: Partial<CurtainPanelData> = { panelType: cmd.newPanelType as PanelType };
        if (cmd.materialOverride !== undefined) {
          updates.materialOverride = cmd.materialOverride ?? undefined;
        }
        panelStore.update(cmd.panelId, updates);

        return { forward, inverse };
      },
    );
  },
};
