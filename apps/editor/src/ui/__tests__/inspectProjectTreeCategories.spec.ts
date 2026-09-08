/**
 * §TREE134 (L-12160..L-12163) — the Inspect project tree maps EVERY element family,
 * and its header counts exactly what it lists. Lane TREE134, 2026-08-26.
 *
 * Founder: *"The Inspect tree doesn't have all the categories mapped — many are
 * missing. Check the project browser on the left-hand side rail panel — you have them
 * all there — do the same."*
 *
 * ⛔ THE DEFECT. `ProjectTreeZone.renderTypesForLevel` opened on a hand-written
 * FOUR-entry array — roomStore/wallStore/slabStore/columnStore — while
 * `INSPECT_CATEGORIES`, in the same directory, declares TWENTY families under a
 * coverage gate. Handrails, curtain walls, furniture, plumbing, lighting, stairs,
 * windows, openings … were in the model, selectable in 3-D, listed by the left-rail
 * browser, and absent from this tree. Separately, `countAllElements()` scanned SIX
 * stores, so the header total counted rows the tree could not show.
 *
 * ⭐ ARM D IS THE ONE THAT STOPS THE RECURRENCE. Every other arm here would still
 * pass if someone "fixed" this by extending the array to today's twenty — and the
 * twenty-first family would be missing again. ARM D adds a family to the registry AT
 * RUNTIME and asserts it reaches the tree with NOBODY editing `ProjectTreeZone.ts` or
 * `projectTreeModel.ts`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    buildProjectTreeModel,
    buildLevelFamilyGroups,
    readFamilyRecords,
    elementRowLabel,
} from '../inspect/audit/projectTreeModel';
import { INSPECT_CATEGORIES } from '../inspect/audit/inspectCategories';

// ── Fixture ───────────────────────────────────────────────────────────────────

const G = globalThis as unknown as Record<string, any>;
const L0 = 'level-ground';
const L1 = 'level-one';

/** Store globals this fixture installs, so `afterEach` can strip exactly those. */
const installed: string[] = [];

function putStore(storeKey: string, records: any[]): void {
    installed.push(storeKey);
    G[storeKey] = {
        getAll: () => records,
        getById: (id: string) => records.find(r => String(r.id) === String(id)),
    };
}

/**
 * A level carrying ONE element of many families — the founder's model in miniature.
 * Wall/slab/room are the three the tree already showed; the rest are the ones it did
 * not, drawn from the families his console printed (`handrail_…`, `curtainwall_…`,
 * `furniture_…`, `plumbing_…`, `light_…`, `door…`, `floor_…`, `opening-stair-…`).
 */
function seedManyFamilies(): void {
    putStore('wallStore', [
        { id: 'wall_A', levelId: L0, name: 'North Wall' },
        { id: 'wall_B', levelId: L1 },
    ]);
    putStore('slabStore',        [{ id: 'slab_A',        levelId: L0 }]);
    putStore('roomStore',        [{ id: 'room_A',        levelId: L0, name: 'Kitchen' }]);
    putStore('curtainWallStore', [{ id: 'curtainwall_A', levelId: L0 }]);
    putStore('handrailStore',    [{ id: 'handrail_A',    levelId: L0 }]);
    putStore('stairStore',       [{ id: 'stair_A',       levelId: L0 }]);
    putStore('furnitureStore',   [{ id: 'furniture_A',   levelId: L0 }]);
    putStore('plumbingStore',    [{ id: 'plumbing_A',    levelId: L0 }]);
    putStore('lightingStore',    [{ id: 'light_A',       levelId: L0 }]);
    putStore('floorStore',       [{ id: 'floor_A',       levelId: L0 }]);
    putStore('ceilingStore',     [{ id: 'ceiling_A',     levelId: L0 }]);
    putStore('columnStore',      [{ id: 'column_A',      levelId: L0 }]);
    // HOSTED families carry `wallId`/`hostWallId` and NO `levelId` of their own (C15).
    putStore('doorStore',        [{ id: 'door_A',        wallId: 'wall_A' }]);
    putStore('windowStore',      [{ id: 'window_A',      hostWallId: 'wall_A' }]);
    putStore('openingStore',     [{ id: 'opening-stair-A', wallId: 'wall_A' }]);
}

beforeEach(() => { installed.length = 0; });
afterEach(() => {
    for (const k of installed) delete G[k];
    installed.length = 0;
    vi.restoreAllMocks();
});

// ── ARM A — every family present on a level gets a group ──────────────────────

describe('ARM A — the tree maps every element family, not a hard-coded handful', () => {
    it('emits one group per family present, each with the right count', () => {
        seedManyFamilies();
        const groups = buildLevelFamilyGroups(L0);
        const byId = new Map(groups.map(g => [g.id, g]));

        // ⛔ FAILS PRE-FIX for every id except rooms/walls/slabs/columns — the
        // four-entry `stores` array could not produce the others under any input.
        for (const id of [
            'rooms', 'walls', 'slabs', 'columns', 'floors', 'ceilings',
            'curtainWalls', 'handrails', 'stairs', 'furniture', 'plumbing',
            'lighting', 'doors', 'windows', 'openings',
        ]) {
            expect(byId.has(id), `missing tree group: ${id}`).toBe(true);
            expect(byId.get(id)!.elements.length, id).toBe(1);
        }
    });

    it('a HOSTED family is filed under its host wall’s storey, never dropped (C15)', () => {
        seedManyFamilies();
        // door/window/opening carry no levelId; wall_A is on L0 and wall_B on L1.
        const l0 = new Map(buildLevelFamilyGroups(L0).map(g => [g.id, g]));
        const l1 = new Map(buildLevelFamilyGroups(L1).map(g => [g.id, g]));
        expect(l0.get('doors')!.elements.map((e: any) => e.id)).toEqual(['door_A']);
        expect(l0.get('windows')!.elements.map((e: any) => e.id)).toEqual(['window_A']);
        expect(l1.has('doors')).toBe(false);
    });

    it('a family with ZERO elements on a level renders NO group — never an empty row', () => {
        seedManyFamilies();
        const l1 = buildLevelFamilyGroups(L1);
        expect(l1.map(g => g.id)).toEqual(['walls']);   // only wall_B is on L1
        expect(l1.every(g => g.elements.length > 0)).toBe(true);
    });

    it('groups follow INSPECT_CATEGORIES order — the Inspect dropdown’s order', () => {
        seedManyFamilies();
        const order  = INSPECT_CATEGORIES.map(c => c.id as string);
        const actual = buildLevelFamilyGroups(L0).map(g => g.id);
        const expected = order.filter(id => actual.includes(id));
        expect(actual).toEqual(expected);
    });

    it('a name filter narrows rows without inventing or losing families', () => {
        seedManyFamilies();
        const groups = buildLevelFamilyGroups(L0, 'kitchen');
        expect(groups.map(g => g.id)).toEqual(['rooms']);
        expect(groups[0]!.elements.map((e: any) => e.id)).toEqual(['room_A']);
    });
});

// ── ARM B — the header total equals the sum of the listed groups ──────────────

describe('ARM B — the header total is the sum of what the tree lists (§CONTEXT-DATA-HONESTY)', () => {
    it('listedTotal === Σ group counts across every level', () => {
        seedManyFamilies();
        const model = buildProjectTreeModel([L0, L1]);
        const summed = model.levels
            .flatMap(l => l.groups)
            .reduce((n, g) => n + g.elements.length, 0);
        expect(model.listedTotal).toBe(summed);
        // 12 unhosted on L0 + 3 hosted resolved to L0 + 1 wall on L1.
        expect(model.listedTotal).toBe(16);
    });

    it('an element on NO declared storey is REPORTED as unplaced, not folded into the total', () => {
        // ⛔ PRE-FIX this element was counted by `countAllElements()` (a raw store scan)
        // and shown by no row — a total covering rows the user cannot see.
        putStore('wallStore', [{ id: 'wall_A', levelId: L0 }, { id: 'wall_orphan', levelId: 'level-deleted' }]);
        const model = buildProjectTreeModel([L0]);
        expect(model.listedTotal).toBe(1);
        expect(model.unplaced).toBe(1);
    });

    it('a store that cannot be READ is unknown, not zero (C78 §8.1)', () => {
        putStore('wallStore', [{ id: 'wall_A', levelId: L0 }]);
        // handrailStore is absent from `window` entirely.
        const model = buildProjectTreeModel([L0]);
        expect(model.unreadable).toContain('handrailStore');
        expect(model.unreadable).not.toContain('wallStore');
        // ⚠ and the missing family contributes NO fabricated 0 group.
        expect(model.levels[0]!.groups.some(g => g.id === 'handrails')).toBe(false);
    });

    it('a THROWING store is unreadable, and does not take the whole tree down', () => {
        installed.push('wallStore');
        G['wallStore'] = { getAll: () => { throw new Error('not ready'); } };
        putStore('slabStore', [{ id: 'slab_A', levelId: L0 }]);
        const model = buildProjectTreeModel([L0]);
        expect(model.unreadable).toContain('wallStore');
        expect(model.listedTotal).toBe(1);
    });

    it('readFamilyRecords keeps ABSENT and EMPTY as different values', () => {
        expect(readFamilyRecords('beamStore').kind).toBe('unreadable');
        putStore('beamStore', []);
        const read = readFamilyRecords('beamStore');
        expect(read.kind).toBe('read');
        expect(read.kind === 'read' && read.records).toEqual([]);
    });

    // ══════════════════════════════════════════════════════════════════════════════════════
    // ⭐⭐ §ENVELOPES-ARE-CATEGORIES (L-13252) — the founder's "true categories, turned on and off"
    // ══════════════════════════════════════════════════════════════════════════════════════
    // `spaceEnvelope` is a plugin DTO store on `runtime.stores`, publishing NO `window` global —
    // so the legacy `window[storeKey].getAll()` read could not see it and the family was absent
    // from the Project Browser and Inspect entirely, with the coverage gate blind to the gap.
    it('⭐ reads level + room envelopes off runtime.stores and SPLITS them by role', () => {
        (window as unknown as { runtime?: unknown }).runtime = {
            stores: {
                spaceEnvelope: {
                    getState: () => new Map<string, unknown>([
                        ['e1', { id: 'e1', role: 'level', levelId: 'L0' }],
                        ['e2', { id: 'e2', role: 'room',  levelId: 'L0' }],
                        ['e3', { id: 'e3', role: 'room',  levelId: 'L0' }],
                    ]),
                },
            },
        };
        const levels = readFamilyRecords('spaceEnvelopeStore',
            { runtimeStoreKey: 'spaceEnvelope', roleFilter: 'level' });
        const rooms = readFamilyRecords('spaceEnvelopeStore',
            { runtimeStoreKey: 'spaceEnvelope', roleFilter: 'room' });
        expect(levels.kind === 'read' && levels.records.map((r) => r.id)).toEqual(['e1']);
        expect(rooms.kind === 'read' && rooms.records.map((r) => r.id)).toEqual(['e2', 'e3']);
        delete (window as unknown as { runtime?: unknown }).runtime;
    });

    it('⛔ a runtime that has not composed is UNREADABLE, never "no envelopes"', () => {
        // The distinction that matters most on this path: before compose, the honest answer is
        // "unknown". Rendering it as an empty category would tell the founder he drew nothing.
        delete (window as unknown as { runtime?: unknown }).runtime;
        const r = readFamilyRecords('spaceEnvelopeStore',
            { runtimeStoreKey: 'spaceEnvelope', roleFilter: 'level' });
        expect(r.kind).toBe('unreadable');
    });

    it('⭐ both envelope families are DECLARED categories, so every derived surface lists them', () => {
        const ids = INSPECT_CATEGORIES.map((c) => c.id);
        expect(ids).toContain('levelEnvelopes');
        expect(ids).toContain('roomEnvelopes');
        // ⚠ `permitted` (the purple BUILDABLE study volume) is deliberately NOT a row — one solved
        // study per parcel is not a set of selectable instances. Recorded so a future reader sees
        // a decision, not an oversight.
        expect(ids).not.toContain('buildableEnvelope');
    });
});

// ── ARM C — selection identity and row naming survive ─────────────────────────

describe('ARM C — the families that already worked still behave identically', () => {
    it('rooms are still identified by their store key, so the room-select path is unchanged', () => {
        const rooms = INSPECT_CATEGORIES.find(c => c.id === 'rooms')!;
        expect(rooms.storeKey).toBe('roomStore');
    });

    it('an unnamed record still reads "WALL 1A2B" — the SINGULAR builder type', () => {
        expect(elementRowLabel({ meshType: 'wall' }, { id: '1a2b5678' })).toBe('WALL 1A2B');
        expect(elementRowLabel({ meshType: 'wall' }, { id: 'x', name: 'North Wall' })).toBe('North Wall');
    });
});

// ── ARM D — ⭐ THE DERIVATION PIN ─────────────────────────────────────────────

describe('ARM D — a NEW family reaches the tree without anyone editing the tree', () => {
    it('appears as a group from the registry alone', () => {
        putStore('wallStore', [{ id: 'wall_A', levelId: L0 }]);

        // A family that exists nowhere in this repo, added to the AUTHORITY only.
        // ⛔ FAILS against any hand-written list in the tree — including a list that
        // had just been extended to today's twenty families, which is exactly the
        // "fix" this pin exists to reject.
        const invented = {
            id: 'skylights', label: 'Skylights', icon: '◇',
            storeKey: 'skylightStore', meshType: 'skylight',
        };
        (INSPECT_CATEGORIES as unknown as any[]).push(invented);
        putStore('skylightStore', [{ id: 'skylight_A', levelId: L0, name: 'Atrium Light' }]);
        try {
            const groups = buildLevelFamilyGroups(L0);
            const g = groups.find(x => x.id === 'skylights');
            expect(g, 'a family added to INSPECT_CATEGORIES must reach the tree').toBeDefined();
            expect(g!.label).toBe('Skylights');
            expect(g!.elements.map((e: any) => e.id)).toEqual(['skylight_A']);
            // …and it is counted, so the header still equals what is listed.
            expect(buildProjectTreeModel([L0]).listedTotal).toBe(2);
        } finally {
            const arr = INSPECT_CATEGORIES as unknown as any[];
            arr.splice(arr.indexOf(invented), 1);
        }
    });

    it('negative control: the pin fails when the registry does NOT declare the family', () => {
        putStore('wallStore', [{ id: 'wall_A', levelId: L0 }]);
        putStore('skylightStore', [{ id: 'skylight_A', levelId: L0 }]);
        expect(buildLevelFamilyGroups(L0).some(g => g.id === 'skylights')).toBe(false);
    });
});
