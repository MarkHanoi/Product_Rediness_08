// §FURNISH-DROP-SURFACING — the dropped furnish stage must reach the RESULT.
//
// Production observed (founder, 2026-08-12): `[lighting-layout] §CHAIN-TIMEOUT
// — no furnish.layout-executed within 12000 ms — firing lighting anyway.` The
// user saw a finished-looking building with ZERO furniture and NO warning. The
// console.warn already existed and the user still saw nothing — a log line is
// not surfacing. The fact must reach the RETURNED RESULT (C75 §1.2:
// COMPUTED and INFERRED are never merged; C75 §1.4: UNKNOWN is a value WITH
// A REASON).
//
// Written RED-FIRST (C70 §5.6): these tests assert an API that does not exist
// yet — `describeLightingBasis` / the `basis` field on LightingCommandSet —
// and MUST fail against shipped code before the fix lands. None of the
// fixtures supply the value under test (C74 §3.4): the basis strings are
// produced by the unit, not fed to it.

import { describe, expect, it } from 'vitest';
import { buildLightingCommands } from '../src/workflows/lightingLayout/buildLightingCommands.js';
import {
    resolveLightingBasis,
    type FurnishStageOutcome,
} from '../src/workflows/lightingLayout/lightingBasis.js';
import type { PlacedLight } from '../src/workflows/lightingLayout/types.js';

const PLACED: readonly PlacedLight[] = [
    { kind: 'pendant', origin: { x: 1, y: 2.7, z: 2 }, roomId: 'r1', ceilingMounted: true },
];

// ─── The three furnish outcomes that must NOT render identically ─────────────

/** Furnish genuinely completed and placed items. */
const FURNISHED: FurnishStageOutcome = {
    state: 'completed',
    placedCount: 24,
    roomCount: 6,
};

/** Furnish completed and legitimately placed nothing (e.g. all corridors). */
const FURNISHED_EMPTY: FurnishStageOutcome = {
    state: 'completed',
    placedCount: 0,
    roomCount: 3,
};

/** Furnish NEVER completed — the §CHAIN-TIMEOUT fallback fired. */
const DROPPED: FurnishStageOutcome = {
    state: 'dropped',
    reason: 'no furnish.layout-executed within 12000 ms (§CHAIN-TIMEOUT fallback fired)',
};

describe('resolveLightingBasis — three furnish outcomes, three distinct answers', () => {
    it('a completed furnish yields basis "furnished"', () => {
        const b = resolveLightingBasis(FURNISHED);
        expect(b.basis).toBe('furnished');
        expect(b.disclosure).toBe(null);
    });

    it('a completed-but-empty furnish yields basis "furnished" — zero items is an ANSWER, not a drop', () => {
        const b = resolveLightingBasis(FURNISHED_EMPTY);
        expect(b.basis).toBe('furnished');
        // The disclosure names the zero explicitly so downstream renders
        // "furnished, 0 items" and never a bare success.
        expect(b.disclosure).toMatch(/0 item/);
    });

    it('a DROPPED furnish yields basis "unfurnished" WITH the drop reason (C75 §1.4)', () => {
        const b = resolveLightingBasis(DROPPED);
        expect(b.basis).toBe('unfurnished');
        expect(b.disclosure).toBeTruthy();
        // The reason must carry the stage that was dropped and why —
        // never a generic "warning".
        expect(b.disclosure).toMatch(/furnish/i);
        expect(b.disclosure).toMatch(/§CHAIN-TIMEOUT|never completed|within 12000 ms/);
    });

    it('an ABSENT outcome (nothing known about furnish at all) is its own state, not a silent pass (C70 §2.2)', () => {
        const b = resolveLightingBasis(undefined);
        expect(b.basis).toBe('unfurnished');
        expect(b.disclosure).toBeTruthy();
        expect(b.disclosure).toMatch(/unknown|no furnish outcome|not reported/i);
    });

    it('the three outcomes never collapse into the same rendering (C75 §1.2)', () => {
        const a = resolveLightingBasis(FURNISHED);
        const b = resolveLightingBasis(FURNISHED_EMPTY);
        const c = resolveLightingBasis(DROPPED);
        const render = (x: { basis: string; disclosure: string | null }): string =>
            `${x.basis}::${x.disclosure ?? ''}`;
        expect(render(a)).not.toBe(render(c));
        expect(render(b)).not.toBe(render(c));
        expect(render(a)).not.toBe(render(b)); // "0 items" is disclosed, not blank
    });
});

describe('buildLightingCommands — the command set CARRIES the basis', () => {
    it('a set built over a DROPPED furnish is stamped computed-without-furniture', () => {
        const set = buildLightingCommands(PLACED, 'L0', () => 'light_0', DROPPED);
        expect(set.basis).toBe('unfurnished');
        expect(set.basisDisclosure).toBeTruthy();
        expect(set.basisDisclosure).toMatch(/furnish/i);
    });

    it('a set built over a COMPLETED furnish reads furnished — and differs from the dropped stamp', () => {
        const dropped = buildLightingCommands(PLACED, 'L0', () => 'light_0', DROPPED);
        const furnished = buildLightingCommands(PLACED, 'L0', () => 'light_1', FURNISHED);
        expect(furnished.basis).toBe('furnished');
        expect(furnished.basis).not.toBe(dropped.basis);
    });

    it('omitting the outcome does NOT default to furnished (UNPROVEN is not a pass, C70 §2.2)', () => {
        const set = buildLightingCommands(PLACED, 'L0', () => 'light_0');
        expect(set.basis).toBe('unfurnished');
        expect(set.basisDisclosure).toBeTruthy();
    });

    it('the commands themselves are unchanged by the stamp — surfacing, not behaviour change', () => {
        const withStamp = buildLightingCommands(PLACED, 'L0', () => 'light_0', DROPPED);
        const legacy = buildLightingCommands(PLACED, 'L0', () => 'light_0', FURNISHED);
        expect(withStamp.commands).toEqual(legacy.commands);
        expect(withStamp.totalElementCount).toBe(1);
    });
});
