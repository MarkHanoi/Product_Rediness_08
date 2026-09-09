// §WINDOWS-ALL-WALLS-IS-NOT-A-PLACE (L-13301, 2026-09-09)
//
// THE FOUNDER'S ASK, verbatim:
//   *"if i say create windows on all walls - it should create windows in all
//    walls on all the envelopes of all houses on the parcel - same for every
//    single request - not for a single envelope"*
//
// ⭐ THE ANSWER THE AUDIT MEASURED IS "YES, AND FOR ONE SENTENCE TOO LOUDLY."
// `create-windows-parametric` reached every wall of every building — correctly.
// But it ALSO reached every wall of every building when the sentence named ONE
// ROOM, because the grammar dropped any trailing place phrase it could not read
// as a level and fell through to `scope: 'all'`. Measured at HEAD dd96ee65:
//
//   "create windows on all walls in the kitchen"
//        → window.parametricCreate { wallIds: 'all' }
//          "Create a window in the middle of every wall in the project"
//   "create windows on all walls in block b"
//        → window.parametricCreate { wallIds: 'all' }        ← same
//
// That is a `destructive: true` MASS CREATION across every storey of every
// block on the parcel, from a sentence that named one room. It is the C68 §7.d
// scope-widening in its worst position: the one verb in this file whose mistake
// AUTHORS GEOMETRY, so the user sees it only by looking.
//
// ⛔ THE TWO HALVES ARE TESTED TOGETHER ON PURPOSE. Narrowing the widening is
// trivial if you are allowed to break the founder's headline sentence, and the
// headline sentence is trivial to keep if you are allowed to widen. The first
// describe block below is the REGRESSION GUARD and it is the whole safety of
// the change; the second is the fix. A commit that satisfies one and not the
// other is a regression either way.
//
// ⭐ THE FIXTURE IS THREE BUILDINGS, because "acts across all footprints" is
// the actual claim under test and a one-building fixture cannot falsify it
// ([[fake-more-capable-than-real]]). Walls carry `levelId` the way `WallStore`
// really does; there is deliberately NO building/group axis on a wall, because
// there is none in the product either (ADR-0383 put `group` on the
// `SpaceEnvelope` MEMBER only, and ADR-0385 makes `hierarchyStore` — not the
// envelope — the containment authority). "All" spans the buildings because the
// wall store is project-wide, and this fixture reproduces exactly that.

import { describe, it, expect } from 'vitest';
import {
    resolveUtterance,
    findLevel,
    type ResolverContext,
    type ZeroTokenResolution,
} from '../src/intents/ZeroTokenResolver.js';
import { resolveNaturalLanguage } from '../src/intents/LocalNaturalLanguageResolver.js';
import { resolveCompoundUtterance } from '../src/intents/SemanticPlan.js';
import { isNotAPlace } from '../src/intents/SpatialScopeTail.js';
import type { ScopeDescriptor, ScopeResult } from '../src/intents/ScopeDescriptor.js';

// ─── THREE BUILDINGS ON ONE PARCEL, TWO STOREYS EACH ─────────────────────────
//
// Block A / Block B / Block C. The id prefix is for the READER; nothing in the
// resolver keys on it, exactly as nothing in the product does.
const WALLS = [
    { id: 'A-L0-w1', levelId: 'L0' }, { id: 'A-L0-w2', levelId: 'L0' }, { id: 'A-L1-w1', levelId: 'L1' },
    { id: 'B-L0-w1', levelId: 'L0' }, { id: 'B-L0-w2', levelId: 'L0' }, { id: 'B-L1-w1', levelId: 'L1' },
    { id: 'C-L0-w1', levelId: 'L0' }, { id: 'C-L0-w2', levelId: 'L0' }, { id: 'C-L1-w1', levelId: 'L1' },
];
/** One room, in Block A only — so a room-scoped answer and a project-wide
 *  answer have DIFFERENT ids and the test can tell them apart. */
const ROOMS = [{ id: 'room-k', name: 'Kitchen', roomNumber: '00-001', levelId: 'L0' }];
const KITCHEN_WALL_IDS = ['A-L0-w1', 'A-L0-w2'];

const LEVELS = [
    { id: 'L0', name: 'Level 0', elevation: 0 },
    { id: 'L1', name: 'Level 1', elevation: 3 },
];

/** The real store shapes, minus only the `storeRegistry` lookup. */
function realScope(d: ScopeDescriptor): ScopeResult {
    const base = d.kind === 'filter' ? d.base : d;
    const kind = ('elementKind' in base ? base.elementKind : undefined) ?? 'wall';
    if (base.kind === 'ids') {
        return { ids: base.ids, kindCounts: { [kind]: base.ids.length }, skipped: [], diagnostics: [] };
    }
    if (base.kind === 'all') {
        // ⭐ PROJECT-WIDE, NO LEVEL AND NO BUILDING FILTER — `WallStore.getAllIds()`.
        const ids = WALLS.map((w) => w.id);
        return { ids, kindCounts: { [kind]: ids.length }, skipped: [], diagnostics: [] };
    }
    if (base.kind === 'level') {
        const level = findLevel(base.levelQuery, LEVELS);
        if (level === undefined) {
            return { error: `No level called "${base.levelQuery}" — the levels here are: ${LEVELS.map((l) => l.name).join(', ')}.` };
        }
        const ids = WALLS.filter((w) => w.levelId === level.id).map((w) => w.id);
        return { ids, kindCounts: { [kind]: ids.length }, skipped: [], diagnostics: [level.name] };
    }
    if (base.kind === 'room') {
        const hit = ROOMS.find((r) => r.name.toLowerCase() === base.roomRef.trim().toLowerCase());
        if (hit === undefined) {
            return { error: `I can't find a room "${base.roomRef}". The rooms here are: ${ROOMS.map((r) => r.name).join(', ')}.` };
        }
        return { ids: [...KITCHEN_WALL_IDS], kindCounts: { [kind]: KITCHEN_WALL_IDS.length }, skipped: [], diagnostics: [hit.name] };
    }
    return { error: 'unsupported scope in this fixture' };
}

let seq = 0;
function ctxOf(overrides: Partial<ResolverContext> = {}): ResolverContext {
    return {
        selection: [],
        levels: LEVELS,
        activeLevelId: 'L0',
        rooms: ROOMS,
        mintId: () => `waw-${++seq}`,
        resolveScope: realScope,
        ...overrides,
    } as ResolverContext;
}

/** THE REAL LADDER the bridge runs, in the bridge's order. Nothing here
 *  shortcuts to an arm — a grammar that only the LLM can reach does not work
 *  for the founder ([[committed-is-not-reachable]]). */
function resolveFull(utterance: string, ctx: ResolverContext): ZeroTokenResolution {
    const plan = resolveCompoundUtterance(utterance, ctx);
    if (plan !== null) return plan;
    const tier01 = resolveUtterance(utterance, ctx);
    if (tier01.kind !== 'miss') return tier01;
    const nl = resolveNaturalLanguage(utterance, ctx);
    if (nl.kind === 'resolved') return nl.resolution;
    return { kind: 'miss' };
}

/** The `wallIds` a window-creation sentence actually dispatched, or a marker. */
function dispatchedWallIds(r: ZeroTokenResolution): unknown {
    if (r.kind !== 'commands') return `<${r.kind}>`;
    const create = r.commands.find((c) => c.type === 'window.parametricCreate');
    if (create === undefined) return `<no parametricCreate: ${r.commands.map((c) => c.type).join(',')}>`;
    return (create.payload as Record<string, unknown>)['wallIds'];
}

// ─────────────────────────────────────────────────────────────────────────────

describe("⭐ THE FOUNDER'S HEADLINE SENTENCE — every wall of every building", () => {
    // ⛔ THIS BLOCK IS THE REGRESSION GUARD. If it goes red, the fix for the
    // widening has eaten the sentence it exists to protect.
    it('"create windows on all walls" reaches all 9 walls of all 3 blocks, on both storeys', () => {
        const r = resolveFull('create windows on all walls', ctxOf());
        expect(r.kind, `resolved as ${r.kind}`).toBe('commands');
        // `'all'` is the project-wide sentinel the batch command resolves against
        // `WallStore.getAll()` — deliberately NOT a pre-resolved id list.
        expect(dispatchedWallIds(r)).toBe('all');
        // And prove the sentinel really is 9 walls across 3 blocks and 2 storeys
        // here, so "all" is measured rather than trusted as a string.
        const ids = realScope({ kind: 'all', elementKind: 'wall' } as ScopeDescriptor);
        expect('ids' in ids && ids.ids).toHaveLength(9);
        if ('ids' in ids) {
            expect(new Set(ids.ids.map((i) => i[0])), 'all three blocks').toEqual(new Set(['A', 'B', 'C']));
            expect(new Set(ids.ids.map((i) => i.slice(2, 4))), 'both storeys').toEqual(new Set(['L0', 'L1']));
        }
    });

    it('"create a 1x2m window every 3 meters in all walls" is project-wide too', () => {
        const r = resolveFull('create a 1x2m window every 3 meters in all walls', ctxOf());
        expect(dispatchedWallIds(r)).toBe('all');
    });

    it('the SHIPPED declared example still resolves — "in the middle of" is a POSITION, not a place', () => {
        // ⛔ Gate 31 (`check-chat-capability-coverage`) caught this one, not the
        // probe: it is a declared example of the capability, and the first cut
        // of the widening fix turned it into a miss by reading "the middle of
        // every wall segment" as a room. An example that does not work is a lie
        // shipped in the UI (C68 §6.3-G2).
        const r = resolveFull('create a window in the middle of every wall segment', ctxOf());
        expect(dispatchedWallIds(r)).toBe('all');
    });

    it('"on level 0" still narrows to that storey — ACROSS all three blocks', () => {
        const r = resolveFull('create windows on all walls on level 0', ctxOf());
        expect(r.kind).toBe('commands');
        const ids = dispatchedWallIds(r);
        expect(Array.isArray(ids)).toBe(true);
        // Six of the nine: two per block, both blocks' ground storey — a LEVEL
        // spans buildings, which is the founder's question answered on the one
        // axis PRYZM does have.
        expect(ids).toEqual(['A-L0-w1', 'A-L0-w2', 'B-L0-w1', 'B-L0-w2', 'C-L0-w1', 'C-L0-w2']);
    });
});

describe('⛔ THE SILENT WIDENING — a named place must never become "the whole project"', () => {
    // Each of these dispatched `wallIds: 'all'` before L-13301.
    const WIDENED = [
        ['a room', 'create windows on all walls in the kitchen'],
        ['a building', 'create windows on all walls in block b'],
        ['a house', 'create windows on all walls in house 2'],
        ['a facade', 'create windows on all walls on the south facade'],
    ] as const;

    for (const [what, utterance] of WIDENED) {
        it(`"${utterance}" (${what}) does NOT create windows project-wide`, () => {
            const r = resolveFull(utterance, ctxOf());
            // THE BINDING ASSERTION: whatever else happens, the one outcome
            // that must never happen is a project-wide creation.
            expect(dispatchedWallIds(r)).not.toBe('all');
            // It must also not have quietly created anything at all.
            expect(r.kind, `"${utterance}" produced ${r.kind}`).not.toBe('commands');
        });
    }

    it('"on this floor" with NO active level declines rather than widening', () => {
        // Rule 16: a place the context cannot ground is `unusable`, and unusable
        // used to fall through to `'all'`. An ungroundable "here" is the purest
        // form of the defect — the user restricted the scope and PRYZM could not
        // tell to what, so it acted on everything.
        const r = resolveFull('create windows on all walls on this floor', ctxOf({ activeLevelId: undefined }));
        expect(dispatchedWallIds(r)).not.toBe('all');
        expect(r.kind).not.toBe('commands');
    });

    it('…but WITH an active level, "on this floor" still resolves to that storey', () => {
        // The control for the arm above: `unusable` declines, GROUNDED resolves.
        const r = resolveFull('create windows on all walls on this floor', ctxOf({ activeLevelId: 'L0' }));
        expect(r.kind).toBe('commands');
        expect(dispatchedWallIds(r)).toEqual(['A-L0-w1', 'A-L0-w2', 'B-L0-w1', 'B-L0-w2', 'C-L0-w1', 'C-L0-w2']);
    });
});

describe('§WINDOWS-ALL-WALLS-IS-NOT-A-PLACE — the shared predicate, directly', () => {
    // ⭐ ONE implementation, two callers. These arms pin the predicate itself so
    // the next grammar that needs the question does not write a fourth regex —
    // which is the defect this repository pays for most.
    it('the ELEMENT NOUN, however determined, names no place', () => {
        for (const p of ['all walls', 'every wall segment', 'the walls', 'the selected walls', 'each wall']) {
            expect(isNotAPlace(p), `"${p}"`).toBe(true);
        }
    });

    it('a POSITION whose object is the element noun names no place', () => {
        for (const p of ['the middle of every wall segment', 'the middle of the wall', 'the outer side of all walls']) {
            expect(isNotAPlace(p), `"${p}"`).toBe(true);
        }
    });

    it('⛔ a REAL place is still a place — including one reached through "of"', () => {
        for (const p of ['the kitchen', 'block b', 'house 2', 'the walls of the kitchen', 'the top of block b']) {
            expect(isNotAPlace(p), `"${p}"`).toBe(false);
        }
    });
});
