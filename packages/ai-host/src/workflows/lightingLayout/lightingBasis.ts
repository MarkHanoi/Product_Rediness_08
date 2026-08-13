// §FURNISH-DROP-SURFACING — the lighting result names the floor it was
// computed on.
//
// WHY THIS EXISTS. Production (founder, 2026-08-12): the furnish stage was
// dropped at the editor's §CHAIN-TIMEOUT fallback ("no furnish.layout-executed
// within 12000 ms — firing lighting anyway") and the user saw a finished-
// looking building with ZERO furniture and NO warning. The warn line already
// existed; a console.warn is not surfacing. The fact must reach the RETURNED
// RESULT — this module is the typed vocabulary for that.
//
// THE THREE OUTCOMES THAT MUST NEVER RENDER IDENTICALLY (C75 §1.2):
//   1. furnish completed, items placed              → basis 'furnished', no disclosure
//   2. furnish completed, ZERO items appropriate    → basis 'furnished', disclosure
//      naming the zero ("0 items" is an ANSWER the engine gave, not a drop)
//   3. furnish NEVER completed (dropped/timed out)  → basis 'unfurnished',
//      disclosure carrying the drop reason (C75 §1.4: UNKNOWN is a value WITH
//      A REASON)
// An ABSENT outcome (the caller knows nothing about furnish) is case 3, never
// a silent pass — UNPROVEN is neither a pass nor a fail (C70 §2.2).
//
// DECISION (proceed-and-stamp, not refuse): the D-LE engine consumes room
// geometry ONLY — furniture is never an input to fixture placement — so its
// output on an unfurnished floor is geometrically valid. Refusing would turn
// "no furniture" into "no furniture AND a dark building". The dishonesty was
// the SILENCE, so the fix is a stamp the UI must carry, mirroring the envelope
// panel's standard ("within the limits that could be checked · indicative
// only · NO LIMIT SET" — three states, none collapsed).
//
// Pure, zero imports — unit-tests in plain Node like the rest of D-LE.

/** What the caller knows about the furnish stage that preceded lighting. */
export type FurnishStageOutcome =
    | {
        /** Furnish ran to completion and reported. `placedCount` 0 is a real
         *  answer ("zero items appropriate"), not a failure. */
        readonly state: 'completed';
        readonly placedCount: number;
        readonly roomCount?: number;
    }
    | {
        /** Furnish never completed — e.g. the editor's §CHAIN-TIMEOUT fallback
         *  fired lighting without a `furnish.layout-executed`. `reason` is
         *  mandatory: a dropped stage without a reason is the defect class
         *  this module exists to kill. */
        readonly state: 'dropped';
        readonly reason: string;
    };

/** The floor-state the lighting result was computed against. */
export type LightingBasis = 'furnished' | 'unfurnished';

export interface LightingBasisResolution {
    readonly basis: LightingBasis;
    /** Human-renderable disclosure. `null` ONLY for the clean furnished case;
     *  every degraded or unknown state carries a reason (C75 §1.4). */
    readonly disclosure: string | null;
}

/**
 * Resolve the basis stamp for a lighting run from what is known about the
 * furnish stage. Total over the input space: `undefined` (nothing known) is
 * an explicit unfurnished-with-reason, never a default pass.
 */
export function resolveLightingBasis(
    outcome: FurnishStageOutcome | undefined,
): LightingBasisResolution {
    if (outcome === undefined) {
        return {
            basis: 'unfurnished',
            disclosure:
                'Furnish outcome unknown — no furnish report was available when lighting ran. ' +
                'Lighting was computed without furniture; the floor may be unfurnished.',
        };
    }
    if (outcome.state === 'dropped') {
        return {
            basis: 'unfurnished',
            disclosure:
                `Furnish stage DROPPED — ${outcome.reason}. ` +
                'Lighting was computed on an UNFURNISHED floor. The furnish stage never completed; ' +
                'this is not the same as "furnished with zero items".',
        };
    }
    // state === 'completed'
    if (outcome.placedCount === 0) {
        return {
            basis: 'furnished',
            disclosure:
                `Furnish completed with 0 items placed` +
                (typeof outcome.roomCount === 'number' ? ` across ${outcome.roomCount} room(s)` : '') +
                ' — the engine reported zero items appropriate. Lighting was computed on that reported floor.',
        };
    }
    return { basis: 'furnished', disclosure: null };
}
