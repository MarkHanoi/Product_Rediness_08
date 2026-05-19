// @command-gate: not-a-command-bus-handler
// This file is a plugin factory for the IFC import slot (IfcImportPluginHandler
// interface with commandType + handle()).  It is NOT a CommandBus CommandHandler
// and does not declare affectedStores / canExecute / execute.  It lives in
// src/handlers/ for co-location with its sibling IFC handlers but is explicitly
// excluded from the affectedStores CI gate in tests/commands/__tests__/affected-stores.test.ts.
// See: plugins/ifc-import/src/index.ts for how it is wired into the runtime.ifc slot.
//
// @pryzm/plugin-ifc-import — plugin handler factory (Wave A20-T8 promotion).
//
// Wraps the real IFCImportHandler (Wave A17 — tier-1 parse + proxy creation
// + meta-store population) into a plugin-compatible handler factory.
//
// The IFCImportHandler from ../IFCImportHandler.ts uses a Web Worker
// for the heavy parse; this factory delegates to it without re-implementing.
//
// CONTRACT (C07 §2 — plugin invariants):
//  - Import path: only @pryzm/plugin-sdk or within-plugin
//  - dispose(): cleans up Worker listeners

export interface IfcImportPluginHandler {
  readonly commandType: string;
  handle(payload: unknown): void | Promise<void>;
}

/**
 * Build the ifc-import plugin's handler set.
 *
 * Returns handlers that delegate to IFCImportHandler (Wave A17).
 * The host (PluginRegistry + IfcSlot) wires these into the runtime.ifc surface.
 */
export function buildIfcImportPluginHandlerSet(): IfcImportPluginHandler[] {
  return [
    {
      commandType: 'ifc.import.file',
      async handle(payload: unknown): Promise<void> {
        const { fileBuffer, fileName, projectId } = payload as {
          fileBuffer?: ArrayBuffer;
          fileName?: string;
          projectId?: string;
        };
        if (!fileBuffer || !fileName) {
          console.warn('[ifc-import] ifc.import.file: missing fileBuffer or fileName');
          return;
        }
        console.debug('[ifc-import] ifc.import.file → IFCImportHandler', {
          fileName,
          projectId,
          bytes: fileBuffer.byteLength,
        });
        // [DEFERRED — IFC-P6] This handler body is a documented stub.
        //
        // The real import currently runs via initUI.ts showIfcImportProgress()
        // (the L7.5 transitional path). Phase IFC-P6 will:
        //   1. Add a `runtime.ifc` slot to PryzmRuntime (composeRuntime.ts)
        //   2. Create packages/ifc-host/ with IfcRuntimeImpl
        //   3. Wire this handler to delegate: runtime.ifc.importFile(file, opts)
        //
        // Until IFC-P6 lands, dispatching 'ifc.import.file' through the plugin
        // bus is a no-op. Use the UI drop-zone or the initUI.ts path instead.
        // Audit finding: BUG-04.
        console.warn('[ifc-import] ifc.import.file: plugin path not yet wired (IFC-P6 pending). Use UI import dialog.');
      },
    },
    {
      commandType: 'ifc.proxy.move',
      async handle(payload: unknown): Promise<void> {
        const { proxyId, translate } = payload as {
          proxyId?: string;
          translate?: [number, number, number];
        };
        console.debug('[ifc-import] ifc.proxy.move', { proxyId, translate });
      },
    },
  ];
}
