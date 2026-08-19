// §FIX-LAYER-ASK-REPAINTED / §FIX-WALL-FINISH-SIDE-EATS-SCOPE /
// §FIX-FINISH-VOCABULARY-IS-THE-CATALOGUE / §FIX-LAYER-SCOPE-UNDECLARED
// (L-1260 … L-1263) — the founder's SIX sentences, pinned.
//
// THE ASK, verbatim:
//   make all walls exterior finish "material X"
//   make all walls interior finish "material X"
//   make all walls in Room X exterior finish "material X"
//   make all walls in Level 1 exterior finish "material X"
//   make all walls interior layer finish "material X"
//   make all walls exterior layer finish "material X"
//
// ⭐ FOUR WITHOUT the word "layer" and TWO WITH it. That is not an accident — he
// is naming the SIBLING capability deliberately, and the two siblings differ in
// exactly one way: `add-wall-layer` MOVES `wall.thickness`.
//
// ⭐ EVERY SENTENCE TEST HERE DRIVES THE REAL LADDER (`resolveCompoundUtterance`
// → `resolveUtterance` → `resolveNaturalLanguage`) and the REAL finish table —
// `resolveFinishRef` itself, never a stub predicate. A test that stubs the thing
// under test proves nothing, and here it would prove less than nothing: the
// whole L-1262 finding is that the finish resolver answered CONFIDENTLY WRONG
// ("polished concrete" → Venetian Plaster), which a stub cannot see.
//
// MEASURED BEFORE (real ladder, 2026-08-19), with `plaster` for "material X":
//   1 → set-wall-side-finish, scope all              ✅
//   2 → set-wall-side-finish, scope all              ✅
//   3 → room  "room x exterior"   ← the SIDE WORD is inside the room name 🔴
//   4 → level "1 exterior"                                                🔴
//   5 → set-wall-side-finish — A REPAINT                                  🔴🔴
//   6 → set-wall-side-finish — A REPAINT                                  🔴🔴
// …and with his LITERAL "material X", all six refused.

import { describe, it, expect } from 'vitest';
import {
  resolveUtterance,
  parseAddWallLayerIntent,
  type ResolverContext,
  type ZeroTokenResolution,
} from '../src/intents/ZeroTokenResolver.js';
import { resolveNaturalLanguage } from '../src/intents/LocalNaturalLanguageResolver.js';
import { resolveCompoundUtterance } from '../src/intents/SemanticPlan.js';
import { parseWallSideFinishIntent } from '../src/intents/WallSideFinishIntent.js';
import {
  resolveFinishRef,
  finishRefCandidates,
  catalogueFinishCount,
} from '../src/intents/finishRef.js';
import { MATERIAL_CATALOG } from '@pryzm/schemas/materials';
import type { ScopeDescriptor, ScopeResult } from '../src/intents/ScopeDescriptor.js';

const LEVELS = [
  { id: 'L0', name: 'Level 0', elevation: 0 },
  { id: 'L1', name: 'Level 1', elevation: 3 },
  { id: 'L2', name: 'Level 2', elevation: 6 },
];

let seq = 0;
function ctxOf(over: Partial<ResolverContext> = {}): ResolverContext {
  return {
    selection: [],
    levels: LEVELS,
    activeLevelId: 'L1',
    mintId: () => `wf-${++seq}`,
    resolveScope: (d: ScopeDescriptor): ScopeResult => {
      const base = d.kind === 'filter' ? d.base : d;
      const where = base.kind === 'level' ? `Level ${base.levelQuery}`
        : base.kind === 'room' ? base.roomRef : '';
      return { ids: ['w1', 'w2'], kindCounts: { wall: 2 }, skipped: [], diagnostics: [where] };
    },
    ...over,
  } as ResolverContext;
}

/** THE REAL LADDER. Nothing here shortcuts to an arm. */
function resolveFull(u: string, ctx: ResolverContext): ZeroTokenResolution {
  const p = resolveCompoundUtterance(u, ctx); if (p !== null) return p;
  const t = resolveUtterance(u, ctx); if (t.kind !== 'miss') return t;
  const nl = resolveNaturalLanguage(u, ctx); if (nl.kind === 'resolved') return nl.resolution;
  return { kind: 'miss' };
}

/** THE REAL finish table — the thing under test, not a stub. */
const realFinish = (r: string): boolean => resolveFinishRef(r) !== null;

// ─────────────────────────────────────────────────────────────────────────────

describe("⭐ THE FOUNDER'S SIX SENTENCES — appearance (1–4)", () => {
  const ctx = ctxOf();

  it('1. "make all walls exterior finish plaster" → the whole project, exterior side', () => {
    const r = resolveFull('make all walls exterior finish plaster', ctx);
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('set-wall-side-finish');
    expect(r.commands).toHaveLength(1);
    expect(r.commands[0]!.type).toBe('wall.setSideFinishBatch');
    const p = r.commands[0]!.payload as Record<string, unknown>;
    expect(p['side']).toBe('exterior');
    expect(p['finish']).toMatchObject({ materialId: 'gypsum-skim' });
    expect(r.summary).toContain('exterior finish');
  });

  it('2. "make all walls interior finish plaster" → the whole project, interior side', () => {
    const r = resolveFull('make all walls interior finish plaster', ctx);
    if (r.kind !== 'commands') throw new Error(`expected commands, got ${r.kind}`);
    expect((r.commands[0]!.payload as Record<string, unknown>)['side']).toBe('interior');
  });

  it('3. ⭐ "…in Room X exterior finish plaster" → the ROOM, and the SIDE WORD is NOT in its name', () => {
    const si = parseWallSideFinishIntent(
      'make all walls in room x exterior finish plaster', realFinish, undefined, ctx);
    expect(si!.scope).toEqual({ kind: 'room', roomRef: 'room x' });
    expect(si!.side).toBe('exterior');
    expect(JSON.stringify(si!.scope)).not.toContain('exterior');
  });

  it('4. ⭐ "…in Level 1 exterior finish plaster" → LEVEL 1, not a level called "1 exterior"', () => {
    const si = parseWallSideFinishIntent(
      'make all walls in level 1 exterior finish plaster', realFinish, undefined, ctx);
    expect(si!.scope).toEqual({ kind: 'level', levelQuery: '1' });
    expect(si!.side).toBe('exterior');
  });

  it('the SHIPPED example was ALREADY broken the same way, and now is not', () => {
    const si = parseWallSideFinishIntent(
      'make all walls on level 2 interior finish limewash', realFinish, undefined, ctx);
    expect(si!.scope).toEqual({ kind: 'level', levelQuery: '2' });
  });

  it('"in the kitchen" stays a ROOM; "in the ground floor" is a LEVEL', () => {
    expect(parseWallSideFinishIntent(
      'make all walls in the kitchen exterior finish plaster', realFinish, undefined, ctx)!.scope)
      .toEqual({ kind: 'room', roomRef: 'kitchen' });
    expect(parseWallSideFinishIntent(
      'make all walls in the ground floor interior finish plaster', realFinish, undefined, ctx)!.scope)
      .toEqual({ kind: 'level', levelQuery: 'ground floor' });
  });

  it('the finish NAME no longer swallows the sentence around it', () => {
    // Was `finishRef: 'exterior finish plaster'` — which then got quoted back at
    // the user in refusals as though he had typed it as a material.
    const si = parseWallSideFinishIntent(
      'make all walls exterior finish plaster', realFinish, undefined, ctx);
    expect(si!.finishRef).toBe('plaster');
  });
});

describe('⭐⭐ SENTENCES 5 AND 6 — the LAYER ask, no longer repainted', () => {
  const ctx = ctxOf();

  for (const [text, side] of [
    ['make all walls interior layer finish plaster', 'interior'],
    ['make all walls exterior layer finish plaster', 'exterior'],
  ] as const) {
    it(`"${text}" reaches add-wall-layer, NOT the appearance-only sibling`, () => {
      // The appearance grammar must stand aside…
      expect(parseWallSideFinishIntent(text, realFinish, undefined, ctx)).toBeNull();
      // …and the layer grammar must claim it, with the side carried.
      const si = parseAddWallLayerIntent(text, ctx);
      expect(si).not.toBeNull();
      expect(si!.side).toBe(side);
      expect(si!.thicknessM).toBeNull();
      expect(si!.finishRef).toBe('plaster');
    });

    it(`"${text}" refuses for the THICKNESS, naming BOTH live routes`, () => {
      const r = resolveFull(text, ctx);
      expect(r.kind).toBe('refusal');
      if (r.kind !== 'refusal') return;
      expect(r.intent).toBe('add-wall-layer');
      expect(r.reason).toContain('makes the wall thicker');
      // C16 CA-18 — the refusal names the live alternative, including the
      // appearance-only sibling, which is very likely what was meant.
      expect(r.reason).toContain('add a 10mm plaster layer to all walls');
      expect(r.reason).toContain('make all walls interior finish plaster');
    });
  }

  it('⛔ it must NOT fall through to set-wall-type — the FIRST fix did exactly that', () => {
    // Measured: with the side-finish parser declining and matchAddWallLayer still
    // downstream of matchWallType, this produced
    //   wall.updateSystemTypeBatch { systemType: "interior layer finish plaster" }
    // — a wall SYSTEM TYPE set to a sentence fragment, worse than the repaint it
    // replaced. A guard that only moves an ask from one wrong grammar to another
    // is not a fix.
    const r = resolveFull('make all walls interior layer finish plaster', ctx);
    expect((r as { intent?: string }).intent).not.toBe('set-wall-type');
    expect(JSON.stringify(r)).not.toContain('updateSystemTypeBatch');
  });

  it('⛔ the thickness is REFUSED, never defaulted — no catalogue thickness exists', () => {
    // MaterialRecord carries no thickness field at all, so any default would be
    // a number with no source, silently thickening every wall by it. This is the
    // measurement behind choosing option (a) over option (b).
    expect(MATERIAL_CATALOG.every((m) => !('thickness' in m))).toBe(true);
  });

  it('the confirm card STATES the thickness change, in millimetres', () => {
    const r = resolveFull('add a 10mm plaster layer to all walls', ctx);
    if (r.kind !== 'commands') throw new Error(`expected commands, got ${r.kind}`);
    expect(r.summary).toContain('10mm thicker');
  });

  it('L-1263 — the layer grammar can now really produce the LEVEL scope it declares', () => {
    const si = parseAddWallLayerIntent('make all walls in level 1 interior layer finish plaster', ctx);
    expect(si!.scope).toEqual({ kind: 'level', levelQuery: '1' });
  });

  it('⛔ REGRESSION GUARD: "…of all walls" is NOT a room called "all walls"', () => {
    // A shipped example — and the fix for a silent-narrowing defect was one
    // measurement away from being a silent-narrowing defect itself.
    const si = parseAddWallLayerIntent('add a 20mm limewash finish to the outer side of all walls', ctx);
    expect(si!.scope).toBe('all');
    expect(si!.side).toBe('exterior');
    expect(si!.thicknessM).toBeCloseTo(0.02, 6);
  });

  it('the shipped "add …" examples are unchanged', () => {
    const a = parseAddWallLayerIntent('add a 10mm plaster layer to the inner side of the selected wall', ctx);
    expect(a).toMatchObject({ side: 'interior', thicknessM: 0.01, scope: 'selection' });
    const b = parseAddWallLayerIntent('add a 12mm plasterboard layer to all walls', ctx);
    expect(b).toMatchObject({ side: 'interior', thicknessM: 0.012, scope: 'all' });
    expect(resolveFinishRef(b!.finishRef!)?.materialId).toBe('gypsum-plasterboard');
  });

  it('a sentence with NO layer word still belongs to the appearance sibling', () => {
    expect(parseAddWallLayerIntent('make all walls interior finish plaster', ctx)).toBeNull();
  });
});

describe('⭐⭐ L-1262 — the finish vocabulary IS the C100 catalogue', () => {
  it('the master is the denominator, and it is far bigger than the alias table', () => {
    expect(catalogueFinishCount()).toBe(MATERIAL_CATALOG.length);
    expect(MATERIAL_CATALOG.length).toBeGreaterThan(200);
  });

  it('⭐ every VISIBLE master material is nameable by the label the picker shows', () => {
    const CONCEALED = new Set(['Insulation', 'Membrane & Waterproofing']);
    const unreachable = MATERIAL_CATALOG
      .filter((m) => !CONCEALED.has(m.category))
      .filter((m) => resolveFinishRef(m.label)?.materialId !== m.id)
      .map((m) => m.label);
    expect(unreachable, `unreachable: ${unreachable.join(' | ')}`).toEqual([]);
  });

  it('a concealed product is still reachable BY ITS FULL NAME (§L960 rule kept)', () => {
    const concealed = MATERIAL_CATALOG.filter((m) => m.category === 'Insulation');
    expect(concealed.length).toBeGreaterThan(0);
    for (const m of concealed) {
      expect(resolveFinishRef(m.label)?.materialId, m.label).toBe(m.id);
    }
  });

  const NAMES: ReadonlyArray<readonly [string, string]> = [
    ['corten steel', 'steel-corten'],
    ['corten', 'steel-corten'],
    ['red facing brick', 'brick-red'],
    // The canonical nicknames must be untouched by the catalogue arm.
    ['plaster', 'gypsum-skim'],
    ['wood', 'wood-oak'],
    ['limewash', 'paint-limewash-cream'],
    ['plasterboard', 'gypsum-plasterboard'],
  ];
  for (const [ref, id] of NAMES) {
    it(`"${ref}" → ${id}`, () => {
      expect(resolveFinishRef(ref)?.materialId).toBe(id);
    });
  }

  it('⭐ "polished concrete" no longer silently becomes VENETIAN PLASTER', () => {
    expect(resolveFinishRef('polished concrete')).toBeNull();
    const c = finishRefCandidates('polished concrete');
    expect(c.length).toBe(2);
    expect(c.every((x) => x.materialId.startsWith('concrete-polished'))).toBe(true);
  });

  it('⛔ ambiguity is a QUESTION, never a pick', () => {
    expect(resolveFinishRef('copper')).toBeNull();
    expect(finishRefCandidates('copper').map((c) => c.materialId).sort())
      .toEqual(['copper-new', 'copper-patinated']);
    // …and the user is told which ones.
    const r = resolveFull('make all walls exterior finish copper', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('Copper');
    expect(r.reason).toContain('Say which one');
  });

  it('⛔ a word this GRAMMAR uses structurally is never a material', () => {
    // "wall" was Plasterboard (inside 'drywall') and "coat" was Skim Coat, so a
    // SCOPE WORD was being applied as a material. Length was never the
    // discriminator — meaning is.
    for (const w of ['wall', 'walls', 'coat', 'layer', 'finish', 'side',
      'interior', 'exterior', 'level', 'room']) {
      expect(resolveFinishRef(w), `${w} resolved as a material`).toBeNull();
    }
  });

  it('⛔ a sentence FRAGMENT is never a material', () => {
    for (const span of ['exterior finish plaster', 'layer finish plaster', 'interior layer finish']) {
      expect(resolveFinishRef(span), `${span} resolved`).toBeNull();
    }
  });

  it('the refusal states the REAL vocabulary size, not 39 nicknames', () => {
    const r = resolveFull('make all walls exterior finish unobtainium', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('unobtainium');
    expect(r.reason).toContain(String(MATERIAL_CATALOG.length));
  });
});
