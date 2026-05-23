/**
 * UserMaterialStore unit tests — #105 Materials Repository, Phase 1.
 *
 * Imports the store DIRECTLY (not via the package index, which pulls in
 * window-touching presentation modules that throw under the node test env).
 * The store's CustomEvent dispatch is window-guarded, so it is a no-op here.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { userMaterialStore } from './UserMaterialStore';

describe('UserMaterialStore (#105 Phase 1)', () => {
    beforeEach(() => {
        userMaterialStore.reset();
    });

    it('creates a material and reflects it in getAll/get/has', () => {
        const m = userMaterialStore.create({ id: 'user-mat-a', label: 'Oak', color: '#c8a96e' });
        expect(m).not.toBeNull();
        expect(m!.source).toBe('user');
        expect(userMaterialStore.has('user-mat-a')).toBe(true);
        expect(userMaterialStore.getAll()).toHaveLength(1);
        expect(userMaterialStore.get('user-mat-a')?.label).toBe('Oak');
    });

    it('applies defaults + clamp01 normalisation on create', () => {
        const m = userMaterialStore.create({
            id: 'user-mat-b', label: 'Wild', color: '#fff',
            metalness: 5, roughness: -2, opacity: 3, transparent: true,
        });
        expect(m!.metalness).toBe(1);   // clamped from 5
        expect(m!.roughness).toBe(0);   // clamped from -2
        expect(m!.opacity).toBe(1);     // clamped from 3
        // empty/absent colour falls back to a safe default
        const def = userMaterialStore.create({ id: 'user-mat-c', label: 'NoColour', color: '' });
        expect(def!.color).toBe('#cccccc');
    });

    it('rejects duplicate ids (create returns null)', () => {
        expect(userMaterialStore.create({ id: 'dup', label: 'One' })).not.toBeNull();
        expect(userMaterialStore.create({ id: 'dup', label: 'Two' })).toBeNull();
        expect(userMaterialStore.getAll()).toHaveLength(1);
    });

    it('updates fields (and clamps scalars), preserving id/source/createdAt', () => {
        const created = userMaterialStore.create({ id: 'u', label: 'A', color: '#111' })!;
        const ok = userMaterialStore.update('u', { label: 'B', color: '#222', metalness: 9, textureUrl: 'data:img' });
        expect(ok).toBe(true);
        const m = userMaterialStore.get('u')!;
        expect(m.label).toBe('B');
        expect(m.color).toBe('#222');
        expect(m.metalness).toBe(1); // clamped
        expect(m.textureUrl).toBe('data:img');
        expect(m.source).toBe('user');
        expect(m.createdAt).toBe(created.createdAt);
        expect(userMaterialStore.update('missing', { label: 'X' })).toBe(false);
    });

    it('deletes a material', () => {
        userMaterialStore.create({ id: 'd', label: 'Del' });
        expect(userMaterialStore.delete('d')).toBe(true);
        expect(userMaterialStore.has('d')).toBe(false);
        expect(userMaterialStore.delete('d')).toBe(false); // already gone
    });

    it('serialize → deserialize round-trips and replaces contents', () => {
        userMaterialStore.create({ id: 'r1', label: 'R1', color: '#abc' });
        userMaterialStore.create({ id: 'r2', label: 'R2', color: '#def', textureUrl: 'data:tex' });
        const snap = userMaterialStore.serialize();
        expect(snap.version).toBe(1);
        expect(snap.materials).toHaveLength(2);

        userMaterialStore.reset();
        expect(userMaterialStore.getAll()).toHaveLength(0);

        userMaterialStore.deserialize(snap);
        expect(userMaterialStore.getAll()).toHaveLength(2);
        expect(userMaterialStore.get('r2')?.textureUrl).toBe('data:tex');
    });

    it('deserialize ignores malformed payloads', () => {
        userMaterialStore.create({ id: 'keep', label: 'Keep' });
        userMaterialStore.deserialize(null);
        userMaterialStore.deserialize({ version: 2, materials: [] });   // wrong version
        userMaterialStore.deserialize({ version: 1, materials: 'nope' }); // wrong shape
        // a valid v1 payload clears + replaces; malformed ones above are no-ops,
        // so the original material is still present.
        expect(userMaterialStore.has('keep')).toBe(true);
    });

    it('getAll returns clones (mutating the result does not affect the store)', () => {
        userMaterialStore.create({ id: 'c', label: 'Clone' });
        const all = userMaterialStore.getAll();
        all[0]!.label = 'MUTATED';
        expect(userMaterialStore.get('c')?.label).toBe('Clone');
    });
});
