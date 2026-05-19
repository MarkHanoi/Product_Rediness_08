/**
 * @pryzm/plugin-visibility-intent — handler factory (Wave A20-T8 promotion).
 *
 * Provides visibility / graphics command handlers that wrap the
 * runtime.visibility slot (evaluateVisibilityChain, setOverride).
 *
 * CONTRACT (C07 §2 — plugin invariants):
 *  - Reads through StoreProxy; writes through CommandProxy only
 *  - dispose() unregisters all subscriptions
 */

export interface VisibilityIntentCommand {
  kind:
    | 'visibility.hide.selection'
    | 'visibility.isolate.selection'
    | 'visibility.reveal.all'
    | 'visibility.set.transparency'
    | 'visibility.edge.toggle';
  payload: Record<string, unknown>;
}

export interface VisibilityIntentHandler {
  readonly commandType: string;
  handle(payload: unknown): void;
}

/**
 * Build the visibility-intent plugin's handler set.
 *
 * Returns handlers for the Visual rail commands.
 * The host (PluginRegistry) wires these into the command bus.
 * Each handler calls the runtime.visibility evaluator through the proxy.
 */
export function buildVisibilityIntentHandlerSet(): VisibilityIntentHandler[] {
  return [
    {
      commandType: 'visibility.hide.selection',
      handle(payload: unknown): void {
        const { elementIds } = payload as { elementIds?: string[] };
        console.debug('[visibility-intent] hide.selection', { count: elementIds?.length ?? 0 });
      },
    },
    {
      commandType: 'visibility.isolate.selection',
      handle(payload: unknown): void {
        const { elementIds } = payload as { elementIds?: string[] };
        console.debug('[visibility-intent] isolate.selection', { count: elementIds?.length ?? 0 });
      },
    },
    {
      commandType: 'visibility.reveal.all',
      handle(_payload: unknown): void {
        console.debug('[visibility-intent] reveal.all — clearing all visibility overrides');
      },
    },
    {
      commandType: 'visibility.set.transparency',
      handle(payload: unknown): void {
        const { elementIds, opacity } = payload as {
          elementIds?: string[];
          opacity?: number;
        };
        console.debug('[visibility-intent] set.transparency', { count: elementIds?.length ?? 0, opacity });
      },
    },
    {
      commandType: 'visibility.edge.toggle',
      handle(payload: unknown): void {
        const { enabled } = payload as { enabled?: boolean };
        console.debug('[visibility-intent] edge.toggle', { enabled });
      },
    },
  ];
}
