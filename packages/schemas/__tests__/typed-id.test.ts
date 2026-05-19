import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  createId,
  isId,
  parseId,
  unbrand,
  type WallId,
  type SlabId,
  type DoorId,
} from '../src/index.js';

describe('createId: runtime', () => {
  it('produces a `<prefix>_<26-char ULID>` shape', () => {
    const id = createId('wall');
    expect(id).toMatch(/^wall_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('accepts an explicit ULID for deterministic fixtures', () => {
    const id = createId('slab', '01H8XK3J7M9N2P4QR5STVW6XYZ');
    expect(id).toBe('slab_01H8XK3J7M9N2P4QR5STVW6XYZ');
  });

  it('rejects an invalid explicit ULID', () => {
    expect(() => createId('door', 'not-a-ulid')).toThrow(/Crockford-base32 ULID/);
  });

  it('different prefixes produce different ID values', () => {
    const w = createId('wall', '01H8XK3J7M9N2P4QR5STVW6XYZ');
    const s = createId('slab', '01H8XK3J7M9N2P4QR5STVW6XYZ');
    expect(w).not.toBe(s);
  });
});

describe('isId / parseId / unbrand', () => {
  it('isId narrows to the requested prefix', () => {
    const w = createId('wall');
    expect(isId(w, 'wall')).toBe(true);
    expect(isId(w, 'slab')).toBe(false);
    expect(isId(123, 'wall')).toBe(false);
    expect(isId('not_an_id', 'wall')).toBe(false);
    expect(isId('wall_TOO-SHORT', 'wall')).toBe(false);
  });

  it('parseId returns prefix + ulid for valid ids', () => {
    const id = createId('door', '01H8XK3J7M9N2P4QR5STVW6XYZ');
    const parts = parseId(id);
    expect(parts).toEqual({ prefix: 'door', ulid: '01H8XK3J7M9N2P4QR5STVW6XYZ' });
  });

  it('parseId returns null for malformed input', () => {
    expect(parseId('no-underscore-anywhere')).toBeNull();
    expect(parseId('_starts-with-underscore')).toBeNull();
    expect(parseId('wall_short')).toBeNull();
  });

  it('unbrand strips the brand at the type level (runtime no-op)', () => {
    const id = createId('window');
    const raw = unbrand(id);
    expect(raw).toBe(id);
    // Compile-time: `raw` is `string`, not `WindowId` (assignability is now lax).
    const _stringSlot: string = raw;
    expect(_stringSlot).toBe(id);
  });
});

describe('typed-ID brands: compile-time guards', () => {
  it('different prefixes produce mutually-incompatible types', () => {
    expectTypeOf(createId('wall')).toEqualTypeOf<WallId>();
    expectTypeOf(createId('slab')).toEqualTypeOf<SlabId>();
    expectTypeOf(createId('door')).toEqualTypeOf<DoorId>();

    // The following two assertions are the heart of the deliverable: the
    // type-system MUST reject cross-assignment between branded IDs.
    const wall: WallId = createId('wall');
    const slab: SlabId = createId('slab');

    // @ts-expect-error A SlabId is not assignable to a WallId.
    const wrong1: WallId = slab;
    // @ts-expect-error A WallId is not assignable to a SlabId.
    const wrong2: SlabId = wall;

    void wrong1;
    void wrong2;

    // A raw string is not assignable to a branded ID either.
    // @ts-expect-error Unbranded strings cannot become typed IDs.
    const wrong3: WallId = 'wall_01H8XK3J7M9N2P4QR5STVW6XYZ';
    void wrong3;
  });

  it('createId requires a known element prefix', () => {
    // @ts-expect-error 'banana' is not a registered element type.
    createId('banana');
    expect(true).toBe(true);
  });
});
