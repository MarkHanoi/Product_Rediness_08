// §FEAT-BALCONY-COMPOUND (L-5600) — the dimension chain, and the founder's numbers.
//
// This is the ONE file that may compare against `BALCONY_DIMENSION_DEFAULTS`, because
// here the DEFAULT is the subject. Everywhere else, comparing a computed value to a
// documented default is the assertion that goes red on a deliberate change and stays
// green on a silently-ignored override (see `BalconyAssembly.test.ts`'s header).

import { describe, expect, it } from 'vitest';
import {
  BALCONY_DIMENSION_DEFAULTS,
  resolveBalconyDimensions,
  type BalconySystemType,
} from '../src/index.js';

const EMPTY = {} as Parameters<typeof resolveBalconyDimensions>[0];

describe('BALCONY_DIMENSION_DEFAULTS — the founder\'s stated defaults', () => {
  it('D-1: 1.00 m along the wall, 0.50 m projection, 1.00 m railing', () => {
    // "initially default of 1 Meter by 0.5 depth. And 1 Meter Hight railing."
    // Pinned literally, in ONE place, so a change to any of the three is a
    // deliberate edit to a named constant rather than a silent drift in a builder.
    expect(BALCONY_DIMENSION_DEFAULTS.width).toBe(1.0);
    expect(BALCONY_DIMENSION_DEFAULTS.projection).toBe(0.5);
    expect(BALCONY_DIMENSION_DEFAULTS.railingHeight).toBe(1.0);
  });

  it('D-2: the plate and finish defaults AGREE with the families they belong to', () => {
    // 0.2 m is the `Slab` schema default AND `ResidentialBuildingExecutor`'s
    // BALCONY_SLAB_THICKNESS_M; 0.015 m is the `Floor` schema default AND
    // DEFAULT_FINISH_THICKNESS_M. Agreeing with the existing family rather than
    // re-deciding for it is the point — a third figure would be the defect.
    expect(BALCONY_DIMENSION_DEFAULTS.slabThickness).toBe(0.2);
    expect(BALCONY_DIMENSION_DEFAULTS.finishThickness).toBe(0.015);
    expect(BALCONY_DIMENSION_DEFAULTS.railDiameter).toBe(0.04);
  });
});

describe('resolveBalconyDimensions — record → systemType → default', () => {
  it('D-3: resolution is TOTAL — an empty record still yields every field', () => {
    const r = resolveBalconyDimensions(EMPTY);
    expect(r).toEqual({ ...BALCONY_DIMENSION_DEFAULTS });
  });

  it('D-4: the SYSTEM TYPE beats the default', () => {
    const french: BalconySystemType = { id: 'french-balcony', projection: 0.12, railingHeight: 1.1 };
    const r = resolveBalconyDimensions(EMPTY, french);
    expect(r.projection).toBe(0.12);
    expect(r.railingHeight).toBe(1.1);
    // ...and leaves the fields it does not pin alone.
    expect(r.width).toBe(BALCONY_DIMENSION_DEFAULTS.width);
  });

  it('D-5: ⭐ the RECORD beats the system type — the override is never ignored', () => {
    // The failure mode a "does it equal the default?" test cannot see: a chain that
    // silently drops the user's explicit value. This is the assertion that catches it.
    const french: BalconySystemType = { id: 'french-balcony', projection: 0.12 };
    const r = resolveBalconyDimensions({ projection: 2.4 } as never, french);
    expect(r.projection).toBe(2.4);
  });

  it('D-6: a ZERO is not "unset" — but the schema refuses it, so the chain never sees one', () => {
    // Every dimensional field on `Balcony` is `.positive()`, so 0 cannot reach here
    // through a parsed record. If it ever does (a hand-built object), `??` treats it
    // as PRESENT and honours it — which is the correct reading of `??` and is pinned
    // so nobody "fixes" it into `||` and silently resurrects the default.
    const r = resolveBalconyDimensions({ projection: 0 } as never);
    expect(r.projection).toBe(0);
  });
});
