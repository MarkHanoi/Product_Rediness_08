// §CWCHAT155 (L-12520..L-12524) — PROOF that the founder's four literal
// curtain-wall PARAMETER sentences now reach the real bus verb through the
// LIVE chat ladder (`resolveUtterance` — tier 0/1, exactly what
// `ZeroTokenChatBridge.tryHandleZeroToken` calls FIRST), not merely through
// the standalone grammar unit (`curtainWallParameterFamily.test.ts`, which
// deliberately calls `parseCurtainWallParameterIntent` directly and says so in
// its own header: "this grammar is not wired into ZeroTokenResolver.ts...
// yet").
//
// BEFORE this lane's wiring (matchCurtainWallParameter in ZeroTokenResolver's
// MATCHERS array + the 'set-curtain-wall-parameter' case arm), every one of
// these four sentences was either an honest miss (CHAT_UNAVAILABLE covered
// the gap) or — for the three that carry the word "wall(s)" inside "curtain
// wall(s)" — silently misread as `set-wall-side-finish`
// (CurtainWallParameterFamily.ts's own header records this measurement,
// 2026-08-27, against the OLD selection-scoped PropertyVocabulary sibling of
// the same names — the identical word collision this lane's grammar is now
// proven immune to below).
//
// Also proves the OWNERSHIP RULE (Blocker 2): the four sentences do NOT
// resolve to `set-wall-side-finish` despite carrying "wall(s)", a genuine
// curtain-wall FINISH ask still reaches `set-wall-side-finish` untouched, and
// "make all walls white paint" (§RACSIDE144's own founder sentence) is
// unaffected.

import { describe, it, expect } from 'vitest';
import {
  resolveUtterance,
  type ResolverContext,
  type ZeroTokenResolution,
} from '../src/intents/ZeroTokenResolver.js';
import type { ScopeDescriptor, ScopeResult } from '../src/intents/ScopeDescriptor.js';

/**
 * A minimal, realistic `resolveScope` stub. It answers the THREE descriptor
 * shapes this lane's arm can produce for a curtain-wall parameter ask:
 *   • level, elementKind 'curtainwall'      — the ground-level / level-3 asks.
 *   • orientation, NO elementKind           — "the west facade" ask; answered
 *     with a MIXED wall + curtain-wall id set on purpose, because that is
 *     EXACTLY what §RACORIENT145's FacadeOrientationService really returns
 *     (curtain walls share the ordinary wall id space in `facadesByOrientation`
 *     — see ZeroTokenResolver.ts's own case-arm comment for why the mix is
 *     safe: `BulkUpdateCurtainWallParameterCommand`'s `'ids'` arm intersects
 *     against the real curtainWallStore, which this ai-host-layer test cannot
 *     see and therefore does not assert — see this lane's report).
 */
function makeResolveScope(): (d: ScopeDescriptor) => ScopeResult {
  return (d: ScopeDescriptor): ScopeResult => {
    if (d.kind === 'level') {
      return {
        ids: d.levelQuery.toLowerCase().includes('ground')
          ? ['cw-ground-1', 'cw-ground-2']
          : ['cw-l3-1'],
        kindCounts: {},
        skipped: [],
        diagnostics: [d.levelQuery.toLowerCase().includes('ground') ? 'Ground Level' : 'Level 3'],
      };
    }
    if (d.kind === 'orientation') {
      // A mixed hit set — see the header note above.
      return {
        ids: ['wall-w-1', 'cw-w-1', 'cw-w-2'],
        kindCounts: {},
        skipped: [],
        diagnostics: ['west'],
      };
    }
    return { error: `unexpected descriptor kind "${d.kind}" for this stub` };
  };
}

function ctxOf(overrides: Partial<ResolverContext> = {}): ResolverContext {
  return {
    selection: [],
    levels: [
      { id: 'L0', name: 'Ground Level', elevation: 0 },
      { id: 'L3', name: 'Level 3', elevation: 9 },
    ],
    activeLevelId: 'L0',
    mintId: () => 'cwchat155-mint',
    resolveScope: makeResolveScope(),
    ...overrides,
  };
}

function commandsOf(r: ZeroTokenResolution): { type: string; payload: Record<string, unknown> }[] {
  if (r.kind !== 'commands') {
    throw new Error(`expected kind 'commands', got ${r.kind}${r.kind === 'refusal' ? `: ${r.reason}` : ''}`);
  }
  return [...r.commands];
}

describe('§CWCHAT155 — the founder\'s four literal sentences reach curtain-wall.bulkUpdateParameter', () => {
  it('"make mullion size of all curtain walls in ground level to 0.06 meters" — PASS', () => {
    const r = resolveUtterance(
      'make mullion size of all curtain walls in ground level to 0.06 meters',
      ctxOf(),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('set-curtain-wall-parameter');
    const [cmd] = commandsOf(r);
    expect(cmd!.type).toBe('curtain-wall.bulkUpdateParameter');
    expect(cmd!.payload['parameter']).toBe('mullionSize');
    expect(cmd!.payload['value']).toBeCloseTo(0.06, 6);
    expect(cmd!.payload['scope']).toEqual({ kind: 'ids', curtainWallIds: ['cw-ground-1', 'cw-ground-2'] });
  });

  it('"set post spacing to 1.2 on the west facade" — PASS', () => {
    const r = resolveUtterance('set post spacing to 1.2 on the west facade', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('set-curtain-wall-parameter');
    const [cmd] = commandsOf(r);
    expect(cmd!.type).toBe('curtain-wall.bulkUpdateParameter');
    expect(cmd!.payload['parameter']).toBe('gridXSpacing');
    expect(cmd!.payload['value']).toBeCloseTo(1.2, 6);
    // The raw (mixed) facade hit set, forwarded unfiltered — see header note.
    expect(cmd!.payload['scope']).toEqual({ kind: 'ids', curtainWallIds: ['wall-w-1', 'cw-w-1', 'cw-w-2'] });
  });

  it('"change panel thickness of all curtain walls to 0.024" — PASS', () => {
    const r = resolveUtterance('change panel thickness of all curtain walls to 0.024', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('set-curtain-wall-parameter');
    const [cmd] = commandsOf(r);
    expect(cmd!.type).toBe('curtain-wall.bulkUpdateParameter');
    expect(cmd!.payload['parameter']).toBe('panelThickness');
    expect(cmd!.payload['value']).toBeCloseTo(0.024, 6);
    expect(cmd!.payload['scope']).toEqual({ kind: 'project' });
  });

  it('"set transom spacing to 4 m on level 3" — PASS', () => {
    const r = resolveUtterance('set transom spacing to 4 m on level 3', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('set-curtain-wall-parameter');
    const [cmd] = commandsOf(r);
    expect(cmd!.type).toBe('curtain-wall.bulkUpdateParameter');
    expect(cmd!.payload['parameter']).toBe('gridYSpacing');
    expect(cmd!.payload['value']).toBeCloseTo(4, 6);
    expect(cmd!.payload['scope']).toEqual({ kind: 'ids', curtainWallIds: ['cw-l3-1'] });
  });
});

describe('§CWCHAT155 — the ownership rule: none of the four collide with set-wall-side-finish', () => {
  const sentences = [
    'make mullion size of all curtain walls in ground level to 0.06 meters',
    'set post spacing to 1.2 on the west facade',
    'change panel thickness of all curtain walls to 0.024',
    'set transom spacing to 4 m on level 3',
  ];
  for (const s of sentences) {
    it(`"${s}" does NOT resolve to set-wall-side-finish`, () => {
      const r = resolveUtterance(s, ctxOf());
      expect(r.kind === 'commands' || r.kind === 'refusal' ? r.intent : r.kind).not.toBe('set-wall-side-finish');
    });
  }
});

describe('§CWCHAT155 — the reverse case: a genuine curtain-wall FINISH ask is unaffected', () => {
  it('"change all curtain walls finish to plaster" still reaches set-wall-side-finish, not the parameter grammar', () => {
    const r = resolveUtterance('change all curtain walls finish to plaster', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('set-wall-side-finish');
  });

  it('the founder\'s ORIGINAL §RACSIDE144 sentence, "make all walls white paint", is unaffected', () => {
    const r = resolveUtterance('make all walls white paint', ctxOf());
    // Whatever this resolves to, it must never be the curtain-wall parameter
    // grammar — "walls" alone (no "curtain") never satisfies its NOUN_SRC.
    expect(r.kind === 'commands' || r.kind === 'refusal' ? r.intent : r.kind).not.toBe('set-curtain-wall-parameter');
    expect(r.kind).toBe('commands');
  });
});

describe('§CWCHAT155 — honesty: out-of-bound and ambiguous-magnitude values refuse BY NAME with BOTH numbers', () => {
  it('an out-of-bound mullion size (6 m, bare — max is 0.5 m) refuses, quoting both numbers', () => {
    const r = resolveUtterance('change all curtain walls mullion size to 6', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('6 m');
    expect(r.reason).toContain('0.5 m');
    expect(r.reason).toContain('0.01 m');
  });

  it('a bare ambiguous magnitude (30 — plausibly meant as 30mm) is READ AS METRES and refused, never silently applied', () => {
    const r = resolveUtterance('change all curtain walls mullion size to 30', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('30 m');
    expect(r.reason).not.toMatch(/\b0\.03\b/); // never silently read as 30mm
  });

  it('a valid bare value (0.06, within bounds) is accepted — the founder\'s own bare "0.03" example', () => {
    const r = resolveUtterance('change all curtain walls mullion size to 0.06', ctxOf());
    expect(r.kind).toBe('commands');
  });
});
