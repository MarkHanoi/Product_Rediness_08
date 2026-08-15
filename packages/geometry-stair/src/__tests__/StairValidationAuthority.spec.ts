/**
 * StairValidationAuthority — executable evidence AT ITS DECLARED STRENGTH.
 *
 * C74 §1.1 classifies this family as **VALIDATION**, and C74 §7 requires
 * evidence at that strength rather than evidence that the module loads. The
 * distinction is the whole point of the row: a family declared VALIDATION with
 * no test that validates is a CLAIM, not a capability. So every case below does
 * the two things VALIDATION means and nothing weaker —
 *
 *   1. a legal stair is ACCEPTED (`isValid: true`, zero errors), and
 *   2. an illegal stair is REFUSED **with its identity** — the rule's own code,
 *      its own sentence, and BOTH numbers (the value measured and the limit it
 *      breached), asserted exactly rather than by `expect(...).toBeTruthy()`.
 *
 * Refusing with the wrong identity, or refusing with a number the rule did not
 * compute, is the failure this suite exists to catch. A test asserting only
 * that `validate()` returns an object would pass against a validator that had
 * been gutted, which is precisely the C74 §1.1 defect being measured.
 *
 * ─── NO SUBSTITUTIONS ANYWHERE ON THE EVALUATED PATH (C74 §3.5) ──────────────
 * There is nothing to disclose: the authority is a pure static function over
 * plain data, `Level` is a five-field record built here as the real type, and
 * the optional `typeStore` context field is simply left absent. The production
 * import path (`@pryzm/geometry-stair` → `ValidateStairCommand`) reaches the
 * same `StairValidationAuthority.validate` this file calls.
 *
 * WHAT IS DELIBERATELY NOT COVERED, so this is never read as full coverage:
 *   • the per-type rule override branch (`ctx.typeStore.resolveRules`) — the
 *     real `StairTypeStore` constructs a DOM event bus at module scope and this
 *     suite runs in the node environment. That branch is UNPROVEN, and saying so
 *     is C70 §2.2: UNPROVEN is not a pass.
 *   • whether the THRESHOLDS are the right thresholds. C74 governs IDENTITY,
 *     not ACCURACY — this suite pins what the rules do, not that AS 1657 says so.
 */

import { describe, it, expect } from 'vitest';
import {
    StairValidationAuthority,
    STAIR_CONSTRAINTS_REGIONS,
} from '../StairValidationAuthority';
import { STAIR_CONSTRAINTS, type StairData, type StairFlight } from '../StairTypes';
import type { Level } from '@pryzm/geometry-wall';

// ─── The model under test: two levels 3.000 m apart ─────────────────────────

const LEVELS: Level[] = [
    { id: 'L0', name: 'Ground', elevation: 0, height: 3.0, childrenIds: [] },
    { id: 'L1', name: 'First', elevation: 3.0, height: 3.0, childrenIds: [] },
];

const ctx = { levels: LEVELS };

function flight(riserCount: number, direction = { x: 1, y: 0, z: 0 }): StairFlight {
    return { direction, riserCount };
}

/**
 * A code-compliant stair: 16 risers × 187.5 mm = exactly the 3.000 m storey,
 * 280 mm going, 1200 mm wide (at the accessible minimum, so no advisory fires),
 * fire rating present. Every field is inside its limit with room to spare.
 */
function legalStair(): Partial<StairData> {
    return {
        baseLevelId: 'L0',
        topLevelId: 'L1',
        riserHeight: 0.1875,
        treadDepth: 0.280,
        width: 1.200,
        fireRating: '60min',
        flights: [flight(16)],
    };
}

/** Only the error codes, in order — the identity half of a refusal. */
function codes(r: { errors: Array<{ code: string }> }): string[] {
    return r.errors.map((e) => e.code);
}

// ────────────────────────────────────────────────────────────────────────────

describe('StairValidationAuthority — VALIDATION strength (C74 §2.2)', () => {

    // ── 1 · ACCEPTS a legal case ────────────────────────────────────────────
    // Half of VALIDATION is not refusing what is lawful. A validator that
    // refused everything would satisfy every negative case below.

    it('ACCEPTS a code-compliant stair — no errors, no advisories', () => {
        const result = StairValidationAuthority.validate(legalStair(), ctx);
        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([]);
        expect(result.isValid).toBe(true);
    });

    // ── 2 · REFUSES each illegal case WITH ITS IDENTITY ─────────────────────

    it('REFUSES an over-steep riser — code, sentence and both numbers', () => {
        // 200 mm rise over 15 risers still lands exactly on the 3.000 m storey,
        // so the height rule stays silent and this refusal is isolated.
        const result = StairValidationAuthority.validate(
            { ...legalStair(), riserHeight: 0.200, flights: [flight(15)] },
            ctx,
        );
        expect(result.isValid).toBe(false);
        expect(codes(result)).toEqual(['STAIR-RISER-TOO-HIGH']);
        expect(result.errors[0]).toEqual({
            code: 'STAIR-RISER-TOO-HIGH',
            message: 'Riser height 200mm exceeds maximum 190mm',
            field: 'riserHeight',
            currentValue: 0.200,
            requiredValue: STAIR_CONSTRAINTS.MAX_RISER_HEIGHT,
        });
    });

    it('REFUSES an under-height riser — code, sentence and both numbers', () => {
        const result = StairValidationAuthority.validate(
            { ...legalStair(), riserHeight: 0.100, flights: [flight(30)] },
            ctx,
        );
        expect(codes(result)).toEqual(['STAIR-RISER-TOO-LOW']);
        expect(result.errors[0]!.message).toBe('Riser height 100mm below minimum 150mm');
        expect(result.errors[0]!.requiredValue).toBe(STAIR_CONSTRAINTS.MIN_RISER_HEIGHT);
    });

    it('REFUSES a shallow going — code, sentence and both numbers', () => {
        const result = StairValidationAuthority.validate(
            { ...legalStair(), treadDepth: 0.200 },
            ctx,
        );
        expect(codes(result)).toEqual(['STAIR-TREAD-TOO-SHALLOW']);
        expect(result.errors[0]!.message).toBe('Tread depth 200mm below minimum 250mm');
        expect(result.errors[0]!.field).toBe('treadDepth');
        expect(result.errors[0]!.requiredValue).toBe(STAIR_CONSTRAINTS.MIN_TREAD_DEPTH);
    });

    it('REFUSES a stair narrower than the minimum, and advises separately on access', () => {
        const result = StairValidationAuthority.validate(
            { ...legalStair(), width: 0.800 },
            ctx,
        );
        expect(codes(result)).toEqual(['STAIR-WIDTH-TOO-NARROW']);
        expect(result.errors[0]!.message).toBe('Width 800mm below minimum 900mm');
        // 800 mm is also under the accessible minimum, but this stair does not
        // CLAIM to be accessible — so that reads as an advisory, not a refusal.
        expect(result.warnings.map((w) => w.code)).toEqual(['STAIR-ACCESSIBILITY-WARNING']);
        expect(result.warnings[0]!.recommendation).toBe('Consider increasing width to 1200mm');
    });

    it('REFUSES a stair that CLAIMS accessibility below the accessible minimum', () => {
        // 1000 mm clears the general 900 mm minimum, so the ONLY thing that can
        // refuse here is the accessibility claim itself.
        const result = StairValidationAuthority.validate(
            { ...legalStair(), width: 1.000, accessibilityType: 'accessible' },
            ctx,
        );
        expect(codes(result)).toEqual(['STAIR-ACCESSIBLE-WIDTH-TOO-NARROW']);
        expect(result.errors[0]!.message).toBe('Accessible stair width 1000mm below minimum 1200mm');
        expect(result.errors[0]!.requiredValue).toBe(STAIR_CONSTRAINTS.MIN_ACCESSIBLE_WIDTH);
        expect(result.warnings).toEqual([]);
    });

    it('REFUSES a stair whose base and top level are the same level', () => {
        const { flights: _drop, ...noFlights } = legalStair();
        const result = StairValidationAuthority.validate(
            { ...noFlights, topLevelId: 'L0' },
            ctx,
        );
        expect(codes(result)).toEqual(['STAIR-SAME-LEVEL']);
        expect(result.errors[0]!.message).toBe('Base level and top level cannot be the same');
        expect(result.errors[0]!.currentValue).toBe('L0');
    });

    it('REFUSES a stair bound to a level that does not exist', () => {
        const { flights: _drop, ...noFlights } = legalStair();
        const result = StairValidationAuthority.validate(
            { ...noFlights, baseLevelId: 'L9-does-not-exist' },
            ctx,
        );
        expect(codes(result)).toEqual(['STAIR-INVALID-BASE-LEVEL']);
        expect(result.errors[0]!.currentValue).toBe('L9-does-not-exist');
        const top = StairValidationAuthority.validate(
            { ...noFlights, topLevelId: 'L9-does-not-exist' },
            ctx,
        );
        expect(codes(top)).toEqual(['STAIR-INVALID-TOP-LEVEL']);
    });

    it('REFUSES a stair that does not reach the storey it spans', () => {
        // 16 × 180 mm = 2.880 m against a 3.000 m storey — 120 mm short, well
        // outside the 50 mm tolerance.
        const result = StairValidationAuthority.validate(
            { ...legalStair(), riserHeight: 0.180 },
            ctx,
        );
        expect(codes(result)).toEqual(['STAIR-HEIGHT-MISMATCH']);
        expect(result.errors[0]!.message).toBe(
            'Total stair height 2880mm does not match level height 3000mm (tolerance: 50mm)',
        );
        expect(result.errors[0]!.currentValue).toBeCloseTo(2.88, 10);
        expect(result.errors[0]!.requiredValue).toBe(3.0);
    });

    it('REFUSES a flight with a zero direction vector, naming the flight', () => {
        const result = StairValidationAuthority.validate(
            { ...legalStair(), flights: [flight(8), flight(8, { x: 0, y: 0, z: 0 })] },
            ctx,
        );
        expect(codes(result)).toEqual(['STAIR-ZERO-DIRECTION']);
        expect(result.errors[0]!.message).toBe('Flight 2 direction cannot be zero vector');
        expect(result.errors[0]!.field).toBe('flights[1].direction');
    });

    it('REFUSES a stair with fewer risers than the minimum', () => {
        const result = StairValidationAuthority.validate(
            { ...legalStair(), riserHeight: 3.0, flights: [flight(1)] },
            ctx,
        );
        expect(codes(result)).toContain('STAIR-TOO-FEW-RISERS');
        const tooFew = result.errors.find((e) => e.code === 'STAIR-TOO-FEW-RISERS')!;
        expect(tooFew.message).toBe('Total riser count 1 is below minimum 2');
        expect(tooFew.currentValue).toBe(1);
        expect(tooFew.requiredValue).toBe(STAIR_CONSTRAINTS.MIN_RISER_COUNT);
    });

    // ── 3 · TURNOVER AT THE BOUNDARY ────────────────────────────────────────
    // A threshold nobody probed at the edge is a threshold that could be `>=`
    // where the sentence says "exceeds" and nothing would notice.

    it('turns over exactly at the riser maximum — 190mm passes, 191mm refuses', () => {
        const { flights: _drop, ...base } = legalStair();
        expect(StairValidationAuthority.validate(
            { ...base, riserHeight: STAIR_CONSTRAINTS.MAX_RISER_HEIGHT }, ctx,
        ).errors).toEqual([]);
        expect(codes(StairValidationAuthority.validate(
            { ...base, riserHeight: 0.191 }, ctx,
        ))).toEqual(['STAIR-RISER-TOO-HIGH']);
    });

    it('turns over exactly at the width minimum — 900mm passes, 899mm refuses', () => {
        const { flights: _drop, ...base } = legalStair();
        expect(codes(StairValidationAuthority.validate(
            { ...base, width: STAIR_CONSTRAINTS.MIN_WIDTH }, ctx,
        ))).toEqual([]);
        expect(codes(StairValidationAuthority.validate(
            { ...base, width: 0.899 }, ctx,
        ))).toEqual(['STAIR-WIDTH-TOO-NARROW']);
    });

    it('turns over exactly at the height tolerance — 50mm out passes, 51mm out refuses', () => {
        // 16 × 184.375 mm = 2.950 m, exactly 50 mm short of the storey.
        expect(codes(StairValidationAuthority.validate(
            { ...legalStair(), riserHeight: 2.95 / 16 }, ctx,
        ))).toEqual([]);
        expect(codes(StairValidationAuthority.validate(
            { ...legalStair(), riserHeight: 2.949 / 16 }, ctx,
        ))).toEqual(['STAIR-HEIGHT-MISMATCH']);
    });

    // ── 4 · THE REGION SET IS LIVE, NOT DECORATIVE ──────────────────────────
    // Same stair, two jurisdictions, two verdicts. If the region parameter were
    // ignored the first and second assertions could not both hold.

    it('accepts under IBC-USA the 200mm rise it refuses under the default code', () => {
        const steep = { ...legalStair(), riserHeight: 0.200, flights: [flight(15)] };
        expect(codes(StairValidationAuthority.validate(steep, ctx)))
            .toEqual(['STAIR-RISER-TOO-HIGH']);
        expect(codes(StairValidationAuthority.validate(steep, { ...ctx, region: 'IBC-USA' })))
            .toEqual([]);
        expect(STAIR_CONSTRAINTS_REGIONS['IBC-USA']!.MAX_RISER_HEIGHT).toBe(0.200);
    });

    it('falls back to the default code set for a region it does not publish', () => {
        const steep = { ...legalStair(), riserHeight: 0.200, flights: [flight(15)] };
        expect(codes(StairValidationAuthority.validate(steep, { ...ctx, region: 'ZZ-UNKNOWN' })))
            .toEqual(['STAIR-RISER-TOO-HIGH']);
    });

    // ── 5 · ADVISORY IS NOT REFUSAL ─────────────────────────────────────────

    it('advises on a missing fire rating without refusing the stair', () => {
        const { fireRating: _drop, ...noRating } = legalStair();
        const result = StairValidationAuthority.validate(noRating, ctx);
        expect(result.errors).toEqual([]);
        expect(result.isValid).toBe(true);
        expect(result.warnings.map((w) => w.code)).toEqual(['STAIR-NO-FIRE-RATING']);
    });

    // ── 6 · PINNED AS MEASURED, NOT ENDORSED ────────────────────────────────
    // §CONTEXT-DATA-HONESTY: for this authority, MISSING and COMPLIANT are the
    // same value. Both cases below are recorded so the behaviour cannot change
    // silently — neither is being called correct.

    it('PINNED — a stair with no dimensions at all validates as legal', () => {
        // Every dimensional rule is guarded by `!== undefined`, so an empty
        // subject clears all of them. `isValid: true` here is a statement about
        // an absence of data, and a caller cannot tell it from compliance.
        const result = StairValidationAuthority.validate({}, { levels: [] });
        expect(result.errors).toEqual([]);
        expect(result.isValid).toBe(true);
        expect(result.warnings.map((w) => w.code)).toEqual(['STAIR-NO-FIRE-RATING']);
    });

    it('PINNED — the storey-height rule is skipped entirely when flights are absent', () => {
        // The height comparison is nested inside the flights branch, so a stair
        // carrying a riser height that cannot reach its top level is not
        // refused as long as no flight has been built yet.
        const { flights: _drop, ...noFlights } = legalStair();
        expect(codes(StairValidationAuthority.validate(
            { ...noFlights, riserHeight: 0.180 }, ctx,
        ))).toEqual([]);
        // With the identical numbers and one flight present, it IS refused.
        expect(codes(StairValidationAuthority.validate(
            { ...noFlights, riserHeight: 0.180, flights: [flight(16)] }, ctx,
        ))).toEqual(['STAIR-HEIGHT-MISMATCH']);
    });
});
