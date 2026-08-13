// §CIRCULATION-INTEGRITY-AUDIT — shared predicates for the three typology arms
// (`circulationIntegrityAudit.test.ts` = apartment, `circulationIntegrityHouseResi.test.ts`
// = house + residential). NOT a `*.test.ts`, so vitest's `__tests__/**/*.test.ts` include
// glob does not collect it — importing it does not re-register another file's suites.
//
// `reachability` is a FAITHFUL REPLICA of the production predicate
// `computeCirculationReachability` in
// `apps/editor/src/ui/apartment-layout/layoutBubbleGraph.ts` (SPEC-CIRCULATION-GRAPH §9.2),
// including §DUP-NAME-SAFE index keying and the §ROOT-CORRIDOR-BEFORE-STAIR root order.
//
// It is REPLICATED rather than imported, and that is itself a finding worth stating: the
// only implementation of "is every room reachable" lives at L7 (apps/editor, a UI module),
// while the generators that SHIP the layout live at L2 (packages/ai-host). The engine
// cannot call the invariant that judges it, so the invariant can only ever be a display
// value — never a gate. See SPEC-CIRCULATION-INTEGRITY §5.

import type { LayoutOption, LayoutRoom } from '../../src/workflows/apartmentLayout/types.js';

/** Mirrors REACH_CIRCULATION_TYPES in layoutBubbleGraph.ts. */
export const CIRCULATION_TYPES: ReadonlySet<string> =
    new Set(['corridor', 'hall', 'stair', 'landing', 'lobby']);
/** Mirrors REACH_SERVED_WITHIN — served within a parent, so not a circulation destination. */
export const SERVED_WITHIN: ReadonlySet<string> =
    new Set(['ensuite', 'enSuite', 'closet', 'wardrobe', 'walkin']);

export interface ReachVerdict {
    readonly reached: number;
    readonly total: number;
    readonly fraction: number;
    readonly unreachedRoomNames: readonly string[];
    /** false ⇒ the option carries no door graph and the BFS fell back to WALL ADJACENCY,
     *  which inflates reachability. Any measurement over such an option is not a door
     *  measurement and must be reported separately. */
    readonly hasDoorGraph: boolean;
}

/** FAITHFUL REPLICA of `computeCirculationReachability` (layoutBubbleGraph.ts:736). */
export function reachability(option: LayoutOption): ReachVerdict {
    const rooms = (option.rooms ?? []).filter(
        (r): r is LayoutRoom => !!r && typeof r.name === 'string' && r.name.length > 0,
    );
    const hasDoorGraph = rooms.length > 0 && rooms.every(r => Array.isArray(r.doorAdjacentTo));
    const typeOf = (r: LayoutRoom): string => String(r.type ?? '').toLowerCase();
    const isCirc = (t: string): boolean => CIRCULATION_TYPES.has(t);
    const isHabitable = (r: LayoutRoom): boolean =>
        !isCirc(typeOf(r)) && !SERVED_WITHIN.has(typeOf(r));
    const habitable = rooms.filter(isHabitable);
    if (habitable.length === 0) {
        return { reached: 0, total: 0, fraction: 1, unreachedRoomNames: [], hasDoorGraph };
    }
    // §DUP-NAME-SAFE — key by ARRAY INDEX, resolve a referenced name to ALL rooms bearing it.
    const idxByName = new Map<string, number[]>();
    rooms.forEach((r, i) => {
        const a = idxByName.get(r.name); if (a) a.push(i); else idxByName.set(r.name, [i]);
    });
    const adj: number[][] = rooms.map(() => []);
    rooms.forEach((r, i) => {
        for (const n of ((hasDoorGraph ? r.doorAdjacentTo : r.adjacentTo) ?? [])) {
            if (typeof n !== 'string') continue;
            for (const j of (idxByName.get(n) ?? [])) {
                if (j === i) continue;
                adj[i]!.push(j); adj[j]!.push(i);      // undirected (robust to one-sided data)
            }
        }
    });
    // §ROOT-CORRIDOR-BEFORE-STAIR — hall → corridor → stair → any circulation → first room.
    const sorted = rooms.map((r, i) => ({ r, i }))
        .sort((a, b) => (a.r.name < b.r.name ? -1 : a.r.name > b.r.name ? 1 : a.i - b.i));
    const root = sorted.find(x => typeOf(x.r) === 'hall')
        ?? sorted.find(x => typeOf(x.r) === 'corridor')
        ?? sorted.find(x => typeOf(x.r) === 'stair')
        ?? sorted.find(x => isCirc(typeOf(x.r)))
        ?? sorted[0]!;
    const seen = new Set<number>([root.i]); const q = [root.i];
    while (q.length) {
        const cur = q.shift()!;
        for (const nb of (adj[cur] ?? []).slice().sort((x, y) => x - y)) {
            if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
        }
    }
    const unreached: string[] = []; let reached = 0;
    rooms.forEach((r, i) => {
        if (!isHabitable(r)) return;
        if (seen.has(i)) reached += 1; else unreached.push(r.name);
    });
    unreached.sort();
    return {
        reached, total: habitable.length,
        fraction: reached / habitable.length,
        unreachedRoomNames: unreached, hasDoorGraph,
    };
}

/**
 * ARM 2 — DOORLESS ROOMS. A strict subset of unreachability that fails DIFFERENTLY and so
 * deserves its own arm: the room has NO realised opening at all (`doorAdjacentTo` empty) —
 * a sealed box, not merely a badly served one. Circulation rooms are INCLUDED: a corridor
 * with no doors is the founder's "the corridor doesn't reach the bedrooms" in its most
 * literal form. A single-room option is excluded (nothing to connect to).
 */
export function doorlessRoomNames(option: LayoutOption): readonly string[] {
    const rooms = option.rooms ?? [];
    if (rooms.length <= 1) return [];
    return rooms
        .filter(r => !Array.isArray(r.doorAdjacentTo) || r.doorAdjacentTo.length === 0)
        .map(r => r.name)
        .sort();
}
