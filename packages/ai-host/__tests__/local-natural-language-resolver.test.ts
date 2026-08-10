// ADR-0313 §NL — local natural-language resolver: semantic equivalence sets,
// follow-ups, clarifications, honest refusals, confidence bounds, and the
// fall-through seam to the LLM.
//
// The load-bearing claims:
//  - linguistic VARIANTS of the same ask produce the SAME SemanticIntent and
//    therefore the SAME commands (via applySemanticIntent — one authority);
//  - a recognized-but-underspecified ask becomes ONE clarifying question,
//    never a guessed value (§CONTEXT-DATA-HONESTY);
//  - conversation context biases interpretation only — live editor state
//    always wins for targeting;
//  - anything not confidently command-shaped is a `miss` (the LLM seam).

import { describe, it, expect } from 'vitest';
import {
  resolveNaturalLanguage,
  noteResolution,
  CONFIDENCE_THRESHOLDS,
  type NaturalLanguageContext,
  type NaturalLanguageResolution,
  type ConversationContext,
} from '../src/intents/LocalNaturalLanguageResolver.js';
import type { ResolverContext, ZeroTokenResolution } from '../src/intents/ZeroTokenResolver.js';

let seq = 0;
const baseCtx = (overrides: Partial<NaturalLanguageContext> = {}): NaturalLanguageContext => ({
  selection: [],
  levels: [
    { id: 'L0', name: 'Level 0', elevation: 0 },
    { id: 'L1', name: 'Level 1', elevation: 3 },
    { id: 'L2', name: 'Level 2', elevation: 6 },
  ],
  activeLevelId: 'L0',
  mintId: () => `test-id-${++seq}`,
  ...overrides,
});

const wallSel = { selection: [{ elementId: 'wall-1', elementType: 'wall' }] };
const doorSel = { selection: [{ elementId: 'door-1', elementType: 'door' }] };

function expectResolved(r: NaturalLanguageResolution): Extract<NaturalLanguageResolution, { kind: 'resolved' }> {
  expect(r.kind).toBe('resolved');
  return r as Extract<NaturalLanguageResolution, { kind: 'resolved' }>;
}
function expectClarification(r: NaturalLanguageResolution): Extract<NaturalLanguageResolution, { kind: 'clarification' }> {
  expect(r.kind).toBe('clarification');
  return r as Extract<NaturalLanguageResolution, { kind: 'clarification' }>;
}
function commandsOf(r: NaturalLanguageResolution) {
  const res = expectResolved(r).resolution;
  expect(res.kind).toBe('commands');
  return res as Extract<ZeroTokenResolution, { kind: 'commands' }>;
}
function refusalOf(r: NaturalLanguageResolution) {
  const res = expectResolved(r).resolution;
  expect(res.kind).toBe('refusal');
  return res as Extract<ZeroTokenResolution, { kind: 'refusal' }>;
}

// ─── Semantic equivalence: set-height ────────────────────────────────────────

describe('semantic equivalence — height variants all yield set-height(3.0)', () => {
  it.each([
    'set the wall height to 3m',
    'make this wall 3 meters tall',
    'can you make the wall three metres high?',
    "I'd like this wall to be 3000mm high",
    'could you increase the height to 3m?',
    'Hey, could you make this wall 3 meters tall?',
    'please change the height to 300 cm',
    'Would you mind making this wall three meters high?',
  ])('"%s"', (utterance) => {
    const r = resolveNaturalLanguage(utterance, baseCtx(wallSel));
    const c = commandsOf(r);
    expect(expectResolved(r).intent).toBe('set-height');
    expect(c.commands).toEqual([
      { type: 'wall.updateDimensions', payload: { wallId: 'wall-1', height: 3 } },
    ]);
    expect(c.destructive).toBe(false);
    expect(expectResolved(r).confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLDS.resolve);
  });

  it('unit normalization preserves the ADR bare-number rule (2700→2.7, 3→3, 900mm→0.9, 90cm→0.9, 0.9→0.9)', () => {
    const cases: readonly [string, number][] = [
      ['set the height to 2700', 2.7],
      ['set the height to 3', 3],
      ['set the height to 900mm', 0.9],
      ['set the height to 90cm', 0.9],
      ['set the height to 0.9', 0.9],
      ['make this wall three thousand millimetres tall', 3],
    ];
    for (const [utterance, height] of cases) {
      const c = commandsOf(resolveNaturalLanguage(utterance, baseCtx(wallSel)));
      expect(c.commands[0]!.payload).toEqual({ wallId: 'wall-1', height });
    }
  });

  it('"make this wall two and a half meters tall" → 2.5', () => {
    const c = commandsOf(resolveNaturalLanguage('make this wall two and a half meters tall', baseCtx(wallSel)));
    expect(c.commands[0]!.payload).toEqual({ wallId: 'wall-1', height: 2.5 });
  });

  it('"make this wall three point five meters tall" → 3.5', () => {
    const c = commandsOf(resolveNaturalLanguage('make this wall three point five meters tall', baseCtx(wallSel)));
    expect(c.commands[0]!.payload).toEqual({ wallId: 'wall-1', height: 3.5 });
  });

  it('height on a door routes through element.updateParameters (same as the grammar path)', () => {
    const c = commandsOf(resolveNaturalLanguage('could you make this door 2.1m tall?', baseCtx(doorSel)));
    expect(c.commands).toEqual([
      {
        type: 'element.updateParameters',
        payload: { elementId: 'door-1', elementType: 'door', parameters: { height: 2.1 } },
      },
    ]);
  });
});

// ─── Semantic equivalence: deletion ──────────────────────────────────────────

describe('semantic equivalence — deletion variants all yield destructive delete-selected', () => {
  const doors = { selection: [{ elementId: 'door-1', elementType: 'door' }] };
  it.each([
    'delete the selected doors',
    'remove those doors',
    "get rid of the doors I've selected",
    "could you remove the three doors I've selected?",
    'please erase the selected door',
  ])('"%s"', (utterance) => {
    const r = resolveNaturalLanguage(utterance, baseCtx(doors));
    const c = commandsOf(r);
    expect(expectResolved(r).intent).toBe('delete-selected');
    expect(c.destructive).toBe(true);
    expect(c.commands).toEqual([
      {
        type: 'element.delete',
        payload: { elementId: 'door-1', elementType: 'door', source: 'AI_CHAT_ZERO_TOKEN' },
      },
    ]);
    // Destructive resolutions must clear the STRICTER bar.
    expect(expectResolved(r).confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLDS.resolveDestructive);
  });

  it('deletion with an EMPTY selection is an honest refusal, not a guess and not a miss', () => {
    const ref = refusalOf(resolveNaturalLanguage('could you remove the doors I selected?', baseCtx()));
    expect(ref.reason).toContain('Nothing is selected');
  });

  it('noun/selection mismatch refuses instead of deleting the wrong thing', () => {
    const ref = refusalOf(resolveNaturalLanguage('remove those doors', baseCtx(wallSel)));
    expect(ref.reason).toContain('selected element is a wall');
    expect(ref.reason).toContain('Nothing was deleted');
  });

  it('a bare "delete" with no target is a clarifying question, never a deletion', () => {
    const c = expectClarification(resolveNaturalLanguage('delete', baseCtx(wallSel)));
    expect(c.intent).toBe('delete-selected');
    expect(c.question.length).toBeGreaterThan(0);
  });
});

// ─── Semantic equivalence: levels ────────────────────────────────────────────

describe('semantic equivalence — level navigation', () => {
  it.each([
    ['go to level 2', 'L2'],
    ['take me to the second floor', 'L2'],
    ['switch to level two', 'L2'],
    ['could you open the second storey?', 'L2'],
    ['go to the ground floor', 'L0'],
  ])('"%s" → %s', (utterance, levelId) => {
    const r = expectResolved(resolveNaturalLanguage(utterance, baseCtx()));
    expect(r.intent).toBe('go-to-level');
    const res = r.resolution;
    expect(res.kind).toBe('local');
    if (res.kind === 'local') {
      expect(res.action).toBe('setActiveLevel');
      expect(res.levelId).toBe(levelId);
    }
  });

  it('"go upstairs" resolves relative to the ACTIVE level (L0 → L1)', () => {
    const r = expectResolved(resolveNaturalLanguage('go upstairs', baseCtx()));
    const res = r.resolution;
    expect(res.kind).toBe('local');
    if (res.kind === 'local') expect(res.levelId).toBe('L1');
  });

  it('"go upstairs to level 3" trusts the EXPLICIT level and refuses honestly when it does not exist', () => {
    const ref = refusalOf(resolveNaturalLanguage('go upstairs to level 3', baseCtx()));
    expect(ref.reason).toContain('Level 0');
    expect(ref.reason).toContain('Level 2');
  });

  it('level switch stores lastLevelId in the returned conversation', () => {
    const r = expectResolved(resolveNaturalLanguage('take me to the second floor', baseCtx()));
    expect(r.conversation.lastLevelId).toBe('L2');
  });
});

// ─── Follow-ups & conversation context ───────────────────────────────────────

describe('conversational follow-ups', () => {
  it('"Make this wall 3m high." then "Actually, make it 3.2m." revises the SAME intent', () => {
    const ctx1 = baseCtx(wallSel);
    const first = expectResolved(resolveNaturalLanguage('make this wall 3m high', ctx1));
    expect(first.intent).toBe('set-height');
    const second = resolveNaturalLanguage(
      'Actually, make it 3.2m.',
      baseCtx({ ...wallSel, conversation: first.conversation }),
    );
    const c = commandsOf(second);
    expect(expectResolved(second).intent).toBe('set-height');
    expect(c.commands[0]!.payload).toEqual({ wallId: 'wall-1', height: 3.2 });
    expect(expectResolved(second).evidence).toContain('follow-up:set-height');
  });

  it('a clarification stores a pendingIntent, and a bare value answers it', () => {
    const q = expectClarification(resolveNaturalLanguage('make the wall taller', baseCtx(wallSel)));
    expect(q.intent).toBe('set-height');
    expect(q.conversation.pendingIntent).toBe('set-height');
    const answer = resolveNaturalLanguage('2700', baseCtx({ ...wallSel, conversation: q.conversation }));
    const c = commandsOf(answer);
    expect(c.commands[0]!.payload).toEqual({ wallId: 'wall-1', height: 2.7 });
  });

  it('conversation context NEVER overrides live editor state: remembered wall, but a door is now selected', () => {
    const conversation: ConversationContext = {
      lastIntent: 'set-height',
      lastReferencedElements: [{ elementId: 'wall-1', elementType: 'wall' }],
      lastMeasurement: 3,
    };
    const r = resolveNaturalLanguage('make it 2.1m', baseCtx({ ...doorSel, conversation }));
    const c = commandsOf(r);
    // Targets the LIVE selection (door-1) — not the remembered wall.
    expect(c.commands).toEqual([
      {
        type: 'element.updateParameters',
        payload: { elementId: 'door-1', elementType: 'door', parameters: { height: 2.1 } },
      },
    ]);
  });

  it('a bare measurement with NO conversational context is a miss (no guessing)', () => {
    expect(resolveNaturalLanguage('3.2m', baseCtx(wallSel)).kind).toBe('miss');
  });

  it('noteResolution folds a tier-0 command resolution into the conversation', () => {
    const tier0: ZeroTokenResolution = {
      kind: 'commands', intent: 'set-height', tier: 0, summary: 's',
      commands: [{ type: 'wall.updateDimensions', payload: { wallId: 'wall-1', height: 3 } }],
      destructive: false,
    };
    const conv = noteResolution({}, tier0);
    expect(conv.lastIntent).toBe('set-height');
    expect(conv.lastMeasurement).toBe(3);
    // …and the follow-up then works even though tier 0 answered the first turn.
    const r = resolveNaturalLanguage('actually make it 3.2', baseCtx({ ...wallSel, conversation: conv }));
    expect(commandsOf(r).commands[0]!.payload).toEqual({ wallId: 'wall-1', height: 3.2 });
  });
});

// ─── Clarifications — recognized but underspecified ──────────────────────────

describe('clarification — ask, never guess', () => {
  it('"make the wall taller" (no amount) asks for the height', () => {
    const c = expectClarification(resolveNaturalLanguage('make the wall taller', baseCtx(wallSel)));
    expect(c.intent).toBe('set-height');
    expect(c.question).toContain('height');
  });

  it('"I\'d like this wall a little thicker" asks for the thickness', () => {
    const c = expectClarification(resolveNaturalLanguage("I'd like this wall a little thicker", baseCtx(wallSel)));
    expect(c.intent).toBe('set-thickness');
    expect(c.question.toLowerCase()).toContain('thick');
  });

  it('"increase the height by 20cm" (relative delta) asks for the absolute value instead of guessing', () => {
    const c = expectClarification(resolveNaturalLanguage('increase the height by 20cm', baseCtx(wallSel)));
    expect(c.intent).toBe('set-height');
    expect(c.question.toLowerCase()).toContain('height');
  });

  it('clarification confidence sits in the medium band', () => {
    const c = expectClarification(resolveNaturalLanguage('make the wall taller', baseCtx(wallSel)));
    expect(c.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLDS.clarify);
    expect(c.confidence).toBeLessThan(CONFIDENCE_THRESHOLDS.resolve);
  });
});

// ─── Other intents through the NL path ───────────────────────────────────────

describe('other intents', () => {
  it('undo variants ("undo that", "go back", "reverse that", "take that back")', () => {
    for (const u of ['undo that', 'go back', 'reverse that', 'take that back', 'Actually, undo that.']) {
      const r = expectResolved(resolveNaturalLanguage(u, baseCtx()));
      expect(r.intent).toBe('undo');
      expect(r.resolution.kind).toBe('local');
    }
  });

  it('redo variants ("redo", "do that again")', () => {
    for (const u of ['redo', 'do that again']) {
      const r = expectResolved(resolveNaturalLanguage(u, baseCtx()));
      expect(r.intent).toBe('redo');
    }
  });

  it('"zoom out so I can see everything" → zoom-fit', () => {
    const c = commandsOf(resolveNaturalLanguage('zoom out so I can see everything', baseCtx()));
    expect(c.commands).toEqual([{ type: 'zoom-fit', payload: {} }]);
  });

  it('"could you add another floor?" → level.add', () => {
    const c = commandsOf(resolveNaturalLanguage('could you add another floor?', baseCtx()));
    expect(c.commands[0]!.type).toBe('level.add');
  });

  it('"please draw a wall from (0,0) to (5,0)" → wall.create on the active level', () => {
    const c = commandsOf(resolveNaturalLanguage('please draw a wall from (0,0) to (5,0)', baseCtx()));
    expect(c.commands[0]!.type).toBe('wall.create');
    expect(c.commands[0]!.payload).toMatchObject({
      start: { x: 0, z: 0 },
      end: { x: 5, z: 0 },
      levelId: 'L0',
    });
  });

  it('"could you build a wall for me?" (no coordinates) → honest refusal with the syntax', () => {
    const ref = refusalOf(resolveNaturalLanguage('could you build a wall for me?', baseCtx()));
    expect(ref.suggestions.some((s) => s.includes('(0,0) to (5,0)'))).toBe(true);
  });

  it('"call this room the master bedroom" with a room selected → room.rename', () => {
    const roomSel = { selection: [{ elementId: 'room-1', elementType: 'room' }] };
    const c = commandsOf(resolveNaturalLanguage('call this room the master bedroom', baseCtx(roomSel)));
    expect(c.commands[0]!.type).toBe('room.rename');
  });

  it('"set the door width to nine hundred millimeters" → door.setWidth 0.9', () => {
    const c = commandsOf(resolveNaturalLanguage('set the door width to nine hundred millimeters', baseCtx(doorSel)));
    expect(c.commands).toEqual([{ type: 'door.setWidth', payload: { doorId: 'door-1', width: 0.9 } }]);
  });
});

// ─── Typos & synonyms ────────────────────────────────────────────────────────

describe('typo + synonym normalization', () => {
  it('"could you remvoe the selectd doors?" still resolves (with a confidence penalty)', () => {
    const doors = { selection: [{ elementId: 'door-1', elementType: 'door' }] };
    const r = resolveNaturalLanguage('could you remvoe the selectd doors?', baseCtx(doors));
    const resolved = expectResolved(r);
    expect(resolved.intent).toBe('delete-selected');
    expect(resolved.evidence.some((e) => e.startsWith('typo-corrected'))).toBe(true);
  });

  it('"make this wall 3 metrs tall" resolves set-height 3', () => {
    const c = commandsOf(resolveNaturalLanguage('make this wall 3 metrs tall', baseCtx(wallSel)));
    expect(c.commands[0]!.payload).toEqual({ wallId: 'wall-1', height: 3 });
  });
});

// ─── Confidence bounds + honesty invariants ──────────────────────────────────

describe('confidence invariants', () => {
  it('every result carries a bounded confidence and non-empty evidence on non-miss', () => {
    const samples = [
      'make this wall 3m tall',
      'make the wall taller',
      'delete the selected doors',
      'go to level 2',
      'make this apartment feel more spacious',
    ];
    for (const u of samples) {
      const r = resolveNaturalLanguage(u, baseCtx(wallSel));
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
      if (r.kind !== 'miss') expect(r.evidence.length).toBeGreaterThan(0);
    }
  });
});

// ─── The LLM seam — misses fall through ──────────────────────────────────────

describe('misses — free-form asks fall through to the LLM tier', () => {
  it.each([
    'Make this apartment feel more spacious.',
    'generate an apartment layout for this floor',
    'what walls are on this level?',
    'how high is this wall?',
    'can you suggest a better kitchen arrangement?',
    'hello',
  ])('"%s" is a miss', (utterance) => {
    expect(resolveNaturalLanguage(utterance, baseCtx(wallSel)).kind).toBe('miss');
  });

  it('questions are never misread as commands even when they mention dimensions', () => {
    expect(resolveNaturalLanguage('how tall is the selected wall?', baseCtx(wallSel)).kind).toBe('miss');
    expect(resolveNaturalLanguage('what is the height of this wall?', baseCtx(wallSel)).kind).toBe('miss');
  });
});

// ─── §FEAT-CHAT-FOLLOWUP — structured revision follow-ups ────────────────────

describe('follow-ups — revisions reuse the last intent, live state wins for targeting', () => {
  it('"change all walls to interior partition" → "actually use exterior brick" keeps the ALL scope', () => {
    const first = resolveNaturalLanguage('change all walls to interior partition', baseCtx());
    const r1 = commandsOf(first);
    expect(r1.commands[0]!.payload).toEqual({ wallIds: 'all', systemType: 'interior partition' });
    const conv = expectResolved(first).conversation;
    expect(conv.lastIntent).toBe('set-wall-type');
    expect(conv.lastWallTypeScope).toBe('all');

    const second = resolveNaturalLanguage('actually use exterior brick', baseCtx({ conversation: conv }));
    const r2 = commandsOf(second);
    expect(expectResolved(second).intent).toBe('set-wall-type');
    expect(r2.commands[0]!.payload).toEqual({ wallIds: 'all', systemType: 'exterior brick' });
  });

  it('the SELECTION scope survives the revision too', () => {
    const ctx = baseCtx(wallSel);
    const first = resolveNaturalLanguage('change these walls to interior partition', ctx);
    const conv = expectResolved(first).conversation;
    expect(conv.lastWallTypeScope).toBe('selection');
    const second = resolveNaturalLanguage('actually use exterior brick', baseCtx({ ...wallSel, conversation: conv }));
    const r2 = commandsOf(second);
    expect(r2.commands[0]!.payload).toEqual({ wallIds: ['wall-1'], systemType: 'exterior brick' });
  });

  it('"go to level 2" → "actually level 1" and → bare "actually 1" both re-target the level switch', () => {
    const first = resolveNaturalLanguage('take me to level 2', baseCtx());
    const conv = expectResolved(first).conversation;
    expect(conv.lastIntent).toBe('go-to-level');

    for (const revision of ['actually level 1', 'actually 1']) {
      const second = resolveNaturalLanguage(revision, baseCtx({ conversation: conv }));
      const res = expectResolved(second).resolution;
      expect(res.kind, revision).toBe('local');
      if (res.kind !== 'local') continue;
      expect(res.levelId, revision).toBe('L1');
    }
  });

  it('noteResolution records the wall-type scope from a tier-0 resolution payload', () => {
    const conv = noteResolution({}, {
      kind: 'commands', intent: 'set-wall-type', tier: 0, summary: '',
      commands: [{ type: 'wall.updateSystemTypeBatch', payload: { wallIds: 'all', systemType: 'wt-x' } }],
      destructive: false,
    });
    expect(conv.lastWallTypeScope).toBe('all');
  });

  it('a pending set-height clarification still wins over a stale go-to-level context', () => {
    const conv: ConversationContext = { lastIntent: 'go-to-level', pendingIntent: 'set-height' };
    const r = resolveNaturalLanguage('2700', baseCtx({ ...wallSel, conversation: conv }));
    const c = commandsOf(r);
    expect(c.commands).toEqual([
      { type: 'wall.updateDimensions', payload: { wallId: 'wall-1', height: 2.7 } },
    ]);
  });
});

// ─── §FIX-CHAT-COMPOUND-DIMENSIONS — binding, not first-number-wins ──────────

describe('compound dimension binding', () => {
  it('binds each value to its named dimension regardless of order', () => {
    const r = resolveNaturalLanguage(
      'make this window 2 meters height, 2 meters width and 0.1 meters sill height',
      baseCtx({ selection: [{ elementId: 'w-9', elementType: 'window' }] }),
    );
    const c = commandsOf(r);
    expect(c.intent).toBe('set-dimensions');
    expect(c.commands).toEqual([{
      type: 'element.updateParameters',
      payload: { elementId: 'w-9', elementType: 'window', parameters: { height: 2, width: 2, sillHeight: 0.1 } },
    }]);
  });

  it('"set the height to 3m and the thickness to 200mm" (dim-then-value order) → one wall command', () => {
    const r = resolveNaturalLanguage('set the height to 3m and the thickness to 200mm', baseCtx(wallSel));
    const c = commandsOf(r);
    expect(c.commands).toEqual([
      { type: 'wall.updateDimensions', payload: { wallId: 'wall-1', height: 3, thickness: 0.2 } },
    ]);
  });

  it('a single bound dimension still resolves through the single-form intent', () => {
    const r = resolveNaturalLanguage('make this door 900mm wide', baseCtx(doorSel));
    const c = commandsOf(r);
    expect(expectResolved(r).intent).toBe('set-width');
    expect(c.commands).toEqual([{ type: 'door.setWidth', payload: { doorId: 'door-1', width: 0.9 } }]);
  });
});
