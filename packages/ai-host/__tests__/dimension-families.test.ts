// §FEAT-BULK-DIMENSIONS (L-949) — the founder's bulk-dimension ask, pinned.
//
// THE ASK, verbatim: *"I have requested the possibility to ask to bulk change
// any element (doors, windows, walls) dimensions (or multiple dims) — I want ALL
// elements dims to be able to be changed."*
//
// ⭐ EVERY SENTENCE TEST HERE DRIVES THE REAL LADDER — `resolveCompoundUtterance`
// → `resolveUtterance` (tier 0/1) → `resolveNaturalLanguage` — and never a
// hand-built intent object. That is the whole point: production has NO AI
// upstream configured (`flyctl secrets list -a pryzm` shows neither
// CF_WORKER_URL nor ANTHROPIC_API_KEY), so a capability that resolves only
// through the LLM planner does not work for the founder. COMMITTED ≠ REACHABLE:
// a green test on a hand-built intent proves the arm, not the sentence.
//
// MEASURED BEFORE THIS CAPABILITY EXISTED (base 5e1d784a, the real ladder):
//   "make all windows 2 meters height"                  → kind=miss
//   "set all walls 3m high"                             → kind=miss
//   "change all windows height to 2m"                   → kind=miss
//   "make all doors 2m wide by 1m high with 0.1 sill"   → refusal "Nothing is
//                                                          selected"
//   (2 windows selected) "…2 meters height and 1 meter width"
//                                                       → refusal "…Select one
//                                                          element, or change one
//                                                          dimension for all of
//                                                          them" — a remedy that
//                                                          did not exist (L-942).

import { describe, it, expect } from 'vitest';
import {
  resolveUtterance,
  applySemanticIntent,
  type ResolverContext,
  type SemanticIntent,
  type ZeroTokenResolution,
} from '../src/intents/ZeroTokenResolver.js';
import { resolveNaturalLanguage } from '../src/intents/LocalNaturalLanguageResolver.js';
import { resolveCompoundUtterance } from '../src/intents/SemanticPlan.js';
import {
  DIMENSION_FAMILIES,
  SINGLE_FORM_CAPABILITY,
  parseDimensionScopedIntent,
  type DimensionKey,
} from '../src/intents/DimensionFamilies.js';
import { EXECUTION_SPECS } from '../src/intents/CapabilityExecutionSpec.js';
import {
  capabilityAppliesTo,
  resolveChatCapability,
} from '../src/capabilities/ChatCapabilityRegistry.js';
import { lengthToMeters } from '../src/intents/ZeroTokenResolver.js';
import type { ScopeDescriptor, ScopeResult } from '../src/intents/ScopeDescriptor.js';

let seq = 0;
function ctxOf(overrides: Partial<ResolverContext> = {}): ResolverContext {
  return {
    selection: [],
    levels: [
      { id: 'L0', name: 'Level 0', elevation: 0 },
      { id: 'L1', name: 'Level 1', elevation: 3 },
      { id: 'L2', name: 'Level 2', elevation: 6 },
    ],
    activeLevelId: 'L0',
    mintId: () => `dim-${++seq}`,
    ...overrides,
  } as ResolverContext;
}

/** A resolver that hands back `n` ids for whatever it is asked. */
function stubScope(n: number, diagnostic = 'Level 2'): (d: ScopeDescriptor) => ScopeResult {
  return () => ({
    ids: Array.from({ length: n }, (_, i) => `id-${i}`),
    kindCounts: {},
    skipped: [],
    diagnostics: [diagnostic],
  });
}

/** THE REAL LADDER the bridge uses. Nothing here shortcuts to an arm. */
function resolveFull(utterance: string, ctx: ResolverContext): ZeroTokenResolution {
  const plan = resolveCompoundUtterance(utterance, ctx);
  if (plan !== null) return plan;
  const tier01 = resolveUtterance(utterance, ctx);
  if (tier01.kind !== 'miss') return tier01;
  const nl = resolveNaturalLanguage(utterance, ctx);
  if (nl.kind === 'resolved') return nl.resolution;
  return { kind: 'miss' };
}

function intentOf(r: ZeroTokenResolution): string | null {
  return r.kind === 'commands' || r.kind === 'local' || r.kind === 'refusal' ? r.intent : null;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('L-949 — THE FOUNDER\'S SENTENCES, through the REAL zero-token ladder', () => {
  const CASES: ReadonlyArray<readonly [string, string, Record<string, number>]> = [
    ['make all windows 2 meters height', 'set-window-dimensions', { height: 2 }],
    ['make all windows 2m high', 'set-window-dimensions', { height: 2 }],
    ['change all windows height to 2m', 'set-window-dimensions', { height: 2 }],
    ['set all walls 3m high', 'set-wall-dimensions', { height: 3 }],
    ['set all walls height to 3m', 'set-wall-dimensions', { height: 3 }],
    ['make all doors 2m high', 'set-door-dimensions', { height: 2 }],
    [
      'make all doors 2m wide by 1m high',
      'set-door-dimensions',
      { width: 2, height: 1 },
    ],
    [
      'make all windows 2 meters height, 1 meter width and 0.1 meters sill height',
      'set-window-dimensions',
      { height: 2, width: 1, sillHeight: 0.1 },
    ],
  ];

  for (const [text, intent, dims] of CASES) {
    it(`"${text}" → ${intent} ${JSON.stringify(dims)}`, () => {
      const r = resolveFull(text, ctxOf({ resolveScope: stubScope(5) }));
      // NOT a miss (which is what falls through to an LLM that production does
      // not have), and NOT a refusal.
      expect(r.kind, `${text} resolved as ${r.kind}`).toBe('commands');
      expect(intentOf(r)).toBe(intent);
      if (r.kind !== 'commands') return;
      // ONE dispatch — the provable half of "one undo entry".
      expect(r.commands).toHaveLength(1);
      // A mass resize is confirmed before it runs.
      expect(r.destructive).toBe(true);
      // The Confirm card states a REAL count, never the unbounded 'all'.
      expect(r.summary).toContain('all 5');
      const payload = r.commands[0]!.payload as Record<string, unknown>;
      const carried = intent === 'set-wall-dimensions'
        ? { height: payload['height'] }
        : (payload['dimensions'] as Record<string, number>);
      for (const [k, v] of Object.entries(dims)) {
        expect(carried[k as keyof typeof carried], `${text} → ${k}`).toBe(v);
      }
    });
  }

  it('the whole-project scope resolves to REAL ids — never the unbounded "all"', () => {
    const r = resolveFull('make all windows 2m high', ctxOf({ resolveScope: stubScope(7) }));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    const ids = (r.commands[0]!.payload as { elementIds: unknown }).elementIds;
    expect(ids).not.toBe('all');
    expect(Array.isArray(ids) && (ids as string[]).length).toBe(7);
  });

  it('the wall family rides the SHIPPED wall.updateHeightBatch verb', () => {
    // That verb landed in VERBS-CMD for the founder's own worked example and has
    // been unreachable from chat ever since — a grammar was the whole gap.
    // Re-implementing it would have been the rival-primitive invention C16
    // forbids, so this assertion pins the reuse.
    const r = resolveFull('set all walls 3m high', ctxOf({ resolveScope: stubScope(4) }));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.type).toBe('wall.updateHeightBatch');
    expect((r.commands[0]!.payload as { wallIds: string[] }).wallIds).toHaveLength(4);
  });

  it('the opening families ride the ONE batch verb, carrying elementKind', () => {
    for (const [text, kind] of [['make all windows 2m high', 'window'], ['make all doors 2m high', 'door']] as const) {
      const r = resolveFull(text, ctxOf({ resolveScope: stubScope(3) }));
      expect(r.kind, text).toBe('commands');
      if (r.kind !== 'commands') continue;
      expect(r.commands[0]!.type).toBe('element.updateDimensionsBatch');
      expect((r.commands[0]!.payload as { elementKind: string }).elementKind).toBe(kind);
    }
  });
});

describe('L-949 — SCOPE: selection, level and room, all through the real ladder', () => {
  it('the SELECTION form acts on the selected elements of that kind', () => {
    const r = resolveFull('make the selected windows 2m high', ctxOf({
      selection: [
        { elementId: 'w1', elementType: 'window' },
        { elementId: 'w2', elementType: 'window' },
      ],
    }));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect((r.commands[0]!.payload as { elementIds: string[] }).elementIds).toEqual(['w1', 'w2']);
  });

  it('a LEVEL scope reaches the injected resolver and names the level', () => {
    const r = resolveFull('set all windows on level 2 to 2m high', ctxOf({ resolveScope: stubScope(6, 'Level 2') }));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.summary).toContain('6 windows on Level 2');
  });

  it('a ROOM scope composes with no grammar of its own', () => {
    const r = resolveFull('make all windows in the kitchen 2m high', ctxOf({ resolveScope: stubScope(2, 'kitchen') }));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.summary).toContain('2 windows');
  });
});

describe('L-949 — refusals rather than cheerful no-ops', () => {
  it('§NO-EMPTY-MEANS-UNKNOWN — an empty target set REFUSES and says so', () => {
    const empty: (d: ScopeDescriptor) => ScopeResult =
      () => ({ ids: [], kindCounts: {}, skipped: [], diagnostics: ['Level 2'] });
    const r = resolveFull('make all windows 2m high', ctxOf({ resolveScope: empty }));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('no windows in this project');
    expect(r.reason).toContain('nothing was changed');
  });

  it('an empty LEVEL scope names the place instead of reporting done', () => {
    const empty: (d: ScopeDescriptor) => ScopeResult =
      () => ({ ids: [], kindCounts: {}, skipped: [], diagnostics: ['Level 2'] });
    const r = resolveFull('set all windows on level 2 to 2m high', ctxOf({ resolveScope: empty }));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('level 2');
    expect(r.reason).toContain('nothing was changed');
  });

  it('NO scope resolver REFUSES rather than widening to the whole project', () => {
    // The dangerous failure this guards: silently treating an unresolvable
    // "all" as "every element", and resizing the model.
    const r = resolveFull('make all windows 2m high', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toMatch(/can't (count|list) every window/);
  });

  it('a kind LACKING the field is refused BY NAME, with the route that has it', () => {
    // ⚠ RE-POINTED 2026-08-17 (§FEAT-DOOR-SILL-DECLARED), and the reason matters.
    // This control used to use DOOR + SILL HEIGHT as its example of an unclaimed
    // field. That example is now WRONG — `set-sill-height` declares 'door', so the
    // ask succeeds and the arm would have gone red for the RIGHT reason. Deleting
    // or loosening it would have thrown away a live control over an honest-refusal
    // path; it is re-pointed at a pair that is still genuinely unclaimed instead.
    //
    // DOOR + THICKNESS is that pair: `set-thickness` is declared for walls, slabs
    // and roofs, and the thing carrying a thickness around a door is the WALL it
    // sits in — so the refusal is architecturally true as well as declarationally.
    //
    // Applying the fields that DO work (height) and staying quiet about this one
    // would be partial execution presented as success.
    const r = resolveFull('make all doors 2m high and 0.2m thick', ctxOf({ resolveScope: stubScope(3) }));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('thickness');
    // ⭐ The refusal states the MEASURED reason, never a false modelling claim.
    // A false refusal shipped over a live field is the same defect class as a
    // false success shipped over a dead one — which is exactly why the door-sill
    // version of this arm had to be CLOSED rather than kept as a passing test.
    expect(r.reason).toContain('walls, slabs and roofs only');
    expect(r.reason).toContain('Nothing was changed');
  });

  it('§FEAT-DOOR-SILL-DECLARED — a door sill now RESOLVES, and the founder sentence works', () => {
    // The founder's literal ask: "batch change dimensions of all windows and doors
    // (width height and sill height)". Before the declaration moved this refused,
    // honestly, on `set-sill-height.targets === ['window']`.
    const r = resolveFull(
      'make all doors 2m wide by 1m high with 0.1 sill',
      ctxOf({ resolveScope: stubScope(3) }),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    // ONE dispatch carrying ALL THREE dimensions — not three commands, not a
    // partial application. The batch composes one child per element (ADR-0314).
    expect(r.commands).toHaveLength(1);
    const payload = r.commands[0]!.payload as { elementKind: string; dimensions: Record<string, number> };
    expect(payload.elementKind).toBe('door');
    expect(payload.dimensions.width).toBeCloseTo(2, 6);
    expect(payload.dimensions.height).toBeCloseTo(1, 6);
    expect(payload.dimensions.sillHeight).toBeCloseTo(0.1, 6);
  });

  it('a wall THICKNESS bulk ask refuses by name and offers the real escape hatch', () => {
    // The carrier that exists (`wall.updateHeightBatch`) carries height only.
    // Silently applying the height and dropping the thickness would be the
    // partial-execution lie; inventing a second wall dimension verb inside a
    // chat tranche would be two sources of truth.
    const r = resolveFull('set all walls 3m high and 200mm thick', ctxOf({ resolveScope: stubScope(3) }));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('thickness');
    expect(r.reason).toContain('set thickness to 200mm');
  });

  it('a non-positive dimension refuses with the number the user said', () => {
    const r = resolveFull('make all windows 0m high', ctxOf({ resolveScope: stubScope(3) }));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('must be positive');
  });
});

describe('L-949 — the multi-selection compound refusal now advertises a REAL remedy', () => {
  it('names the bulk sentence instead of a capability that does not exist (L-942)', () => {
    const ctx = ctxOf({
      selection: [
        { elementId: 'w1', elementType: 'window' },
        { elementId: 'w2', elementType: 'window' },
      ],
    });
    const r = applySemanticIntent(
      { intent: 'set-dimensions', height: 2, width: 1 } as SemanticIntent,
      ctx,
    );
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('make all windows 2m high');
    // …and the remedy it names really resolves, through the real ladder.
    const remedy = resolveFull('make all windows 2m high', ctxOf({ resolveScope: stubScope(2) }));
    expect(remedy.kind).toBe('commands');
  });
});

describe('L-949 — the anti-nibbling guards (a near-miss must never resize)', () => {
  const MUST_NOT_BE_A_RESIZE: readonly string[] = [
    // The recorded, UNRESOLVED qualifier. Dropping it would raise every wall in
    // the building while the user believed the ask was scoped.
    'raise all exterior walls to 3.2 m',
    'set all exterior walls 3m high',
    'make all interior walls 2.7m high',
    // Owned by other capabilities.
    'make all walls angled by 70 degrees',
    'make all walls white',
    'change all windows to timber casement',
    // Ambiguous scope — "the" with no scope word could mean the selection or
    // the project, and a mass resize does not guess.
    'make the windows 2m high',
    // The SINGLE-element forms the existing matchers own.
    'make this 3m tall',
    'set height to 3m',
  ];

  for (const text of MUST_NOT_BE_A_RESIZE) {
    it(`"${text}" is NOT a bulk-dimension ask`, () => {
      const si = parseDimensionScopedIntent(text, ctxOf(), lengthToMeters);
      expect(si, `${text} was claimed as ${si?.intent}`).toBeNull();
    });
  }

  it('a VISIBILITY question never reaches the resize (C68 §5.j)', () => {
    // "highlight walls taller than 3m" once dispatched wall.updateDimensions on a
    // read-only question. The shared ladder gate keys on the INTENT ID, so a new
    // mutating family is covered by construction — this pins that it stays so.
    for (const q of ['highlight all walls taller than 3m', 'isolate all doors 2m high', 'hide all windows 2m high']) {
      const r = resolveFull(q, ctxOf({ resolveScope: stubScope(3) }));
      const id = intentOf(r);
      expect(
        id === null || !['set-wall-dimensions', 'set-window-dimensions', 'set-door-dimensions'].includes(id),
        `${q} → ${id}`,
      ).toBe(true);
    }
  });

  it('a NON-IMPERATIVE or hypothetical never resizes', () => {
    for (const q of [
      "don't make all windows 2m high",
      'what would happen if I made all windows 2m high?',
      'I was thinking about making all windows 2m high',
    ]) {
      const r = resolveFull(q, ctxOf({ resolveScope: stubScope(3) }));
      expect(r.kind, q).not.toBe('commands');
    }
  });
});

describe('L-949 — the table is GENERATED, and its claims are checked against the single form', () => {
  it('every family has a spec that is destructive AND count-bound', () => {
    for (const family of DIMENSION_FAMILIES) {
      const spec = EXECUTION_SPECS[family.intent];
      expect(spec, family.intent).toBeDefined();
      // The two halves of a safe mass edit. `destructive: false` drops the
      // Confirm card; `requireResolvedIds: false` lets the card show no number.
      expect(spec.destructive, `${family.intent} must show a Confirm card`).toBe(true);
      expect(spec.requireResolvedIds, `${family.intent} must resolve a real count`).toBe(true);
      expect(spec.busCommand, family.intent).toBe(family.busCommand);
      expect(spec.idsField, family.intent).toBe(family.idsField);
    }
  });

  it('every family has a registry capability whose targets come from the table', () => {
    for (const family of DIMENSION_FAMILIES) {
      const cap = resolveChatCapability(family.intent);
      expect(cap, family.intent).not.toBeNull();
      expect(cap!.targets).toEqual([family.elementKind]);
      expect(cap!.busCommand).toBe(family.busCommand);
      expect(cap!.destructive).toBe(true);
      expect(cap!.examples.length).toBeGreaterThan(0);
    }
  });

  // ⭐ THE CROSS-CHECK the module cycle forbids doing at runtime — see
  // `SINGLE_FORM_CAPABILITY`'s doc comment. A bulk ask may NEVER reach an
  // (element kind × dimension) pair the ONE-ELEMENT ask would refuse, and this
  // is what makes that true rather than merely intended: a target removed from
  // `set-height` / `set-width` / `set-sill-height` turns this red in the same
  // run instead of letting the batch quietly out-claim the single form.
  it('the batch can never accept what the SINGLE form refuses', () => {
    for (const family of DIMENSION_FAMILIES) {
      for (const field of family.carries as readonly DimensionKey[]) {
        const single = resolveChatCapability(SINGLE_FORM_CAPABILITY[field]);
        expect(single, `${SINGLE_FORM_CAPABILITY[field]} must exist`).not.toBeNull();
        expect(
          capabilityAppliesTo(single!, family.elementKind),
          `${family.intent} claims ${field}, but ${SINGLE_FORM_CAPABILITY[field]} does not target ${family.elementKind}`,
        ).toBe(true);
      }
    }
  });

  it('every EXAMPLE the registry advertises really resolves to its own capability', () => {
    // C68 §5.f — an example that does not resolve is an advertised capability
    // that is not one.
    for (const family of DIMENSION_FAMILIES) {
      for (const example of family.examples) {
        const ctx = ctxOf({
          resolveScope: stubScope(4),
          selection: [
            { elementId: 'x1', elementType: family.elementKind },
            { elementId: 'x2', elementType: family.elementKind },
          ],
        });
        const r = resolveFull(example, ctx);
        expect(intentOf(r), `"${example}"`).toBe(family.intent);
        expect(r.kind, `"${example}" resolved as ${r.kind}`).toBe('commands');
      }
    }
  });
});
