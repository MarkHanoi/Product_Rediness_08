// §GATE-QUERYENGINE-READ-ONLY (RAC-FIX-1, 2026-08-11)
// =============================================================================
//
// WHY THIS FILE EXISTS — the measurement, before the fix.
//
// `RAC-CONFORMANCE-SCORECARD-CATEGORIES-6-10.md` §1.1 measured 0 mutations in 38
// adversarial read-only phrasings **at the zero-token ladder**, and then said the
// honest thing about its own limit: 35 of the 38 ended as a `miss`, and in the
// running app a miss falls THROUGH — `AIPanel.ts:1635` to the LLM planner, then
// `AIPanel.ts:1654` to the legacy `QueryEngine`. `QueryEngine` is **not**
// read-only: several of its handlers push mutating `CommandProposal`s into
// `commandProposalStore`, and `AIPanel.ts:1699-1703` renders them as clickable
// cards.
//
// So the P0 the ladder closed did not go away; it moved downstream, and
// downstream had never been measured. This file measures it.
//
// ─── WHAT IT ASSERTS, AND ON WHICH OBJECT ───────────────────────────────────
//
// NOT `result.answer` — a truthful-sounding answer over a queued mutation is the
// worst of both. The invariant is on the STORE:
//
//     an informational utterance must add ZERO CommandProposals.
//
// A proposal needs a human click before it executes. That is a mitigation, not a
// gate: the same reasoning that made the destructive Confirm card insufficient
// for `remove the material from this wall` (scorecard §1.4) applies here. A card
// the user did not ask for, offering to build 5 levels because they asked a
// QUESTION about 5 levels, is a defect whether or not they click it.
//
// ─── WHY THE aiService STUB IS NOT OPTIONAL ─────────────────────────────────
//
// Every mutating handler begins `const aiService = this.aiService; if
// (!aiService) return …`. Probing with `aiService === null` would short-circuit
// the exact branch under test and return a FALSE PASS — the probe would be
// measuring its own stub. So the stub RETURNS a proposal, which is what the real
// AIService does, and the gate is on what reaches the store.
//
// §CONTEXT-DATA-HONESTY: the positive control below proves the harness can SEE a
// proposal. Without it, "0 proposals" is indistinguishable from "the probe is
// broken" — failure and emptiness are the same value until you separate them.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { commandProposalStore } from '@pryzm/command-registry';
import { QueryEngine } from '../src/QueryEngine.js';
import { AIReadModel } from '../src/AIReadModel.js';

// ─── Harness ─────────────────────────────────────────────────────────────────

/** The proposal a real AIService would hand back. Shape is irrelevant — what
 *  matters is that it is non-empty, so a handler that queues one really does. */
const FAKE_PROPOSAL = { id: 'probe-proposal', description: 'probe' };

function makeEngine(): { engine: QueryEngine; added: unknown[] } {
  const added: unknown[] = [];
  vi.spyOn(commandProposalStore, 'add').mockImplementation(((p: unknown) => {
    added.push(p);
    return undefined as never;
  }) as never);

  const engine = new QueryEngine(new AIReadModel());
  engine.setAIService({
    getIntentSuggestions: () => [],
    getCommandProposals: async () => [FAKE_PROPOSAL],
  });
  return { engine, added };
}

beforeEach(() => {
  // QueryEngine reads `window` for projectContext and dispatches DOM events.
  // A bare stub is enough: the read model then reports an empty project, which
  // is the honest state for a probe with no scene.
  (globalThis as Record<string, unknown>)['window'] = {
    dispatchEvent: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  // `triggerActionsTab()` reaches for the DOM *after* the proposal is queued.
  // Without this stub the run dies with `document is not defined` and the
  // failure message names the DOM instead of the defect — a probe that hides
  // its own finding behind an environment error is not evidence.
  (globalThis as Record<string, unknown>)['document'] = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as Record<string, unknown>)['window'];
  delete (globalThis as Record<string, unknown>)['document'];
});

// ─── The corpus ──────────────────────────────────────────────────────────────
//
// Two families, deliberately separated.

/**
 * FAMILY A — the scorecard's own 38, verbatim. These are the sentences that
 * ALREADY reach `QueryEngine` today, because the ladder honestly misses them.
 * If any of these queues a proposal, the P0 never left the product.
 */
const READ_ONLY_38: readonly string[] = [
  'highlight walls taller than 3m',
  'highlight all walls taller than 3 metres',
  'show me the walls taller than 3m',
  'show me every wall thicker than 200mm',
  'which walls are taller than 3m?',
  'how many walls are taller than 3.2 m?',
  'find all walls over 3m tall',
  'list the doors wider than 900mm',
  'highlight the windows with a sill height above 1m',
  'what levels are visible?',
  'which levels are visible',
  'is level 2 hidden?',
  'list the hidden elements',
  'am I in isolation mode?',
  'what is hidden right now?',
  'tell me which walls are hidden on level 2',
  'what is the height of this wall?',
  'how thick is the selected wall?',
  'what material is this room?',
  'what type is this wall?',
  'what are the height, thickness and type of this wall?',
  'what is the area of the kitchen?',
  'how many rooms are on level 2?',
  'Changed 7 of 10 walls. 3 skipped: locked / invalid / not eligible.',
  'Level 2 — 14 walls, 6 doors, 3 windows',
  'Wall height: 3.2 m',
  'what would happen if I made all the walls 3.2m?',
  'do not change the wall height',
  'I do not want to hide level 2',
  'can you hide a level?',
  'are you able to change a room material?',
  'check whether every wall on level 2 is 3m tall',
  'verify the exterior walls are all the same height',
  'compare the wall heights on level 1 and level 2',
  'why is this wall 3.2m tall?',
  'summarise the materials used in this project',
  'where are the load-bearing walls?',
  'give me a schedule of all the doors',
];

/**
 * FAMILY B — the ADVERSARIAL half, and the reason this file is not a formality.
 *
 * `QueryEngine.query()` is `input.match(re)` over a table of patterns, and
 * **almost none of those patterns is anchored**. `/create (\d+) levels?…/i`,
 * `/make all slabs (white|…)/i` and `/remove\s+all\s+grids?/i` match ANYWHERE in
 * the sentence. There is no `nonImperativeReason` check, no
 * `descriptiveReportReason` check and no interrogative check on this rung — all
 * three guards live in `CapabilityRefusal.ts`, which `QueryEngine` does not
 * import.
 *
 * So each sentence below wraps one of QueryEngine's OWN mutating patterns in a
 * question, a negation, a hypothetical or a pasted report line. Every one of
 * these is a sentence a user can plausibly type while asking ABOUT the model.
 */
const ADVERSARIAL_WRAPPERS: readonly string[] = [
  // Questions.
  'what happens if I create 5 levels at 3m?',
  'should I create 5 levels at 3m?',
  'is it a good idea to make all slabs white?',
  'why would anyone want to delete all grids?',
  'can you create walls on all slabs?',
  'would it be possible to create curtain walls on all slabs?',
  'what does "add 3 levels at 3m" do?',
  // Negations — the opposite instruction.
  'do not create 5 levels at 3m',
  "don't make all slabs white",
  'never delete all grids',
  // Hypotheticals.
  'I was thinking about creating 5 levels at 3m',
  'I was wondering whether to make all slabs white',
  // Report paste-backs — the §FIX-CHAT-REPORT-PASTEBACK family, one rung down.
  'Created 5 levels at 3m',
  'Deleted all grids — undo with Ctrl+Z.',
];

// ─── The gate ────────────────────────────────────────────────────────────────

describe('§GATE-QUERYENGINE-READ-ONLY — an informational utterance queues nothing', () => {
  it('POSITIVE CONTROL: the harness can see a proposal (0 is a real 0)', async () => {
    const { engine, added } = makeEngine();
    // A genuine, imperative mutation ask. If THIS queues nothing, every other
    // row in this file is meaningless and the harness — not the product — is
    // what is broken.
    await engine.query('create 5 levels at 3m');
    expect(added.length, 'the probe cannot observe proposals at all').toBeGreaterThan(0);
  });

  it.each(READ_ONLY_38)('read-only "%s" queues no CommandProposal', async (utterance) => {
    const { engine, added } = makeEngine();
    await engine.query(utterance);
    expect(added, `"${utterance}" queued a mutating proposal`).toEqual([]);
  });

  it.each(ADVERSARIAL_WRAPPERS)(
    'non-imperative "%s" queues no CommandProposal',
    async (utterance) => {
      const { engine, added } = makeEngine();
      await engine.query(utterance);
      expect(added, `"${utterance}" queued a mutating proposal`).toEqual([]);
    },
  );
});
