// §CWPROPS152 — CurtainWallParameterFamily grammar tests.
//
// ⚠ Run STANDALONE against the exported `parseCurtainWallParameterIntent`
// function — NOT through `resolveUtterance` / `resolveNaturalLanguage` (the
// real chat ladder), because this grammar is not wired into
// `ZeroTokenResolver.ts` / `CapabilityExecutionSpec.ts` / `ChatCapabilityRegistry.ts`
// yet (all three were DIRTY, mid-edit by a concurrent lane, at the time this
// grammar was written — see the module's own header). This mirrors
// §RACORIENT145's own isolation pattern for exactly the same reason.
//
// Pins the founder's four literal example sentences (verbatim from the
// brief), plus the grammar's own declared boundaries: multi-parameter
// sentences are not claimed, a bare sentence with no scope signal at all is
// not claimed, and the value is always read in METRES.

import { describe, it, expect } from 'vitest';
import { parseCurtainWallParameterIntent } from '../src/intents/CurtainWallParameterFamily';

describe('§CWPROPS152 — the founder\'s four literal example sentences', () => {
    it('"make mullion size of all curtain walls in ground level to 0.06 meters" — PARSES', () => {
        const r = parseCurtainWallParameterIntent('make mullion size of all curtain walls in ground level to 0.06 meters');
        expect(r).not.toBeNull();
        expect(r!.parameter).toBe('mullionSize');
        expect(r!.value).toBeCloseTo(0.06, 6);
        expect(r!.scope).toEqual({ kind: 'level', levelQuery: 'ground level' });
    });

    it('"set post spacing to 1.2 on the west facade" — PARSES', () => {
        const r = parseCurtainWallParameterIntent('set post spacing to 1.2 on the west facade');
        expect(r).not.toBeNull();
        expect(r!.parameter).toBe('gridXSpacing');
        expect(r!.value).toBeCloseTo(1.2, 6);
        expect(r!.scope).toEqual({ kind: 'orientation', orientation: 'W' });
    });

    it('"change panel thickness of all curtain walls to 0.024" — PARSES', () => {
        const r = parseCurtainWallParameterIntent('change panel thickness of all curtain walls to 0.024');
        expect(r).not.toBeNull();
        expect(r!.parameter).toBe('panelThickness');
        expect(r!.value).toBeCloseTo(0.024, 6);
        expect(r!.scope).toBe('all');
    });

    it('"set transom spacing to 4 m on level 3" — PARSES', () => {
        const r = parseCurtainWallParameterIntent('set transom spacing to 4 m on level 3');
        expect(r).not.toBeNull();
        expect(r!.parameter).toBe('gridYSpacing');
        expect(r!.value).toBeCloseTo(4, 6);
        expect(r!.scope).toEqual({ kind: 'level', levelQuery: '3' });
    });
});

describe('§CWPROPS152 — the founder\'s own verbatim wording (with "to")', () => {
    it('"Make mullion size of all curtain walls in ground level to 0.06 meters" (capitalised, exact quote)', () => {
        const r = parseCurtainWallParameterIntent('Make mullion size of all curtain walls in ground level to 0.06 meters');
        expect(r).not.toBeNull();
        expect(r!.parameter).toBe('mullionSize');
        expect(r!.value).toBeCloseTo(0.06, 6);
    });
});

describe('§CWPROPS152 — shape 2 (noun-first)', () => {
    it('"set all curtain walls post spacing to 1.5" parses', () => {
        const r = parseCurtainWallParameterIntent('set all curtain walls post spacing to 1.5');
        expect(r).not.toBeNull();
        expect(r!.parameter).toBe('gridXSpacing');
        expect(r!.value).toBeCloseTo(1.5, 6);
        expect(r!.scope).toBe('all');
    });

    it('"set every curtain wall mullion size to 0.03" parses (singular noun, "every")', () => {
        const r = parseCurtainWallParameterIntent('set every curtain wall mullion size to 0.03');
        expect(r).not.toBeNull();
        expect(r!.parameter).toBe('mullionSize');
        expect(r!.value).toBeCloseTo(0.03, 6);
    });

    it('"set these curtain walls panel thickness to 0.02" — the SELECTION form', () => {
        const r = parseCurtainWallParameterIntent('set these curtain walls panel thickness to 0.02');
        expect(r).not.toBeNull();
        expect(r!.scope).toBe('selection');
    });
});

describe('§CWPROPS152 — units', () => {
    it('explicit millimetres convert to metres', () => {
        const r = parseCurtainWallParameterIntent('change all curtain walls mullion size to 60mm');
        expect(r).not.toBeNull();
        expect(r!.value).toBeCloseTo(0.06, 6);
    });

    it('explicit centimetres convert to metres', () => {
        const r = parseCurtainWallParameterIntent('change all curtain walls mullion size to 6cm');
        expect(r).not.toBeNull();
        expect(r!.value).toBeCloseTo(0.06, 6);
    });

    it('a BARE number is read as METRES (the schema\'s native unit) — never silently as millimetres', () => {
        const r = parseCurtainWallParameterIntent('change all curtain walls mullion size to 0.06');
        expect(r).not.toBeNull();
        expect(r!.value).toBeCloseTo(0.06, 6); // NOT 0.00006 (mm-as-m) or 60 (mm literal)
    });
});

describe('§CWPROPS152 — deliberately NOT claimed', () => {
    it('a completely bare sentence with NO scope word/noun AND no spatial tail is not claimed', () => {
        expect(parseCurtainWallParameterIntent('set mullion size to 0.06')).toBeNull();
    });

    it('two DIFFERENT parameters in one sentence are not claimed (no silent winner)', () => {
        const r = parseCurtainWallParameterIntent(
            'set all curtain walls mullion size to 0.06 and panel thickness to 0.02',
        );
        expect(r).toBeNull();
    });

    it('an unknown attribute word is simply not recognised (falls through, never a guess)', () => {
        expect(parseCurtainWallParameterIntent('make all curtain walls glazing tint to 0.5')).toBeNull();
    });

    it('a wall-dimension sentence ("height") is not swallowed by this grammar', () => {
        expect(parseCurtainWallParameterIntent('make all curtain walls 5 meters height')).toBeNull();
    });
});

describe('§CWPROPS152 — level / room / orientation via the shared SpatialScopeTail (no second scope-tail spelling)', () => {
    it('"on level 2" resolves to a LEVEL scope', () => {
        const r = parseCurtainWallParameterIntent('set all curtain walls mullion size to 0.05 on level 2');
        expect(r).not.toBeNull();
        expect(r!.scope).toEqual({ kind: 'level', levelQuery: '2' });
    });

    it('"in the kitchen" (no level noun) resolves to a ROOM scope', () => {
        const r = parseCurtainWallParameterIntent('set all curtain walls mullion size to 0.05 in the kitchen');
        expect(r).not.toBeNull();
        expect(r!.scope).toEqual({ kind: 'room', roomRef: 'kitchen' });
    });

    it('"selected curtain walls ... on level 2" is NOT claimed — a spatial phrase composes with ALL only', () => {
        const r = parseCurtainWallParameterIntent('set selected curtain walls mullion size to 0.05 on level 2');
        expect(r).toBeNull();
    });
});

describe('§CWPROPS152 — grammar coverage: every constraints-module key has a spoken form', () => {
    it('parses each of the four keys via its primary spoken form', () => {
        expect(parseCurtainWallParameterIntent('change all curtain walls mullion size to 0.05')!.parameter).toBe('mullionSize');
        expect(parseCurtainWallParameterIntent('change all curtain walls panel thickness to 0.02')!.parameter).toBe('panelThickness');
        expect(parseCurtainWallParameterIntent('change all curtain walls post spacing to 1.5')!.parameter).toBe('gridXSpacing');
        expect(parseCurtainWallParameterIntent('change all curtain walls transom spacing to 5')!.parameter).toBe('gridYSpacing');
    });
});
