/**
 * L-936 §L-936-EMITTER-HONESTY — the three sentences `§MOVE-REWELD-DISPATCH`
 * owed and did not say, pinned so they cannot be lost again.
 *
 * ─── WHY THIS FILE IS A REGRESSION PIN AND NOT A LOGGING PREFERENCE ──────────
 *
 * L-936 was opened on a reading of one console line:
 *
 *     §MOVE-REWELD-DISPATCH: moved wall X → 1 junction re-weld(s)
 *                            via joinedTo-graph [X]
 *
 * read as *"the joinedTo query returned only the mover"*. It did not.
 * `L936InteriorLPairMove.measure.test.ts` measured the same gesture end-to-end:
 * the graph named TWO partners, and the engine — correctly, per C83 §10.2.2 —
 * planned a re-seat for the SUBJECT alone. The line printed `entries`, which is
 * the plan, and never printed the partners at all, so **"a partner was found and
 * deliberately left where it is" and "no partner was found" rendered as the same
 * eleven words.** Six reports in this family (L-921, L-922, L-925, L-926, L-928,
 * L-932) were triaged against that output.
 *
 * The two silences measured beside it are the same defect without the sentence:
 * an empty plan returned bare, and a plan-stage refusal handed to an
 * `onConsequence` sink that `engineLauncher.ts` does not compose.
 *
 * Fixture: the founder's own — two INTERIOR walls in an L, sharing the corner
 * (4,5), each terminating on a perimeter wall at its far end.
 *
 * @file packages/geometry-wall/__tests__/L936ReweldEmitterHonesty.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { WallMoveReweldService } from '../src/WallMoveReweldService';
import type { ReweldWallStoreRef, ReweldJoinedWallsQuery } from '../src/WallMoveReweldService';
import type { WallData } from '../src/WallTypes';

const LEVEL = 'L0';
const THICK = 0.2;

type XZ = [number, number];

function wall(id: string, s: XZ, e: XZ): WallData {
    return {
        id, type: 'wall', levelId: LEVEL, properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness: THICK, baseOffset: 0, openings: [],
    } as unknown as WallData;
}

/** The three surfaces the service reads, plus a hand-fired 'update' carrying
 *  prevState — the §STEP7 shape `WallStore` emits in production. */
class StoreDouble implements ReweldWallStoreRef {
    private readonly byId = new Map<string, WallData>();
    private readonly subs: Array<(e: 'add' | 'update' | 'remove', w: WallData, p?: WallData) => void> = [];

    add(w: WallData): void { this.byId.set(w.id, w); }
    getById(id: string): WallData | undefined { return this.byId.get(id); }
    getByLevel(levelId: string): WallData[] {
        return [...this.byId.values()].filter(w => w.levelId === levelId);
    }
    subscribe(cb: (e: 'add' | 'update' | 'remove', w: WallData, p?: WallData) => void): () => void {
        this.subs.push(cb);
        return () => { const i = this.subs.indexOf(cb); if (i >= 0) this.subs.splice(i, 1); };
    }

    /** Rigid translation, committed then announced — what UpdateWallBaselineCommand does. */
    translate(id: string, dx: number, dz: number): void {
        const prev = this.byId.get(id)!;
        const next = {
            ...prev,
            baseLine: prev.baseLine.map(p => ({ x: p.x + dx, y: p.y, z: p.z + dz })),
        } as unknown as WallData;
        this.byId.set(id, next);
        for (const cb of this.subs) cb('update', next, prev);
    }
}

interface Harness {
    store: StoreDouble;
    service: WallMoveReweldService;
    logs: string[];
    warns: string[];
    restore(): void;
}

/** Built WITHOUT `onConsequence` — deliberately mirroring the production
 *  composition in `engineLauncher.ts`, which does not pass one. */
function makeHarness(): Harness {
    const store = new StoreDouble();
    store.add(wall('p-south', [0, 0], [10, 0]));
    store.add(wall('p-east', [10, 0], [10, 8]));
    store.add(wall('i-a', [4, 0], [4, 5]));    // vertical partition
    store.add(wall('i-b', [4, 5], [10, 5]));   // horizontal partition — THE MOVER

    // Exactly what the flush writes for this fixture (measured in
    // `L936InteriorLPairMove.measure.test.ts` STAGE B, real solve, real writer).
    const edges: Record<string, string[]> = {
        'i-a': ['p-south', 'i-b'],
        'i-b': ['i-a', 'p-east'],
        'p-south': ['p-west', 'p-east', 'i-a'],
        'p-east': ['p-south', 'p-north', 'i-b'],
    };
    const getJoinedWalls = (wallId: string): ReweldJoinedWallsQuery =>
        edges[wallId]
            ? { ok: true, wallId, joinedWallIds: edges[wallId]! }
            : { ok: false, wallId, reason: 'wall-unknown-to-joinedTo-writer' };

    const logs: string[] = [];
    const warns: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { warns.push(a.map(String).join(' ')); });

    const service = new WallMoveReweldService(store, {
        commandManagerRef: { current: { getContext: () => ({}), execute: () => undefined } },
        makeCascadeCommand: () => ({ canExecute: () => ({ ok: true }) }),
        getJoinedWalls,
    });

    return {
        store, service, logs, warns,
        restore() { service.dispose(); logSpy.mockRestore(); warnSpy.mockRestore(); },
    };
}

let h: Harness | undefined;
beforeEach(() => { h = makeHarness(); });
afterEach(() => { h?.restore(); h = undefined; });

describe('L-936 §L-936-EMITTER-HONESTY — the dispatch line reports partners, re-seats and refusals as THREE facts', () => {
    it('a SUBJECT-ONLY plan says so, and names the partners it declined to move', () => {
        // The oblique drag: the only one of the four measured gestures that
        // produces the founder's exact `1 …-weld(s) [the mover]` shape.
        h!.store.translate('i-b', -0.4, -0.6);

        const line = h!.logs.find(l => l.includes('§MOVE-REWELD-DISPATCH'));
        expect(line, 'the dispatch must still announce itself').toBeDefined();

        // ⭐ The partner list — the fact the old line omitted entirely, and
        //    without which "1 re-weld" is unreadable.
        expect(line).toContain('2 partner(s) via joinedTo-graph');
        expect(line).toContain('i-a');
        expect(line).toContain('p-east');

        // ⭐ And the disambiguation the whole row turned on.
        expect(line).toContain('1 baseline re-seat(s)');
        expect(line).toContain('THE SUBJECT ONLY — no partner followed');
    });

    it('an EMPTY plan is no longer a bare return — the 600 mm dangling corner gets a sentence', () => {
        // Perpendicular, into the partner. Measured: plans=[] consequences=[],
        // 600 mm dangling, and NOT ONE LINE printed.
        h!.store.translate('i-b', 0, -0.6);

        expect(h!.logs.find(l => l.includes('§MOVE-REWELD-DISPATCH'))).toBeUndefined();
        const warn = h!.warns.find(w => w.includes('§MOVE-REWELD-EMPTY-PLAN'));
        expect(warn, 'an empty plan over NAMED partners must not be silent').toBeDefined();
        expect(warn).toContain('2 partner(s) considered via joinedTo-graph');
        expect(warn).toContain('i-a');
        expect(warn).toContain('0 re-weld entries and 0 refusals');
    });

    it('a plan-stage REFUSAL is audible with NO `onConsequence` sink — the production composition', () => {
        // Perpendicular, away from the partner: the corner falls 600 mm past
        // i-a's end, so closing it would lengthen an incumbent (C83 §10.2.2).
        h!.store.translate('i-b', 0, +0.6);

        const warn = h!.warns.find(w => w.includes('§MOVE-REWELD-REFUSED'));
        expect(warn, 'a refusal with no sink must still reach the console').toBeDefined();
        expect(warn).toContain('INCUMBENT_EXTENSION_REQUIRED');
        expect(warn).toContain('LEFT UNREPAIRED');
        expect(warn).toContain('i-a');
    });
});
