// @vitest-environment happy-dom
//
// C27 INS-α-8 — ElementMeshRegistryAdapter unit tests.
//
// The adapter is the bridge from a THREE-like scene graph to the
// duck-typed `ElementMeshRegistry` consumed by IsolationAnimator
// (renderer-three).  These tests use plain JS object trees — no real
// THREE — to validate the traversal + filter contract.

import { describe, it, expect } from 'vitest';
import { ElementMeshRegistryAdapter } from '../src/ui/inspect/ElementMeshRegistryAdapter.js';

// ── Fake mesh + scene factories ──────────────────────────────────────────────

interface FakeMesh {
    isMesh: true;
    userData: Record<string, unknown>;
    material: { opacity: number; transparent: boolean };
    visible: boolean;
    children: FakeMesh[];
}

function fakeMesh(elementId?: string | undefined, extraKey?: { key: string; val: string }): FakeMesh {
    const userData: Record<string, unknown> = {};
    if (elementId !== undefined) userData['elementId'] = elementId;
    if (extraKey !== undefined) userData[extraKey.key] = extraKey.val;
    return {
        isMesh: true,
        userData,
        material: { opacity: 1, transparent: false },
        visible: true,
        children: [],
    };
}

/** Scene with a THREE-style `traverse(fn)` method walking the tree depth-first. */
function traversableScene(roots: FakeMesh[]): {
    traverse: (fn: (obj: unknown) => void) => void;
    children: FakeMesh[];
} {
    const walk = (nodes: FakeMesh[], fn: (obj: unknown) => void): void => {
        for (const n of nodes) {
            fn(n);
            if (n.children.length > 0) walk(n.children, fn);
        }
    };
    return {
        children: roots,
        traverse(fn) { walk(roots, fn); },
    };
}

/** Scene with only `children[]` — no traverse() method, exercises the
 *  recursive-children fallback path. */
function childrenOnlyScene(roots: FakeMesh[]): { children: FakeMesh[] } {
    return { children: roots };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ElementMeshRegistryAdapter (C27 INS-α-8)', () => {
    it('empty scene → getMeshesForElement returns [], listElementIds returns []', () => {
        const reg = new ElementMeshRegistryAdapter(traversableScene([]));
        expect(reg.getMeshesForElement('wall-1')).toEqual([]);
        expect(reg.listElementIds()).toEqual([]);
    });

    it('single mesh with userData.elementId="wall-1" — getMeshes returns it; listElementIds includes it', () => {
        const m = fakeMesh('wall-1');
        const reg = new ElementMeshRegistryAdapter(traversableScene([m]));
        const result = reg.getMeshesForElement('wall-1');
        expect(result.length).toBe(1);
        expect(result[0]).toBe(m);
        expect(reg.listElementIds()).toEqual(['wall-1']);
    });

    it('multiple meshes sharing an id → getMeshes returns all of them', () => {
        const a = fakeMesh('wall-1');
        const b = fakeMesh('wall-1');
        const c = fakeMesh('wall-2');
        const reg = new ElementMeshRegistryAdapter(traversableScene([a, b, c]));
        const wall1 = reg.getMeshesForElement('wall-1');
        expect(wall1.length).toBe(2);
        expect(wall1).toContain(a);
        expect(wall1).toContain(b);
        // listElementIds is a Set-derived unique list.
        const ids = reg.listElementIds();
        expect(new Set(ids)).toEqual(new Set(['wall-1', 'wall-2']));
    });

    it('custom elementIdKey works (looks at userData[key] instead of userData.elementId)', () => {
        const m = fakeMesh(undefined, { key: 'bimId', val: 'beam-7' });
        const reg = new ElementMeshRegistryAdapter(traversableScene([m]), {
            elementIdKey: 'bimId',
        });
        expect(reg.getMeshesForElement('beam-7').length).toBe(1);
        expect(reg.listElementIds()).toEqual(['beam-7']);
        // The default elementId key finds nothing.
        const def = new ElementMeshRegistryAdapter(traversableScene([m]));
        expect(def.getMeshesForElement('beam-7')).toEqual([]);
    });

    it('nested scene via children[] traversal works without a traverse() method', () => {
        const grand = fakeMesh('door-1');
        const child = fakeMesh('wall-1');
        child.children.push(grand);
        const root = fakeMesh('level-1');
        root.children.push(child);
        const reg = new ElementMeshRegistryAdapter(childrenOnlyScene([root]));
        expect(reg.getMeshesForElement('door-1').length).toBe(1);
        expect(reg.getMeshesForElement('wall-1').length).toBe(1);
        expect(reg.getMeshesForElement('level-1').length).toBe(1);
        const ids = reg.listElementIds();
        expect(new Set(ids)).toEqual(new Set(['door-1', 'wall-1', 'level-1']));
    });

    it('mesh without userData.elementId is skipped from listElementIds', () => {
        const tagged = fakeMesh('wall-1');
        const untagged = fakeMesh(undefined);
        const reg = new ElementMeshRegistryAdapter(traversableScene([tagged, untagged]));
        // Untagged mesh has no elementId — it never appears in listElementIds.
        expect(reg.listElementIds()).toEqual(['wall-1']);
        // And lookups for empty / missing ids return [] (not the untagged mesh).
        expect(reg.getMeshesForElement('')).toEqual([]);
        expect(reg.getMeshesForElement('missing-id')).toEqual([]);
    });

    it('handles a scene-like with neither traverse() nor children[] (empty graph)', () => {
        const reg = new ElementMeshRegistryAdapter({});
        expect(reg.getMeshesForElement('any')).toEqual([]);
        expect(reg.listElementIds()).toEqual([]);
    });

    it('returns a FROZEN array from getMeshesForElement (defensive)', () => {
        const m = fakeMesh('wall-1');
        const reg = new ElementMeshRegistryAdapter(traversableScene([m]));
        const result = reg.getMeshesForElement('wall-1');
        expect(Object.isFrozen(result)).toBe(true);
    });
});
