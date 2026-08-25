// §CHAT-OPENING-SHAPE (L-10945) + §CHAT-ORIENTATION-IS-NOT-A-ROOM (L-10941) —
// the founder's two refusals, pinned at the layer he types into.
//
// THE TWO SENTENCES, VERBATIM, AND WHAT THE PRODUCT SAID:
//
//   "change all windows to segmental type"
//     → "There is no window type called 'segmental type' in this project.
//        The window types here are: Single Pane (Default), Timber Casement, …"
//
//   "Make all windows in the south facade 0.1 meters sill height, 3 meters
//    height and 1.5 meters wide"
//     → "I can't find a room 'south'. The rooms here are: 00-001 (Room 00-001)."
//
// ⭐ EVERY SENTENCE TEST HERE DRIVES THE REAL LADDER —
// `resolveCompoundUtterance` → `resolveUtterance` → `resolveNaturalLanguage` —
// and never a hand-built intent object. That is the whole point, and it is the
// register's `[[committed-is-not-reachable]]` rule: production has NO AI
// upstream configured, so a capability that resolves only through the planner
// does not work for the founder. A green test on a hand-built intent proves the
// arm, not the sentence.

import { describe, it, expect } from 'vitest';
import {
  resolveUtterance,
  type ResolverContext,
  type ZeroTokenResolution,
} from '../src/intents/ZeroTokenResolver.js';
import { resolveNaturalLanguage } from '../src/intents/LocalNaturalLanguageResolver.js';
import { resolveCompoundUtterance } from '../src/intents/SemanticPlan.js';
import type { ScopeDescriptor, ScopeResult } from '../src/intents/ScopeDescriptor.js';

let seq = 0;

/** The window types the founder's project really holds — the list his refusal
 *  quoted back at him. Seeded so the arbitration below is not vacuous. */
const WINDOW_TYPES = [
  { id: 'wt-single', name: 'Single Pane (Default)' },
  { id: 'wt-timber', name: 'Timber Casement' },
  { id: 'wt-alu3', name: 'Aluminium Triple Glazed' },
];

const captured: ScopeDescriptor[] = [];

function ctxOf(overrides: Partial<ResolverContext> = {}): ResolverContext {
  captured.length = 0;
  return {
    selection: [],
    levels: [
      { id: 'L0', name: 'Level 0', elevation: 0 },
      { id: 'L1', name: 'Level 1', elevation: 3 },
      { id: 'L2', name: 'Level 2', elevation: 6 },
    ],
    activeLevelId: 'L0',
    rooms: [{ id: 'r1', name: 'Room 00-001', roomNumber: '00-001' }],
    mintId: () => `shape-${++seq}`,
    resolveWindowSystemType: (ref: string) =>
      WINDOW_TYPES.find((t) => t.name.toLowerCase() === ref.trim().toLowerCase()
        || t.id === ref.trim()) ?? null,
    windowSystemTypeNames: WINDOW_TYPES.map((t) => t.name),
    resolveScope: (d: ScopeDescriptor): ScopeResult => {
      captured.push(d);
      return {
        ids: ['w1', 'w2', 'w3'],
        kindCounts: { window: 3 },
        skipped: [],
        diagnostics: ['south-facing exterior'],
      };
    },
    ...overrides,
  } as ResolverContext;
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

// ── §A — REFUSAL 1, THE FOUNDER'S LITERAL SENTENCE ──────────────────────────

describe('§A — ⭐⭐ "change all windows to segmental type"', () => {
  it('⭐ resolves to set-window-shape, NOT to a window-type refusal', () => {
    const r = resolveFull('change all windows to segmental type', ctxOf());
    expect(intentOf(r)).toBe('set-window-shape');
    expect(r.kind).toBe('commands');
  });

  it('⭐ dispatches element.updateOpeningProfileBatch with the SEGMENTAL profile', () => {
    const r = resolveFull('change all windows to segmental type', ctxOf());
    expect(r.kind).toBe('commands');
    const cmds = (r as { commands: { type: string; payload: Record<string, unknown> }[] }).commands;
    expect(cmds).toHaveLength(1);
    expect(cmds[0]!.type).toBe('element.updateOpeningProfileBatch');
    expect(cmds[0]!.payload.openingProfile).toBe('segmental-arch');
    expect(cmds[0]!.payload.elementKind).toBe('window');
    // ⛔ RESOLVED IDS, never the unbounded 'all' — the Confirm card must be able
    // to state a real count, and the verb has no 'all' form at all.
    expect(cmds[0]!.payload.elementIds).toEqual(['w1', 'w2', 'w3']);
  });

  it('the summary states a real count in the mode bar\'s own word', () => {
    const r = resolveFull('change all windows to segmental type', ctxOf());
    const summary = (r as { summary?: string }).summary ?? '';
    expect(summary).toContain('Segmental');
    expect(summary).toMatch(/3 windows/);
  });

  it('⛔ NON-VACUITY — the SAME ladder still refuses a genuinely unknown type', () => {
    const r = resolveFull('change all windows to flurble casement', ctxOf());
    expect(intentOf(r)).toBe('set-window-type');
    expect(r.kind).toBe('refusal');
  });
});

describe('§B — open phrasings all reach the same capability', () => {
  const sentences = [
    ['change all windows to segmental', 'segmental-arch'],
    ['change all windows to segmental arch', 'segmental-arch'],
    ['make all windows arched', 'round-arch'],
    ['make all windows round arch', 'round-arch'],
    ['change all windows to semicircular', 'round-arch'],
    ['make all windows circular', 'circular'],
    ['turn all windows into round', 'circular'],
    ['change all windows to rectangular', 'rectangular'],
    ['make all windows square head', 'rectangular'],
    ['change the shape of all windows to segmental', 'segmental-arch'],
    ['reshape all windows to shallow arch', 'segmental-arch'],
  ] as const;
  for (const [text, profile] of sentences) {
    it(`"${text}" → ${profile}`, () => {
      const r = resolveFull(text, ctxOf());
      expect(intentOf(r), text).toBe('set-window-shape');
      const cmds = (r as { commands: { payload: Record<string, unknown> }[] }).commands;
      expect(cmds[0]!.payload.openingProfile).toBe(profile);
    });
  }

  it('the DOOR family works too', () => {
    const r = resolveFull('change all doors to arched', ctxOf());
    expect(intentOf(r)).toBe('set-door-shape');
    const cmds = (r as { commands: { payload: Record<string, unknown> }[] }).commands;
    expect(cmds[0]!.payload.elementKind).toBe('door');
    expect(cmds[0]!.payload.openingProfile).toBe('round-arch');
  });
});

describe('§C — ⛔ THE CATALOGUE STILL GETS THE FIRST SAY', () => {
  it('a REAL type name is still a TYPE, even when it contains a shape word', () => {
    const ctx = ctxOf({
      resolveWindowSystemType: (ref: string) =>
        ref.trim().toLowerCase() === 'segmental casement'
          ? { id: 'wt-seg', name: 'Segmental Casement' }
          : null,
      windowSystemTypeNames: ['Segmental Casement'],
    } as Partial<ResolverContext>);
    const r = resolveFull('change all windows to segmental casement', ctx);
    expect(intentOf(r)).toBe('set-window-type');
  });

  it('⛔ NON-VACUITY — without that type in the project, the same words are a SHAPE', () => {
    const r = resolveFull('change all windows to segmental', ctxOf());
    expect(intentOf(r)).toBe('set-window-shape');
  });

  it('an ordinary type sentence is untouched', () => {
    const r = resolveFull('change all windows to timber casement', ctxOf());
    expect(intentOf(r)).toBe('set-window-type');
  });
});

describe('§D — ⛔ a door may not be circular, and the refusal NAMES the rule', () => {
  it('states the geometry, not a vocabulary miss', () => {
    const r = resolveFull('make all doors circular', ctxOf());
    expect(intentOf(r)).toBe('set-door-shape');
    expect(r.kind).toBe('refusal');
    const reason = (r as { reason: string }).reason;
    expect(reason).toMatch(/door cannot be circular/i);
    expect(reason).toMatch(/notch/i);
    expect(reason).toMatch(/Rectangular/);
    expect(reason).toMatch(/Nothing was changed/);
  });

  it('⛔ NON-VACUITY — a door CAN be segmental, and that one runs', () => {
    const r = resolveFull('make all doors segmental', ctxOf());
    expect(r.kind).toBe('commands');
  });
});

// ── §E — REFUSAL 2, THE ORIENTATION AXIS ────────────────────────────────────

describe('§E — ⭐⭐ "in the south facade" is an ORIENTATION, not a room', () => {
  it('⭐ the founder\'s literal compound sentence resolves, and scopes by FACADE', () => {
    const r = resolveFull(
      'Make all windows in the south facade 0.1 meters sill height, 3 meters height and 1.5 meters wide',
      ctxOf(),
    );
    expect(intentOf(r)).toBe('set-window-dimensions');
    expect(r.kind).toBe('commands');
    // The scope the resolver ASKED FOR — the evidence it stopped looking for a room.
    const orientation = captured.find((d) => d.kind === 'orientation');
    expect(orientation, JSON.stringify(captured)).toBeDefined();
    expect((orientation as { orientation: string }).orientation).toBe('S');
  });

  it('⭐ SLICE 4 — all THREE dimensions ride ONE command, so it is ONE undo entry', () => {
    const r = resolveFull(
      'Make all windows in the south facade 0.1 meters sill height, 3 meters height and 1.5 meters wide',
      ctxOf(),
    );
    const cmds = (r as { commands: { type: string; payload: Record<string, unknown> }[] }).commands;
    expect(cmds).toHaveLength(1);
    expect(cmds[0]!.type).toBe('element.updateDimensionsBatch');
    expect(cmds[0]!.payload.dimensions).toEqual({ sillHeight: 0.1, height: 3, width: 1.5 });
  });

  it('the shape capability accepts the facade scope too', () => {
    const r = resolveFull('change all windows in the south facade to segmental', ctxOf());
    expect(intentOf(r)).toBe('set-window-shape');
    expect(captured.some((d) => d.kind === 'orientation')).toBe(true);
  });

  const phrasings = [
    'change all windows in the south facade to segmental',
    'change all windows on the north elevation to segmental',
    'change all windows in the western side to segmental',
    'change all windows in the south to segmental',
  ];
  for (const text of phrasings) {
    it(`"${text}" scopes by orientation`, () => {
      const r = resolveFull(text, ctxOf());
      expect(intentOf(r), text).toBe('set-window-shape');
      expect(captured.some((d) => d.kind === 'orientation'), text).toBe(true);
    });
  }
});

describe('§F — ⛔ a room really called "South" still wins', () => {
  it('the project gets the FIRST SAY, so this can only turn a refusal into a resolution', () => {
    const ctx = ctxOf({
      rooms: [{ id: 'r9', name: 'South', roomNumber: '00-009' }],
    } as Partial<ResolverContext>);
    const r = resolveFull('change all windows in the south to segmental', ctx);
    expect(intentOf(r)).toBe('set-window-shape');
    const room = captured.find((d) => d.kind === 'room');
    expect(room, JSON.stringify(captured)).toBeDefined();
    expect((room as { roomRef: string }).roomRef).toBe('south');
  });

  it('an ordinary room scope is untouched', () => {
    const r = resolveFull('change all windows in the kitchen to segmental', ctxOf());
    expect(intentOf(r)).toBe('set-window-shape');
    expect(captured.some((d) => d.kind === 'room')).toBe(true);
  });

  it('a LEVEL scope is untouched', () => {
    const r = resolveFull('change all windows on level 2 to segmental', ctxOf());
    expect(intentOf(r)).toBe('set-window-shape');
    expect(captured.some((d) => d.kind === 'level')).toBe(true);
  });
});

// ── §G — ⭐ SLICE 2: THE REFUSAL NAMES WHAT IT SEARCHED ──────────────────────
//
// The grammar fixes above are per-SENTENCE. This is per-AXIS, and it is the
// part that stops the next unmatched qualifier producing the same defect: a
// refusal may no longer present ONE axis's inventory as the whole vocabulary.

describe('§G — an unmatched type ref no longer implies its list is the language', () => {
  it('⭐ the type refusal states WHICH AXES were searched', () => {
    const r = resolveFull('change all windows to timber flurble casement unit', ctxOf());
    expect(intentOf(r)).toBe('set-window-type');
    expect(r.kind).toBe('refusal');
    const reason = (r as { reason: string }).reason;
    // It still lists the real types — that half was always right.
    expect(reason).toContain('Timber Casement');
    // ⭐ And it no longer stops there.
    expect(reason).toMatch(/I searched/);
    expect(reason).toMatch(/opening shapes/);
    expect(reason).toMatch(/compass orientations/);
  });

  it('⛔ NON-VACUITY — the founder\'s ORIGINAL sentence never reaches this refusal at all', () => {
    const r = resolveFull('change all windows to segmental type', ctxOf());
    const reason = (r as { reason?: string }).reason ?? '';
    expect(reason).not.toContain('There is no window type called');
    expect(r.kind).toBe('commands');
  });

  it('the WALL type refusal gained the same tail, without an opening-shape offer', () => {
    const ctx = ctxOf({
      resolveWallSystemType: () => null,
      wallSystemTypeNames: ['Monolithic (Default)'],
    } as Partial<ResolverContext>);
    const r = resolveFull('change all walls to flurble bloop', ctx);
    expect(intentOf(r)).toBe('set-wall-type');
    const reason = (r as { reason: string }).reason;
    expect(reason).toMatch(/I searched/);
    // ⛔ A wall has no opening-shape axis, and the registry knows it. Offering
    // one here would be the same over-claim in the other direction.
    expect(reason).not.toMatch(/opening shapes/);
  });
});
