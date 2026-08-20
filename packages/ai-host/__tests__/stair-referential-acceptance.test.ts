// @pryzm/ai-host — §FEAT-RAC-STAIR-SHAPE / §REFUSE-RAC-REPLICATE (L-1540..L-1542)
// =============================================================================
//
// ⭐ THE FOUNDER'S TWO SENTENCES, VERBATIM, AND THE MEASUREMENT THAT STARTED THIS
// FILE: both resolved to `{kind:'miss'}` — *"I'm not sure how to help with that
// yet."*
//
//   1  "create same stair in ground in level 1"
//   2  "create stair in L shape aligned to the selected wall"
//
// C67 §4 rule 19.b is the bar and it is why every `FOUNDER_*` constant below is
// his literal, article-free and all: *"An acceptance family's first phrasing is
// the user's literal … ⛔ A paraphrase that happens to work is not acceptance
// evidence."* The near-miss corpus at the bottom exists because L-1440 was
// exactly a phrasing that every existing test had written the OTHER way.

import { describe, expect, it } from 'vitest';
import {
  applySemanticIntent,
  resolveUtterance,
  resolveUtteranceIntent,
  type ResolverContext,
  type SemanticIntent,
} from '../src/intents/ZeroTokenResolver.js';
import { parseSpatialAnchorRef, describeAnchorRef } from '../src/intents/SpatialAnchorRef.js';
import { STAIR_SHAPES } from '@pryzm/geometry-stair';

const ctx = (over: Partial<ResolverContext> = {}): ResolverContext => ({
  selection: [],
  levels: [
    { id: 'L0', name: 'Ground', elevation: 0 },
    { id: 'L1', name: 'Level 1', elevation: 3 },
    { id: 'L5', name: 'Level 5', elevation: 15 },
  ],
  activeLevelId: 'L0',
  mintId: () => 'id-1',
  ...over,
} as ResolverContext);

const withWall = { selection: [{ elementId: 'w1', elementType: 'wall' }] };

function intentFor(text: string, over: Partial<ResolverContext> = {}): SemanticIntent | null {
  return resolveUtteranceIntent(text, ctx(over));
}

// ─────────────────────────────────────────────────────────────────────────────
// FOUNDER SENTENCE 2 — "create stair in L shape aligned to the selected wall"
// ─────────────────────────────────────────────────────────────────────────────

describe('2 — "create stair in L shape aligned to the selected wall"', () => {
  const FOUNDER_2 = 'create stair in L shape aligned to the selected wall';

  it('⭐ the founder literal is CLAIMED — it is no longer a bare miss', () => {
    const r = resolveUtterance(FOUNDER_2, ctx(withWall));
    expect(r.kind, 'the sentence still falls through to a miss').not.toBe('miss');
    const si = intentFor(FOUNDER_2, withWall);
    expect(si).not.toBeNull();
    expect(si!.intent).toBe('create-stair-shape');
  });

  it('the SHAPE is read as L — the tool axis, not the command axis', () => {
    const si = intentFor(FOUNDER_2, withWall)!;
    expect((si as { shape: string }).shape).toBe('L');
  });

  it('⭐ it ACTIVATES the stair tool with the shape — it does not create anything', () => {
    const si = intentFor(FOUNDER_2, withWall)!;
    const app = applySemanticIntent(si, ctx(withWall));
    expect(app.kind).toBe('local');
    expect((app as { action: string }).action).toBe('activateTool');
    const placement = (app as { placement: { itemRef: string; stairShape?: string } }).placement;
    expect(placement.itemRef).toBe('stair');
    expect(placement.stairShape).toBe('L');
  });

  it('⭐⭐ the alignment clause it CANNOT honour is DISCLOSED, never dropped', () => {
    // C84 EI-2 — a sentence asking for two things, served for one, must say so.
    // C67 §4 rule 20.b makes selection-as-geometry a MUST NOT, so the alignment
    // is genuinely un-honourable; what is under test is that the reply admits it.
    const si = intentFor(FOUNDER_2, withWall)!;
    const app = applySemanticIntent(si, ctx(withWall));
    const note = (app as { placement: { unhonouredNote?: string } }).placement.unhonouredNote;
    expect(note, 'the un-honoured alignment was silently dropped').toBeDefined();
    expect(note!).toContain('did NOT align');
    // the user's own words, quoted back — proof it was READ
    expect(note!).toContain('the selected wall');
    // the honest reason, in the ONE place it is authored
    expect(note!).toContain('WHICH element it is, not WHERE it is');
    // C16 CA-18 — the LIVE route for the half that was dropped
    expect(note!).toContain('By Walls');
  });

  it('⛔ a plain "create a stair" is NOT stolen — it keeps its working path', () => {
    // §FIX-PLACEMENT-OVERCLAIM: eight pills were once lost to a grammar standing
    // in front of a path that did the right thing.
    const si = intentFor('create a stair');
    expect(si?.intent).not.toBe('create-stair-shape');
    const r = resolveUtterance('create a stair', ctx());
    expect(r.kind).toBe('local');
    expect((r as { action: string }).action).toBe('activateTool');
  });

  it('⛔ the PINNED multi-storey refusal is NOT softened into an activation', () => {
    // C98 §L-1441.4.a — "It must not create a single-storey stair as a partial
    // result." The range guard in the shape grammar is what enforces this, and
    // the matcher ORDER (span before shape) is what makes it provable.
    const FOUNDER_A = 'create a stair from ground to level 5 connected to this wall in L shape';
    const si = intentFor(FOUNDER_A, withWall);
    expect(si?.intent).toBe('create-stair-span');
    const app = applySemanticIntent(si!, ctx(withWall));
    expect(app.kind).toBe('refusal');
  });

  it('⛔ an anchor with NO shape stays the pinned span refusal', () => {
    const si = intentFor('create a stair connected to this wall', withWall);
    expect(si?.intent).toBe('create-stair-span');
  });

  it('⛔⛔ a BULK EDIT of existing stairs is never answered with a draw cursor', () => {
    // C68 §5.j claiming discipline. "make" is both a creation verb and the
    // shared edit verb; "straight" is a shape the catalogue families cannot
    // resolve as a stair TYPE, so these fall through to this grammar. Arming a
    // creation tool for them would hand a draw cursor to someone asking to
    // change stairs that already exist.
    for (const t of [
      'make all the stairs straight',
      'make all stairs L shape',
      'make the selected stairs U shape',
      'make every staircase curved',
    ]) {
      expect(intentFor(t, { selection: [{ elementId: 's1', elementType: 'stair' }] })?.intent, t)
        .not.toBe('create-stair-shape');
    }
  });

  it('⭐ the bulk guard keys on the STAIR noun — the founder\'s "the selected WALL" survives it', () => {
    // A bare \bselected\b guard would have stood the grammar down on the very
    // sentence it exists to serve.
    expect(intentFor(FOUNDER_2, withWall)?.intent).toBe('create-stair-shape');
  });
});

describe('2b — the shape vocabulary is the CATALOGUE, not a transcription', () => {
  it('every authored shape is speakable by its letter', () => {
    for (const s of STAIR_SHAPES) {
      const si = intentFor(`create a stair in ${s.label} shape`);
      expect(si?.intent, `shape ${s.label} is unspeakable`).toBe('create-stair-shape');
      expect((si as { shape: string }).shape).toBe(s.label);
    }
  });

  it('the words people actually use reach the same shapes', () => {
    const cases: readonly (readonly [string, string])[] = [
      ['create an L-shaped stair', 'L'],
      ['create a U-shaped stair', 'U'],
      ['add a straight stair', 'I'],
      ['create a curved stair', 'C'],
      ['create a stair with a quarter turn', 'L'],
      ['create a stair with a half turn', 'U'],
      ['build a dog-leg stair', 'L'],
      ['draw a switchback stair', 'U'],
    ];
    for (const [text, shape] of cases) {
      const si = intentFor(text);
      expect(si?.intent, `unclaimed: ${text}`).toBe('create-stair-shape');
      expect((si as { shape: string }).shape, text).toBe(shape);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FOUNDER SENTENCE 1 — "create same stair in ground in level 1"
// ─────────────────────────────────────────────────────────────────────────────

describe('1 — "create same stair in ground in level 1"', () => {
  const FOUNDER_1 = 'create same stair in ground in level 1';

  it('⭐ the founder literal is CLAIMED — it is no longer a bare miss', () => {
    const r = resolveUtterance(FOUNDER_1, ctx(withWall));
    expect(r.kind, 'the sentence still falls through to a miss').not.toBe('miss');
    expect(intentFor(FOUNDER_1, withWall)?.intent).toBe('replicate-element');
  });

  it('both place tails are read — source and target, in his word order', () => {
    const si = intentFor(FOUNDER_1, withWall)!;
    expect((si as { elementKind: string }).elementKind).toBe('stair');
    expect((si as { sourceLevelQuery?: string }).sourceLevelQuery).toBe('ground');
    expect((si as { targetLevelQuery?: string }).targetLevelQuery).toBe('level 1');
  });

  it('⭐⭐ the refusal RESOLVES the level it can, and quotes the real level name', () => {
    // The difference between "I can't do that" and "I understood you want it on
    // Level 1 and I still can't" — only the second is falsifiable by the reader.
    const si = intentFor(FOUNDER_1, withWall)!;
    const app = applySemanticIntent(si, ctx(withWall));
    expect(app.kind).toBe('refusal');
    const reason = (app as { reason: string }).reason;
    expect(reason).toContain('Level 1');
    expect(reason).toContain('stair');
  });

  it('the refusal names WHY, says nothing changed, and names a LIVE route', () => {
    const si = intentFor(FOUNDER_1, withWall)!;
    const reason = (applySemanticIntent(si, ctx(withWall)) as { reason: string }).reason;
    // the measured cause — no command, on any kind
    expect(reason).toContain('not a command this product has');
    // ⛔ never a silent no-op
    expect(reason).toContain('Nothing was created');
    // C16 CA-18 — the live alternative, as a sentence he can type
    expect(reason).toContain('duplicate ground to level 1');
    // ⭐ and the TRAP in that alternative, named rather than discovered later
    expect(reason).toContain('does NOT copy stairs');
    const suggestions =
      (applySemanticIntent(si, ctx(withWall)) as { suggestions: readonly string[] }).suggestions;
    expect(suggestions).toContain('duplicate ground to level 1');
  });

  it('an UNRESOLVABLE level is reported as unresolvable, listing the real ones', () => {
    // §CONTEXT-DATA-HONESTY — a level that does not exist must never be quoted
    // back as though it did.
    const si = intentFor('copy the selected stair to level 9', withWall)!;
    expect(si.intent).toBe('replicate-element');
    const reason = (applySemanticIntent(si, ctx(withWall)) as { reason: string }).reason;
    expect(reason).toContain('not a level in this project');
    expect(reason).toContain('Ground');
    expect(reason).toContain('Level 5');
  });

  it('the family is GENERAL — a column asks the same question and is told the truth', () => {
    const si = intentFor('create the same column in level 1')!;
    expect(si.intent).toBe('replicate-element');
    const reason = (applySemanticIntent(si, ctx()) as { reason: string }).reason;
    expect(reason).toContain('column');
    // a column IS carried by the floor-plate route — so the offer is unqualified
    expect(reason).toContain('columns included');
    expect(reason).not.toContain('does NOT copy columns');
  });

  it('⛔ it does NOT steal `duplicate-level`, which is LIVE', () => {
    const si = intentFor('duplicate ground to level 1');
    expect(si?.intent).toBe('duplicate-level');
  });

  it('⛔ a plain creation sentence with no sameness marker is untouched', () => {
    expect(intentFor('create a stair')?.intent).not.toBe('replicate-element');
    expect(intentFor('create a wall')?.intent).not.toBe('replicate-element');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE SHARED ANCHOR VOCABULARY — the actual root of sentence 2's miss
// ─────────────────────────────────────────────────────────────────────────────

describe('§RAC-ANCHOR-ONE-VOCABULARY — a refusal grammar must not be narrower than the doctrine', () => {
  it('⭐ "aligned to" — the exact word that walked past the old eight-word list', () => {
    const ref = parseSpatialAnchorRef('create stair aligned to the selected wall');
    expect(ref, '"aligned" is still unreadable').not.toBeNull();
    expect(ref!.relation).toBe('aligned');
    expect(ref!.determiner).toBe('the selected');
    expect(ref!.noun).toBe('wall');
    expect(describeAnchorRef(ref!)).toBe('the selected wall');
  });

  it('the whole RELATION CLASS is read, not a list of the words seen so far', () => {
    const relations = [
      'aligned to', 'align with', 'parallel to', 'perpendicular to', 'flush with',
      'connected to', 'attached to', 'anchored to', 'joined to',
      'next to', 'adjacent to', 'beside', 'alongside', 'against', 'touching',
      'along', 'following', 'facing',
    ];
    for (const rel of relations) {
      const ref = parseSpatialAnchorRef(`create a stair ${rel} the selected wall`);
      expect(ref, `relation "${rel}" is unreadable`).not.toBeNull();
      expect(ref!.noun, rel).toBe('wall');
    }
  });

  it('the DETERMINER class is read too — this / that / selected / picked / highlighted', () => {
    for (const det of ['this', 'that', 'the selected', 'the picked', 'the highlighted', 'the current']) {
      const ref = parseSpatialAnchorRef(`create a stair against ${det} wall`);
      expect(ref, `determiner "${det}" is unreadable`).not.toBeNull();
    }
  });

  it('⛔⛔ a SUBJECT is not an ANCHOR — the over-claim GA gate 31 caught', () => {
    // "make the selected stairs 1.2m wide" is `set-stair-dimensions`'s OWN
    // declared example — the copy a refusal offers the user. The first cut of
    // this module read "the selected stairs" as a spatial anchor, which made the
    // stair-span grammar claim the sentence and turned a working bulk resize
    // into a refusal about geometry nobody asked for. C68 §6.3-G2: "an example
    // that does not work is a lie shipped in the UI."
    //
    // C67 §4 rule 20's table is the principle: selection-as-SUBJECT works,
    // selection-as-GEOMETRY-SOURCE does not, and the RELATION WORD is the only
    // thing that tells them apart.
    expect(parseSpatialAnchorRef('make the selected stairs 1.2m wide')).toBeNull();
    expect(parseSpatialAnchorRef('make this wall 3 m high')).toBeNull();
    expect(parseSpatialAnchorRef('delete the selected wall')).toBeNull();
    // and the sentence must reach its own capability, not the span refusal
    const si = intentFor('make the selected stairs 1.2m wide', {
      selection: [{ elementId: 's1', elementType: 'stair' }],
    });
    expect(si?.intent).not.toBe('create-stair-span');
  });

  it('⛔ a DESCRIPTION is not a REFERENCE — "against a wall" points at nothing', () => {
    // The distinction the whole capability turns on: "a wall" describes a kind
    // of place, "the selected wall" points at an object only the selection knows.
    expect(parseSpatialAnchorRef('create a stair against a wall')).toBeNull();
    expect(parseSpatialAnchorRef('create a stair in the middle of the room')).toBeNull();
  });

  it('⭐ the span refusal still reports the determiner shape its pinned test asserts', () => {
    // Widening a vocabulary must not silently change the SHAPE of a pinned
    // field — that is how a grammar fix becomes a copy regression.
    const si = intentFor('create a stair from ground to level 5 connected to this wall in L shape', withWall)!;
    expect((si as { anchorRef?: string }).anchorRef).toBe('this');
  });
});
