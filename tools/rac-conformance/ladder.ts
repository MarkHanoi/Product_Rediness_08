#!/usr/bin/env tsx
/**
 * tools/rac-conformance/ladder.ts — SHARED harness primitives for the RAC
 * conformance probes (RAC-1 categories 1–5, RAC-2 categories 6–10).
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `tools/ga-gate/check-chat-capability-coverage.ts` (D14) proves DECLARATION ↔
 * ROUTE: every registered bus command is declared, every declared target is
 * accepted, every commandProof file names a live execution authority. It does
 * NOT prove ROUTE → AUTHORITATIVE STATE. A capability can be perfectly declared,
 * resolve perfectly, dispatch perfectly, and write a store nothing renders,
 * persists or exports — that is the §FIX-CHAT-DEAD-ROUTES family, 13/13 dead.
 *
 * This harness answers the founder's question — "can the RAC RELIABLY do X?" —
 * by scoring every operation on SEVEN INDEPENDENT VERDICTS. It never collapses
 * them, and it never treats `success === true` as evidence of V3.
 *
 * ─── THE SEVEN VERDICTS ─────────────────────────────────────────────────────
 *   V1 RESOLVE   the utterance reaches the intended capability (executable here)
 *   V2 DISPATCH  it emits the intended bus command(s)            (executable here)
 *   V3 STATE     the store the RENDERER and PERSISTENCE consult now holds the
 *                new value. NOT `success===true`. NOT a plugin DTO store.
 *   V4 PERSIST   save → reload round-trips the value
 *   V5 UNDO      one undo restores exactly the prior value
 *   V6 SYNC      a second client receives the authoritative change
 *   V7 REPORT    the user-visible transcript is TRUE of what happened
 *
 * ─── PASS / FAIL / UNPROVEN ─────────────────────────────────────────────────
 * UNPROVEN is FIRST-CLASS and honourable. "I could not establish this" is a
 * DIFFERENT FACT from "this is broken" (§CONTEXT-DATA-HONESTY: failure and
 * emptiness are never the same value). A probe is NEVER weakened to turn a red
 * row green — a red row is the deliverable.
 *
 * ─── WHAT THIS FILE CAN AND CANNOT DO ───────────────────────────────────────
 * IT CAN: drive the REAL resolver ladder (compound → tier 0/1 → local NL) in
 * the bridge's own order, in a synthesised ResolverContext, and report the exact
 * ZeroTokenResolution — intent, commands, refusal text.
 *
 * IT CANNOT: execute a bus command. There is no DOM, no `window.commandManager`,
 * no renderer and no Postgres in this process. V3–V7 are therefore established
 * by SOURCE-ANCHORED evidence (which store the handler writes, whether the
 * serializer carries the field) and are marked UNPROVEN — never PASS — wherever
 * only a runtime could settle them. Every such row says so in its reason.
 */

import {
  applySemanticIntent,
  resolveUtterance,
  type ResolverContext,
  type SemanticIntent,
  type ZeroTokenResolution,
} from '../../packages/ai-host/src/intents/ZeroTokenResolver.js';
import { resolveNaturalLanguage } from '../../packages/ai-host/src/intents/LocalNaturalLanguageResolver.js';
import { resolveCompoundUtterance } from '../../packages/ai-host/src/intents/SemanticPlan.js';
import { capabilityGapRefusal } from '../../packages/ai-host/src/capabilities/CapabilityRefusal.js';
import type { ScopeDescriptor, ScopeResult } from '../../packages/ai-host/src/intents/ScopeDescriptor.js';

export type Verdict = 'PASS' | 'FAIL' | 'UNPROVEN';

export interface OperationRow {
  readonly category: string;
  readonly operation: string;
  /** The utterance actually typed at the probe, verbatim. */
  readonly utterance: string;
  readonly v1: Verdict; readonly v2: Verdict; readonly v3: Verdict;
  readonly v4: Verdict; readonly v5: Verdict; readonly v6: Verdict;
  readonly v7: Verdict;
  /** One line per non-PASS cell. */
  readonly notes: string;
}

let seq = 0;

/**
 * A ResolverContext of the same shape the editor bridge builds. Three levels at
 * 0/3/6 m mirrors the acceptance suite so level-occupancy refusals behave
 * identically. `resolveScope` is injected only when a probe asks for it —
 * ABSENCE is meaningful (a spatial ask with no resolver MUST refuse, never
 * silently widen to 'all'; C68 §7.e).
 */
export function ctx(
  selection: readonly { elementId: string; elementType: string }[] = [],
  resolveScope?: (d: ScopeDescriptor) => ScopeResult,
): ResolverContext {
  return {
    selection: selection.map((s) => ({ ...s })),
    levels: [
      { id: 'L0', name: 'Level 0', elevation: 0 },
      { id: 'L1', name: 'Level 1', elevation: 3 },
      { id: 'L2', name: 'Level 2', elevation: 6 },
    ],
    activeLevelId: 'L0',
    mintId: () => `rac-mint-${++seq}`,
    ...(resolveScope === undefined ? {} : { resolveScope }),
  } as ResolverContext;
}

export function sel(kind: string, n = 1): { elementId: string; elementType: string }[] {
  return Array.from({ length: n }, (_, i) => ({ elementId: `rac-${kind}-${i}`, elementType: kind }));
}

/** A stub scope resolution: enough for an arm to produce a real count, and
 *  deliberately not enough to be mistaken for a model. */
export const STUB_SCOPE = (): ScopeResult => ({
  ids: ['rac-scope-1', 'rac-scope-2', 'rac-scope-3'],
  kindCounts: {},
  skipped: [],
  diagnostics: ['Level 0'],
});

/**
 * THE FULL LADDER, in the chat bridge's order: compound plan → tier 0/1 →
 * local natural language → the capability-gap refusal. A miss here is what the
 * bridge forwards to the legacy QueryEngine / the model.
 *
 * ─── THE CAPABILITY-GAP RUNG (added RAC-FIX-1, 2026-08-11) ──────────────────
 * The harness used to stop at the NL layer and report `miss`. That UNDERSTATED
 * the product: `ZeroTokenChatBridge.ts:1192` runs ONE more deterministic step on
 * an NL miss — `capabilityGapRefusal`, which turns "remove the material from
 * this wall" into a named refusal instead of an LLM hand-off. Omitting it made a
 * REFUSAL and a MISS look like the same value in the probe output, which is the
 * exact conflation this harness exists to prevent (§CONTEXT-DATA-HONESTY).
 *
 * It is added as a RUNG, not folded into the resolvers: the bridge's own order
 * is what production runs, and a probe that reorders the ladder is measuring a
 * system that does not exist.
 */
export function ladder(utterance: string, c: ResolverContext): ZeroTokenResolution {
  const plan = resolveCompoundUtterance(utterance, c);
  if (plan !== null) return plan;
  const tier01 = resolveUtterance(utterance, c);
  if (tier01.kind !== 'miss') return tier01;
  const nl = resolveNaturalLanguage(utterance, c);
  if (nl.kind === 'resolved') return nl.resolution;
  if (nl.kind === 'clarification') {
    return { kind: 'refusal', intent: nl.intent, reason: nl.question } as ZeroTokenResolution;
  }
  const gap = capabilityGapRefusal(utterance, c.selection.map((s) => s.elementType));
  if (gap !== null) return gap as ZeroTokenResolution;
  return { kind: 'miss' };
}

export function intentOf(r: ZeroTokenResolution): string | null {
  return r.kind === 'commands' || r.kind === 'local' || r.kind === 'refusal' ? r.intent : null;
}

/**
 * MUTATION, as the harness defines it: the resolution produced bus commands, or
 * a LOCAL action that changes the document/view. Both are things that happen to
 * the model without another confirmation step. A `refusal` and a `miss` are not
 * mutations.
 */
export function mutates(r: ZeroTokenResolution): boolean {
  return r.kind === 'commands' || r.kind === 'local';
}

export function commandTypesOf(r: ZeroTokenResolution): string[] {
  if (r.kind !== 'commands') return [];
  return (r.commands as readonly { type?: string }[]).map((c) => c.type ?? '?');
}

/** Short one-line description of a resolution, for transcripts. */
export function describe(r: ZeroTokenResolution): string {
  switch (r.kind) {
    case 'commands':
      return `commands[${commandTypesOf(r).join(', ')}] intent=${r.intent}`;
    case 'local':
      return `local intent=${r.intent} action=${String((r as { action?: unknown }).action ?? '?')}`;
    case 'refusal': {
      // Refusals carry their text as `reason` in some arms and `message` in
      // others. Printing only one made half the refusals look empty, which is
      // the same failure-vs-emptiness conflation the harness exists to expose.
      const rr = r as { reason?: string; message?: string };
      return `refusal intent=${r.intent} :: ${rr.reason ?? rr.message ?? '(no text)'}`;
    }
    default:
      return 'miss (falls through to the legacy QueryEngine / model)';
  }
}

export { applySemanticIntent };
export type { SemanticIntent, ZeroTokenResolution, ResolverContext };

export function markdownTable(rows: readonly OperationRow[]): string {
  const head = '| # | Category | Operation | Utterance | V1 RESOLVE | V2 DISPATCH | V3 STATE | V4 PERSIST | V5 UNDO | V6 SYNC | V7 REPORT | Reason |';
  const sep = '|---|---|---|---|---|---|---|---|---|---|---|---|';
  const body = rows.map((r, i) =>
    `| ${i + 1} | ${r.category} | ${r.operation} | \`${r.utterance}\` | ${r.v1} | ${r.v2} | ${r.v3} | ${r.v4} | ${r.v5} | ${r.v6} | ${r.v7} | ${r.notes} |`);
  return [head, sep, ...body].join('\n');
}
