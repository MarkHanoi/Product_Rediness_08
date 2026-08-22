/**
 * §LEVEL-COVERAGE-IS-MEASURED (L-3520) — lane INSP3, 2026-08-22.
 *
 * Pins the founder's report of 2026-08-22, screenshot 3:
 *   *"EXPLODE does not separate every element — upper levels lift, but a lot of
 *   geometry stays behind."*
 *
 * ⭐ THE FALSIFIABLE CLAIM THESE TESTS DEFEND is not "the explode is fixed". It
 * is narrower and it is the thing that was missing: **the log line the founder
 * was reading could not have told him.** `[§LEVEL-STACK] … (total 443; …)` counts
 * the roots the pass MOVED. 443-of-443 and 443-of-1546 print the same line.
 *
 * These drive the pure derivation, not the scene, because the derivation is what
 * was absent. A green run here establishes that the arithmetic and the wording
 * are right; it establishes NOTHING about the viewport, and the module header
 * says so.
 */

import { describe, it, expect } from 'vitest';
import {
    censusLevelCoverage,
    formatLevelCoverage,
    UNATTRIBUTED,
    type LevelCoverageSubject,
} from '../src/ui/bottom-menu/levelCoverageCensus';

const s = (over: Partial<LevelCoverageSubject> = {}): LevelCoverageSubject => ({
    family: 'wall',
    covered: true,
    hasLevelTag: true,
    ...over,
});

describe('§LEVEL-COVERAGE-IS-MEASURED — the denominator the explode log never had', () => {
    it('reports covered vs left-behind, not just the numerator', () => {
        const r = censusLevelCoverage([
            s(), s(), s({ covered: false, hasLevelTag: false }),
        ]);
        expect(r.totalDrawn).toBe(3);
        expect(r.totalCovered).toBe(2);
        expect(r.totalLeftBehind).toBe(1);
    });

    it('breaks the left-behind population out BY FAMILY, worst first', () => {
        const r = censusLevelCoverage([
            s({ family: 'wall' }),
            s({ family: 'furniture', covered: false, hasLevelTag: false }),
            s({ family: 'furniture', covered: false, hasLevelTag: false }),
            s({ family: 'roof', covered: false, hasLevelTag: false }),
        ]);
        // A scene-wide average decides nothing; the top row is the thing to fix.
        expect(r.rows[0].family).toBe('furniture');
        expect(r.rows[0].leftBehind).toBe(2);
        expect(r.rows[1].family).toBe('roof');
        expect(r.rows.find(x => x.family === 'wall')!.leftBehind).toBe(0);
    });

    // ── THE FOUNDER'S LEAD, MEASURED RATHER THAN ASSUMED ─────────────────────
    //
    // His hypothesis: the left-behind population is "very likely the SAME
    // population" as the census `(unattributed)` bucket. The two predicates are
    // DIFFERENT (`levelId` vs `elementType`), so the honest answer is a reported
    // overlap. These two cases are the two ways the identity fails.
    it('an object CAN be left behind while being fully attributed', () => {
        const r = censusLevelCoverage([
            s({ family: 'wall', covered: false, hasLevelTag: false }),
        ]);
        expect(r.totalLeftBehind).toBe(1);
        // Named family ⇒ NOT in the census's unattributed bucket. The overlap is 0.
        expect(r.leftBehindUnattributed).toBe(0);
    });

    it('an object CAN be unattributed and still covered', () => {
        const r = censusLevelCoverage([
            s({ family: null, covered: true, hasLevelTag: true }),
        ]);
        expect(r.rows[0].family).toBe(UNATTRIBUTED);
        expect(r.totalLeftBehind).toBe(0);
        expect(r.leftBehindUnattributed).toBe(0);
    });

    it('counts the overlap when it IS the same population', () => {
        const r = censusLevelCoverage([
            s({ family: null, covered: false, hasLevelTag: false }),
            s({ family: null, covered: false, hasLevelTag: false }),
            s({ family: 'wall', covered: true }),
        ]);
        expect(r.totalLeftBehind).toBe(2);
        expect(r.leftBehindUnattributed).toBe(2);
    });

    // ── TAGGED-BUT-UNBUCKETED IS A DIFFERENT DEFECT AND MUST NOT BE FOLDED IN ─
    it('separates "no level tag" from "tagged and dropped by the bucketing"', () => {
        const r = censusLevelCoverage([
            s({ family: 'stair', covered: false, hasLevelTag: true }),   // bucketing failure
            s({ family: 'stair', covered: false, hasLevelTag: false }),  // tagging failure
        ]);
        expect(r.totalLeftBehind).toBe(2);
        expect(r.leftBehindWithTag).toBe(1);
        expect(r.rows[0].leftBehindWithTag).toBe(1);
    });
});

describe('§LEVEL-COVERAGE-IS-MEASURED — the console line', () => {
    it('says COMPLETE out loud rather than going quiet', () => {
        // context-data-honesty-family: an instrument that prints nothing when all
        // is well is indistinguishable from one that is broken.
        const line = formatLevelCoverage(censusLevelCoverage([s(), s()]), 'exploded');
        expect(line).toContain('COMPLETE');
        expect(line).toContain('2/2');
    });

    it('distinguishes "nothing drawn" from "100% covered"', () => {
        const line = formatLevelCoverage(censusLevelCoverage([]), 'exploded');
        expect(line).toContain('UNDEFINED, not 100%');
        expect(line).not.toContain('COMPLETE');
    });

    it('leads with the denominator and names the worst families', () => {
        const line = formatLevelCoverage(
            censusLevelCoverage([
                s({ family: 'furniture', covered: false, hasLevelTag: false }),
                s({ family: 'furniture', covered: false, hasLevelTag: false }),
                s({ family: 'wall', covered: true }),
            ]),
            'exploded',
        );
        expect(line).toContain('2 of 3');
        expect(line).toContain('furniture=2/2');
        // The overlap is printed as a number, never asserted as an identity.
        expect(line).toContain('this is the OVERLAP, measured, not assumed');
    });

    it('flags tagged-but-unbucketed inline, because it has a different fix', () => {
        const line = formatLevelCoverage(
            censusLevelCoverage([s({ family: 'stair', covered: false, hasLevelTag: true })]),
            'solo',
        );
        expect(line).toContain('TAGGED but unbucketed');
    });
});
