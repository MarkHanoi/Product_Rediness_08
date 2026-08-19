// §FIX-SCOPE-TAIL-ONE-PARSER / §FIX-HOSTED-LEVEL-SCOPE / §FIX-WINDOW-CREATE-REACH
// (L-1201) — the founder's TWO sentences, pinned end to end.
//
// THE ASKS, verbatim:
//   1. *"make sure this is accepted: change all windows in level 2 to
//      1.5 meters wide"*
//   2. *"Make sure this works: Make windows every 2 meters in level 2"*
//
// ⭐ EVERY SENTENCE TEST HERE DRIVES THE REAL LADDER — `resolveCompoundUtterance`
// → `resolveUtterance` (tier 0/1) → `resolveNaturalLanguage` — and never a
// hand-built intent object, because production has NO AI upstream configured and
// a capability that resolves only through the LLM planner does not work for the
// founder (COMMITTED ≠ REACHABLE).
//
// ⭐ AND THE SCOPE RESOLVER HERE IS NOT A STUB THAT RETURNS N IDS. The level arm
// for windows and doors was UNSATISFIABLE — `WindowStore`/`DoorStore` have no
// level accessor and `WindowOpening`/`DoorOpening` carry no `levelId`, so the
// bridge's `getAll().filter(e => e.levelId === level.id)` fallback returned []
// for every level of every project. A stub scope resolver would have reported
// that fixed sentence as GREEN while the founder saw "There are no windows on
// Level 2". So the resolver below is built from the REAL store shapes — windows
// keyed to walls by `wallId`, walls carrying `levelId` — and runs the REAL
// `resolveLevelScopeByHost`. A fake built from the header cannot falsify the
// header.
//
// MEASURED BEFORE THIS CHANGE (real ladder, 2026-08-19):
//   "change all windows in level 2 to 1.5 meters wide"
//        → scope { kind:'room', roomRef:'level' }        ← a room called "level"
//   "set all windows in level 2 width to 1.5m"
//        → scope room 'level' AND **dimensions { width: 2 }**  ← the user said 1.5
//   "make all windows in this floor 2m high"
//        → scope { kind:'room', roomRef:'thi' }          ← not even "this"
//   "make windows every 2 meters in level 2"      → null (no grammar claimed it)
//   "add windows every 2 meters in level 2"       → null
//   "put a 1x2m window every 3m in level 1"       → null

import { describe, it, expect } from 'vitest';
import {
  resolveUtterance,
  lengthToMeters,
  parseWindowsParametricIntent,
  findLevel,
  type ResolverContext,
  type ZeroTokenResolution,
} from '../src/intents/ZeroTokenResolver.js';
import { resolveNaturalLanguage } from '../src/intents/LocalNaturalLanguageResolver.js';
import { resolveCompoundUtterance } from '../src/intents/SemanticPlan.js';
import { parseDimensionScopedIntent } from '../src/intents/DimensionFamilies.js';
import { parseDeleteScopedIntent } from '../src/intents/DeleteFamilies.js';
import { readSpatialTail, parseTrailingSpatialScope } from '../src/intents/SpatialScopeTail.js';
import { resolveLevelScopeByHost, isHostDerivedKind } from '../src/intents/HostedOpeningScope.js';
import type { ScopeDescriptor, ScopeResult } from '../src/intents/ScopeDescriptor.js';

// ─── A model built from the REAL store SHAPES ────────────────────────────────
//
// Walls carry `levelId` (WallStore really does). Windows and doors carry
// `wallId` and NOTHING ELSE about place (WindowOpening/DoorOpening really do
// not carry `levelId` — `grep -n levelId packages/geometry-window/src/WindowTypes.ts`
// → 0 hits). That asymmetry IS the defect, so the fixture must reproduce it or
// the test cannot see it.

const WALLS = [
  { id: 'w-l1-a', levelId: 'L1' },
  { id: 'w-l1-b', levelId: 'L1' },
  { id: 'w-l2-a', levelId: 'L2' },
  { id: 'w-l2-b', levelId: 'L2' },
  { id: 'w-l2-c', levelId: 'L2' },
];
const WINDOWS = [
  { id: 'win-1', wallId: 'w-l2-a' },
  { id: 'win-2', wallId: 'w-l2-a' },
  { id: 'win-3', wallId: 'w-l2-b' },
  { id: 'win-4', wallId: 'w-l1-a' },
  // An ORPHAN: its host wall is not in the model any more. It must be a COUNTED
  // SKIP WITH ITS REASON, never silently included and never silently dropped.
  { id: 'win-orphan', wallId: 'w-deleted' },
];
const DOORS = [
  { id: 'door-1', wallId: 'w-l1-a' },
  { id: 'door-2', wallId: 'w-l1-b' },
  { id: 'door-3', wallId: 'w-l2-c' },
];
const ROOMS = [{ id: 'room-k', name: 'Kitchen' }];

const LEVELS = [
  { id: 'L0', name: 'Level 0', elevation: 0 },
  { id: 'L1', name: 'Level 1', elevation: 3 },
  { id: 'L2', name: 'Level 2', elevation: 6 },
];

/** The REAL derivation, over the REAL store shapes — the resolver the editor
 *  bridge now runs, minus only the `storeRegistry` lookup. */
function realScope(d: ScopeDescriptor): ScopeResult {
  const base = d.kind === 'filter' ? d.base : d;
  const kind = ('elementKind' in base ? base.elementKind : undefined) ?? 'wall';
  const rows: Array<{ id: string; levelId?: string; wallId?: string }> =
    kind === 'window' ? WINDOWS : kind === 'door' ? DOORS : kind === 'wall' ? WALLS : [];

  if (base.kind === 'all') {
    const ids = rows.map((r) => r.id);
    return { ids, kindCounts: { [kind]: ids.length }, skipped: [], diagnostics: [] };
  }
  if (base.kind === 'level') {
    const level = findLevel(base.levelQuery, LEVELS);
    if (level === undefined) {
      return { error: `No level called "${base.levelQuery}" — the levels here are: ${LEVELS.map((l) => l.name).join(', ')}.` };
    }
    if (!isHostDerivedKind(rows)) {
      const ids = rows.filter((r) => r.levelId === level.id).map((r) => r.id);
      return { ids, kindCounts: { [kind]: ids.length }, skipped: [], diagnostics: [level.name] };
    }
    const hosted = resolveLevelScopeByHost(kind, rows, level.id, level.name, (wallId) => {
      const w = WALLS.find((x) => x.id === wallId);
      return w === undefined ? undefined : w.levelId;
    });
    if (hosted.kind === 'refused') return { error: hosted.error };
    return {
      ids: hosted.ids,
      kindCounts: { [kind]: hosted.ids.length },
      skipped: hosted.skipped,
      diagnostics: [level.name],
    };
  }
  if (base.kind === 'room') {
    const hit = ROOMS.find((r) => r.name.toLowerCase().includes(base.roomRef.toLowerCase()));
    if (hit === undefined) {
      return { error: `I can't find a room "${base.roomRef}". The rooms here are: ${ROOMS.map((r) => r.name).join(', ')}.` };
    }
    return { ids: ['win-3'], kindCounts: { [kind]: 1 }, skipped: [], diagnostics: [hit.name] };
  }
  return { error: 'unsupported scope in this fixture' };
}

let seq = 0;
function ctxOf(overrides: Partial<ResolverContext> = {}): ResolverContext {
  return {
    selection: [],
    levels: LEVELS,
    activeLevelId: 'L1',
    mintId: () => `sst-${++seq}`,
    resolveScope: realScope,
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

// ─────────────────────────────────────────────────────────────────────────────

describe('⭐ FOUNDER SENTENCE 1 — "change all windows in level 2 to 1.5 meters wide"', () => {
  it('parses, resolves through the REAL host-derived level scope, and dispatches ONE command', () => {
    const r = resolveFull('change all windows in level 2 to 1.5 meters wide', ctxOf());
    expect(r.kind, `resolved as ${r.kind}`).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('set-window-dimensions');
    // ONE dispatch — the provable half of "one undo entry".
    expect(r.commands).toHaveLength(1);
    expect(r.commands[0]!.type).toBe('element.updateDimensionsBatch');
    const payload = r.commands[0]!.payload as Record<string, unknown>;
    // ⭐ THE VALUE HE SAID. 1.5, not the "2" the old lazy capture leaked out of
    // "level 2" and read back as the width.
    expect(payload['dimensions']).toEqual({ width: 1.5 });
    expect(payload['elementKind']).toBe('window');
    // ⭐ THE WINDOWS ON LEVEL 2, derived through their HOST WALLS. Three of the
    // five windows are hosted by Level-2 walls; win-4 is Level 1; win-orphan's
    // host is gone.
    expect(payload['elementIds']).toEqual(['win-1', 'win-2', 'win-3']);
    // A mass resize is confirmed before it runs…
    expect(r.destructive).toBe(true);
    // …with the LEVEL-scoped count, not the project count (5 windows exist).
    expect(r.summary).toContain('all 3 windows on Level 2');
    expect(r.summary).not.toContain('all 5');
  });

  it('the ORPHANED window is a COUNTED SKIP WITH ITS REASON, never a silent drop', () => {
    const r = resolveFull('change all windows in level 2 to 1.5 meters wide', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.summary).toContain('1× window skipped');
    expect(r.summary).toContain('host wall is no longer in the model');
  });

  it('the dispatch is the LIVE batch route, never the detached plugin window.setSize DTO path', () => {
    const r = resolveFull('change all windows in level 2 to 1.5 meters wide', ctxOf());
    if (r.kind !== 'commands') throw new Error('expected commands');
    expect(r.commands.map((c) => c.type)).toEqual(['element.updateDimensionsBatch']);
    expect(JSON.stringify(r.commands)).not.toContain('setSize');
  });
});

describe('⭐ FOUNDER SENTENCE 2 — "make windows every 2 meters in level 2"', () => {
  it('parses, scopes the WALLS on level 2, and dispatches ONE parametric-create command', () => {
    const r = resolveFull('make windows every 2 meters in level 2', ctxOf());
    expect(r.kind, `resolved as ${r.kind}`).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('create-windows-parametric');
    expect(r.commands).toHaveLength(1);
    expect(r.commands[0]!.type).toBe('window.parametricCreate');
    const payload = r.commands[0]!.payload as Record<string, unknown>;
    expect(payload['mode']).toEqual({ kind: 'spacing', spacingM: 2 });
    expect(payload['wallIds']).toEqual(['w-l2-a', 'w-l2-b', 'w-l2-c']);
    expect(r.destructive).toBe(true);
  });

  it('the Confirm card names the wall set, the DEFAULT size, the sill AND the interior walls', () => {
    const r = resolveFull('make windows every 2 meters in level 2', ctxOf());
    if (r.kind !== 'commands') throw new Error('expected commands');
    expect(r.summary).toContain('the 3 walls on Level 2');
    // ⛔ Silently including interior walls behind a bare count is the worst
    // available outcome — there is no exterior filter to apply, so it SAYS SO.
    expect(r.summary).toContain('interior walls included');
    expect(r.summary).toContain('(default size)');
    expect(r.summary).toContain('sill 0.9m');
    expect(r.summary).toContain('skipped and reported');
  });

  const NEIGHBOURS = [
    'make windows every 2m on level 2',
    'add windows every 2 meters in level 2',
    'put a 1x2m window every 3m in level 1',
  ];
  for (const text of NEIGHBOURS) {
    it(`neighbouring phrasing "${text}" reaches the same capability`, () => {
      const si = parseWindowsParametricIntent(text, ctxOf());
      expect(si, `${text} was not claimed`).not.toBeNull();
      expect(si!.scope).toMatchObject({ kind: 'level' });
    });
  }

  it('SHIPPED example "create a 1x2m window every 3 meters in all walls" is byte-identical', () => {
    expect(parseWindowsParametricIntent('create a 1x2m window every 3 meters in all walls', ctxOf()))
      .toEqual({
        intent: 'create-windows-parametric',
        mode: { kind: 'spacing', spacingM: 3 },
        widthM: 1, heightM: 2, scope: 'all',
      });
  });

  it('SHIPPED example "… in the walls on the ground floor" keeps its LEVEL reading (last preposition wins)', () => {
    const si = parseWindowsParametricIntent(
      'create a 1x2m window every 3 meters in the walls on the ground floor', ctxOf());
    expect(si!.scope).toEqual({ kind: 'level', levelQuery: 'ground floor' });
  });

  it('SHIPPED example "create a window in the middle of every wall segment" still scopes ALL', () => {
    const si = parseWindowsParametricIntent('create a window in the middle of every wall segment', ctxOf());
    expect(si).toEqual({
      intent: 'create-windows-parametric',
      mode: { kind: 'count', count: 1 },
      widthM: null, heightM: null, scope: 'all',
    });
  });

  it('the hyphenated level form survives ("in the ground-floor walls")', () => {
    const si = parseWindowsParametricIntent('create a 1x2m window every 3 meters in the ground-floor walls', ctxOf());
    expect(si!.scope).toEqual({ kind: 'level', levelQuery: 'ground' });
  });

  it('⛔ "make" does NOT let the CREATE grammar steal a RESIZE sentence', () => {
    // Without the creation-mode guard, widening the verb to `make` would have
    // made "make all windows 2m high" create a window in every wall.
    expect(parseWindowsParametricIntent('make all windows 2m high', ctxOf())).toBeNull();
    expect(parseWindowsParametricIntent('make all windows on level 2 1.5m wide', ctxOf())).toBeNull();
    const r = resolveFull('make all windows 2m high', ctxOf());
    expect(r.kind === 'commands' && r.intent).toBe('set-window-dimensions');
  });

  it('⛔ a ROOM tail is DROPPED, not resolved — the capability declares no room scope', () => {
    // Gate 31's symmetric arm caught this capability over-claiming 'room' once
    // already. The shared tail CAN read a room here; the grammar must not use it.
    expect(parseWindowsParametricIntent('add a window in the kitchen', ctxOf())).toBeNull();
  });
});

describe('the neighbouring RESIZE phrasings the founder will type next', () => {
  const CASES: ReadonlyArray<readonly [string, string, unknown, Record<string, number>]> = [
    ['change all windows in level 2 to 1.5 meters wide', 'set-window-dimensions', { kind: 'level', levelQuery: '2' }, { width: 1.5 }],
    ['make all windows on level 2 1.5m wide', 'set-window-dimensions', { kind: 'level', levelQuery: '2' }, { width: 1.5 }],
    // ⭐ THE WRONG-NUMBER CASE. Before the fix this carried width = 2.
    ['set all windows in level 2 width to 1.5m', 'set-window-dimensions', { kind: 'level', levelQuery: '2' }, { width: 1.5 }],
    ['make all doors in level 1 900mm wide', 'set-door-dimensions', { kind: 'level', levelQuery: '1' }, { width: 0.9 }],
    ['set all windows at level 2 to 2m high', 'set-window-dimensions', { kind: 'level', levelQuery: '2' }, { height: 2 }],
    // ⛔ MUST STAY A ROOM.
    ['change all windows in the kitchen to 1.5m wide', 'set-window-dimensions', { kind: 'room', roomRef: 'kitchen' }, { width: 1.5 }],
  ];
  for (const [text, intent, scope, dims] of CASES) {
    it(`"${text}" → ${intent} ${JSON.stringify(scope)} ${JSON.stringify(dims)}`, () => {
      const si = parseDimensionScopedIntent(text, ctxOf(), lengthToMeters);
      expect(si, `${text} was not claimed`).not.toBeNull();
      expect(si!.intent).toBe(intent);
      expect((si as unknown as { scope: unknown }).scope).toEqual(scope);
      expect((si as unknown as { dims: unknown }).dims).toEqual(dims);
    });
  }

  it('"on level 2" is BYTE-IDENTICAL to what it produced before (the documented worked example)', () => {
    const si = parseDimensionScopedIntent('set all windows on level 2 to 2m high', ctxOf(), lengthToMeters);
    expect(si).toEqual({
      intent: 'set-window-dimensions',
      dims: { height: 2 },
      scope: { kind: 'level', levelQuery: '2' },
    });
  });

  it('⭐ "in this floor" now reaches HERE_RE — it used to produce roomRef "thi"', () => {
    const si = parseDimensionScopedIntent('make all windows in this floor 2m high', ctxOf(), lengthToMeters);
    expect((si as unknown as { scope: unknown }).scope).toEqual({ kind: 'level', levelQuery: 'Level 1' });
    expect((si as unknown as { dims: unknown }).dims).toEqual({ height: 2 });
  });

  it('a place that CANNOT be resolved DECLINES — it never widens to the whole project', () => {
    // "this floor" with no active level. The old code fell through the level
    // branch to `return null` too, but the ROOM branch had no such guard and
    // would have resized a fuzzy-matched room instead.
    const si = parseDimensionScopedIntent(
      'make all windows in this floor 2m high',
      ctxOf({ activeLevelId: undefined } as never),
      lengthToMeters,
    );
    expect(si).toBeNull();
  });

  it('the possessive form survives the tail rewrite', () => {
    const si = parseDimensionScopedIntent("set all windows' width to 1m", ctxOf(), lengthToMeters);
    expect(si).toEqual({ intent: 'set-window-dimensions', dims: { width: 1 }, scope: 'all' });
  });

  it('the unscoped and qualified refusals are UNCHANGED — the claim surface did not widen', () => {
    expect(parseDimensionScopedIntent('make the windows 2m high', ctxOf(), lengthToMeters)).toBeNull();
    expect(parseDimensionScopedIntent('raise all exterior walls to 3.2 m', ctxOf(), lengthToMeters)).toBeNull();
    expect(parseDimensionScopedIntent('change all windows to timber casement', ctxOf(), lengthToMeters)).toBeNull();
  });
});

describe('the DELETE twin had the identical defect', () => {
  it('"delete all windows in level 2" is a LEVEL, not a room called "level 2"', () => {
    const si = parseDeleteScopedIntent('delete all windows in level 2', ctxOf());
    expect(si).toEqual({ intent: 'delete-windows-scoped', scope: { kind: 'level', levelQuery: '2' } });
  });
  it('"remove every window on level 2" is byte-identical to before', () => {
    const si = parseDeleteScopedIntent('remove every window on level 2', ctxOf());
    expect(si).toEqual({ intent: 'delete-windows-scoped', scope: { kind: 'level', levelQuery: '2' } });
  });
  it('"delete all furniture in the kitchen" stays a ROOM', () => {
    const si = parseDeleteScopedIntent('delete all furniture in the kitchen', ctxOf());
    expect(si).toEqual({ intent: 'delete-furniture-scoped', scope: { kind: 'room', roomRef: 'kitchen' } });
  });
  it('"clear the furniture on this floor" stays the ACTIVE level', () => {
    const si = parseDeleteScopedIntent('clear the furniture on this floor', ctxOf());
    expect(si).toEqual({ intent: 'delete-furniture-scoped', scope: { kind: 'level', levelQuery: 'Level 1' } });
  });
});

describe('readSpatialTail — the ruling itself', () => {
  const ctx = ctxOf();
  it('the preposition never decides the kind; the noun does', () => {
    for (const prep of ['on', 'in', 'at']) {
      expect(readSpatialTail('level', '2', ctx)).toEqual({ kind: 'scope', scope: { kind: 'level', levelQuery: '2' } });
      void prep;
    }
    expect(readSpatialTail(undefined, 'kitchen', ctx)).toEqual({ kind: 'scope', scope: { kind: 'room', roomRef: 'kitchen' } });
  });
  it('a room genuinely named "Level" stays reachable', () => {
    // "in the level to 1.5m wide" — the level noun with no level after it.
    expect(readSpatialTail('level', 'to', ctx)).toEqual({ kind: 'scope', scope: { kind: 'room', roomRef: 'level' } });
  });
  it('a phrase ENDING in a level noun is a level ("the ground floor")', () => {
    expect(readSpatialTail(undefined, 'ground floor', ctx))
      .toEqual({ kind: 'scope', scope: { kind: 'level', levelQuery: 'ground floor' } });
  });
  it('an unresolvable "this floor" is UNUSABLE, never a silent widening', () => {
    expect(readSpatialTail(undefined, 'this floor', ctxOf({ activeLevelId: undefined } as never)))
      .toEqual({ kind: 'unusable' });
  });
  it('parseTrailingSpatialScope takes the LAST preposition', () => {
    expect(parseTrailingSpatialScope('windows in the walls on the ground floor', ctx))
      .toEqual({ kind: 'scope', scope: { kind: 'level', levelQuery: 'ground floor' } });
  });
});

describe('findLevel — the trailing-noun retry is a LAST RESORT and can only add hits', () => {
  it('a bare number still resolves', () => {
    expect(findLevel('2', LEVELS)?.id).toBe('L2');
  });
  it('an exact name still wins', () => {
    expect(findLevel('Level 1', LEVELS)?.id).toBe('L1');
  });
  it('"2 floor" now resolves, where it used to miss', () => {
    expect(findLevel('2 floor', LEVELS)?.id).toBe('L2');
  });
  it('a level literally named "Ground Floor" is matched by the FULL phrase', () => {
    const levels = [{ id: 'G', name: 'Ground Floor', elevation: 0 }];
    expect(findLevel('ground floor', levels)?.id).toBe('G');
  });
  it('nonsense still misses', () => {
    expect(findLevel('to', LEVELS)).toBeUndefined();
  });
});

describe('resolveLevelScopeByHost — the unsatisfiable arm, made satisfiable honestly', () => {
  it('windows have NO levelId of their own, so the plain filter is host-derived', () => {
    expect(isHostDerivedKind(WINDOWS)).toBe(true);
    expect(isHostDerivedKind(WALLS)).toBe(false);
  });
  it('derives the level through the host wall', () => {
    const r = resolveLevelScopeByHost('window', WINDOWS, 'L2', 'Level 2', (id) => WALLS.find((w) => w.id === id)?.levelId);
    expect(r.kind).toBe('resolved');
    if (r.kind !== 'resolved') return;
    expect(r.ids).toEqual(['win-1', 'win-2', 'win-3']);
    expect(r.skipped).toEqual([
      { kind: 'window', count: 1, reason: expect.stringContaining('host wall is no longer in the model') },
    ]);
  });
  it('NO WALL STORE refuses — it never returns an empty set that reads as "there are none"', () => {
    const r = resolveLevelScopeByHost('window', WINDOWS, 'L2', 'Level 2', () => null);
    expect(r.kind).toBe('refused');
    if (r.kind !== 'refused') return;
    expect(r.error).toContain('takes its level from the');
    expect(r.error).toContain('nothing about the model is confirmed');
  });
  it('an element with neither a level nor a host is a counted skip, not a zero', () => {
    const r = resolveLevelScopeByHost('window', [{ id: 'x' }], 'L2', 'Level 2', () => undefined);
    expect(r.kind).toBe('resolved');
    if (r.kind !== 'resolved') return;
    expect(r.ids).toEqual([]);
    expect(r.skipped[0]!.count).toBe(1);
    expect(r.skipped[0]!.reason).toContain('no level and no host wall');
  });
});
