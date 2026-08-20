// §FIX-RAKE-SWALLOWED-AS-TYPE (L-1370) · §FIX-RAKE-UNIT-UNRECOGNISED (L-1371) ·
// §FIX-RAKE-SCOPE-TAIL (L-1372) · §FIX-RAKE-90-IS-VERTICAL (L-1373)
// =============================================================================
//
// THE FOUNDER'S SENTENCE, IN PRODUCTION:
//
//     make all walls on level 3 raked 90 dregress
//
// (his typo for *degrees*), answered with:
//
//     "There is no wall type called "on level 3 raked 90 dregres" in this
//      project. The wall types here are: Monolithic (Default), … Try: "change
//      all walls to monolithic (default)""
//
// ⭐ A sentence containing the word "raked" and a number was answered CONFIDENTLY
// as a WALL TYPE ask. That is the product being confidently wrong, which is
// worse than refusing (C68 §7).
//
// Three separable defects stacked into that one answer, and this file falsifies
// each of them SEPARATELY — a single end-to-end assertion would go green as soon
// as any one of the three were fixed:
//
//  1. L-1370 — `parseWallTypeIntent` guarded DIMENSION words and not RAKE words,
//     so the rake near-miss fell into it and became a catalogue lookup. The
//     asymmetry was the proof it was a gap, not a design: `DimensionFamilies`
//     has declined rake words since it was written.
//  2. L-1371 — "recognised-but-underspecified" (rake word ✓, number ✓, unit
//     unknown) fell THROUGH instead of refusing BY NAME.
//  3. L-1372 — the rake grammar carried the FOURTH hand-written spelling of the
//     spatial tail, so "in level 3" read as a ROOM called "level" here while the
//     identical phrase had been working elsewhere since L-1201.
//
// ⛔ NOTHING IS STUBBED. Every case drives the real `resolveUtterance` against
// the real wall-type catalogue lookup — a test that stubs the resolver proves
// nothing about which grammar claims a sentence.

import { describe, it, expect } from 'vitest';
import {
  resolveUtterance,
  type ResolverContext,
  type ZeroTokenResolution,
} from '../src/intents/ZeroTokenResolver.js';
import { OTHER_CAPABILITY_WORD } from '../src/intents/DimensionFamilies.js';
import {
  resolveWallSystemTypeRef,
  type WallSystemTypeCatalogueReader,
} from '@pryzm/command-registry';

// The REAL built-in wall types, verbatim from `geometry-wall/WallSystemTypeStore`
// — the same fixture `capability-acceptance.test.ts` uses, and the same names the
// founder was shown in the wrong answer.
const WALL_TYPES = [
  { id: 'wt-monolithic', name: 'Monolithic (Default)' },
  { id: 'wt-interior-partition', name: 'Interior – Partition 100mm' },
  { id: 'wt-exterior-brick', name: 'Exterior – Brick 300mm' },
  { id: 'wt-timber-frame', name: 'Timber Frame – 200mm' },
];

const catalogueReader = {
  getById: (id: string) => WALL_TYPES.find((t) => t.id === id),
  getAll: () => WALL_TYPES,
} as unknown as WallSystemTypeCatalogueReader;

/** Records every scope descriptor the resolver asks for, so a test can assert
 *  WHICH scope was resolved rather than only that something resolved. */
interface ScopeSpy {
  readonly seen: Record<string, unknown>[];
}

const ctxOf = (overrides: Partial<ResolverContext> = {}): ResolverContext => ({
  selection: [],
  levels: [
    { id: 'L1', name: 'Level 1', elevation: 0 },
    { id: 'L2', name: 'Level 2', elevation: 3 },
    { id: 'L3', name: 'Level 3', elevation: 6 },
  ],
  activeLevelId: 'L1',
  mintId: () => 'rake-test',
  resolveWallSystemType: (ref) => {
    const hit = resolveWallSystemTypeRef(catalogueReader, ref);
    return hit === null ? null : { id: hit.id, name: hit.name };
  },
  wallSystemTypeNames: WALL_TYPES.map((t) => t.name),
  ...overrides,
});

/** A live scope resolver: three walls on Level 3, two in the kitchen. */
const withScope = (spy: ScopeSpy): Partial<ResolverContext> => ({
  resolveScope: ((descriptor: Record<string, unknown>) => {
    spy.seen.push(descriptor);
    const ids = descriptor['kind'] === 'room' ? ['w-k1', 'w-k2'] : ['w1', 'w2', 'w3'];
    return {
      ids,
      kindCounts: { wall: ids.length },
      skipped: [],
      diagnostics: [descriptor['kind'] === 'room' ? 'Kitchen' : 'Level 3'],
    };
  }) as never,
});

const spy = (): ScopeSpy => ({ seen: [] });

function intentOf(r: ZeroTokenResolution): string | null {
  return r.kind === 'commands' || r.kind === 'local' || r.kind === 'refusal' ? r.intent : null;
}

function reasonOf(r: ZeroTokenResolution): string {
  return r.kind === 'refusal' ? r.reason : '';
}

// ─── L-1370 · the missing near-miss guard ────────────────────────────────────

describe('§FIX-RAKE-SWALLOWED-AS-TYPE (L-1370) — a rake near-miss is NEVER a wall type', () => {
  it("the founder's EXACT sentence is never answered as a wall-type miss", () => {
    const s = spy();
    const r = resolveUtterance(
      'make all walls on level 3 raked 90 dregress',
      ctxOf(withScope(s)),
    );
    expect(intentOf(r)).not.toBe('set-wall-type');
    // The whole defect was the copy: the product named a "wall type" the user
    // never asked for and listed the catalogue at him.
    expect(reasonOf(r)).not.toMatch(/wall type/i);
    expect(reasonOf(r)).not.toMatch(/Monolithic/);
  });

  it('the guard holds even with NO scope resolver — the fall-through target is what changed', () => {
    // Without `resolveScope` the sentence still cannot execute, but WHICH
    // capability owns the refusal is the whole point: before the guard it was
    // the wall-type catalogue.
    const r = resolveUtterance('make all walls on level 3 raked 90 dregress', ctxOf());
    expect(intentOf(r)).not.toBe('set-wall-type');
  });

  it('a rake sentence the rake grammar CANNOT claim still never becomes a type', () => {
    // No number at all ⇒ neither rake shape matches. Before L-1370 this landed
    // in `parseWallTypeIntent` with typeRef "tilted a bit".
    const r = resolveUtterance('make all walls tilted a bit', ctxOf());
    expect(intentOf(r)).not.toBe('set-wall-type');
    expect(reasonOf(r)).not.toMatch(/wall type called/i);
  });

  it('⛔ DOES NOT OVER-DECLINE — a real wall-type sentence still resolves as a type', () => {
    const r = resolveUtterance('change all walls to monolithic (default)', ctxOf());
    expect(r.kind).toBe('commands');
    expect(intentOf(r)).toBe('set-wall-type');
  });

  it('⛔ DOES NOT OVER-DECLINE — the founder\'s "interior partition" still resolves', () => {
    const r = resolveUtterance('make all walls interior partition', ctxOf());
    expect(intentOf(r)).toBe('set-wall-type');
  });

  it('the guard is DERIVED, not transcribed — every word in the shared set is declined', () => {
    // C84 EI-8a: a licensed copy is pinned by a TEST, never by a comment. If a
    // word is added to `OTHER_CAPABILITY_WORD` and the type grammar keeps its
    // own list, this fails.
    const words = ['angled', 'tilted', 'raked', 'leaning', 'leant', 'slanted', 'vertical', 'upright', 'pitch', 'slope', 'degrees', 'deg'];
    for (const w of words) {
      expect(OTHER_CAPABILITY_WORD.test(w)).toBe(true);
      const r = resolveUtterance(`change all walls to ${w} something`, ctxOf());
      expect(intentOf(r), `"${w}" was claimed as a wall type`).not.toBe('set-wall-type');
    }
  });

  it('the COLOUR grammar is guarded too — found by MEASUREMENT, not by reasoning', () => {
    // The audit sweep that followed the wall-type fix caught this one live:
    //   "paint all walls raked 90 dregress"
    //     -> refusal set-wall-color, 'I don't know the colour "raked 90 dregress"'
    // The colour-specific verbs (paint/colour) claim an unresolvable ref ON
    // PURPOSE so an unknown colour earns a colour refusal listing real options.
    // What they must not claim is a ref made of ANOTHER capability's words.
    for (const u of ['paint all walls raked 90 dregress', 'colour all walls angled by 70 degrees']) {
      expect(intentOf(resolveUtterance(u, ctxOf())), u).not.toBe('set-wall-color');
    }
  });

  it('⛔ the colour guard DOES NOT over-decline — real colours and unknown colours are unchanged', () => {
    expect(intentOf(resolveUtterance('paint all walls white', ctxOf()))).toBe('set-wall-color');
    // An unknown NON-capability ref still claims, and still earns the colour
    // refusal that lists real options — that rule is the reason `paint` claims
    // at all, and the guard must not have quietly removed it.
    const r = resolveUtterance('paint all walls unobtainium', ctxOf());
    expect(intentOf(r)).toBe('set-wall-color');
    expect(reasonOf(r)).toContain('unobtainium');
  });

  it('the HOSTED type grammars are guarded by the same set (window / door)', () => {
    for (const noun of ['window', 'door']) {
      const r = resolveUtterance(`change all ${noun}s to slanted 45 degrees`, ctxOf());
      expect(intentOf(r)).not.toBe(`set-${noun}-type`);
    }
  });
});

// ─── L-1371 · the bad unit refuses BY NAME ───────────────────────────────────

describe('§FIX-RAKE-UNIT-UNRECOGNISED (L-1371) — recognised-but-underspecified refuses by name', () => {
  it('quotes the unit the user typed and names the correction', () => {
    const s = spy();
    const r = resolveUtterance(
      'make all walls on level 3 raked 90 dregress',
      ctxOf(withScope(s)),
    );
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.intent).toBe('set-wall-rake');
    expect(r.reason).toContain('dregress');
    expect(r.reason).toMatch(/did you mean degrees/i);
  });

  it('⛔ NEVER auto-corrects — a bad unit yields NO command', () => {
    const s = spy();
    const r = resolveUtterance('make all walls raked 70 dregress', ctxOf(withScope(s)));
    expect(r.kind).toBe('refusal');
    expect(intentOf(r)).toBe('set-wall-rake');
  });

  it('⛔ the unit pattern is NOT widened — "dregress" is not accepted as degrees', () => {
    const s = spy();
    const r = resolveUtterance('make all walls raked 70 dregress', ctxOf(withScope(s)));
    if (r.kind === 'commands') throw new Error('a typo unit was silently accepted');
    expect(r.kind).toBe('refusal');
  });

  it('the CORRECTLY SPELLED sentence executes — the claim is not widened into a wall of refusals', () => {
    const s = spy();
    const r = resolveUtterance(
      'make all walls on level 3 raked 70 degrees',
      ctxOf(withScope(s)),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands).toEqual([
      { type: 'wall.updateRakeBatch', payload: { wallIds: ['w1', 'w2', 'w3'], rakeAngleDeg: 70 } },
    ]);
  });

  it('the recognised units all still parse: bare, °, deg, degree, degrees', () => {
    const s = spy();
    for (const tail of ['70', '70°', '70 deg', '70 degree', '70 degrees']) {
      const r = resolveUtterance(`make all walls raked ${tail}`, ctxOf(withScope(s)));
      expect(r.kind, tail).toBe('commands');
    }
  });
});

// ─── L-1372 · the fourth spatial tail, folded in ─────────────────────────────

describe('§FIX-RAKE-SCOPE-TAIL (L-1372) — "in level 3" and "on level 3" are the same sentence', () => {
  it('"in level 3" resolves a LEVEL, not a room called "level"', () => {
    const s = spy();
    const r = resolveUtterance('make all walls in level 3 raked 70 degrees', ctxOf(withScope(s)));
    expect(r.kind).toBe('commands');
    expect(s.seen[0]).toEqual({ kind: 'level', levelQuery: '3', elementKind: 'wall' });
  });

  it('"on level 3" resolves the IDENTICAL descriptor', () => {
    const s = spy();
    const r = resolveUtterance('make all walls on level 3 raked 70 degrees', ctxOf(withScope(s)));
    expect(r.kind).toBe('commands');
    expect(s.seen[0]).toEqual({ kind: 'level', levelQuery: '3', elementKind: 'wall' });
  });

  it('PRESERVED — the level arm still reads "on the ground floor" whole', () => {
    const s = spy();
    const r = resolveUtterance('tilt all walls on the ground floor by 60 degrees', ctxOf(withScope(s)));
    expect(r.kind).toBe('commands');
    expect(s.seen[0]).toEqual({ kind: 'level', levelQuery: 'ground floor', elementKind: 'wall' });
  });

  it('PRESERVED — the ROOM arm still reads "in the kitchen"', () => {
    const s = spy();
    const r = resolveUtterance('rake all walls in the kitchen by 75 degrees', ctxOf(withScope(s)));
    expect(r.kind).toBe('commands');
    expect(s.seen[0]).toEqual({ kind: 'room', roomRef: 'kitchen', elementKind: 'wall' });
  });

  it('PRESERVED — a spatial phrase composes with the ALL scope ONLY', () => {
    const s = spy();
    const r = resolveUtterance(
      'make these walls on level 3 raked 70 degrees',
      ctxOf({ ...withScope(s), selection: [{ elementId: 'w9', elementType: 'wall' }] }),
    );
    // Never a level scope: that would contradict the live selection.
    expect(s.seen.filter((d) => d['kind'] === 'level')).toHaveLength(0);
  });

  it('NEW from the shared tail — "this floor" resolves against the ACTIVE level', () => {
    const s = spy();
    const r = resolveUtterance('make all walls on this floor raked 70 degrees', ctxOf(withScope(s)));
    expect(r.kind).toBe('commands');
    expect(s.seen[0]).toEqual({ kind: 'level', levelQuery: 'Level 1', elementKind: 'wall' });
  });
});

// ─── L-1373 · 90° IS VERTICAL, and the card says so ──────────────────────────

describe('§FIX-RAKE-90-IS-VERTICAL (L-1373) — the confirm card states the ORIENTATION, in words', () => {
  it('90 degrees says VERTICAL, not "lean to 90°"', () => {
    const s = spy();
    const r = resolveUtterance('make all walls on level 3 raked 90 degrees', ctxOf(withScope(s)));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toEqual({ wallIds: ['w1', 'w2', 'w3'], rakeAngleDeg: 90 });
    // ⭐ The founder asked to RAKE and 90 STRAIGHTENS. The card is the last
    // honest moment before a mass edit, so it must say what it is about to do.
    expect(r.summary).toMatch(/VERTICAL/);
    expect(r.summary).not.toMatch(/^Lean/);
  });

  it('every other angle carries the reference point that makes the number legible', () => {
    const s = spy();
    const r = resolveUtterance('make all walls raked 70 degrees', ctxOf(withScope(s)));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.summary).toContain('70°');
    expect(r.summary).toContain('90° = vertical');
  });

  it('"make all walls vertical" is unchanged and still means 90', () => {
    const r = resolveUtterance('make all walls vertical', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toEqual({ wallIds: 'all', rakeAngleDeg: 90 });
    expect(r.summary).toMatch(/VERTICAL/);
  });
});
