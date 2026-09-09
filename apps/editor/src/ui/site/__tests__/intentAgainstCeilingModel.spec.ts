/**
 * §26.6 rule 3 (L-13046, founder 2026-09-07) — EVERY INTENT SITS BESIDE ITS CEILING AND CAN NEVER
 * EXCEED IT. *"Can never go beyond"* is a REFUSAL with both numbers, never a clamp.
 *
 * ⭐ The founder's model sentence is pinned VERBATIM through the ONE generalised producer, and every
 * pair's refusal is asserted to carry the intent, the ceiling and the difference — with the intent
 * left untouched on the model.
 */

import { describe, expect, it } from 'vitest';
import { beyondCeilingStatement, buildBrutAllocation, resolveBrutAllowance } from '../brutAreaAllocation';
import type { IntendedAreaSnapshot } from '../intendedAreaChannel';
import { buildIntentAgainstCeiling, CEILING_LABEL, INTENT_REFUSAL_CONSEQUENCE } from '../intentAgainstCeilingModel';
import { buildParcelLawModel } from '../parcel/parcelLawModel';

const RECT = [{ x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 30 }, { x: 0, z: 30 }];

function envelope(over: Record<string, unknown> = {}): never {
    return {
        insetPolygon: [{ x: 3, z: 3 }, { x: 37, z: 3 }, { x: 37, z: 27 }, { x: 3, z: 27 }],
        insetAreaM2: 431, maxHeight_m: 9, farLimitedHeight_m: null, maxFloors: 3, maxFAR: null,
        maxCoverage: null, maxVolumeM3: 3879, footprintIsUpperBound: false, confidence: 'structured',
        granularity: 'parcel', status: 'ok', refusal: null, zoneCode: 'R1',
        derivation: [{ constraint: 'setback.front', value: 3, source: 'pack', ordinanceRef: 'Art. 1', fieldProvenance: 'published-structured' }],
        caveats: [], tiers: [], permittedUse: [], ...over,
    } as never;
}

const law = (over: Record<string, unknown> = {}) =>
    buildParcelLawModel({ parcelRing: RECT, edgeClassifications: undefined, identity: null, envelope: envelope(over) });

/**
 * ⛔⛔ §BASE-OFFSET-IS-ABSOLUTE (L-13286) — `baseOffsetM` DEFAULTS TO THE STOREY'S ELEVATION,
 * because that is literally what the production producer writes:
 * `baseOffset: level.elevation` (`envelopeAuthoringPlan.ts:658`).
 *
 * ⭐ THIS LINE USED TO BE A HARD-CODED `baseOffsetM: 0`, AND THAT IS WHY EVERY TEST BELOW WAS
 * GREEN WHILE THE PANEL PRINTED 39.0 m FOR A 21 m BUILDING. A fixture that seats every storey at
 * zero cannot tell `elevation + baseOffset` apart from `baseOffset`: the two expressions agree
 * for exactly the one value the real system never produces. The suite was not measuring the
 * production frame — it was measuring a frame invented by its own helper
 * ([[fake-more-capable-than-real]]).
 *
 * `baseOffsetM` may still be overridden per level to cover the storey-with-no-envelope arm.
 */
function snapshot(levels: readonly {
    id: string; name: string; elevation: number | null; areaM2: number; heightM: number | null;
    baseOffsetM?: number | null;
}[]): IntendedAreaSnapshot {
    return {
        readable: true,
        byLevel: levels.map((l) => ({
            levelId: l.id, name: l.name, elevation: l.elevation, levelEnvelopeCount: 1,
            intendedAreaM2: l.areaM2, heightM: l.heightM,
            baseOffsetM: l.baseOffsetM === undefined ? l.elevation : l.baseOffsetM,
            rooms: [], roomsSubtotalM2: 0,
        })),
        roomEnvelopeCount: 0, roomsOnStoreysWithoutLevel: 0, skippedCount: 0,
        totalIntendedM2: levels.length === 0 ? null : levels.reduce((s, l) => s + l.areaM2, 0),
    };
}

describe('§26.6 rule 3 — the founder\'s sentence is THE producer, generalised', () => {
    it('⭐ reproduces his example byte for byte: 875 asked, 431 permitted, 444 less, nothing allocated', () => {
        expect(beyondCeilingStatement({
            label: 'Ground', asked: 875, ceiling: 431, unit: 'm²', dp: 0,
            ceilingClause: 'no storey may overhang the buildable footprint', consequence: 'Nothing was allocated here.',
        })).toBe('Ground: you asked for 875 m², but no storey may overhang the buildable footprint, which is 431 m² — 444 m² less than you asked for. Nothing was allocated here.');
    });

    it('⛔ the allocation still prints EXACTLY that sentence through the same producer — nothing was replaced', () => {
        const allowance = resolveBrutAllowance({ permittedFootprintM2: 431, maxFAR: null, parcelAreaM2: 1200, maxFloors: 3 });
        const model = buildBrutAllocation(
            allowance,
            [{ levelId: 'L0', name: 'Ground', elevation: 0 }],
            [{ levelId: 'L0', requestedM2: 875 }],
        );
        expect(model.rows[0]!.statement).toBe('Ground: you asked for 875 m², but no storey may overhang the buildable footprint, which is 431 m² — 444 m² less than you asked for. Nothing was allocated here.');
        // …and it was REFUSED, not clipped: nothing allocated, the request kept as typed.
        expect(model.rows[0]!.allocatedM2).toBeNull();
        expect(model.rows[0]!.requestedM2).toBe(875);
    });

    it('speaks heights in the same voice, to one decimal', () => {
        expect(beyondCeilingStatement({
            label: 'Total height', asked: 12, ceiling: 9, unit: 'm', dp: 1,
            ceilingClause: 'no building may rise above the maximum height', consequence: INTENT_REFUSAL_CONSEQUENCE,
        })).toBe(`Total height: you asked for 12.0 m, but no building may rise above the maximum height, which is 9.0 m — 3.0 m less than you asked for. ${INTENT_REFUSAL_CONSEQUENCE}`);
    });
});

describe('§26.6.3 — 3.1 levels and heights, beside their ceilings', () => {
    it('total height beside Maximum height, WITHIN, measured top-of-highest to base-of-lowest', () => {
        const m = buildIntentAgainstCeiling(snapshot([
            { id: 'L0', name: 'Ground', elevation: 0, areaM2: 300, heightM: 3 },
            { id: 'L1', name: 'First', elevation: 3, areaM2: 300, heightM: 3 },
        ]), law());
        if (!m.readable) throw new Error('readable expected');
        expect(m.totalHeight).toMatchObject({ intent: 6, ceiling: 9, unit: 'm', ceilingLabel: CEILING_LABEL.height, ceilingSubject: 'height' });
        expect(m.totalHeight.verdict.kind).toBe('within');
        expect(m.totalHeight.verdict.sentence).toContain('6.0 m of the 9.0 m');
        expect(m.totalHeight.verdict.sentence).toContain('3.0 m in hand');
        expect(m.totalHeightBasis).toContain('top of the highest');
        expect(m.levels).toMatchObject({ intent: 2, ceiling: 3, unit: 'storeys' });
        expect(m.levels.verdict.kind).toBe('within');
        expect(m.heightsPerLevel.map((h) => h.heightM)).toEqual([3, 3]);
    });

    it('⛔ EXCEEDS — refused with both numbers and the difference; the intent is NOT trimmed on the model', () => {
        const m = buildIntentAgainstCeiling(snapshot([
            { id: 'L0', name: 'Ground', elevation: 0, areaM2: 300, heightM: 4 },
            { id: 'L1', name: 'First', elevation: 4, areaM2: 300, heightM: 4 },
            { id: 'L2', name: 'Second', elevation: 8, areaM2: 300, heightM: 4 },
            { id: 'L3', name: 'Third', elevation: 12, areaM2: 300, heightM: 4 },
        ]), law());
        if (!m.readable) throw new Error('readable expected');
        expect(m.totalHeight.intent).toBe(16);
        expect(m.totalHeight.verdict.kind).toBe('exceeds');
        expect(m.totalHeight.verdict.sentence).toBe(
            `Total height: you asked for 16.0 m, but no building may rise above the maximum height, which is 9.0 m — 7.0 m less than you asked for. ${INTENT_REFUSAL_CONSEQUENCE}`,
        );
        expect(m.levels.verdict.kind).toBe('exceeds');
        expect(m.levels.verdict.sentence).toContain('you asked for 4 storeys');
        expect(m.levels.verdict.sentence).toContain('which is 3 storeys');
        expect(m.levels.verdict.sentence).toContain('1 storeys less');
    });

    it('a ceiling the pack did not derive reads as NOT CHECKABLE — never a pass, never a fail', () => {
        const m = buildIntentAgainstCeiling(snapshot([{ id: 'L0', name: 'Ground', elevation: 0, areaM2: 300, heightM: 3 }]), law({ maxHeight_m: null, maxFloors: null }));
        if (!m.readable) throw new Error('readable expected');
        expect(m.totalHeight.ceiling).toBeNull();
        expect(m.totalHeight.verdict.kind).toBe('ceiling-not-derived');
        expect(m.totalHeight.verdict.sentence).toContain('you asked for 3.0 m');
        expect(m.totalHeight.verdict.sentence).toContain('was not derived');
        expect(m.totalHeight.verdict.sentence).toContain('does not infer');
        expect(m.levels.verdict.kind).toBe('ceiling-not-derived');
    });

    it('no height declared → the total is UNMEASURABLE, and says so rather than assuming 3 m', () => {
        const m = buildIntentAgainstCeiling(snapshot([{ id: 'L0', name: 'Ground', elevation: 0, areaM2: 300, heightM: null }]), law());
        if (!m.readable) throw new Error('readable expected');
        expect(m.totalHeight.intent).toBeNull();
        expect(m.totalHeight.verdict.kind).toBe('intent-unmeasurable');
        expect(m.totalHeight.verdict.sentence).toContain('not assumed');
    });

    it('a storey with no elevation → heights are ADDED, and the stacking assumption is STATED', () => {
        const m = buildIntentAgainstCeiling(snapshot([
            { id: 'L0', name: 'Ground', elevation: 0, areaM2: 300, heightM: 3 },
            { id: 'L1', name: 'First', elevation: null, areaM2: 300, heightM: 3.5 },
        ]), law());
        if (!m.readable) throw new Error('readable expected');
        expect(m.totalHeight.intent).toBe(6.5);
        expect(m.totalHeightBasis).toContain('added up');
        expect(m.totalHeightBasis).toContain('assumption');
    });
});

describe('§26.6.3 — 3.2 areas: ground beside Maximum implantation area, per level, then the total', () => {
    it('ground and every storey beside the implantation ceiling, the total beside the buildable area', () => {
        const m = buildIntentAgainstCeiling(snapshot([
            { id: 'L0', name: 'Ground', elevation: 0, areaM2: 300, heightM: 3 },
            { id: 'L1', name: 'First', elevation: 3, areaM2: 250, heightM: 3 },
        ]), law());
        if (!m.readable) throw new Error('readable expected');
        expect(m.groundArea).toMatchObject({ intent: 300, ceiling: 431, ceilingLabel: CEILING_LABEL.implantation, ceilingSubject: 'footprint' });
        expect(m.groundArea.verdict.kind).toBe('within');
        expect(m.areasPerLevel.map((p) => p.intent)).toEqual([300, 250]);
        expect(m.areasPerLevel.every((p) => p.ceiling === 431)).toBe(true);
        // The total is the ONE producer's: footprint × storeys = 431 × 3 = 1293 here (no FAR).
        expect(m.totalArea).toMatchObject({ intent: 550, ceiling: 1293, ceilingLabel: CEILING_LABEL.buildable, ceilingSubject: 'gfa' });
        expect(m.totalArea.verdict.kind).toBe('within');
    });

    it('⛔ the founder\'s own numbers on the ground pair: 875 asked, 431 permitted — refused, not clipped', () => {
        const m = buildIntentAgainstCeiling(snapshot([{ id: 'L0', name: 'Ground', elevation: 0, areaM2: 875, heightM: 3 }]), law());
        if (!m.readable) throw new Error('readable expected');
        expect(m.groundArea.intent).toBe(875);
        expect(m.groundArea.verdict.kind).toBe('exceeds');
        expect(m.groundArea.verdict.sentence).toContain('you asked for 875 m², but no storey may overhang the buildable footprint, which is 431 m² — 444 m² less than you asked for.');
        expect(m.groundArea.verdict.sentence).toContain(INTENT_REFUSAL_CONSEQUENCE);
    });

    it('nothing declared → every pair says so; the ceilings still stand beside the absence', () => {
        const m = buildIntentAgainstCeiling(snapshot([]), law());
        if (!m.readable) throw new Error('readable expected');
        expect(m.groundArea.verdict.kind).toBe('no-intent');
        expect(m.groundArea.ceiling).toBe(431);
        expect(m.totalArea.verdict.kind).toBe('no-intent');
        expect(m.levels.verdict.kind).toBe('no-intent');
        expect(m.totalHeight.verdict.kind).toBe('no-intent');
    });

    it('an unreadable store is an ADMISSION about PRYZM, forwarded verbatim', () => {
        const m = buildIntentAgainstCeiling({ readable: false, reason: 'no-store', text: 'NO STORE' }, law());
        expect(m).toEqual({ readable: false, reason: 'no-store', text: 'NO STORE' });
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// §BASE-OFFSET-IS-ABSOLUTE (L-13286) — the founder's Barcelona repro, pinned by its own numbers
// ══════════════════════════════════════════════════════════════════════════════════════════════
// FOUNDER, 2026-09-09, on a real Eixample parcel:
//   > "THE ENVELOPE SHOULD BE CORRECT? OR THE DATA ON THE PANEL IS CORRECT? WHAT DETERMINES THE
//   >  HEIGHT? … THE LEVELS TO BE BUILT ENVELOPES BY LEVEL FIT ON THE BUILDABLE PURPLE ENVELOPE
//   >  HOWEVER ON THE CARD … IT SAYS 24 METERS"
//
// His screen: 7 storeys seated at 0/3/6/9/12/15/18 m, 3.0 m each, ceiling 22.4 m / 6 storeys.
// The panel printed **Total height 39.0 m** and refused. The true height is **21.0 m** and it
// FITS. The envelope was right; the panel was wrong — and the geometry was the honest witness.
const BCN_STACK = [0, 3, 6, 9, 12, 15, 18].map((elevation, i) => ({
    id: i === 0 ? 'L0' : `L${i}`,
    name: i === 0 ? 'Ground' : `Level ${i}`,
    elevation,
    areaM2: 322,
    heightM: 3,
}));

describe('§BASE-OFFSET-IS-ABSOLUTE (L-13286) — the storey elevation is counted ONCE', () => {
    const bcnLaw = () => law({ maxHeight_m: 22.4, maxFloors: 6 });

    it('⭐ the founder\'s stack measures 21.0 m, NOT 39.0 m — top-of-highest minus base-of-lowest', () => {
        const m = buildIntentAgainstCeiling(snapshot(BCN_STACK), bcnLaw());
        if (!m.readable) throw new Error('readable expected');
        // 18 m seat + 3 m storey = 21 m top; lowest base 0 m. NOT 18 + 18 + 3 = 39.
        expect(m.totalHeight.intent).toBe(21);
        expect(m.totalHeight.intent).not.toBe(39);
    });

    it('⛔ and therefore it does NOT refuse on height — 21.0 m fits inside 22.4 m with 1.4 m in hand', () => {
        const m = buildIntentAgainstCeiling(snapshot(BCN_STACK), bcnLaw());
        if (!m.readable) throw new Error('readable expected');
        expect(m.totalHeight.verdict.kind).toBe('within');
        // ⛔ The exact sentence he was shown must be gone. A refusal computed from a wrong number
        // is worse than silence: it tells a user to shrink a building that already complies.
        expect(m.totalHeight.verdict.sentence).not.toContain('less than you asked for');
    });

    it('⚠ the STOREY refusal beside it is REAL and survives — 7 declared against a 6-storey cap', () => {
        const m = buildIntentAgainstCeiling(snapshot(BCN_STACK), bcnLaw());
        if (!m.readable) throw new Error('readable expected');
        expect(m.levels.intent).toBe(7);
        expect(m.levels.verdict.kind).toBe('exceeds');
        expect(m.levels.verdict.sentence).toContain('you asked for 7 storeys');
        expect(m.levels.verdict.sentence).toContain('which is 6 storeys');
    });

    it('⭐ CROSS-MODEL AGREEMENT — the measured height equals what the RENDERER seats and extrudes', () => {
        // The renderer's frame, transcribed from `SpaceEnvelopeMeshBuilder.ts:449-450`:
        //     const baseY = prism.baseOffset;  const topY = prism.baseOffset + prism.height;
        // ⛔ No `elevation` term. If this expression and the panel ever disagree again, ONE of
        // them has changed coordinate frames — which is the entire defect this suite now guards.
        const rendererTop = Math.max(...BCN_STACK.map((l) => l.elevation + l.heightM));
        const rendererBase = Math.min(...BCN_STACK.map((l) => l.elevation));
        const m = buildIntentAgainstCeiling(snapshot(BCN_STACK), bcnLaw());
        if (!m.readable) throw new Error('readable expected');
        expect(m.totalHeight.intent).toBe(rendererTop - rendererBase);
    });

    it('a storey whose envelope carries NO base falls back to the storey elevation, never to 0', () => {
        // baseOffsetM explicitly null = no level envelope seated a base on this storey.
        const m = buildIntentAgainstCeiling(snapshot([
            { id: 'L0', name: 'Ground', elevation: 0, areaM2: 300, heightM: 3, baseOffsetM: null },
            { id: 'L1', name: 'First', elevation: 3, areaM2: 300, heightM: 3, baseOffsetM: null },
        ]), law());
        if (!m.readable) throw new Error('readable expected');
        expect(m.totalHeight.intent).toBe(6);
        expect(m.totalHeightBasis).toContain('top of the highest');
    });
});
