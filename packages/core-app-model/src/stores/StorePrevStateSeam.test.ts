/**
 * C72 §3.1/§3.4/§3.5 · gap register PR-03 — the §STEP7 emit seam, for the six
 * core-app-model stores whose 'update' emissions carried no prevState
 * (check-prevstate-contract P1 ledger rows, struck in the same commit as these
 * fixes).
 *
 * SEAM tests, not classifier tests (C72 §3.4): each drives the REAL mutation
 * entry point on the REAL store, registers a REAL subscriber, and reads
 * `prevState` off the emission. No fixture supplies the value under test.
 *
 * The differentiating assertion in every case is two-directional:
 *   · prevState is PRESENT and carries the PRE-mutation value — fails if the
 *     third argument is dropped again (the two-argument famine);
 *   · prevState ≠ the post-mutation payload on the changed field — fails if an
 *     implementation "reconstructs" it by re-reading the store after the write
 *     (C72 §3.5: that diffs a value against itself and reports "unchanged").
 */

import { describe, it, expect } from 'vitest';

import { CeilingStore } from './CeilingStore';
import { FloorStore } from './FloorStore';
import { FloorSystemTypeStore } from './FloorSystemTypeStore';
import { HandrailStore } from './HandrailStore';
import { RoofStore } from './RoofStore';
import { StairStore } from './StairStore';

const ctx = { activeLevelId: 'L0' } as never; // ProjectContext stub — stores read .activeLevelId only

const meta = { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 };

describe('CeilingStore — §STEP7 prevState on the update seam', () => {
    function seeded() {
        const store = new CeilingStore();
        (store as unknown as { _ceilings: Map<string, unknown> })._ceilings.set('c1', {
            id: 'c1',
            levelId: 'L0',
            properties: { mark: 'OLD' },
            holeElements: [],
            metadata: { ...meta },
        });
        return store;
    }

    it('update() emits the pre-mutation ceiling as the third argument', () => {
        const store = seeded();
        let seen: { next?: any; prev?: any } = {};
        store.subscribe((event, next, prevState) => {
            if (event === 'update') seen = { next, prev: prevState };
        });
        store.update('c1', { properties: { mark: 'NEW' } } as never);

        expect(seen.prev, 'third argument missing — the two-argument famine is back').toBeTruthy();
        expect(seen.prev.properties.mark).toBe('OLD'); // real prior, not a post-write re-read
        expect(seen.next.properties.mark).toBe('NEW');
        expect(seen.prev).not.toBe(seen.next);
    });

    it('addHoleElement() / removeHoleElement() emit the pre-mutation ceiling', () => {
        const store = seeded();
        const prevs: any[] = [];
        store.subscribe((event, _next, prevState) => {
            if (event === 'update') prevs.push(prevState);
        });

        store.addHoleElement('c1', { id: 'h1', elementId: 'e1' } as never);
        expect(prevs[0], 'addHoleElement dropped prevState').toBeTruthy();
        expect(prevs[0].holeElements).toHaveLength(0); // prior had no hole

        store.removeHoleElement('c1', 'h1');
        expect(prevs[1], 'removeHoleElement dropped prevState').toBeTruthy();
        expect(prevs[1].holeElements).toHaveLength(1); // prior still held the hole
    });
});

describe('FloorStore — §STEP7 prevState on the update seam', () => {
    it('update() emits the pre-mutation floor as the third argument', () => {
        const store = new FloorStore();
        (store as unknown as { _floors: Map<string, unknown> })._floors.set('f1', {
            id: 'f1',
            levelId: 'L0',
            label: 'OLD',
            metadata: { ...meta },
        });

        let seen: { next?: any; prev?: any } = {};
        store.subscribe((event, next, prevState) => {
            if (event === 'update') seen = { next, prev: prevState };
        });
        store.update('f1', { label: 'NEW' } as never);

        expect(seen.prev, 'third argument missing').toBeTruthy();
        expect(seen.prev.label).toBe('OLD');
        expect(seen.next.label).toBe('NEW');
    });
});

describe('FloorSystemTypeStore — §STEP7 prevState on the update seam', () => {
    it('updateCustomType() emits the pre-mutation type as the third argument', () => {
        const store = new FloorSystemTypeStore();
        const created = store.addCustomType({
            name: 'OLD',
            layers: [{ name: 'core', thickness: 0.2 } as never],
            category: 'interior',
            zoneTypes: [],
        } as never);

        let seen: { next?: any; prev?: any } = {};
        store.subscribe((event, next, prevState) => {
            if (event === 'update') seen = { next, prev: prevState };
        });
        store.updateCustomType(created.id, { name: 'NEW' });

        expect(seen.prev, 'third argument missing').toBeTruthy();
        expect(seen.prev.name).toBe('OLD');
        expect(seen.next.name).toBe('NEW');
        expect(seen.prev.metadata.version).toBe(1);
        expect(seen.next.metadata.version).toBe(2);
    });
});

describe('HandrailStore — §STEP7 prevState on the update seam', () => {
    function makeHandrail(id: string, mark: string) {
        return { id, levelId: 'L0', properties: { mark }, metadata: { ...meta } } as never;
    }

    it('update() emits the pre-mutation handrail as the third argument', () => {
        const store = new HandrailStore(ctx);
        store.add(makeHandrail('h1', 'OLD'));

        let seen: { next?: any; prev?: any } = {};
        store.subscribe((event, next, prevState) => {
            if (event === 'update') seen = { next, prev: prevState };
        });
        store.update('h1', { properties: { mark: 'NEW' } } as never);

        expect(seen.prev, 'third argument missing').toBeTruthy();
        expect(seen.prev.properties.mark).toBe('OLD');
        expect(seen.next.properties.mark).toBe('NEW');
    });

    it('restoreSnapshot(): prior captured BEFORE the write; undefined on an empty slot', () => {
        const store = new HandrailStore(ctx);
        store.add(makeHandrail('h1', 'OLD'));

        const prevs: any[] = [];
        store.subscribe((event, _next, prevState) => {
            if (event === 'update') prevs.push(prevState);
        });

        // Restore over an existing record → prev is the stored prior, not the snapshot.
        store.restoreSnapshot('h1', makeHandrail('h1', 'RESTORED'));
        expect(prevs[0]).toBeTruthy();
        expect(prevs[0].properties.mark).toBe('OLD'); // §3.5: a post-write read would say 'RESTORED'

        // Restore into an empty slot → no prior exists → undefined, honestly.
        store.restoreSnapshot('h2', makeHandrail('h2', 'FRESH'));
        expect(prevs[1]).toBeUndefined();
    });
});

describe('RoofStore (core-app-model copy) — §STEP7 prevState on the update seam', () => {
    function seeded() {
        const store = new RoofStore(ctx);
        (store as unknown as { _roofs: Map<string, unknown> })._roofs.set('r1', {
            id: 'r1',
            levelId: 'L0',
            overhang: 0.5,
            footprint: { polygon: [[0, 0], [4, 0], [4, 4]], centroid: [2, 2] },
            properties: {},
            metadata: { ...meta },
        });
        return store;
    }

    it('update() emits the pre-mutation roof to on("update") listeners', () => {
        const store = seeded();
        let seen: { next?: any; prev?: any } = {};
        store.on('update', ((next: any, prevState: any) => {
            seen = { next, prev: prevState };
        }) as never);
        store.update('r1', { overhang: 1.5 } as never);

        expect(seen.prev, 'second listener argument missing').toBeTruthy();
        expect(seen.prev.overhang).toBe(0.5);
        expect(seen.next.overhang).toBe(1.5);
    });

    it('restoreSnapshot() over an existing roof emits the stored prior', () => {
        const store = seeded();
        let seen: { next?: any; prev?: any } = {};
        store.on('update', ((next: any, prevState: any) => {
            seen = { next, prev: prevState };
        }) as never);

        store.restoreSnapshot({
            id: 'r1',
            levelId: 'L0',
            overhang: 9,
            footprint: { polygon: [[0, 0], [4, 0], [4, 4]], centroid: [2, 2] },
            properties: {},
            metadata: { ...meta },
        } as never);

        expect(seen.prev, 'restoreSnapshot dropped prevState').toBeTruthy();
        expect(seen.prev.overhang).toBe(0.5); // the prior — a post-write read would say 9
        expect(seen.next.overhang).toBe(9);
    });
});

describe('StairStore (core-app-model copy) — §STEP7 prevState on the update seam', () => {
    function makeStair(id: string, rotation: number) {
        return {
            id,
            baseLevelId: 'L0',
            topLevelId: 'L1',
            shape: 'straight',
            rotation,
            properties: {},
            metadata: { createdAt: '1', modifiedAt: '1', version: 0 },
        } as never;
    }

    it('update() emits the pre-mutation stair as the third argument', () => {
        const store = new StairStore(ctx);
        store.add(makeStair('s1', 0));

        let seen: { next?: any; prev?: any } = {};
        store.subscribe((event, next, prevState) => {
            if (event === 'update') seen = { next, prev: prevState };
        });
        store.update('s1', { rotation: 90 } as never);

        expect(seen.prev, 'third argument missing').toBeTruthy();
        expect(seen.prev.rotation).toBe(0);
        expect(seen.next.rotation).toBe(90);
        expect(seen.prev.metadata.version).toBe(0);
        expect(seen.next.metadata.version).toBe(1);
    });

    it('restoreSnapshot(): prior captured BEFORE the write; undefined on an empty slot', () => {
        const store = new StairStore(ctx);
        store.add(makeStair('s1', 0));

        const prevs: any[] = [];
        store.subscribe((event, _next, prevState) => {
            if (event === 'update') prevs.push(prevState);
        });

        store.restoreSnapshot(makeStair('s1', 45));
        expect(prevs[0]).toBeTruthy();
        expect(prevs[0].rotation).toBe(0); // §3.5: a post-write read would say 45

        store.restoreSnapshot(makeStair('s2', 10));
        expect(prevs[1]).toBeUndefined(); // no prior existed — honest absence
    });
});
