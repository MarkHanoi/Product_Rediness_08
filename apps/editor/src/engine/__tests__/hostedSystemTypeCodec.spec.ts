// @vitest-environment happy-dom
//
// §TYPE-SNAPSHOT-CODEC (C65 §3.1 / §5.3) — door/window custom types must
// round-trip the snapshot through ONE codec used by both ProjectSerializer and
// ProjectLoader. This spec proves the round-trip against the REAL stores, and
// carries the POSITIVE CONTROLS C65 §5 demands: the round-trip observably fails
// when the persistence step is omitted, and a malformed / privilege-escalating
// record is refused rather than repaired.

import { describe, it, expect, afterEach } from 'vitest';
import { doorSystemTypeStore } from '@pryzm/geometry-door';
import { windowSystemTypeStore } from '@pryzm/geometry-window';
import {
    encodeHostedSystemType,
    decodeHostedSystemType,
} from '../persistence/hostedSystemTypeCodec';
import { performElementTypeAuthoring } from '../elementTypeAuthoringAdapters';

afterEach(() => {
    doorSystemTypeStore.clearCustomTypes();
    windowSystemTypeStore.clearCustomTypes();
});

function duplicateBuiltIn(family: 'door' | 'window', name: string) {
    const store = family === 'door' ? doorSystemTypeStore : windowSystemTypeStore;
    const source = store.getAll().find(t => t.isBuiltIn)!;
    const { id: _i, isBuiltIn: _b, metadata: _m, ...rest } = structuredClone(source) as any;
    return performElementTypeAuthoring('duplicate', { family, draft: { ...rest, name } })!.created;
}

describe('hostedSystemTypeCodec — round-trip (founder requirement as a test)', () => {
    it.each(['door', 'window'] as const)(
        '%s: authored type → encode → clear → decode → SAME id, name and finishes',
        (family) => {
            const store = family === 'door' ? doorSystemTypeStore : windowSystemTypeStore;
            const created = duplicateBuiltIn(family, `${family} RT Type`);

            // SAVE side — what ProjectSerializer writes for custom types.
            const wire = store.getAll().filter(t => !t.isBuiltIn).map(t => encodeHostedSystemType(t));
            expect(wire).toHaveLength(1);

            // Project close (C13) — custom types wiped.
            store.clearCustomTypes();
            expect(store.getById(created.id)).toBeUndefined();

            // LOAD side — what ProjectLoader restores.
            const decoded = decodeHostedSystemType(wire[0], family)!;
            expect(decoded).not.toBeNull();
            store.add(decoded as any);

            const restored = store.getById(created.id)!;
            expect(restored.name).toBe(`${family} RT Type`);
            expect(restored.isBuiltIn).toBe(false);
            expect(restored.frameFinish).toEqual(created.frameFinish);
        },
    );

    it('POSITIVE CONTROL — without the persistence step the type is GONE after clear', () => {
        const created = duplicateBuiltIn('door', 'Lost Without Snapshot');
        doorSystemTypeStore.clearCustomTypes();
        // No encode/decode ran: the founder's "falls back to default" defect, proven
        // reachable — which is what makes the round-trip test above able to fail.
        expect(doorSystemTypeStore.getById(created.id)).toBeUndefined();
    });
});

describe('decodeHostedSystemType — §CONTEXT-DATA-HONESTY (refuse, never repair)', () => {
    const validDoor = () => encodeHostedSystemType(
        duplicateBuiltIn('door', 'Decode Fixture'),
    );

    it('refuses non-objects, missing id/name, and missing finish slots', () => {
        expect(decodeHostedSystemType(null, 'door')).toBeNull();
        expect(decodeHostedSystemType([], 'door')).toBeNull();
        expect(decodeHostedSystemType({ name: 'x' }, 'door')).toBeNull();
        expect(decodeHostedSystemType({ id: 'dt-x' }, 'door')).toBeNull();

        const noLeaf = validDoor();
        delete (noLeaf as any).leafFinish;
        expect(decodeHostedSystemType(noLeaf, 'door')).toBeNull();
    });

    it('validates per FAMILY — a door-shaped record is not a window type', () => {
        // A door record has leafFinish but no sillFinish; window requires sillFinish.
        expect(decodeHostedSystemType(validDoor(), 'window')).toBeNull();
    });

    it('refuses a present-but-wrong glazingOpacity', () => {
        const bad = validDoor();
        (bad as any).glazingOpacity = 'clear';
        expect(decodeHostedSystemType(bad, 'door')).toBeNull();
    });

    it('FORCES isBuiltIn false — a snapshot cannot smuggle a record into the immutable tier', () => {
        const smuggled = validDoor();
        (smuggled as any).isBuiltIn = true;
        const decoded = decodeHostedSystemType(smuggled, 'door')!;
        expect(decoded.isBuiltIn).toBe(false);
    });

    it('carries ride-along fields verbatim (dimensions, segments, tags)', () => {
        const wire = validDoor();
        const decoded = decodeHostedSystemType(wire, 'door')!;
        expect(decoded.dimensions).toEqual((wire as any).dimensions);
        expect(decoded.defaultSegments).toEqual((wire as any).defaultSegments);
        expect(decoded.tags).toEqual((wire as any).tags);
    });
});
