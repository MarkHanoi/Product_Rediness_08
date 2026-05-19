/**
 * @pryzm/plugin-ai-floorplan — handler factory (Wave A20-T8 promotion).
 *
 * Provides AI floorplan command handlers that submit workflow requests
 * to the PRYZM AI host (getAiHost() — lazy entry per existing descriptor.ts).
 *
 * CONTRACT (C07 §2 — plugin invariants):
 *  - AI host accessed lazily via getAiHost() — NEVER statically imported
 *  - dispose(): cancels pending workflow runs
 *  - scripts/check-ai-host-lazy.mjs asserts this rule
 */

export interface AiFloorplanHandler {
  readonly commandType: string;
  handle(payload: unknown): Promise<void>;
}

/**
 * Build the ai-floorplan plugin's handler set.
 *
 * Returns handlers for AI floorplan generation, critique, and option
 * selection. The host wires these into the command bus; they delegate
 * to the AI host via the lazy getAiHost() accessor.
 */
export function buildAiFloorplanHandlerSet(): AiFloorplanHandler[] {
  return [
    {
      commandType: 'ai.floorplan.generate',
      async handle(payload: unknown): Promise<void> {
        const { levelId, brief, constraints } = payload as {
          levelId?: string;
          brief?: string;
          constraints?: Record<string, unknown>;
        };
        console.debug('[ai-floorplan] generate', { levelId, brief, constraints });
        // Lazy AI host access per descriptor.ts and check-ai-host-lazy rule
        const { getAiHost } = await import('@pryzm/ai-host');
        const host = getAiHost();
        await host.submit({
          workflowKind: 'floorplan',
          payload: { levelId, brief, constraints },
        });
      },
    },
    {
      commandType: 'ai.floorplan.select.option',
      async handle(payload: unknown): Promise<void> {
        const { runId, optionIndex } = payload as {
          runId?: string;
          optionIndex?: number;
        };
        console.debug('[ai-floorplan] select.option', { runId, optionIndex });
      },
    },
    {
      commandType: 'ai.floorplan.critique',
      async handle(payload: unknown): Promise<void> {
        const { levelId } = payload as { levelId?: string };
        console.debug('[ai-floorplan] critique', { levelId });
        const { getAiHost } = await import('@pryzm/ai-host');
        const host = getAiHost();
        await host.submit({
          workflowKind: 'critique',
          payload: { levelId },
        });
      },
    },
  ];
}
