// @vitest-environment happy-dom
//
// §ISOLATE-ALL-ELEMENTS-WIRED (2026-06-26) — single-source-of-truth coverage.
//
// Proves floor isolation enumerates EVERY registered element root (the resolver
// reads elementRegistry.getAllRoots() in production) and decides per-root
// visibility correctly — covering the two failure modes the founder hit:
//
//   1. The stair RAILING (and handrail) was missing on the isolated Ground Floor.
//   2. Span elements (stair / lift) cross base→top and must show when EITHER
//      endpoint level is isolated.
//
// We drive the PURE decision function `decideLevelIsolation(roots, active)` with
// an explicit root list (the same shape getAllRoots() yields). This exercises
// the real span/railing/coverage logic without coupling the test to package
// node_modules resolution. `resolveRootLevels` is also asserted directly.

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import type { StoreType } from '@pryzm/core-app-model/element-registry';
import {
    decideLevelIsolation,
    resolveRootLevels,
    type RegisteredRoot,
} from '../src/engine/inspect/LevelIsolationResolver.js';

const roots: RegisteredRoot[] = [];

function add(id: string, storeType: StoreType | undefined, ud: Record<string, unknown>): THREE.Object3D {
    const g = new THREE.Group();
    g.userData = { id, elementType: storeType ?? ud.elementType, ...ud };
    roots.push({ id, root: g, storeType });
    return g;
}

function decide(id: string, activeLevelId: string | null): boolean {
    const d = decideLevelIsolation(roots, activeLevelId).find(x => x.id === id);
    if (!d) throw new Error(`no decision for ${id}`);
    return d.visibleInIsolation;
}

describe('§ISOLATE-ALL-ELEMENTS-WIRED — every element type is covered by construction', () => {
    // Reset the shared root list before each test.
    function reset() { roots.length = 0; }

    // Every placed element type that registers a root, with single-level userData.
    const SINGLE_LEVEL_TYPES: StoreType[] = [
        'wall', 'slab', 'ceiling', 'floor', 'column', 'beam',
        'curtainwall', 'curtain-panel', 'window', 'door', 'roof',
        'room', 'furniture', 'plumbing', 'grid', 'annotation', 'stair-landing',
    ];

    it('each single-level element type hides when its level is NOT isolated, shows when it IS', () => {
        reset();
        for (const t of SINGLE_LEVEL_TYPES) {
            add(`${t}-L0`, t, { levelId: 'L0' });
            add(`${t}-L1`, t, { levelId: 'L1' });
        }
        for (const t of SINGLE_LEVEL_TYPES) {
            expect(decide(`${t}-L0`, 'L0'), `${t} L0 under L0 isolation`).toBe(true);
            expect(decide(`${t}-L1`, 'L0'), `${t} L1 under L0 isolation`).toBe(false);
        }
    });

    it('STAIR RAILING follows its host stair and shows on the isolated Ground Floor (founder bug)', () => {
        reset();
        add('stair-1', 'stair', { levelId: 'L0', baseLevelId: 'L0', topLevelId: 'L1' });
        // Railing hosted on stair-1; carries only the stair's primary levelId.
        add('railing-1', 'stair-railing', { levelId: 'L0', stairId: 'stair-1' });

        expect(decide('stair-1', 'L0')).toBe(true);
        expect(decide('railing-1', 'L0')).toBe(true);
    });

    it('a railing whose own levelId mismatches still follows its host stair span', () => {
        reset();
        add('stair-2', 'stair', { levelId: 'L0', baseLevelId: 'L0', topLevelId: 'L1' });
        // Railing accidentally stamped with the TOP level only — must still show on
        // Ground because its host stair spans Ground.
        add('railing-2', 'stair-railing', { levelId: 'L1', stairId: 'stair-2' });

        expect(decide('railing-2', 'L0')).toBe(true); // host stair spans L0
        expect(decide('railing-2', 'L1')).toBe(true); // its own level + host top
    });

    it('span elements (stair, lift) show when EITHER base or top level is isolated', () => {
        reset();
        add('stair-3', 'stair', { levelId: 'L0', baseLevelId: 'L0', topLevelId: 'L1' });
        add('lift-1', 'verticalCirculation', { levelId: 'L0', baseLevelId: 'L0', topLevelId: 'L2' });

        expect(decide('stair-3', 'L0')).toBe(true);
        expect(decide('stair-3', 'L1')).toBe(true);
        expect(decide('stair-3', 'L2')).toBe(false);
        expect(decide('lift-1', 'L0')).toBe(true);
        expect(decide('lift-1', 'L2')).toBe(true);
        expect(decide('lift-1', 'L1')).toBe(false);
    });

    it('handrail follows its host stair span via stairId', () => {
        reset();
        add('stair-4', 'stair', { levelId: 'L1', baseLevelId: 'L1', topLevelId: 'L2' });
        add('handrail-1', 'handrail', { levelId: 'L1', stairId: 'stair-4' });
        expect(decide('handrail-1', 'L1')).toBe(true);
        expect(decide('handrail-1', 'L2')).toBe(true); // host top
        expect(decide('handrail-1', 'L0')).toBe(false);
    });

    it('instanced groups (walls/columns/beams) keyed only by levelId are covered (no storeType)', () => {
        reset();
        // InstancedElementRenderer stamps userData.levelId + elementType, no id, no
        // registerSemantic → enumerated as an untyped root. Still isolated correctly.
        add('instanced-walls-L1', undefined, { levelId: 'L1', elementType: 'wall' });
        expect(decide('instanced-walls-L1', 'L0')).toBe(false);
        expect(decide('instanced-walls-L1', 'L1')).toBe(true);
    });

    it('an untyped instanced STAIR group still spans base→top (span-by-stamp)', () => {
        reset();
        add('instanced-stair', undefined, { elementType: 'stair', levelId: 'L0', baseLevelId: 'L0', topLevelId: 'L1' });
        expect(decide('instanced-stair', 'L1')).toBe(true);
    });

    it('no isolation (null active level) keeps everything visible', () => {
        reset();
        add('wall-x', 'wall', { levelId: 'L9' });
        expect(decide('wall-x', null)).toBe(true);
    });

    it('a root with no resolvable level fails OPEN (never blanked by isolation)', () => {
        reset();
        add('mystery', 'wall', {}); // no levelId at all
        expect(decide('mystery', 'L0')).toBe(true);
    });

    it('resolveRootLevels: span element yields base+top; railing inherits host span', () => {
        reset();
        const stair = add('s', 'stair', { levelId: 'A', baseLevelId: 'A', topLevelId: 'B' });
        expect([...resolveRootLevels(stair, 'stair')].sort()).toEqual(['A', 'B']);
        // Railing whose host root is NOT in the registry still picks up its own
        // base/top if stamped; here only its own levelId 'A' is known.
        const railSelfOnly = add('r0', 'stair-railing', { levelId: 'A' });
        expect([...resolveRootLevels(railSelfOnly, 'stair-railing')].sort()).toEqual(['A']);
    });
});
