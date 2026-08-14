// @pryzm/plugin-ai-generative — plugin descriptor (S51 D1).
//
// ─── C74 §3.4 SCAFFOLD DECLARATION (CO-06, §CO-06-GRACE-FIX 2026-08-14) ─────
// owner: AI-host seat — the docket row (BIM30-DISPOSITION-DOCKET.md §3) names
//   "AI-host owner (unclaimed)"; while the seat stays unclaimed, the
//   disposition's default (REMOVE) is what executes, so the scaffold cannot
//   idle ownerless.
// date: recorded 2026-08-12 (ADR-0323, BIM30-DISPOSITION-DOCKET.md §3) ·
//   reviewBy deadline 2026-09-12.
//   ⚠ Pre-fix, the reviewBy stamp ALONE made this header gate-compliant —
//   DATE_RE matched the future date and the old grace clause asked for
//   nothing else. That loophole is closed (§CO-06-GRACE-FIX); this header now
//   declares what the old one only dated.
//
// WHAT IS FAKE — the PLUGIN SHELL, not the workflow. This descriptor is
//   NOT WIRED: ZERO importers outside this package, `enabled: false`, and it
//   registers nothing — no composition root, plugin host, or workflow
//   registry consumes it. The Generate3Options workflow it names IS real
//   (packages/ai-host/src/workflows/Generate3Options.ts) and is reached via
//   getAiHost() independently of this shell, so this package contributes
//   ZERO bytes of `AiHost.impl` to the editor's first-paint chunk.
//
// RETIRING MECHANISM (ADR-0323 rule 4) — the package is REMOVED when the
//   reviewBy date (2026-09-12) passes with the descriptor still unwired: an
//   expired undecided disposition fails the run that discovers it, so this
//   shell cannot quietly become permanent architecture. If an owner wires it
//   into the plugin host before then, this header is retired in the same
//   change (the wiring commit IS the retirement).
//
// Spec source: `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md`
// §S51 — "AI generative + rule engine + semantic query".  This is the
// plugin shell for the generative workflow (`Generate3Options`); the
// real impl lives at `packages/ai-host/src/workflows/Generate3Options.ts`
// and is wired through `getAiHost()`.

/** Stable identifier registered with the plugin host. */
export const PLUGIN_ID = 'ai-generative' as const;

/** Workflow id this plugin registers with `AiPlane.workflowRegistry`.
 *  Matches `WorkflowDescriptor.id` in `packages/ai-host`. */
export const WORKFLOW_ID = 'ai.generative.three-options' as const;

export interface AiGenerativePluginDescriptor {
  readonly id: typeof PLUGIN_ID;
  readonly title: string;
  readonly workflowKind: 'generative';
  readonly workflowId: typeof WORKFLOW_ID;
  readonly sidebarSlot: 'ai-workflows';
  readonly enabled: boolean;
  /** Per-call cost ceiling (USD) — descriptor must be ≤ SPEC-28 §3
   *  ceiling of 0.18 USD; the workflow registry rejects descriptors
   *  that exceed it. */
  readonly estimatedCostUsd: number;
  readonly featureFlag: string | null;
}

export const aiGenerativeDescriptor: AiGenerativePluginDescriptor = Object.freeze({
  id: PLUGIN_ID,
  title: 'AI Generative — 3 Options',
  workflowKind: 'generative',
  workflowId: WORKFLOW_ID,
  sidebarSlot: 'ai-workflows',
  enabled: false,
  estimatedCostUsd: 0.18,
  featureFlag: 'pryzm.ai.generative',
});
