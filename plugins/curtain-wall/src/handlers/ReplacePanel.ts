// ReplacePanelHandler — TASK-07 Phase B (MASTER-IMPL-PLAN-2026-05-18 BUG-7).
//
// P6 fix: Removed window.commandManager bridge. The panel store is now accessed
// directly via ctx.stores.curtainPanelStore (injected by EngineBootstrap at
// apps/editor/src/engine/engineLauncher.ts).
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
  type: 'curtainwall.replacePanel',

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
        reason: `'${cmd.newPanelType}' is not a valid PanelType. ` +
          `Valid values: SystemPanel_Glass, SystemPanel_Opaque, SystemPanel_Empty`,
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
      'curtainwall.replacePanel.handler',
      { 'pryzm.command.type': 'curtainwall.replacePanel' },
      () => {
        const panelStore = ctx.stores['curtainPanelStore'] as CurtainPanelStore | undefined;
        if (!panelStore) {
          console.error('[curtainwall.replacePanel] curtainPanelStore not available in handler context');
          return { forward: [], inverse: [] };
        }

        const panel = panelStore.get(cmd.panelId);
        if (!panel) {
          console.error('[curtainwall.replacePanel] panel not found in store:', cmd.panelId);
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
        // §MI-02: panelStore.update() emits storeEventBus 'curtain-panel' event;
        // EngineBootstrap subscriber calls curtainWallBuilder.updateCurtainWall(cw).
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
