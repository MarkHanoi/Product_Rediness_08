/**
 * §FIX-ELEMENT-REBIND-ON-ROOT-SWAP — ElementRegistry root-swap notification.
 *
 * INVARIANT UNDER TEST: `registerRoot()` is the ONE call every builder makes when
 * it replaces an element's scene root, so it is the authoritative "this element's
 * object identity changed" signal — including for builders that tear the old root
 * down first (`unregisterRoot()` then `registerRoot()`, as StairMeshBuilder does),
 * which is precisely the shape a per-type `bim-<type>-updated` allowlist misses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { elementRegistry } from './ElementRegistry.js';

function root(name: string): THREE.Object3D {
    const o = new THREE.Object3D();
    o.name = name;
    return o;
}

describe('ElementRegistry §FIX-ELEMENT-REBIND-ON-ROOT-SWAP', () => {
    beforeEach(() => {
        elementRegistry.clear();
    });

    it('does NOT fire on first registration (creation batches stay silent)', () => {
        const cb = vi.fn();
        const off = elementRegistry.onRootSwapped(cb);
        elementRegistry.registerRoot('e1', root('a'));
        expect(cb).not.toHaveBeenCalled();
        off();
    });

    it('does NOT fire on an idempotent re-register of the SAME object', () => {
        const a = root('a');
        elementRegistry.registerRoot('e1', a);
        const cb = vi.fn();
        const off = elementRegistry.onRootSwapped(cb);
        elementRegistry.registerRoot('e1', a);
        expect(cb).not.toHaveBeenCalled();
        off();
    });

    it('fires with (id, new, previous) when a root is overwritten in place', () => {
        const a = root('a');
        const b = root('b');
        elementRegistry.registerRoot('e1', a);
        const cb = vi.fn();
        const off = elementRegistry.onRootSwapped(cb);

        elementRegistry.registerRoot('e1', b);

        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith('e1', b, a);
        expect(elementRegistry.getRoot('e1')).toBe(b);
        off();
    });

    it('fires across the unregisterRoot() + registerRoot() teardown pair (StairMeshBuilder shape)', () => {
        const a = root('a');
        const b = root('b');
        elementRegistry.registerRoot('stair-1', a);
        const cb = vi.fn();
        const off = elementRegistry.onRootSwapped(cb);

        // StairMeshBuilder.updateStair(): removeStair() unregisters, then re-registers.
        elementRegistry.unregisterRoot('stair-1');
        elementRegistry.registerRoot('stair-1', b);

        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith('stair-1', b, a);
        off();
    });

    it('a REAL unregister() ends the identity chain — a later re-create is not a swap', () => {
        elementRegistry.registerRoot('e1', root('a'));
        elementRegistry.unregister('e1');
        const cb = vi.fn();
        const off = elementRegistry.onRootSwapped(cb);
        elementRegistry.registerRoot('e1', root('b'));
        expect(cb).not.toHaveBeenCalled();
        off();
    });

    it('clear() ends every identity chain', () => {
        elementRegistry.registerRoot('e1', root('a'));
        elementRegistry.clear();
        const cb = vi.fn();
        const off = elementRegistry.onRootSwapped(cb);
        elementRegistry.registerRoot('e1', root('b'));
        expect(cb).not.toHaveBeenCalled();
        off();
    });

    it('a throwing listener never breaks the builder rebuild or the other listeners', () => {
        elementRegistry.registerRoot('e1', root('a'));
        const bad = vi.fn(() => { throw new Error('observer blew up'); });
        const good = vi.fn();
        const off1 = elementRegistry.onRootSwapped(bad);
        const off2 = elementRegistry.onRootSwapped(good);

        expect(() => elementRegistry.registerRoot('e1', root('b'))).not.toThrow();
        expect(bad).toHaveBeenCalled();
        expect(good).toHaveBeenCalled();
        off1(); off2();
    });

    it('the disposer removes the subscription', () => {
        elementRegistry.registerRoot('e1', root('a'));
        const cb = vi.fn();
        elementRegistry.onRootSwapped(cb)();
        elementRegistry.registerRoot('e1', root('b'));
        expect(cb).not.toHaveBeenCalled();
    });
});
