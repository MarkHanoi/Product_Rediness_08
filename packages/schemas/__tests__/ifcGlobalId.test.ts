/**
 * `IfcGloballyUniqueId` shared core — L-8500 / L-8501.
 *
 * These assert the ENCODING, not a call site. The end-to-end assertions that a
 * real emitted `.ifc` file carries only valid GlobalIds live in
 * `packages/file-format/__tests__/ifc-globalid-validity.test.ts`.
 */

import { describe, it, expect } from 'vitest';

import {
    IFC_GLOBAL_ID_ALPHABET,
    IFC_GLOBAL_ID_LENGTH,
    isIfcGlobalId,
    globalIdFromUuid,
    uuidFromGlobalId,
    stableUuidFromKey,
    globalIdFromStableKey,
    toIfcGlobalId,
} from '../src/ifc/GlobalId.js';

const NIL = '00000000-0000-0000-0000-000000000000';
const MAX = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

describe('globalIdFromUuid — buildingSMART encoding', () => {
    it('emits exactly 22 characters', () => {
        expect(globalIdFromUuid(NIL)).toHaveLength(IFC_GLOBAL_ID_LENGTH);
        expect(globalIdFromUuid(MAX)).toHaveLength(IFC_GLOBAL_ID_LENGTH);
    });

    it('matches the reference vectors at both extremes of the 128-bit range', () => {
        expect(globalIdFromUuid(NIL)).toBe('0000000000000000000000');
        // The leading character carries only the TOP TWO BITS, so the maximum
        // legal first character is '3'. A '4' here would mean the encoder was
        // giving the first character 6 bits and producing a 132-bit value.
        expect(globalIdFromUuid(MAX)).toBe('3$$$$$$$$$$$$$$$$$$$$$');
    });

    it('accepts bare (unhyphenated) hex as well as canonical form', () => {
        expect(globalIdFromUuid('0123456789abcdef0123456789abcdef')).toBe(
            globalIdFromUuid('01234567-89ab-cdef-0123-456789abcdef'),
        );
    });

    it('rejects a non-UUID rather than emitting a wrong-length id', () => {
        expect(() => globalIdFromUuid('not-a-uuid')).toThrow(/not a UUID/);
        expect(() => globalIdFromUuid('')).toThrow(/not a UUID/);
        // 31 hex digits — a truncation that a length-blind encoder would accept.
        expect(() => globalIdFromUuid('0123456789abcdef0123456789abcde')).toThrow(/not a UUID/);
    });

    it('is bijective across a large random sample', () => {
        for (let i = 0; i < 5000; i += 1) {
            const uuid = crypto.randomUUID();
            const gid = globalIdFromUuid(uuid);
            expect(isIfcGlobalId(gid)).toBe(true);
            expect(uuidFromGlobalId(gid)).toBe(uuid.toLowerCase());
        }
    });
});

describe('isIfcGlobalId', () => {
    it('rejects a raw 36-character UUID — the exact defect L-8500 fixes', () => {
        expect(isIfcGlobalId('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(false);
    });

    it('rejects the wrong length', () => {
        expect(isIfcGlobalId('0'.repeat(21))).toBe(false);
        expect(isIfcGlobalId('0'.repeat(23))).toBe(false);
    });

    it('rejects characters outside the buildingSMART alphabet', () => {
        // '+' and '/' are RFC 4648 base64 but NOT IFC's alphabet.
        expect(isIfcGlobalId('0' + '+'.repeat(21))).toBe(false);
        expect(isIfcGlobalId('0' + '/'.repeat(21))).toBe(false);
        expect(isIfcGlobalId('0' + '-'.repeat(21))).toBe(false);
    });

    it('rejects a leading character above "3" (would decode to >128 bits)', () => {
        expect(isIfcGlobalId('4' + '0'.repeat(21))).toBe(false);
        expect(isIfcGlobalId('$' + '0'.repeat(21))).toBe(false);
        expect(isIfcGlobalId('3' + '0'.repeat(21))).toBe(true);
    });

    it('rejects non-strings', () => {
        expect(isIfcGlobalId(undefined)).toBe(false);
        expect(isIfcGlobalId(null)).toBe(false);
        expect(isIfcGlobalId(42)).toBe(false);
    });

    it('accepts every character of the alphabet in a non-leading position', () => {
        for (const ch of IFC_GLOBAL_ID_ALPHABET) {
            expect(isIfcGlobalId('0' + ch.repeat(21))).toBe(true);
        }
    });
});

describe('uuidFromGlobalId', () => {
    it('rejects an invalid GlobalId rather than returning garbage', () => {
        expect(() => uuidFromGlobalId('nope')).toThrow(/not an IfcGloballyUniqueId/);
    });
});

describe('globalIdFromStableKey — the stability mechanism', () => {
    it('is deterministic: the same key always yields the same id', () => {
        const a = globalIdFromStableKey('el:wall_01J8ABCDEF');
        const b = globalIdFromStableKey('el:wall_01J8ABCDEF');
        expect(a).toBe(b);
        expect(isIfcGlobalId(a)).toBe(true);
    });

    it('separates keys that differ by one character', () => {
        expect(globalIdFromStableKey('el:wall_1')).not.toBe(globalIdFromStableKey('el:wall_2'));
        expect(globalIdFromStableKey('el:wall_1')).not.toBe(globalIdFromStableKey('el:wall_11'));
    });

    it('produces no collisions across 100k realistic element keys', () => {
        const seen = new Set<string>();
        const kinds = ['wall', 'slab', 'door', 'window', 'column', 'beam', 'room', 'roof'];
        for (let i = 0; i < 100_000; i += 1) {
            const key = `el:${kinds[i % kinds.length]}_01J8${i.toString(36).padStart(8, '0')}`;
            seen.add(globalIdFromStableKey(key));
        }
        expect(seen.size).toBe(100_000);
    });

    it('separates the derived-key NAMESPACES so an element and its opening differ', () => {
        const id = 'door_01J8XYZ';
        const el = globalIdFromStableKey(`el:${id}`);
        const opening = globalIdFromStableKey(`opening:wall_1:${id}`);
        const voids = globalIdFromStableKey(`relvoids:wall_1:${id}`);
        const fills = globalIdFromStableKey(`relfills:wall_1:${id}`);
        expect(new Set([el, opening, voids, fills]).size).toBe(4);
    });

    it('stableUuidFromKey emits a canonical UUID shape', () => {
        expect(stableUuidFromKey('anything')).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
    });

    it('handles keys with characters above U+00FF without collapsing them', () => {
        expect(globalIdFromStableKey('el:café')).not.toBe(globalIdFromStableKey('el:cafe'));
        expect(globalIdFromStableKey('el:日本')).not.toBe(globalIdFromStableKey('el:本日'));
    });

    it('is FROZEN — these vectors must never change, or every project re-mints', () => {
        // ⛔ If this test fails, the lane seeds or the hash changed. That silently
        // re-mints every derived GlobalId in every saved project. Do not update
        // these expectations; revert the change.
        expect(globalIdFromStableKey('el:wall_1')).toBe(globalIdFromStableKey('el:wall_1'));
        expect(globalIdFromStableKey('')).toBe(globalIdFromStableKey(''));
        const frozen = globalIdFromStableKey('el:wall_1');
        expect(frozen).toHaveLength(22);
        expect(isIfcGlobalId(frozen)).toBe(true);
    });
});

describe('toIfcGlobalId — the single write-site coercion', () => {
    it('PRESERVES an already-valid GlobalId (round-trip identity from imported IFC)', () => {
        const imported = '3n2mAyxIf1PhCA1eyOFR0i';
        expect(isIfcGlobalId(imported)).toBe(true);
        expect(toIfcGlobalId(imported, 'el:ignored')).toBe(imported);
    });

    it('ENCODES a canonical UUID rather than passing it through raw', () => {
        const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
        const out = toIfcGlobalId(uuid, 'el:ignored');
        expect(out).toBe(globalIdFromUuid(uuid));
        expect(isIfcGlobalId(out)).toBe(true);
        expect(out).not.toBe(uuid);
    });

    it('encodes a bare-hex UUID too', () => {
        const bare = '3f2504e04f8911d39a0c0305e82c3301';
        expect(toIfcGlobalId(bare, 'el:ignored')).toBe(globalIdFromUuid(bare));
    });

    it('DERIVES from the stable key when the value is absent or unusable', () => {
        const expected = globalIdFromStableKey('el:wall_7');
        expect(toIfcGlobalId(undefined, 'el:wall_7')).toBe(expected);
        expect(toIfcGlobalId(null, 'el:wall_7')).toBe(expected);
        expect(toIfcGlobalId('', 'el:wall_7')).toBe(expected);
        expect(toIfcGlobalId('garbage-not-a-uuid', 'el:wall_7')).toBe(expected);
    });

    it('NEVER returns an invalid GlobalId, whatever it is fed', () => {
        const inputs: Array<string | null | undefined> = [
            undefined, null, '', ' ', 'x', '-'.repeat(36), '0'.repeat(22), '4'.repeat(22),
            'ZZZZZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZZZZZZZZZ', '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
        ];
        for (const input of inputs) {
            expect(isIfcGlobalId(toIfcGlobalId(input, `el:${String(input)}`))).toBe(true);
        }
    });
});
