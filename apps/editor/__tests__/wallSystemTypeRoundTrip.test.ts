// @vitest-environment node
//
// §TYPE-SNAPSHOT-CODEC — the persistence round-trip the founder's complaint #2 is about:
// "the element types must be saved in the user project/session — when the user re-opens
// the project, all new types created must remain, ROBUSTLY."
//
// They did remain — but not INTACT. `ProjectSerializer` wrote a custom wall type with
// `structuredClone(t)` (every field); `ProjectLoader` restored it by hand-listing four
// of them (`{id, name, description, layers}`). Any field outside that list survived the
// save and was dropped on the way back in. `function` — the ISO 13567 / IfcWallTypeEnum
// envelope function that drives plan pen weight (§FEAT-PEN-WEIGHT-BY-WALL-FUNCTION,
// L-285) — is exactly such a field, so a user type declared 'exterior' reloaded as
// UNDECLARED and the drawing silently re-weighted itself on every reopen.
//
// The cure is structural, not a fifth field in the list: ONE codec, used by BOTH sides.
// This suite is that codec's contract. It exercises the REAL wallSystemTypeStore
// singleton — the same instance ProjectSerializer and ProjectLoader both import — so it
// proves the seam, not a mock of it.

import { describe, it, expect, beforeEach } from 'vitest';
import { wallSystemTypeStore } from '@pryzm/geometry-wall';
import {
    encodeWallSystemType,
    decodeWallSystemType,
} from '../src/engine/persistence/wallSystemTypeCodec';

const LAYERS = [
    { name: 'Face Brick',  thickness: 0.110, function: 'finish-exterior', materialColor: '#c0674a' },
    { name: 'Insulation',  thickness: 0.060, function: 'insulation',      materialColor: '#f5e07a' },
    { name: 'Blockwork',   thickness: 0.140, function: 'structure',       materialColor: '#a0a0a0' },
] as any;

describe('§TYPE-SNAPSHOT-CODEC — custom wall type survives a project round-trip', () => {

    beforeEach(() => {
        // Contract 45 / C13 — the same teardown a project switch performs. Built-ins stay.
        wallSystemTypeStore.clearCustomTypes();
    });

    it('create → serialise → clear (project switch) → load: the type is still there', () => {
        const created = wallSystemTypeStore.add({
            name: 'Founder Test Wall 310mm',
            description: 'Authored in the type editor',
            layers: LAYERS,
            function: 'exterior',
        } as any);

        // ── SAVE ──────────────────────────────────────────────────────────────
        const snapshot = wallSystemTypeStore.getAll()
            .filter(t => !wallSystemTypeStore.isBuiltIn(t.id))
            .map(encodeWallSystemType);

        expect(snapshot).toHaveLength(1);

        // ── PROJECT CLOSED ────────────────────────────────────────────────────
        wallSystemTypeStore.clearCustomTypes();
        expect(wallSystemTypeStore.getById(created.id)).toBeUndefined();

        // ── LOAD ──────────────────────────────────────────────────────────────
        for (const raw of snapshot) {
            const params = decodeWallSystemType(raw);
            expect(params).not.toBeNull();
            wallSystemTypeStore.add(params!);
        }

        const restored = wallSystemTypeStore.getById(created.id);
        expect(restored).toBeDefined();
        // The id is preserved (§M-B1): every wall referencing it stays referencing it,
        // instead of becoming a dangling reference that falls back to a built-in.
        expect(restored!.id).toBe(created.id);
        expect(restored!.name).toBe('Founder Test Wall 310mm');
        expect(restored!.description).toBe('Authored in the type editor');
    });

    it('preserves the declared envelope `function` — THE REGRESSION (L-285)', () => {
        const created = wallSystemTypeStore.add({
            name: 'Exterior Custom', layers: LAYERS, function: 'exterior',
        } as any);

        const wire = encodeWallSystemType(wallSystemTypeStore.getById(created.id)!);
        wallSystemTypeStore.clearCustomTypes();
        wallSystemTypeStore.add(decodeWallSystemType(wire)!);

        // Before the codec this read `undefined`: saved as exterior, reloaded as
        // "this type does not say", and the plan pen silently reverted.
        expect(wallSystemTypeStore.getById(created.id)!.function).toBe('exterior');
    });

    it('preserves the full layer stack, not just its total thickness', () => {
        const created = wallSystemTypeStore.add({ name: 'Layered', layers: LAYERS } as any);
        const wire = encodeWallSystemType(wallSystemTypeStore.getById(created.id)!);
        wallSystemTypeStore.clearCustomTypes();
        wallSystemTypeStore.add(decodeWallSystemType(wire)!);

        const restored = wallSystemTypeStore.getById(created.id)!;
        expect(restored.layers).toHaveLength(3);
        expect(restored.layers.map(l => l.name)).toEqual(['Face Brick', 'Insulation', 'Blockwork']);
        expect(restored.layers[0].materialColor).toBe('#c0674a');
        // totalThickness is DERIVED by the store from the restored layers — never carried
        // on the wire, so it cannot disagree with the stack it is supposed to summarise.
        expect(restored.totalThickness).toBeCloseTo(0.310, 6);
    });

    it('an UNDECLARED function stays undeclared — it is a real answer, not a missing value', () => {
        const created = wallSystemTypeStore.add({ name: 'Unsaid', layers: LAYERS } as any);
        const wire = encodeWallSystemType(wallSystemTypeStore.getById(created.id)!);

        expect('function' in wire).toBe(false);

        wallSystemTypeStore.clearCustomTypes();
        wallSystemTypeStore.add(decodeWallSystemType(wire)!);
        // NOT defaulted to 'interior' or 'exterior'. L-285: undefined means the type
        // does not say, and the drawing leaves the pen unmodulated.
        expect(wallSystemTypeStore.getById(created.id)!.function).toBeUndefined();
    });

    it('built-in types are NOT written to the snapshot (they come back from code)', () => {
        const snapshot = wallSystemTypeStore.getAll()
            .filter(t => !wallSystemTypeStore.isBuiltIn(t.id))
            .map(encodeWallSystemType);
        expect(snapshot).toEqual([]);
        expect(wallSystemTypeStore.getById('wt-monolithic')).toBeDefined();
    });

    describe('§CONTEXT-DATA-HONESTY — a malformed record is REPORTED, never repaired', () => {
        it.each([
            ['not an object',   'nope'],
            ['null',            null],
            ['missing id',      { name: 'x', layers: [] }],
            ['empty id',        { id: '', name: 'x', layers: [] }],
            ['missing name',    { id: 'wt-1', layers: [] }],
            ['missing layers',  { id: 'wt-1', name: 'x' }],
            ['layers not array',{ id: 'wt-1', name: 'x', layers: {} }],
        ])('returns null for %s rather than a plausible default', (_label, raw) => {
            expect(decodeWallSystemType(raw)).toBeNull();
        });
    });

    it('decode does not alias the snapshot array (a later store freeze cannot corrupt it)', () => {
        const wire = { id: 'wt-alias', name: 'Alias', layers: LAYERS };
        const decoded = decodeWallSystemType(wire)!;
        expect(decoded.layers).not.toBe(wire.layers);
        expect(decoded.layers).toEqual(wire.layers);
    });
});
