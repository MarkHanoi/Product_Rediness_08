// §L-1032 — "Move/Change slab from Level 1 to Level 2", from the chat.
// =============================================================================
//
// The founder's ask has two halves. The PANEL half shipped in 40494b09 /
// d6a80d02. This suite pins the CHAT half, and it pins it by EXECUTING the
// resolver on his own sentences and asserting the VERB and the PAYLOAD that
// come out — not by asserting that a table has a row in it.
//
// ── WHAT THIS SUITE IS ACTUALLY GUARDING ────────────────────────────────────
//
// Three answers, never two:
//
//   1. a MOVABLE family      → the family's own verb, with the family's own
//                              payload field spelling (they genuinely differ);
//   2. a REFUSED family      → that family's declared `reason`, verbatim out of
//                              `LEVEL_CHANGE_REFUSALS`. "Move this door to level
//                              2" must say a door belongs to its host wall — not
//                              "I can't do that", and emphatically not "Done";
//   3. a family in NEITHER   → an honest "I don't know", never a guess.
//
// Plus the fourth thing, which is the one that actually ships defects: the
// sentences this grammar must NOT claim. Every miss below was measured, and the
// slab-catalogue collision in particular was a REAL misresolution found by the
// coverage gate while this capability was being written.

import { describe, it, expect } from 'vitest';
import {
  applySemanticIntent,
  resolveUtterance,
  type ResolverContext,
  type ZeroTokenResolution,
} from '../src/intents/ZeroTokenResolver.js';
import {
  LEVEL_CHANGE_REFUSALS,
  LEVEL_CHANGE_VERBS,
  buildLevelChangePayload,
} from '@pryzm/command-bus';
import {
  MOVE_TO_LEVEL_BUS_COMMANDS,
  MOVE_TO_LEVEL_TARGETS,
  normalizeElementKind,
  resolveChatCapability,
  CHAT_UNAVAILABLE,
} from '../src/capabilities/ChatCapabilityRegistry.js';
import { CHAT_CLASSIFIED } from '../src/capabilities/ChatCommandClassification.js';
import { capabilityGapRefusal } from '../src/capabilities/CapabilityRefusal.js';

const LEVELS = [
  { id: 'L0', name: 'Level 0', elevation: 0 },
  { id: 'L1', name: 'Level 1', elevation: 3 },
  { id: 'L2', name: 'Level 2', elevation: 6 },
];

function ctxOf(kinds: readonly string[]): ResolverContext {
  return {
    selection: kinds.map((k, i) => ({ elementId: `${k}-${i + 1}`, elementType: k })),
    levels: LEVELS,
    activeLevelId: 'L0',
    mintId: () => 'mint-1',
  } as ResolverContext;
}

function commandsOf(r: ZeroTokenResolution): readonly { type: string; payload: unknown }[] {
  expect(r.kind, `expected commands, got ${r.kind === 'refusal' ? `refusal: ${r.reason}` : r.kind}`)
    .toBe('commands');
  return (r as Extract<ZeroTokenResolution, { kind: 'commands' }>).commands;
}

function refusalOf(r: ZeroTokenResolution): string {
  expect(r.kind, `expected a refusal, got ${r.kind}`).toBe('refusal');
  return (r as Extract<ZeroTokenResolution, { kind: 'refusal' }>).reason;
}

// ─── 1. THE FOUNDER'S SENTENCES ──────────────────────────────────────────────

describe('§L-1032 — the founder’s own phrasings reach the family’s own verb', () => {
  it('"move the slab to level 2" dispatches slab.changeLevel with the slab’s field spelling', () => {
    const r = resolveUtterance('move the slab to level 2', ctxOf(['slab']));
    expect(commandsOf(r)).toEqual([
      { type: 'slab.changeLevel', payload: { slabId: 'slab-1', levelId: 'L2' } },
    ]);
  });

  it('"move slab from Level 0 to Level 2" carries the destination, and says the origin is the user’s claim', () => {
    const r = resolveUtterance('move slab from level 0 to level 2', ctxOf(['slab']));
    expect(commandsOf(r)).toEqual([
      { type: 'slab.changeLevel', payload: { slabId: 'slab-1', levelId: 'L2' } },
    ]);
    // The selection carries no level, so the arm CANNOT verify "from Level 0".
    // It says so rather than asserting a fact it did not check.
    const summary = (r as Extract<ZeroTokenResolution, { kind: 'commands' }>).summary;
    expect(summary).toContain('you said it is on Level 0');
  });

  it('"change this wall’s level to Level 1" dispatches wall.changeLevel — a DIFFERENT payload shape', () => {
    const r = resolveUtterance("change this wall's level to level 1", ctxOf(['wall']));
    // `wall.changeLevel` takes {id, newLevelId, newElevationY}; `slab.changeLevel`
    // takes {slabId, levelId}. Hand-typing either is §L-978, so the payload is
    // asserted against `buildLevelChangePayload` — the ONE builder — rather than
    // against a literal typed twice.
    expect(commandsOf(r)).toEqual([
      {
        type: 'wall.changeLevel',
        payload: buildLevelChangePayload(LEVEL_CHANGE_VERBS['wall.changeLevel']!, 'wall-1', 'L1', 3),
      },
    ]);
  });

  it('"change the level of this slab to level 2" — the of-form', () => {
    const r = resolveUtterance('change the level of this slab to level 2', ctxOf(['slab']));
    expect(commandsOf(r)).toEqual([
      { type: 'slab.changeLevel', payload: { slabId: 'slab-1', levelId: 'L2' } },
    ]);
  });

  it('"move this to level 2" — no noun, the selection decides the family', () => {
    const r = resolveUtterance('move this to level 2', ctxOf(['column']));
    expect(commandsOf(r)).toEqual([
      { type: 'column.changeLevel', payload: { columnId: 'column-1', levelId: 'L2' } },
    ]);
  });

  it('every MOVABLE family in the register really produces its own verb from a sentence', () => {
    // The point of a derived capability: the loop is over the REGISTER, so a
    // family added to it is covered here in the same edit, and a family that
    // leaves it stops being asserted in the same edit.
    for (const kind of MOVE_TO_LEVEL_TARGETS) {
      const r = resolveUtterance('move this to level 2', ctxOf([kind]));
      const cmds = commandsOf(r);
      expect(cmds.length, kind).toBe(1);
      expect(MOVE_TO_LEVEL_BUS_COMMANDS, kind).toContain(cmds[0]!.type);
      // The payload names the element under the family's OWN id field.
      expect(Object.values(cmds[0]!.payload as Record<string, unknown>), kind)
        .toContain(`${kind}-1`);
      expect(Object.values(cmds[0]!.payload as Record<string, unknown>), kind).toContain('L2');
    }
  });
});

// ─── 2. THE REFUSALS — the point of the task ─────────────────────────────────

describe('§L-1032 — a refused family answers with ITS OWN reason, never "I can’t do that"', () => {
  it('"move this door to level 2" explains that a door belongs to its host wall', () => {
    const reason = refusalOf(resolveUtterance('move this door to level 2', ctxOf(['door'])));
    expect(reason).toBe(LEVEL_CHANGE_REFUSALS['door']!.reason);
    expect(reason).toContain('host wall');
  });

  it('the door answer does not need a door SELECTED — the spoken noun decides first', () => {
    // Answering "nothing is selected" here would be true and useless: the user
    // would select the door and learn the real answer only on the second try.
    const reason = refusalOf(resolveUtterance('move this door to level 2', ctxOf([])));
    expect(reason).toBe(LEVEL_CHANGE_REFUSALS['door']!.reason);
  });

  it('every DECLARED refusal in the register is the sentence the chat says', () => {
    for (const [kind, row] of Object.entries(LEVEL_CHANGE_REFUSALS)) {
      const chatKind = normalizeElementKind(row.panelTypes[0]!);
      const r = resolveUtterance('move this to level 2', ctxOf([chatKind]));
      expect(refusalOf(r), `${kind}: the chat must speak the register's own reason`).toBe(row.reason);
    }
  });

  it('a family in NEITHER table gets an honest "I don’t know", not a guess', () => {
    // 'lift' has a refusal row; 'sprinkler' is invented here precisely because
    // nothing anywhere has an opinion about it. The answer must say so.
    const reason = refusalOf(resolveUtterance('move this to level 2', ctxOf(['sprinkler'])));
    expect(reason).toContain("I don't know whether a sprinkler can change level");
    expect(reason).toContain('Nothing was moved');
  });

  it('one refused element in a MIXED selection refuses the WHOLE ask', () => {
    // Partial execution reported as success is §L-995…L-998. Moving the slab and
    // silently leaving the door behind would be exactly that.
    const reason = refusalOf(resolveUtterance('move these to level 2', ctxOf(['slab', 'door'])));
    expect(reason).toContain('Nothing was moved');
    expect(reason).toContain('host wall');
  });

  it('"move all walls to level 2" refuses BY NAME — there is no project-wide level change', () => {
    const reason = refusalOf(resolveUtterance('move all walls to level 2', ctxOf(['wall'])));
    expect(reason).toContain('only move what you have selected');
    expect(reason).toContain('Nothing was moved');
  });

  it('a spoken noun that contradicts the selection refuses rather than moving the wrong thing', () => {
    const reason = refusalOf(resolveUtterance('move the slab to level 2', ctxOf(['wall'])));
    expect(reason).toContain('You asked to move a slab');
    expect(reason).toContain('Nothing was moved');
  });

  it('an unknown level refuses by LISTING the real ones', () => {
    const reason = refusalOf(resolveUtterance('move the slab to level 9', ctxOf(['slab'])));
    expect(reason).toContain('Level 0, Level 1, Level 2');
    expect(reason).toContain('Nothing was moved');
  });

  it('nothing selected refuses instead of moving nothing and reporting success', () => {
    const reason = refusalOf(resolveUtterance('move this to level 2', ctxOf([])));
    expect(reason).toContain('Nothing is selected');
  });

  it('a wall cannot move to a level with no elevation — the bus would bounce the payload', () => {
    // `ChangeWallLevelHandler.canExecute` rejects a non-finite `newElevationY`.
    // Dispatching anyway would produce a bus rejection the user never asked for;
    // refusing names the real gap instead.
    const ctx = {
      ...ctxOf(['wall']),
      levels: [{ id: 'LX', name: 'Mezzanine' }],
    } as ResolverContext;
    const reason = refusalOf(resolveUtterance('move this to mezzanine', ctx));
    expect(reason).toContain('no elevation recorded');
  });
});

// ─── 3. THE SENTENCES IT MUST NOT CLAIM ──────────────────────────────────────

describe('§L-1032 — what the level grammar deliberately does not claim', () => {
  it.each([
    // A PLANAR move. Still genuinely unconnected, and the `position` unconnected
    // topic must keep answering for it.
    ['move the wall 2m to the left', 'wall'],
    ['move the sofa to the corner', 'furniture'],
    // The slab-catalogue collision, in the OTHER direction: a bare demonstrative
    // plus a level noun used as the OBJECT is a finish/type ask.
    ['change this floor to oak', 'slab'],
    ['change the slab type to concrete', 'slab'],
    // Level navigation and duplication belong to their own capabilities.
    // (Asserted as "not move-to-level" rather than "miss" — see below.)
  ])('"%s" is not claimed as a level change', (utterance, kind) => {
    const r = resolveUtterance(utterance, ctxOf([kind]));
    const intent = r.kind === 'miss' ? null : (r as { intent: string }).intent;
    expect(intent).not.toBe('move-to-level');
  });

  it('the neighbouring level capabilities keep their sentences', () => {
    const cases: [string, string][] = [
      ['go to level 2', 'go-to-level'],
      ['switch to level 2', 'go-to-level'],
      ['duplicate level 0 to level 1', 'duplicate-level'],
      ['add a level at 9m', 'add-level'],
    ];
    for (const [utterance, expected] of cases) {
      const r = resolveUtterance(utterance, ctxOf([]));
      expect((r as { intent?: string }).intent, utterance).toBe(expected);
    }
  });
});

// ─── 4. THE DECLARATION SURFACES AGREE ───────────────────────────────────────

describe('§L-1032 — the capability, the register and the classification agree', () => {
  it('the class-B deferral is GONE — a verb may not be declared twice', () => {
    // `ChatCommandClassification` deferred wall/roof changeLevel with
    // `blockedBy: 'defined re-hosting semantics per element family'`. Those
    // semantics are now the register, so the deferral had to be deleted in the
    // same commit that shipped the capability — the coverage gate fails a verb
    // that is both classified and covered.
    for (const verb of MOVE_TO_LEVEL_BUS_COMMANDS) {
      expect(CHAT_CLASSIFIED.has(verb), `${verb} is still classified`).toBe(false);
      expect(CHAT_UNAVAILABLE.has(verb), `${verb} is both exposed and deferred`).toBe(false);
    }
  });

  it('every DEFERRED family with a built verb is declared in CHAT_UNAVAILABLE, in the register’s own words', () => {
    // §L-1087 — beam / furniture / lighting / plumbing have a working verb and a
    // working store move, and are STILL withheld because their meshes are seated
    // at a stored absolute Y. The chat must say so rather than leave the verb
    // undeclared (which is the c1902a5a blindness) or offer it (which would ship
    // a chair floating under its own floor).
    for (const kind of ['beam', 'furniture', 'lighting', 'plumbing']) {
      const row = LEVEL_CHANGE_REFUSALS[kind];
      if (row === undefined) continue; // moved back to movable — asserted above.
      expect(CHAT_UNAVAILABLE.get(`${kind}.changeLevel`), kind).toBe(row.reason);
    }
  });

  it('the capability’s targets are the register’s movable families, in the chat’s spelling', () => {
    const cap = resolveChatCapability('move-to-level');
    expect(cap).not.toBeNull();
    expect(cap!.targets).toEqual(MOVE_TO_LEVEL_TARGETS);
    const fromRegister = [
      ...new Set(
        Object.values(LEVEL_CHANGE_VERBS).flatMap((s) => s.panelTypes.map(normalizeElementKind)),
      ),
    ];
    expect([...MOVE_TO_LEVEL_TARGETS].sort()).toEqual(fromRegister.sort());
  });

  it('the probe behaves as the registry claims for EVERY declared target and every refused kind', () => {
    for (const kind of MOVE_TO_LEVEL_TARGETS) {
      const r = applySemanticIntent({ intent: 'move-to-level', levelQuery: '2' }, ctxOf([kind]));
      expect(r.kind, `${kind} is declared a target but the arm refuses it`).toBe('commands');
    }
    for (const row of Object.values(LEVEL_CHANGE_REFUSALS)) {
      const kind = normalizeElementKind(row.panelTypes[0]!);
      const r = applySemanticIntent({ intent: 'move-to-level', levelQuery: '2' }, ctxOf([kind]));
      expect(r.kind, `${kind} is refused by the register but the arm accepts it`).toBe('refusal');
    }
  });
});

// ─── 5. THE `position` TOPIC MUST NOT SHADOW THE LIVE CAPABILITY ─────────────

describe('§L-1032 — the `position` unconnected topic was narrowed, not deleted', () => {
  it('a level-shaped sentence never earns "position isn’t connected to chat yet"', () => {
    // The shadowing case: a level ask the GRAMMAR happens to miss must fall
    // through to the LLM, not be denied by a topic table that is now wrong.
    // §FIX-BARE-FINISH-SELF-CONTRADICTS is this defect one capability earlier.
    expect(capabilityGapRefusal('move the slab onto the second floor please', ['slab'])).toBeNull();
    expect(capabilityGapRefusal('relocate this wall to level 2', ['wall'])).toBeNull();
    expect(capabilityGapRefusal('shift the column up a storey', ['column'])).toBeNull();
  });

  it('a PLANAR move still gets the honest position refusal — the gap is real', () => {
    const r = capabilityGapRefusal('move the wall 2 metres to the left', ['wall']);
    expect(r).not.toBeNull();
    expect(r!.reason).toContain('position');
  });
});
