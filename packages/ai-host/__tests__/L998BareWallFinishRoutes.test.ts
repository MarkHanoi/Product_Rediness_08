/**
 * L-998 — A REFUSAL THAT ADVERTISES THE CAPABILITY IT IS REFUSING.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Founder-reported on the live deploy 2026-08-18. Typed:
 *
 *   "change wall finish to plaster white"
 *
 * and was answered:
 *
 *   "Wall material isn't connected to chat yet. I can change wall height,
 *    thickness, base offset, type, colour, wall angle, window creation,
 *    WALL SIDE FINISH and FINISH LAYER. Try: 'set all walls 3m high' …"
 *
 * ⭐ THE SENTENCE CONTRADICTS ITSELF. It declines because "wall material isn't
 * connected", then lists *wall side finish* and *finish layer* among the things it
 * CAN do — which is exactly what was asked for.
 *
 * ⛔ AND THE LIST IS NOT HAND-WRITTEN. `describeCapabilitiesFor()` builds it from
 * `capabilitiesForElement(kind)` — the C67/C68 registry. So this was not a stale
 * inventory: the TOPIC TABLE was refusing something the REGISTRY was offering, and
 * either half alone reads as correct. That is the sharper of the two possibilities,
 * and it is the one that was true.
 *
 * TWO CAUSES, both closed here:
 *   1. `UNCONNECTED_TOPICS['material']` matched `finish|finishes|render|cladding`
 *      and carried NO `excludeKinds`, unlike `colour` (which excluded 'wall' when
 *      wall colour went live). Split into `material` (still a real gap for a wall —
 *      C85 §4: no bus verb reaches `materialId` on the authority) and `surface finish`
 *      (live for 'wall', still a gap for slab/roof/room).
 *   2. `parseWallSideFinishIntent` REQUIRED a scope word, so a bare "change wall
 *      finish to X" never claimed and fell through to the refusal above. It now
 *      claims with a SELECTION scope — never 'all', so a scope-less sentence still
 *      cannot re-finish the whole building — and with nothing selected it refuses
 *      by NAMING THE LIVE ROUTE (C16 CA-18).
 *
 * The end state the contract allows is exactly two: a write, or a refusal that
 * names the live route. "Advertises it and refuses it" was a third.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveUtterance,
  type ResolverContext,
  type ZeroTokenResolution,
} from '../src/intents/ZeroTokenResolver.js';
import { resolveNaturalLanguage } from '../src/intents/LocalNaturalLanguageResolver.js';
import { resolveCompoundUtterance } from '../src/intents/SemanticPlan.js';
import {
  capabilityGapRefusal,
  describeCapabilitiesFor,
  unconnectedTopics,
} from '../src/capabilities/CapabilityRefusal.js';
import { capabilitiesForElement } from '../src/capabilities/ChatCapabilityRegistry.js';
import type { ScopeDescriptor, ScopeResult } from '../src/intents/ScopeDescriptor.js';

let seq = 0;
function ctxOf(overrides: Partial<ResolverContext> = {}): ResolverContext {
  return {
    selection: [],
    levels: [
      { id: 'L0', name: 'Ground', elevation: 0 },
      { id: 'L1', name: 'Level 1', elevation: 3 },
    ],
    activeLevelId: 'L0',
    mintId: () => `l998-${++seq}`,
    ...overrides,
  } as ResolverContext;
}

function stubScope(n: number, diagnostic = 'Ground'): (d: ScopeDescriptor) => ScopeResult {
  return () => ({
    ids: Array.from({ length: n }, (_, i) => `w-${i}`),
    kindCounts: {},
    skipped: [],
    diagnostics: [diagnostic],
  });
}

/** THE REAL LADDER the bridge uses — never a shortcut to an arm. */
function resolveFull(utterance: string, ctx: ResolverContext): ZeroTokenResolution {
  const plan = resolveCompoundUtterance(utterance, ctx);
  if (plan !== null) return plan;
  const tier01 = resolveUtterance(utterance, ctx);
  if (tier01.kind !== 'miss') return tier01;
  const nl = resolveNaturalLanguage(utterance, ctx);
  if (nl.kind === 'resolved') return nl.resolution;
  return { kind: 'miss' };
}

const SELECTED_WALLS = [
  { elementId: 'w-sel-1', elementType: 'wall' },
  { elementId: 'w-sel-2', elementType: 'wall' },
];

describe('L-998 — the sentence reaches the capability its own refusal advertised', () => {
  it('"change wall finish to plaster white" with walls selected → set-wall-side-finish', () => {
    const r = resolveFull(
      'change wall finish to plaster white',
      ctxOf({ resolveScope: stubScope(2), selection: SELECTED_WALLS as never }),
    );
    expect(r.kind, `resolved as ${r.kind}`).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('set-wall-side-finish');
    const cmd = r.commands[0]!;
    expect(cmd.type).toBe('wall.setSideFinishBatch');
    const p = cmd.payload as Record<string, unknown>;
    expect(p['side'], 'the unmarked side is the interior — the face seen from inside').toBe('interior');
    const finish = p['finish'] as Record<string, unknown>;
    expect(finish['materialId']).toBe('gypsum-skim');
  });

  it('with NOTHING selected it refuses by naming the live route (CA-18) — never "not connected"', () => {
    const r = resolveFull(
      'change wall finish to plaster white',
      ctxOf({ resolveScope: stubScope(0), selection: [] }),
    );
    expect(r.kind, `resolved as ${r.kind}`).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason.toLowerCase()).toContain('select');
    // The live route, spelled out — the whole point of CA-18.
    expect(r.reason.toLowerCase()).toContain('inner finishes walls');
    expect(
      r.reason.toLowerCase(),
      'the sentence that started this defect must never come back',
    ).not.toContain("isn't connected to chat yet");
  });

  it('a scope-less sentence NEVER means the whole building', () => {
    // The guard worth keeping when the scope-word requirement came out.
    const r = resolveFull(
      'change wall finish to plaster',
      ctxOf({ resolveScope: stubScope(2), selection: SELECTED_WALLS as never }),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    const ids = (r.commands[0]!.payload as Record<string, unknown>)['wallIds'];
    expect(ids, 'a bare ask resolves against the SELECTION, not "all"').not.toBe('all');
  });

  it('a spatial phrase without "all" is still honoured, not narrowed to the selection', () => {
    const r = resolveFull(
      'change wall finish on the ground floor to plaster',
      ctxOf({ resolveScope: stubScope(4), selection: SELECTED_WALLS as never }),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    const ids = (r.commands[0]!.payload as Record<string, unknown>)['wallIds'] as string[];
    expect(ids, 'the LEVEL the user named wins over the live selection').toHaveLength(4);
  });
});

describe('L-998 — the topic table and the registry cannot contradict each other', () => {
  it('no manufactured "not connected" refusal for a WALL finish', () => {
    expect(capabilityGapRefusal('change wall finish to plaster white', [])).toBeNull();
    expect(capabilityGapRefusal('change the wall cladding', [])).toBeNull();
  });

  it('wall MATERIAL is still an honest gap — vocabulary was split, not deleted', () => {
    // C85 §4, measured: `materialId` cannot be set through any bus verb that
    // reaches the authority. Refusing it is correct and must survive.
    const r = capabilityGapRefusal('change the wall material to concrete', []);
    expect(r, 'wall material must still refuse').not.toBeNull();
    expect(r!.reason).toContain("isn't connected to chat yet");
  });

  it('a SLAB finish is still an honest gap — only the wall arm moved', () => {
    const r = capabilityGapRefusal('change the slab finish to oak', []);
    expect(r, 'slab finish must still refuse').not.toBeNull();
    expect(r!.reason).toContain("isn't connected to chat yet");
  });

  it('⭐ THE INVARIANT — a topic may never fire for a kind whose OWN advertised list matches it', () => {
    // THE GENERIC FORM OF THE FOUNDER'S DEFECT, and the assertion has to be built
    // around the way it actually failed.
    //
    // The naive version — "the topic LABEL must not appear in the advertised list" —
    // would NOT have caught this: the label was 'material', and no wall capability
    // advertises the word "material". What contradicted the registry was the topic's
    // MATCH REGEX: `/…|finish|finishes|…/` matched inside the very labels
    // `describeCapabilitiesFor('wall')` prints — "wall side finish", "finish layer".
    //
    // So the invariant is stated over the regex, against the advertised vocabulary
    // itself: if a topic's matcher fires on a kind's own advertised label or alias,
    // that kind must be excluded, or the refusal denies what the same sentence offers.
    const KINDS = ['wall', 'slab', 'door', 'window', 'roof', 'room', 'ceiling', 'floor', 'stair', 'column'];
    const contradictions: string[] = [];
    for (const topic of unconnectedTopics()) {
      for (const kind of KINDS) {
        if (topic.excludeKinds?.includes(kind) === true) continue;
        for (const cap of capabilitiesForElement(kind)) {
          const vocabulary = [cap.refusalLabel ?? '', ...(cap.aliases ?? [])].filter((w) => w.length > 0);
          const hit = vocabulary.find((w) => topic.match.test(w.toLowerCase()));
          if (hit === undefined) continue;
          contradictions.push(
            `topic "${topic.label}" fires on "${hit}" — which ${kind} ADVERTISES via ${cap.id}. ` +
            `The refusal would read: "${kind} ${topic.label} isn't connected to chat yet. ` +
            `${describeCapabilitiesFor(kind)}"`,
          );
        }
      }
    }
    expect(contradictions, 'a refusal that advertises what it refuses').toEqual([]);
  });

  it('the founder’s exact reply can no longer be produced for that sentence', () => {
    // The end-to-end statement, in one line: whatever this sentence does now, it is
    // not "isn't connected to chat yet".
    const r = capabilityGapRefusal('change wall finish to plaster white', ['wall']);
    expect(r).toBeNull();
  });
});
