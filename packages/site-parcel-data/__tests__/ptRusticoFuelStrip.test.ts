// §PT-RUSTICO-FUEL-STRIP — DL 82/2021 art. 61.º, pinned.
//
// ⭐ THE PROPERTY THAT MATTERS: a `null` input NEVER becomes a verdict. Doctrine §0.2 — any
// parameter at `unresolved` BLOCKS the envelope — and the whole reason this module can be trusted
// on rustic land is that "nobody asked about forest proximity" refuses instead of granting.

import { describe, it, expect } from 'vitest';
import type { Pt } from '@pryzm/schemas';
import {
    PT_DL82_ART61_STRIP_M,
    evaluatePtRusticoFuelStrip,
    type PtRusticoFuelStripInput,
} from '../src/countryAdapters/pt/ptRusticoFuelStrip.js';

/** A square of side `s` metres, centred on the origin, in scene-XZ. */
function square(s: number): Pt[] {
    const h = s / 2;
    return [
        { x: -h, z: -h },
        { x: h, z: -h },
        { x: h, z: h },
        { x: -h, z: h },
    ];
}

const BINDING: Omit<PtRusticoFuelStripInput, 'parcelRing'> = {
    isSoloRustico: true,
    inAglomeradoRural: false,
    forestOrWithin50m: true,
};

describe('§PT-RUSTICO-FUEL-STRIP — the applicability gates, in the article’s own order', () => {
    it('solo urbano ⇒ not-applicable, with the clause named', () => {
        const r = evaluatePtRusticoFuelStrip({ ...BINDING, isSoloRustico: false, parcelRing: square(400) });
        expect(r.kind).toBe('not-applicable');
        if (r.kind === 'not-applicable') expect(r.why).toContain('SOLO RÚSTICO');
    });

    it('inside an aglomerado rural ⇒ not-applicable', () => {
        const r = evaluatePtRusticoFuelStrip({ ...BINDING, inAglomeradoRural: true, parcelRing: square(400) });
        expect(r.kind).toBe('not-applicable');
    });

    it('neither in nor within 50 m of forest ⇒ not-applicable, and says it answers nothing else', () => {
        const r = evaluatePtRusticoFuelStrip({ ...BINDING, forestOrWithin50m: false, parcelRing: square(400) });
        expect(r.kind).toBe('not-applicable');
        if (r.kind === 'not-applicable') expect(r.why).toContain('municipal envelope');
    });
});

describe('⛔ a `null` input BLOCKS the envelope — it never becomes a verdict', () => {
    it.each([
        ['isSoloRustico', { isSoloRustico: null }],
        ['inAglomeradoRural', { inAglomeradoRural: null }],
        ['forestOrWithin50m', { forestOrWithin50m: null }],
    ] as ReadonlyArray<readonly [string, Partial<PtRusticoFuelStripInput>]>)(
        '%s = null ⇒ unresolved + a citation',
        (_name, patch) => {
            const r = evaluatePtRusticoFuelStrip({ ...BINDING, ...patch, parcelRing: square(400) });
            expect(r.kind).toBe('unresolved');
            if (r.kind !== 'unresolved') return;
            expect(r.refusalReason.length).toBeGreaterThan(40);
            expect(r.ordinanceRef).toContain('82/2021');
        },
    );

    it('the forest refusal says WHY a default would be dangerous, not just that it is missing', () => {
        const r = evaluatePtRusticoFuelStrip({
            ...BINDING,
            forestOrWithin50m: null,
            parcelRing: square(400),
        });
        expect(r.kind).toBe('unresolved');
        if (r.kind === 'unresolved') {
            expect(r.refusalReason).toContain('the fire regime may forbid');
            // And it names the missing source rather than shrugging.
            expect(r.refusalReason).toContain('SGIFR/ICNF');
        }
    });

    it('no geometry ⇒ unresolved (doctrine §12 step 1), not an empty ring', () => {
        const r = evaluatePtRusticoFuelStrip({ ...BINDING, parcelRing: [{ x: 0, z: 0 }] });
        expect(r.kind).toBe('unresolved');
        if (r.kind === 'unresolved') expect(r.refusalReason).toContain('A1 unresolved');
    });
});

describe('the 50 m negative buffer', () => {
    it('⛔ a parcel no point of which is > 50 m from a boundary is REFUSED, legally grounded', () => {
        // A 90 m square: every point is within 45 m of a boundary, so a 50 m erosion is empty.
        const r = evaluatePtRusticoFuelStrip({ ...BINDING, parcelRing: square(90) });
        expect(r.kind).toBe('refused-empty');
        if (r.kind !== 'refused-empty') return;
        expect(r.stripM).toBe(PT_DL82_ART61_STRIP_M);
        expect(r.refusalReason).toContain('consumes this parcel entirely');
        expect(r.ordinanceRef).toContain('art. 61');
    });

    it('a large parcel yields an OUTER BOUND whose ring is the parcel eroded by 50 m', () => {
        const r = evaluatePtRusticoFuelStrip({ ...BINDING, parcelRing: square(400) });
        expect(r.kind).toBe('outer-bound');
        if (r.kind !== 'outer-bound') return;
        // 400 − 2×50 = 300 m square. Check the extent rather than vertex order.
        const xs = r.ring.map((p) => p.x);
        const zs = r.ring.map((p) => p.z);
        expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(300, 3);
        expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(300, 3);
    });

    it('⛔ the statutory default is FLAGGED as possibly overstating (the ±50 % problem, L-616)', () => {
        const r = evaluatePtRusticoFuelStrip({ ...BINDING, parcelRing: square(400) });
        expect(r.kind).toBe('outer-bound');
        if (r.kind !== 'outer-bound') return;
        // A Programa Sub-regional may WIDEN the strip by up to 50 %, in which case a 50 m
        // erosion is too generous — the one direction C58 §1.4 forbids.
        expect(r.stripBasis).toBe('statutory-default-unverified');
        expect(r.mayOverstate).toBe(true);
        expect(r.watch).toContain('Despacho 675/2026');
    });

    it('⭐ supplying the Programa Sub-regional width clears the flag — the escape hatch (L-942)', () => {
        const wider = evaluatePtRusticoFuelStrip({
            ...BINDING,
            parcelRing: square(400),
            subRegionalStripM: 75, // +50 %
        });
        expect(wider.kind).toBe('outer-bound');
        if (wider.kind !== 'outer-bound') return;
        expect(wider.stripBasis).toBe('sub-regional-programme');
        expect(wider.mayOverstate).toBe(false);
        const xs = wider.ring.map((p) => p.x);
        expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(250, 3); // 400 − 2×75
    });

    it('a WIDER programme can turn an outer bound into a refusal — which is the point of the flag', () => {
        // 220 m square: clears 50 m (120 m residue) but NOT 75 m and not 110 m.
        const at50 = evaluatePtRusticoFuelStrip({ ...BINDING, parcelRing: square(220) });
        expect(at50.kind).toBe('outer-bound');
        const at110 = evaluatePtRusticoFuelStrip({
            ...BINDING,
            parcelRing: square(220),
            subRegionalStripM: 110,
        });
        expect(at110.kind).toBe('refused-empty');
    });

    it('every outcome carries the article — a value without its citation is a bug, not a parameter', () => {
        const cases: PtRusticoFuelStripInput[] = [
            { ...BINDING, parcelRing: square(400) },
            { ...BINDING, parcelRing: square(90) },
            { ...BINDING, forestOrWithin50m: null, parcelRing: square(400) },
        ];
        for (const c of cases) {
            const r = evaluatePtRusticoFuelStrip(c);
            if (r.kind === 'not-applicable') continue;
            expect(r.ordinanceRef).toContain('Decreto-Lei n.º 82/2021');
        }
    });
});
